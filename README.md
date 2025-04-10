# Auto Reachouts

A job search automation tool built with Motia Framework that helps search for job listings using Google dorks.

## Prerequisites

- Node.js (v18+)
- Python (v3.8+)
- pnpm (recommended) or npm

## Setup

1. **Clone the repository**:

   ```
   git clone https://github.com/yourusername/auto-reachouts.git
   cd auto-reachouts
   ```

2. **Install Node.js dependencies**:

   ```
   pnpm install
   ```

3. **Set up Python environment**:

   ```
   chmod +x setup-python.sh
   ./setup-python.sh
   ```

4. **Configure environment variables**:
   ```
   cp .env.example .env
   ```
   Edit the `.env` file with your Marvin API key and other credentials.

## Running the Application

1. **Start the development server**:

   ```
   pnpm dev
   ```

2. **Open the Motia Workbench**:
   Navigate to http://localhost:3000 to access the workflow UI.

3. **Make a test request**:
   ```
   curl -X POST http://localhost:3000/api/job-search \
     -H "Content-Type: application/json" \
     -d '{"query": "find founding engineer roles in san francisco", "limit": 10}'
   ```

## Project Structure

- `steps/` - Contains all workflow steps
  - `api.step.ts` - API endpoint for job search queries
  - `parse-query.step.py` - Python step for parsing queries and generating Google dorks
  - `get-job-urls.step.ts` - Retrieves job listing URLs from search results
  - `scrape-job-details.step.ts` - Extracts relevant details from job listings
  - `lookup-apollo-emails.step.ts` - Finds contact emails using Apollo
  - `schedule-email.step.ts` - Schedules follow-up emails to contacts
- `.motia/` - Motia framework configuration
- `config/` - Configuration files for the application
- `.env.example` - Example environment variable template
- `requirements.txt` - Python dependencies

## Features

- Automated job searching using Google dorks
- Job details extraction from listings
- Contact discovery via Apollo integration
- Scheduled follow-up emails
- Customizable search queries

## License

MIT
