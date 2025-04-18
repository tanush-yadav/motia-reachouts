'use client'

import {
  ExternalLink,
  Loader2,
  Mail
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LeadType, supabase } from '@/lib/supabase'

// Helper function to format date strings
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Helper function to get status color
function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'scraped':
      return 'bg-blue-500'
    case 'contacted':
      return 'bg-yellow-500'
    case 'replied':
      return 'bg-green-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

export function LeadsTable() {
  const [leads, setLeads] = useState<LeadType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeads() {
      try {
        setLoading(true)

        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          throw error
        }

        setLeads(data || [])
      } catch (error) {
        console.error('Error fetching leads:', error)
        setError('Failed to load leads. Please try again later.')
      } finally {
        setLoading(false)
      }
    }

    fetchLeads()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No leads found. Start a job search to find potential leads.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.role_title || 'N/A'}</TableCell>
                <TableCell>{lead.company_name || 'N/A'}</TableCell>
                <TableCell>{lead.contact_name || 'Unknown'}</TableCell>
                <TableCell>
                  <Badge className={getStatusColor(lead.status)}>
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(lead.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {lead.job_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={lead.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View Job Listing"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Send Email">
                      <Mail className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}