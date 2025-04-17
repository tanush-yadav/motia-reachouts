from typing import Dict, List, Any
import logging
import marvin
from pydantic import BaseModel, Field
import os
from supabase import create_client, Client
import datetime

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

    jobId: str = Field(..., description="Unique identifier for this job search process")
    query: str = Field(..., description="The original user query string")
    role: str = Field(..., description="Job role/title to search for")
    location: str = Field("remote", description="Location preference (default: remote)")
    limit: int = Field(10, description="Maximum number of links to process")
    google_dorks: List[str] = Field(
        default_factory=list, description="Generated Google dork queries"
    )


def parse_job_query(job_query: Dict[str, Any]) -> JobQuery:
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
    # Ensure jobId is passed through
    parsed_query[0].jobId = job_query["jobId"]

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
    - Include natural terms like: "jobs", "we're hiring", "open roles"
    - Avoid generic keywords that return company pages
    - Output only clean, complete Google-ready queries as a list of strings

    Input:
    - Role: founding engineer
    - Location: San Francisco

    Output:
    [
      'site:workatastartup.com "founding engineer" "San Francisco"',
      'site:workatastartup.com "founding engineer" "San Francisco" "jobs"',
      'site:workatastartup.com "founding engineer" "we're hiring" "San Francisco"',
      'site:workatastartup.com "founding engineer" "San Francisco" "open role"',
      'site:workatastartup.com "founding engineer" "job listing" "San Francisco"'
    ]
    """

def generate_smart_dorks(parsed_query: JobQuery) -> List[str]:
    """Generate optimized Google dorks for job searching"""
    # Convert dict to object if needed
    base = "site:workatastartup.com"
    dorks = []

    # Format role with quotes if it contains spaces
    role = f'"{parsed_query.role}"' if ' ' in parsed_query.role else parsed_query.role

    # Format location with quotes
    location = ""
    if parsed_query.location:
        if parsed_query.location.lower() == "remote":
            location = '"remote"'
        else:
            location = f'"{parsed_query.location}"'

    # Core dorks (most specific first)
    if location:
        dorks.append(f"{base} {role} {location}")
        dorks.append(f"{base} {role} {location} jobs")
    else:
        dorks.append(f"{base} {role}")
        dorks.append(f"{base} {role} jobs")

    # Add one variation with "hiring" only if we have few dorks
    if len(dorks) < 3:
        dorks.append(f"{base} {role} hiring")

    logger.info(f"Generated {len(dorks)} Google dorks for {parsed_query.role}")
    return dorks[:parsed_query.limit if hasattr(parsed_query, 'limit') else 3]


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

    # Check for required fields
    required_fields = ["query", "jobId"]
    for field in required_fields:
        if not hasattr(args, field):
            ctx.logger.error(f"Missing required field: {field}")
            raise ValueError(f"Event is missing required field: {field}")

    # Extract query and jobId from the event
    query = args.query
    jobId = args.jobId
    limit = getattr(args, "limit", 10)

    try:
        # Update job status to PROCESSING
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_ANON_KEY")

        if supabase_url and supabase_key:
            supabase: Client = create_client(supabase_url, supabase_key)
            supabase.table("jobs").update({"status": "PROCESSING"}).eq("id", jobId).execute()
            ctx.logger.info(f"Updated job {jobId} status to PROCESSING")
        else:
            ctx.logger.info("SUPABASE_URL or SUPABASE_ANON_KEY not set, skipping job status update")

        raw_query = {
            "jobId": jobId,
            "query": query,
            "limit": limit,
        }

        parsed_query = parse_job_query(raw_query)
        ctx.logger.info(
            f"Extracted role: '{parsed_query.role}', location: '{parsed_query.location}' for job {jobId}"
        )

        # Generate Google dorks
        try:
            # google_dorks = generate_google_dorks(parsed_query=parsed_query)
            google_dorks = generate_smart_dorks(parsed_query=parsed_query)
            parsed_query.google_dorks = google_dorks
            ctx.logger.info(f"Generated {len(google_dorks)} Google dorks for job {jobId}")
        except Exception as e:
            ctx.logger.error(f"Error generating dorks with Marvin: {str(e)}")
            google_dorks = [] # Ensure google_dorks is defined even on error

        # Update job with parsed info and status
        if supabase_url and supabase_key:
            supabase: Client = create_client(supabase_url, supabase_key)
            update_payload = {
                "status": "PROCESSING",
                "parsed_role": parsed_query.role,
                "parsed_location": parsed_query.location,
                "google_dorks": google_dorks,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            try:
                response = supabase.table("jobs").update(update_payload).eq("id", jobId).execute()
                # Log the raw response for debugging if needed
                logger.info(f"Supabase update response for job {jobId}: {response}")
                # The client raises an exception on HTTP error, so no need to check response.error
                ctx.logger.info(f"Updated job {jobId} status to PROCESSING with parsed info.")
            except Exception as db_err: # Catch Supabase specific errors if known, else general Exception
                ctx.logger.error(f"Error updating job {jobId} in Supabase: {db_err}")
        else:
            ctx.logger.info("SUPABASE_URL or SUPABASE_ANON_KEY not set, skipping job status update")

    except Exception as e:
        ctx.logger.error(f"Error parsing query or generating dorks: {str(e)}")
        # Update job status to ERROR if possible
        if 'jobId' in locals() and supabase_url and supabase_key:
            try:
                supabase: Client = create_client(supabase_url, supabase_key)
                supabase.table("jobs").update({
                    "status": "ERROR",
                    "error_message": f"Failed during query parsing/dork generation: {str(e)}",
                    "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }).eq("id", jobId).execute()
            except Exception as db_err:
                 ctx.logger.error(f"Failed to update job {jobId} to ERROR status: {db_err}")
        # Re-raise or handle error appropriately for the Motia framework
        raise

    # Emit the processed result
    await ctx.emit({"topic": "job.query.processed", "data": parsed_query.dict()})

    # Return the result as a dictionary
    return parsed_query.dict()
