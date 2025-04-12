'use client'

import { AlertCircle, Clock, File, Inbox, Search, Send } from 'lucide-react'
import * as React from 'react'

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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { convertEmailToMailFormat, getEmails } from '@/lib/emailService'
import { type Mail } from '../app/data'
import { useMail } from '../app/use-mail'

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
  const [loading, setLoading] = React.useState(false)

  // Function to refresh emails
  const refreshEmails = React.useCallback(async () => {
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

  // Initialize mails from props
  React.useEffect(() => {
    setMails(initialMails)
  }, [initialMails])

  // Count emails by status
  const sentCount = mails.filter((mail) => mail.labels.includes('sent')).length
  const scheduledCount = mails.filter((mail) =>
    mail.labels.includes('scheduled')
  ).length
  const pendingCount = mails.filter((mail) =>
    mail.labels.includes('pending')
  ).length
  const failedCount = mails.filter(
    (mail) => mail.labels.includes('failed') || mail.labels.includes('error')
  ).length
  const allCount = mails.length

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
          <div
            className={cn(
              'flex h-[52px] items-center justify-center',
              isCollapsed ? 'h-[52px]' : 'px-2'
            )}
          >
            <AccountSwitcher isCollapsed={isCollapsed} accounts={accounts} />
          </div>
          <Separator />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: 'All Emails',
                label: allCount.toString(),
                icon: Inbox,
                variant: 'default',
              },
              {
                title: 'Sent',
                label: sentCount.toString(),
                icon: Send,
                variant: 'ghost',
              },
              {
                title: 'Scheduled',
                label: scheduledCount.toString(),
                icon: Clock,
                variant: 'ghost',
              },
              {
                title: 'Pending',
                label: pendingCount.toString(),
                icon: File,
                variant: 'ghost',
              },
              {
                title: 'Failed',
                label: failedCount.toString(),
                icon: AlertCircle,
                variant: 'ghost',
              },
            ]}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs defaultValue="all">
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger
                  value="all"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  All mail
                </TabsTrigger>
                <TabsTrigger
                  value="unread"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  Unread
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <form>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search" className="pl-8" />
                </div>
              </form>
            </div>
            <TabsContent value="all" className="m-0">
              <MailList items={mails} />
            </TabsContent>
            <TabsContent value="unread" className="m-0">
              <MailList items={mails.filter((item) => !item.read)} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2">
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">
                  Refreshing emails...
                </p>
              </div>
            </div>
          ) : (
            <MailDisplay
              mail={mails.find((item) => item.id === mail.selected) || null}
              onEmailDeleted={refreshEmails}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}
