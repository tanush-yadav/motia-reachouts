import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { Calendar, Clock } from 'lucide-react'

interface EmailMetadataProps {
  status: string
  scheduledAt?: string | null
  sentAt: string
}

export function EmailMetadata({
  status,
  scheduledAt,
  sentAt,
}: EmailMetadataProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <Badge variant={getBadgeVariantForStatus(status)}>{status}</Badge>

      {scheduledAt && (
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Calendar className="h-3 w-3" />
          <span>Scheduled for: {format(new Date(scheduledAt), 'PPp')}</span>
        </div>
      )}

      <div className="flex items-center text-xs text-muted-foreground gap-1">
        <Clock className="h-3 w-3" />
        <span>
          {scheduledAt ? 'Created' : 'Sent'}: {format(new Date(sentAt), 'PPp')}
        </span>
      </div>
    </div>
  )
}

function getBadgeVariantForStatus(status: string) {
  status = status.toLowerCase()

  if (status === 'sent') return 'default'
  if (status === 'scheduled') return 'outline'
  if (status === 'pending') return 'secondary'
  if (['failed', 'error'].includes(status)) return 'destructive'

  return 'secondary'
}
