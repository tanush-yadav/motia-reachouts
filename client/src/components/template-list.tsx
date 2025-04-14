import { ScrollArea } from '@/components/ui/scroll-area'
import { TemplateType } from '@/lib/supabase' // Assuming TemplateType is defined here
import { cn } from '@/lib/utils'
import { Inbox } from 'lucide-react'

interface TemplateListProps {
  items: TemplateType[]
  selectedTemplateId: string | null
  onSelectTemplate: (id: string) => void
}

export function TemplateList({
  items,
  selectedTemplateId,
  onSelectTemplate,
}: TemplateListProps) {
  return (
    <ScrollArea className="h-[calc(100vh-10rem)]">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-2 opacity-50" />
            <p>No templates found</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left text-sm transition-all hover:bg-accent/50',
                selectedTemplateId === item.id &&
                  'bg-accent/30 border-accent/70'
              )}
              onClick={() => onSelectTemplate(item.id)}
            >
              <div className="font-medium text-sm">{item.name}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground mt-0.5">
                {item.subject || 'No subject'}
              </div>
            </button>
          ))
        )}
      </div>
    </ScrollArea>
  )
}
