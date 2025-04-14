'use client'

import {
  AlertCircle,
  Ban,
  BookText,
  Clock,
  File,
  Inbox,
  Search,
  Send,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { cn } from '@/lib/utils'

import { AccountSwitcher } from '@/components/account-switcher'
import { MailDisplay } from '@/components/mail-display'
import { MailList } from '@/components/mail-list'
import { Nav } from '@/components/nav'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  convertEmailToMailFormat,
  createTemplate,
  getEmails,
  getTemplates,
} from '@/lib/emailService'
import { TemplateType } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'
import { type Mail } from '../app/data'
import { useMail } from '../app/use-mail'
import { TemplateDisplay } from './template-display'
import { TemplateList } from './template-list'

interface MailProps {
  accounts: {
    label: string
    email: string
    icon: React.ReactNode
  }[]
  mails: Mail[]
  defaultLayout: number[] | undefined
  defaultCollapsed?: boolean
  navCollapsedSize: number
}

export function Mail({
  accounts,
  mails: initialMails,
  defaultLayout = [265, 440, 655],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [mail, setMail] = useMail()
  const [mails, setMails] = React.useState<Mail[]>(initialMails)
  const [templates, setTemplates] = React.useState<TemplateType[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null)
  const [loading, setLoading] = React.useState(false)
  const [viewMode, setViewMode] = React.useState<'mail' | 'templates'>('mail')
  const [activeTab, setActiveTab] = React.useState('inbox')
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = React.useState(false)
  const [newTemplateName, setNewTemplateName] = React.useState('')
  const [newTemplateSubject, setNewTemplateSubject] = React.useState('')
  const [newTemplateBody, setNewTemplateBody] = React.useState('')
  const [isCreatingTemplate, setIsCreatingTemplate] = React.useState(false)

  const fetchMailData = React.useCallback(async () => {
    try {
      setLoading(true)
      const emailsData = await getEmails()
      const formattedMails = emailsData.map(convertEmailToMailFormat)
      setMails(formattedMails)
    } catch (error) {
      console.error('Error refreshing emails:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTemplateData = React.useCallback(async () => {
    try {
      setLoading(true)
      const templatesData = await getTemplates()
      setTemplates(templatesData)
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshData = React.useCallback(() => {
    if (viewMode === 'mail') {
      fetchMailData()
    } else {
      fetchTemplateData()
    }
  }, [viewMode, fetchMailData, fetchTemplateData])

  React.useEffect(() => {
    setMails(initialMails)
  }, [initialMails])

  React.useEffect(() => {
    refreshData()
  }, [viewMode, refreshData])

  const getFilteredEmails = () => {
    if (activeTab === 'inbox') {
      return mails.filter(
        (mail) => mail.is_approved !== false && !mail.labels.includes('sent')
      )
    } else if (activeTab === 'rejected') {
      return mails.filter((mail) => mail.is_approved === false)
    } else if (activeTab === 'sent') {
      return mails.filter(
        (mail) => mail.labels.includes('sent') || mail.labels.includes('Sent')
      )
    } else if (activeTab === 'scheduled') {
      return mails.filter((mail) => mail.labels.includes('scheduled'))
    } else if (activeTab === 'pending') {
      return mails.filter((mail) => mail.labels.includes('pending'))
    } else if (activeTab === 'failed') {
      return mails.filter(
        (mail) =>
          mail.labels.includes('failed') || mail.labels.includes('error')
      )
    }

    return mails
  }

  const inboxCount = mails.filter(
    (mail) => mail.is_approved !== false && !mail.labels.includes('sent')
  ).length
  const rejectedCount = mails.filter(
    (mail) => mail.is_approved === false
  ).length
  const sentCount = mails.filter(
    (mail) => mail.labels.includes('sent') || mail.labels.includes('Sent')
  ).length
  const scheduledCount = mails.filter((mail) =>
    mail.labels.includes('scheduled')
  ).length
  const pendingCount = mails.filter((mail) =>
    mail.labels.includes('pending')
  ).length
  const failedCount = mails.filter(
    (mail) => mail.labels.includes('failed') || mail.labels.includes('error')
  ).length

  const handleMailTabChange = (tab: string) => {
    setActiveTab(tab)
    setMail({ selected: null })
  }

  const filteredEmails = getFilteredEmails()
  const selectedTemplate = React.useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null
  }, [templates, selectedTemplateId])

  const getNavLinks = () => {
    if (viewMode === 'templates') {
      return [
        {
          title: 'Templates',
          label: templates.length.toString(),
          icon: BookText,
          variant: 'default' as 'default' | 'ghost',
        },
      ]
    } else {
      return [
        {
          title: 'Inbox',
          label: inboxCount.toString(),
          icon: Inbox,
          variant:
            activeTab === 'inbox'
              ? 'default'
              : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('inbox'),
        },
        {
          title: 'Rejected',
          label: rejectedCount.toString(),
          icon: Ban,
          variant:
            activeTab === 'rejected'
              ? 'default'
              : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('rejected'),
        },
        {
          title: 'Sent',
          label: sentCount.toString(),
          icon: Send,
          variant:
            activeTab === 'sent' ? 'default' : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('sent'),
        },
        {
          title: 'Scheduled',
          label: scheduledCount.toString(),
          icon: Clock,
          variant:
            activeTab === 'scheduled'
              ? 'default'
              : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('scheduled'),
        },
        {
          title: 'Pending',
          label: pendingCount.toString(),
          icon: File,
          variant:
            activeTab === 'pending'
              ? 'default'
              : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('pending'),
        },
        {
          title: 'Failed',
          label: failedCount.toString(),
          icon: AlertCircle,
          variant:
            activeTab === 'failed'
              ? 'default'
              : ('ghost' as 'default' | 'ghost'),
          onClick: () => handleMailTabChange('failed'),
        },
      ]
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName || !newTemplateSubject || !newTemplateBody) return

    setIsCreatingTemplate(true)
    try {
      const newTemplate = await createTemplate({
        name: newTemplateName,
        subject: newTemplateSubject,
        body: newTemplateBody,
      })

      await fetchTemplateData()

      setSelectedTemplateId(newTemplate.id)

      setIsCreateTemplateOpen(false)
      setNewTemplateName('')
      setNewTemplateSubject('')
      setNewTemplateBody('')
    } catch (error) {
      console.error('Error creating template:', error)
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout=${JSON.stringify(
            sizes
          )}`
        }}
        className="h-full items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15}
          maxSize={20}
          onCollapse={(collapsed) => {
            setIsCollapsed(collapsed)
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
              collapsed
            )}`
          }}
          className={cn(
            isCollapsed &&
              'min-w-[50px] transition-all duration-300 ease-in-out'
          )}
        >
          <div className="p-2 flex justify-center gap-1">
            <Button
              variant={viewMode === 'mail' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewMode('mail')
                setSelectedTemplateId(null)
              }}
              className="flex-1"
            >
              Mail
            </Button>
            <Button
              variant={viewMode === 'templates' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewMode('templates')
                setMail({ selected: null })
              }}
              className="flex-1"
            >
              Templates
            </Button>
          </div>
          <Separator />
          <div
            className={cn(
              'flex h-[52px] items-center justify-center',
              isCollapsed ? 'h-[52px]' : 'px-2'
            )}
          >
            <AccountSwitcher isCollapsed={isCollapsed} accounts={accounts} />
          </div>
          <Separator />
          <Nav isCollapsed={isCollapsed} links={getNavLinks()} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          {viewMode === 'mail' ? (
            <Tabs
              defaultValue="all"
              value={activeTab}
              onValueChange={handleMailTabChange}
            >
              <div className="flex items-center px-4 py-2">
                <h1 className="text-xl font-bold">
                  {activeTab === 'inbox' && 'Inbox'}
                  {activeTab === 'rejected' && 'Rejected Emails'}
                  {activeTab === 'sent' && 'Sent Emails'}
                  {activeTab === 'scheduled' && 'Scheduled Emails'}
                  {activeTab === 'pending' && 'Pending Emails'}
                  {activeTab === 'failed' && 'Failed Emails'}
                </h1>
              </div>
              <Separator />
              <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <form>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search Mail" className="pl-8" />
                  </div>
                </form>
              </div>
              <TabsContent value={activeTab} className="m-0">
                <MailList items={filteredEmails} />
              </TabsContent>
            </Tabs>
          ) : (
            <div>
              <div className="flex items-center px-4 py-2">
                <h1 className="text-xl font-bold">Email Templates</h1>
              </div>
              <Separator />
              <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <form>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search Templates" className="pl-8" />
                  </div>
                </form>
              </div>
              <TemplateList
                items={templates}
                selectedTemplateId={selectedTemplateId}
                onSelectTemplate={setSelectedTemplateId}
              />
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">
                  {viewMode === 'mail'
                    ? 'Refreshing emails...'
                    : 'Loading templates...'}
                </p>
              </div>
            </div>
          ) : viewMode === 'mail' ? (
            <MailDisplay
              mail={
                filteredEmails.find((item) => item.id === mail.selected) || null
              }
              onEmailDeleted={refreshData}
            />
          ) : (
            <TemplateDisplay
              template={selectedTemplate}
              onTemplateUpdated={refreshData}
              onCreateNew={() => setIsCreateTemplateOpen(true)}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog
        open={isCreateTemplateOpen}
        onOpenChange={setIsCreateTemplateOpen}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Create a new email template with placeholders for personalization.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Template Name
              </Label>
              <Input
                id="name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Initial Outreach"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subject" className="text-right">
                Subject Line
              </Label>
              <Input
                id="subject"
                value={newTemplateSubject}
                onChange={(e) => setNewTemplateSubject(e.target.value)}
                placeholder="e.g., Interested in {role} at {company_name}"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="body" className="text-right pt-2">
                Email Body
              </Label>
              <Textarea
                id="body"
                value={newTemplateBody}
                onChange={(e) => setNewTemplateBody(e.target.value)}
                placeholder="Hello {contact_first_name},

I noticed your {role} position at {company_name} and I'm interested in learning more.

Best regards,
{sender_name}"
                className="col-span-3 min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="col-span-4 px-2">
              <div className="p-3 bg-muted rounded-md text-sm">
                <h4 className="font-semibold mb-1">Available Placeholders:</h4>
                <p className="text-muted-foreground">
                  {'{contact_name}'}, {'{contact_first_name}'},{' '}
                  {'{company_name}'}, {'{role}'}, {'{sender_name}'},{' '}
                  {'{sender_first_name}'}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateTemplateOpen(false)}
              disabled={isCreatingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={
                isCreatingTemplate ||
                !newTemplateName ||
                !newTemplateSubject ||
                !newTemplateBody
              }
            >
              {isCreatingTemplate ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
