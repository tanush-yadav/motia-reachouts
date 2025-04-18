'use client'

import { LeadsTable } from '@/components/LeadsTable'

export default function LeadsPage() {
  return (
    <div className="container">
      <div className="flex flex-col py-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Leads</h1>
        <p className="text-muted-foreground mb-8">View and manage your job leads.</p>
        <LeadsTable />
      </div>
    </div>
  )
}