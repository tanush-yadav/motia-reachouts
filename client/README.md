# Auto Reachouts Client

This is the frontend application for the Auto Reachouts system, built with Next.js and Shadcn UI components.

## Setup Instructions

### 1. Install Dependencies

```bash
# Navigate to the client directory
cd client

# Install dependencies
npm install
# or
pnpm install
# or
yarn install
```

### 2. Environment Configuration

Create a `.env.local` file in the client directory with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace `your_supabase_url` and `your_supabase_anon_key` with your actual Supabase credentials.

### 3. Run Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Features

- **Email Management**: View, approve, reject, and delete emails
- **Email Scheduling**: Schedule emails to be sent at specified times
- **Email Templates**: Use templates for consistent email communication
- **Approval Workflow**: Built-in approval process for email sending

## Tech Stack

- **Framework**: Next.js
- **UI Components**: Shadcn UI
- **Styling**: Tailwind CSS
- **Database**: Supabase
- **Date Handling**: date-fns

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs)
- [Shadcn UI](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.io/docs)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
