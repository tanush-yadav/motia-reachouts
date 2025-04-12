'use client' // Ensure this line is at the top

import Cookies from 'js-cookie'
import Image from 'next/image'
import { useEffect, useState } from 'react'

import { Mail } from '@/components/mail'
import { convertEmailToMailFormat, getEmails } from '@/lib/emailService'
import { accounts, Mail as MailType } from './data'

export default function MailPage() {
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

    // Add the no-scroll class to the body when the component mounts
    document.body.classList.add('no-scroll')

    // Remove the no-scroll class when the component unmounts
    return () => {
      document.body.classList.remove('no-scroll')
    }
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
    <div className="h-screen flex flex-col">
      <div className="md:hidden">
        <Image
          src="/examples/mail-dark.png"
          width={1280}
          height={727}
          alt="Mail"
          className="hidden dark:block"
        />
        <Image
          src="/examples/mail-light.png"
          width={1280}
          height={727}
          alt="Mail"
          className="block dark:hidden"
        />
      </div>
      <div className="hidden flex-col md:flex h-full flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-lg">Loading emails...</p>
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
    </div>
  )
}
