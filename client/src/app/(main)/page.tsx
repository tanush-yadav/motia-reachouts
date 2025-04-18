import { JobSearchForm } from '@/components/JobSearchForm'
import { Toaster } from '@/components/ui/toaster'

export default function DashboardPage() {
  return (
    <div className="container">
      <div className="flex flex-col items-center py-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Job Search Dashboard</h1>
        <p className="text-muted-foreground mb-8">Search for job listings and automatically collect lead information.</p>
        <JobSearchForm />
        <Toaster />
      </div>
    </div>
  )
}