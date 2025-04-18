'use client'

import Cookies from 'js-cookie'
import { useEffect, useState } from 'react'

import { accounts, Mail as MailType } from '@/app/data'
import { Mail } from '@/components/mail'
import { convertEmailToMailFormat, getEmails } from '@/lib/emailService'
import { Loader2 } from 'lucide-react'

export default function EmailsPage() {
  const [defaultLayout, setDefaultLayout] = useState(undefined)
  const [defaultCollapsed, setDefaultCollapsed] = useState(undefined)
  const [mails, setMails] = useState<MailType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const layout = Cookies.get('react-resizable-panels:layout')
    const collapsed = Cookies.get('react-resizable-panels:collapsed')

    const parseJSON = (value) => {
      try {
        return JSON.parse(value)
      } catch (e) {
        console.error('Failed to parse JSON:', e)
        return undefined
      }
    }

    setDefaultLayout(layout ? parseJSON(layout) : undefined)
    setDefaultCollapsed(collapsed ? parseJSON(collapsed) : undefined)
  }, [])

  useEffect(() => {
    async function fetchEmails() {
      try {
        setLoading(true)
        const emailsData = await getEmails()
        const formattedMails = emailsData.map(convertEmailToMailFormat)
        setMails(formattedMails)
      } catch (error) {
        console.error('Error fetching emails:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchEmails()
  }, [])

  return (
    <div className="h-full flex-1">
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Mail
          accounts={accounts}
          mails={mails}
          defaultLayout={defaultLayout}
          defaultCollapsed={defaultCollapsed}
          navCollapsedSize={4}
        />
      )}
    </div>
  )
}