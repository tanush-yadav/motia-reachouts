import marvin
import os
import supabase
import json
import asyncio
from typing import Optional, Dict, Any

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
# Set the default model for Marvin functions globally
marvin.defaults.model = "openai:o4-mini-2025-04-16"

async def generate_variation(job_description: str, current_message: str) -> str:
   instructions =  """
    You are helping improve a cold outreach message for a Founding Engineer or similar early technical role.

    Inputs:

        current_message: A friendly, raw draft by the user (good base, needs tightening).

        job_description: Includes the job responsibilities, required skills, and the company's mission/vision.

    Task:

    Rewrite current_message to naturally align with the spirit of the job description and company mission.

    Preserve the message's natural tone and format.

    Only subtly reflect understanding of the mission and expectations.

    Keep it concise, Do not keyword-stuff or copy-paste the JD language — instead, subtly reflect understanding of the mission and expectations.

    Where relevant, highlight user's fit based on their past work — especially concrete, shipped things (products, tools, results).

    End with a warm, confident close (e.g., "Would love to jam if this resonates.").

    Important:

    Assume the reader is busy.
    Focus on clarity, authenticity, and impact.
    If something feels obvious or filler, cut it.
    """

   task = marvin.Task(
      instructions=instructions,
      context={
         "current_message": current_message,
         "job_description": job_description
      }
   )
   response = task.run()
   print(response)
   return response


def init_supabase_client(ctx):
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        ctx.logger.error("Supabase URL or Service Role Key not configured.")
        raise ValueError("Missing Supabase configuration.")
    try:
        client = supabase.create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        ctx.logger.info("Supabase client initialized successfully.")
        return client
    except Exception as e:
        ctx.logger.error(f"Failed to initialize Supabase client: {e}")
        raise

config = {
    "type": "event",
    "name": "Generate Email Variations",
    "description": "Generates 3 personalized variations of an outreach email.",
    "subscribes": ["email.approval.required", "email.schedule.completed"],
    "emits": ["email.variations.generated"],
    "flows": ["job-search"],
}

async def handler(event, ctx):
    ctx.logger.info("Starting email variation generation")

    try:
        supabase_client = init_supabase_client(ctx)

        # Query for leads with emails that need variations
        email_response = supabase_client.table("emails").select(
            "id,body_1,lead_id"
        ).eq("status", "Scheduled").execute()

        if not email_response.data or len(email_response.data) == 0:
            ctx.logger.info("No scheduled emails found that need variations.")
            return {"success": True, "count": 0}

        ctx.logger.info(f"Found {len(email_response.data)} scheduled emails to generate variations for")

        processed_count = 0
        for email in email_response.data:
            email_id = email.get("id")
            lead_id = email.get("lead_id")
            current_message = email.get("body_1")

            if not email_id or not lead_id or not current_message:
                ctx.logger.warn(f"Missing required data for email {email_id}. Skipping.")
                continue

            ctx.logger.info(f"Processing variations for email ID: {email_id}, lead ID: {lead_id}")

            # Fetch the lead's job description
            lead_response = supabase_client.table("leads").select("job_description").eq("id", lead_id).maybe_single().execute()

            if not lead_response.data:
                ctx.logger.warn(f"Lead record not found for ID: {lead_id}. Skipping.")
                continue

            job_description = lead_response.data.get("job_description")
            if not job_description:
                ctx.logger.info(f"Job description is empty for lead ID: {lead_id}. Using minimal personalization.")
                job_description = "No job description provided."

            # Generate 3 variations
            ctx.logger.info(f"Generating 3 variations for email {email_id}")
            body2 = await generate_variation(job_description=job_description, current_message=current_message)
            body3 = await generate_variation(job_description=job_description, current_message=current_message)
            body4 = await generate_variation(job_description=job_description, current_message=current_message)

            # Update the email record with variations
            update_data = {
                "body_2": body2,
                "body_3": body3,
                "body_4": body4,
            }

            update_response = supabase_client.table("emails").update(update_data).eq("id", email_id).execute()

            ctx.logger.info(f"Successfully updated email {email_id} with variations")
            processed_count += 1

            # Emit event for each processed email
            await ctx.emit({
                "topic": "email.variations.generated",
                "data": {
                    "emailId": email_id,
                    "leadId": lead_id
                }
            })

        ctx.logger.info(f"Completed generating variations for {processed_count} emails")
        return {"success": True, "count": processed_count}

    except Exception as e:
        ctx.logger.error(f"Error in generate variations handler: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # Sample job description and current message for testing
    sample_job_description = """
    Founding Engineer at TechStart AI

    About Us:
    TechStart AI is building the next generation of AI-powered productivity tools for modern teams.
    Our mission is to automate the mundane and elevate human creativity.

    Responsibilities:
    - Design and implement core machine learning infrastructure
    - Build and optimize data pipelines for training and inference
    - Work directly with customers to understand pain points
    - Help shape the product roadmap and engineering culture

    Requirements:
    - Experience building scalable software systems
    - Strong programming skills in Python and modern frameworks
    - Passion for AI/ML technologies
    - Self-directed with an ownership mentality
    """

    sample_current_message = """
    Hey Sarah,

    I saw TechStart AI is looking for a Founding Engineer and I'm really excited about what you're building. I've spent the last 4 years at DataCorp building machine learning pipelines that process 10TB of data daily, and previously led the backend team at StartupX where we scaled to 1M users.

    I've been following the AI productivity space closely and think there's huge potential to transform how teams work with the right tools. Would love to share some specific ideas I have about data pipeline optimization and ML infrastructure that could help.

    Are you free for a quick chat this week to discuss how I could contribute to TechStart's mission?

    Cheers,
    Alex
    """

    async def test_generate_variation():
        print("Testing generate_variation function...")
        print("\nSample Current Message:")
        print(sample_current_message)
        print("\nSample Job Description:")
        print(sample_job_description)

        print("\nGenerating variation...")
        result = await generate_variation(
            job_description=sample_job_description,
            current_message=sample_current_message
        )

        print("\nGenerated Variation:")
        print(result)

    # Run the test function
    asyncio.run(test_generate_variation())