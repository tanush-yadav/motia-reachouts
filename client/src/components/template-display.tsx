import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { updateTemplate } from '@/lib/emailService'
import { TemplateType } from '@/lib/supabase'
import {
  Edit as EditIcon,
  Eye,
  FilePlus,
  Loader2,
  Mail,
  Save,
} from 'lucide-react'
import { useEffect, useState } from 'react'

interface TemplateDisplayProps {
  template: TemplateType | null
  onTemplateUpdated: () => void // Callback to refresh the list after update
  onCreateNew?: () => void // Optional callback to create a new template
}

export function TemplateDisplay({
  template,
  onTemplateUpdated,
  onCreateNew,
}: TemplateDisplayProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit')

  // Sample data for preview
  const sampleData = {
    contact_name: 'John Smith',
    contact_first_name: 'John',
    company_name: 'Acme Corp',
    role: 'Software Engineer',
    sender_name: 'Jane Doe',
    sender_first_name: 'Jane',
  }

  useEffect(() => {
    if (template) {
      setEditSubject(template.subject || '')
      setEditBody(template.body || '')
      setIsEditing(false) // Reset editing state when template changes
    } else {
      setEditSubject('')
      setEditBody('')
      setIsEditing(false)
    }
  }, [template])

  const handleSave = async () => {
    if (!template?.id) return

    setIsSaving(true)
    try {
      await updateTemplate(template.id, {
        subject: editSubject,
        body: editBody,
      })
      setIsEditing(false)
      onTemplateUpdated() // Refresh list in parent component
    } catch (error) {
      console.error('Failed to save template:', error)
      // TODO: Add user feedback (e.g., toast notification)
    } finally {
      setIsSaving(false)
    }
  }

  // Replace placeholders with sample data
  const getPreviewContent = (content: string): string => {
    if (!content) return ''
    return Object.entries(sampleData).reduce(
      (text, [key, value]) => text.replace(new RegExp(`{${key}}`, 'g'), value),
      content
    )
  }

  // Strip HTML tags from content
  const stripHtml = (html: string): string => {
    if (!html) return ''
    return html.replace(/<[^>]*>?/gm, '')
  }

  // Highlight placeholders with a background color and border
  const highlightPlaceholders = (text: string): React.ReactNode => {
    if (!text) return null

    const placeholderRegex = /{([a-z_]+)}/g
    const parts = []
    let lastIndex = 0
    let match

    while ((match = placeholderRegex.exec(text)) !== null) {
      // Add text before the placeholder
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index))
      }

      // Add the highlighted placeholder
      parts.push(
        <span
          key={`${match[0]}-${match.index}`}
          className="inline-block bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded px-1 text-blue-800 dark:text-blue-300 font-mono text-xs"
        >
          {match[0]}
        </span>
      )

      lastIndex = match.index + match[0].length
    }

    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return (
      <>
        {parts.map((part, i) =>
          typeof part === 'string' ? <span key={i}>{part}</span> : part
        )}
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center p-2 justify-between bg-muted/30">
        <h2 className="text-lg font-semibold p-2">
          {template ? template.name : 'Select a template'}
        </h2>
        <div className="flex gap-2">
          {onCreateNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateNew}
              className="gap-1"
            >
              <FilePlus className="h-4 w-4" />
              New
            </Button>
          )}
          {template && !isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="gap-1"
            >
              <EditIcon className="h-4 w-4" />
              Edit
            </Button>
          )}
          {template && isEditing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsEditing(false)
                  // Reset changes
                  setEditSubject(template.subject || '')
                  setEditBody(template.body || '')
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-1"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
            </>
          )}
        </div>
      </div>
      <Separator />

      {template ? (
        <div className="flex flex-1 flex-col">
          {isEditing ? (
            // Edit Mode
            <div className="flex flex-1 flex-col p-4 gap-4">
              <div>
                <Label htmlFor="template-subject" className="mb-1 font-medium">
                  Subject Line
                </Label>
                <Input
                  id="template-subject"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="Template subject"
                  disabled={isSaving}
                  className="font-medium"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <Label htmlFor="template-body" className="mb-1 font-medium">
                  Email Body
                </Label>
                <Textarea
                  id="template-body"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  placeholder="Template body (use {variable_name} for placeholders)"
                  className="flex-1 w-full min-h-[300px] font-mono text-sm"
                  disabled={isSaving}
                />
                <div className="mt-3 p-3 bg-muted/50 rounded-md border">
                  <h4 className="text-sm font-semibold mb-2">
                    Available Placeholders:
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs text-muted-foreground">
                    {Object.keys(sampleData).map((key) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 rounded px-1 text-blue-800 dark:text-blue-300 font-mono">
                          {`{${key}}`}
                        </span>
                        <span className="text-muted-foreground">
                          → {sampleData[key as keyof typeof sampleData]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // View/Preview Mode
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}
              className="flex-1 flex flex-col"
            >
              <div className="border-b px-4">
                <TabsList className="mt-2 mb-2">
                  <TabsTrigger value="edit" className="gap-1">
                    <EditIcon className="h-3.5 w-3.5" />
                    Template
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="edit"
                className="px-4 flex flex-col gap-4 overflow-auto py-4"
              >
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    SUBJECT
                  </Label>
                  <div className="rounded-md border border-input bg-card p-2.5 text-sm font-medium">
                    {highlightPlaceholders(template.subject)}
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    BODY
                  </Label>
                  <div className="rounded-md border border-input bg-card p-3 whitespace-pre-wrap flex-1 text-sm overflow-auto">
                    {highlightPlaceholders(template.body)}
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="preview"
                className="flex flex-col overflow-auto"
              >
                <div className="max-w-2xl w-full mx-auto p-5 flex-1 flex flex-col">
                  <div className="bg-white dark:bg-black border rounded-lg shadow-sm p-6 flex-1 flex flex-col">
                    <div className="flex items-center border-b pb-4 mb-4">
                      <Mail className="h-5 w-5 mr-2 text-primary" />
                      <h3 className="font-semibold">Email Preview</h3>
                    </div>

                    <div className="p-4 mb-4 border rounded-md bg-muted/20">
                      <div className="text-sm font-medium mb-1 text-muted-foreground">
                        To:
                      </div>
                      <div className="text-sm mb-3">
                        {sampleData.contact_name} &lt;
                        {sampleData.contact_first_name.toLowerCase()}@
                        {sampleData.company_name
                          .toLowerCase()
                          .replace(/\s+/g, '')}
                        .com&gt;
                      </div>

                      <div className="text-sm font-medium mb-1 text-muted-foreground">
                        Subject:
                      </div>
                      <div className="text-sm font-medium mb-3">
                        {stripHtml(getPreviewContent(template.subject))}
                      </div>

                      <Separator className="my-2" />

                      <div className="text-sm mt-4 email-body">
                        {stripHtml(getPreviewContent(template.body))
                          .split('\n')
                          .map((line, i) => (
                            <p
                              key={i}
                              className={line.trim() ? 'mb-2' : 'mb-1'}
                            >
                              {line}
                            </p>
                          ))}
                      </div>
                    </div>

                    <div className="mt-auto pt-2 text-xs text-muted-foreground italic">
                      This is a preview with sample data. Actual email content
                      will vary based on recipient information.
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full gap-4">
          <Mail className="h-10 w-10 opacity-40 mb-2" />
          <p className="text-lg">
            Select a template from the list to view or edit its content.
          </p>
          {onCreateNew && (
            <Button
              onClick={onCreateNew}
              variant="outline"
              className="mt-2 gap-2"
            >
              <FilePlus className="h-4 w-4" />
              Create New Template
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
