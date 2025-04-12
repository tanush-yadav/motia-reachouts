import formatDistanceToNow from 'date-fns/formatDistanceToNow'
import { ComponentProps } from 'react'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Mail } from '../app/data'
import { useMail } from '../app/use-mail'

interface MailListProps {
  items: Mail[]
}

export function MailList({ items }: MailListProps) {
  const [mail, setMail] = useMail()

  return (
    <ScrollArea className="h-[calc(100vh-10rem)]">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p>No emails found</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              className={cn(
                'flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent',
                mail.selected === item.id && 'bg-muted'
              )}
              onClick={() =>
                setMail({
                  ...mail,
                  selected: item.id,
                })
              }
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{item.name}</div>
                    {!item.read && (
                      <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'ml-auto text-xs',
                      mail.selected === item.id
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {formatDistanceToNow(new Date(item.date), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
                <div className="text-xs font-medium">{item.subject}</div>
              </div>
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {item.text.substring(0, 300)}
              </div>
              {item.labels.length ? (
                <div className="flex items-center gap-2">
                  {item.labels.map((label) => (
                    <Badge
                      key={label}
                      variant={getBadgeVariantFromLabel(label)}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </ScrollArea>
  )
}

function getBadgeVariantFromLabel(
  label: string
): ComponentProps<typeof Badge>['variant'] {
  if (['work', 'sent'].includes(label.toLowerCase())) {
    return 'default'
  }

  if (['personal', 'scheduled'].includes(label.toLowerCase())) {
    return 'outline'
  }

  if (['pending'].includes(label.toLowerCase())) {
    return 'secondary'
  }

  if (['failed', 'error'].includes(label.toLowerCase())) {
    return 'destructive'
  }

  return 'secondary'
}
