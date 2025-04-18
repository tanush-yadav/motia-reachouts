import marvin
import os
import supabase
import json
import asyncio
from typing import Optional, Dict, Any

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")


@marvin.fn
async def generate_variation(job_description: str, current_message: str) -> str:
    """
    You are helping improve a cold outreach message for a Founding Engineer or similar early technical role.

    Inputs:

    current_message: A friendly, raw draft by the user (good base, needs tightening).

    job_description: Includes the job responsibilities, required skills, and the company’s mission/vision.

    Task:

    Rewrite current_message to naturally align with the spirit of the job description and company mission.

    Preserve the user’s natural, human tone — real, confident, slight founder-energy.

    Keep it concise:

    No long paragraphs.

    No repeating the same achievements.

    Every line must add clear value.

    Max 120–150 words.

    Do not keyword-stuff or copy-paste the JD language — instead, subtly reflect understanding of the mission and expectations.

    Where relevant, highlight user’s fit based on their past work — especially concrete, shipped things (products, tools, results).

    End with a warm, confident close (e.g., "Would love to jam if this resonates.").

    Important:

    Assume the reader is busy.

    Focus on clarity, authenticity, and impact.

    If something feels obvious or filler, cut it.
    """

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