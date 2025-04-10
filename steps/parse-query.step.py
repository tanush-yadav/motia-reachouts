from typing import Dict, List, Any
import logging
import marvin
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration for the Python step
config = {
    "type": "event",
    "name": "Query Processor",
    "description": "Parses job search queries and generates Google dorks",
    "subscribes": ["job.query.received"],
    "emits": ["job.query.processed"],
    "flows": ["job-search"],
}


class JobQuery(BaseModel):
    """Query model for job search parameters"""

    query: str = Field(..., description="The original user query string")
    role: str = Field(..., description="Job role/title to search for")
    location: str = Field("remote", description="Location preference (default: remote)")
    limit: int = Field(10, description="Maximum number of links to process")
    google_dorks: List[str] = Field(
        default_factory=list, description="Generated Google dork queries"
    )


def parse_job_query(job_query: Dict[str, int]) -> JobQuery:
    """
    Parse the raw query string into structured job search parameters

    Args:
        query: The job query object from the user (e.g., 'find founding engineer roles in san francisco')

    Returns:
        JobQuery object with role and location extracted
    """
    instructions = """
    Analyze the job search query and extract:
    1. The job role or title being searched for
    2. The location preference (if mentioned, otherwise use "remote")

    Example query: 'find founding engineer roles in san francisco'
    Expected extraction:
    - role: founding engineer
    - location: san francisco
    """

    parsed_query = marvin.extract(job_query, target=JobQuery, instructions=instructions)
    logger.info(f"Parsed query: {parsed_query}")
    parsed_query[0].query = job_query["query"]
    parsed_query[0].limit = job_query["limit"]

    return parsed_query[0]


@marvin.fn
def generate_google_dorks(parsed_query: JobQuery) -> List[str]:
    """
    Generate 3–5 high-quality Google search queries (dorks) to find job listings on workatastartup.com.

    The goal is to discover live job posts for a specific role and location.

    Instructions:
    - Use: site:workatastartup.com as the base
    - Include the exact job role in quotes, e.g. "founding engineer"
    - If location is not "remote", include it in quotes too, e.g. "San Francisco"
    - Include natural terms like: "jobs", "we’re hiring", "open roles"
    - Avoid generic keywords that return company pages
    - Output only clean, complete Google-ready queries as a list of strings

    Input:
    - Role: founding engineer
    - Location: San Francisco

    Output:
    [
      'site:workatastartup.com "founding engineer" "San Francisco"',
      'site:workatastartup.com "founding engineer" "San Francisco" "jobs"',
      'site:workatastartup.com "founding engineer" "we’re hiring" "San Francisco"',
      'site:workatastartup.com "founding engineer" "San Francisco" "open role"',
      'site:workatastartup.com "founding engineer" "job listing" "San Francisco"'
    ]
    """


async def handler(args, ctx):
    """
    Process the job query event, parse it, and generate Google dorks

    Args:
        args: The incoming event data
        ctx: Context object provided by Motia

    Returns:
        Dictionary with processed query information
    """
    ctx.logger.info(f"Received event: {args}")

    # Extract raw query from the event
    if hasattr(args, "query"):
        query = args.query
        limit = getattr(args, "limit", 10)
    else:
        ctx.logger.error(f"Invalid event format: {args}")
        raise ValueError("Expected event with 'raw_query' field")

    try:
        raw_query = {
            "query": query,
            "limit": limit,
        }

        parsed_query = parse_job_query(raw_query)
        ctx.logger.info(
            f"Extracted role: '{parsed_query.role}', location: '{parsed_query.location}'"
        )
    except Exception as e:
        ctx.logger.error(f"Error parsing query with Marvin: {str(e)}")
        parsed_data = {
            "query": query,
            "role": query.replace("find ", "").replace(" roles", "").strip(),
            "location": "remote",
            "limit": limit,
        }
        parsed_query = JobQuery(**parsed_data)

    # Generate Google dorks using Marvin
    try:
        google_dorks = generate_google_dorks(parsed_query=parsed_query)
        parsed_query.google_dorks = google_dorks
        ctx.logger.info(f"Generated {len(google_dorks)} Google dorks using Marvin")
    except Exception as e:
        ctx.logger.error(f"Error generating dorks with Marvin: {str(e)}")

    # Emit the processed result
    await ctx.emit({"topic": "job.query.processed", "data": parsed_query.dict()})

    # Return the result as a dictionary
    return parsed_query.dict()
