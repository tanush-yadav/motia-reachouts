import format from 'date-fns/format'
import {
  CheckCircle,
  Edit,
  ExternalLink,
  Forward,
  Loader2,
  MoreVertical,
  Reply,
  ReplyAll,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  deleteEmail,
  getEmailById,
  getLeadById,
  updateApprovalStatus,
  updateEmail,
} from '@/lib/emailService'
import React from 'react'
import { Mail } from '../app/data'
import { useMail } from '../app/use-mail'
import { EmailMetadata } from './email-metadata'

interface MailDisplayProps {
  mail: Mail | null
  onEmailDeleted?: () => void
}

export function MailDisplay({ mail, onEmailDeleted }: MailDisplayProps) {
  const today = new Date()
  const [emailDetails, setEmailDetails] = React.useState<any>(null)
  const [leadDetails, setLeadDetails] = React.useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [, setMail] = useMail()

  React.useEffect(() => {
    async function fetchEmailDetails() {
      if (mail?.id) {
        const details = await getEmailById(mail.id)
        setEmailDetails(details)

        // Initialize edit fields with current values
        setEditSubject(details?.subject || '')
        setEditBody(details?.body || '')

        // Fetch lead details if lead_id exists
        if (details?.lead_id) {
          const lead = await getLeadById(details.lead_id)
          setLeadDetails(lead)
        } else {
          setLeadDetails(null)
        }
      } else {
        setEmailDetails(null)
        setEditSubject('')
        setEditBody('')
        setLeadDetails(null)
      }
    }

    fetchEmailDetails()
    // Reset edit mode when mail changes
    setIsEditing(false)
  }, [mail?.id])

  const handleDelete = async () => {
    if (!mail?.id) return

    try {
      setIsDeleting(true)
      await deleteEmail(mail.id)
      setMail({ selected: null })
      if (onEmailDeleted) {
        onEmailDeleted()
      }
    } catch (error) {
      console.error('Failed to delete email:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApproval = async (approve: boolean) => {
    if (!mail?.id) return

    try {
      if (approve) {
        setIsApproving(true)
      } else {
        setIsRejecting(true)
      }

      await updateApprovalStatus(mail.id, approve)

      // Update local state
      setEmailDetails((prev) => ({
        ...prev,
        is_approved: approve,
      }))
    } catch (error) {
      console.error(`Failed to ${approve ? 'approve' : 'reject'} email:`, error)
    } finally {
      setIsApproving(false)
      setIsRejecting(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!mail?.id) return

    try {
      setIsSaving(true)

      // Only scheduled emails can be edited
      if (emailDetails?.status !== 'Scheduled') {
        alert('Only scheduled emails can be edited')
        return
      }

      await updateEmail(mail.id, {
        subject: editSubject,
        body: editBody,
      })

      // Update local state
      setEmailDetails((prev) => ({
        ...prev,
        subject: editSubject,
        body: editBody,
      }))

      // Update mail object to reflect changes
      if (mail) {
        setMail({
          selected: mail.id,
          mail: {
            ...mail,
            subject: editSubject,
            text: editBody,
          },
        })
      }

      // Exit edit mode
      setIsEditing(false)

      // Refresh emails list
      if (onEmailDeleted) {
        onEmailDeleted()
      }
    } catch (error) {
      console.error('Failed to save email:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Function to open job URL
  const openJobUrl = () => {
    if (leadDetails?.job_url) {
      window.open(leadDetails.job_url, '_blank')
    }
  }

  // Function to open company URL
  const openCompanyUrl = () => {
    if (leadDetails?.company_url) {
      window.open(leadDetails.company_url, '_blank')
    }
  }

  // Function to highlight URLs in text
  const highlightUrls = (text: string) => {
    if (!text) return ''

    // If text is HTML, just return it
    if (text.startsWith('<')) return text

    // Regular expression to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g

    return text.replace(urlRegex, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">${url}</a>`
    })
  }

  // Check if email is editable (only scheduled emails)
  const isEmailEditable = emailDetails?.status === 'Scheduled'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center p-2">
        <div className="flex items-center gap-2">
          {/* YC Icon */}
          {leadDetails?.job_url && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="bg-orange-100 hover:bg-orange-200"
                    onClick={openJobUrl}
                  >
                    <div className="h-4 w-4 flex items-center justify-center font-bold text-orange-500">
                      Y
                    </div>
                    <span className="sr-only">Go to YC Job</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View job on Y Combinator</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="mx-1 h-6" />
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={!mail || isDeleting}
                onClick={handleDelete}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="sr-only">Delete</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={
                  !mail || isApproving || emailDetails?.is_approved === true
                }
                onClick={() => handleApproval(true)}
                className={
                  emailDetails?.is_approved === true ? 'bg-green-50' : ''
                }
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                <span className="sr-only">Approve</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {emailDetails?.is_approved === true ? 'Approved' : 'Approve'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={
                  !mail || isRejecting || emailDetails?.is_approved === false
                }
                onClick={() => handleApproval(false)}
                className={
                  emailDetails?.is_approved === false ? 'bg-red-50' : ''
                }
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="sr-only">Reject</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {emailDetails?.is_approved === false ? 'Rejected' : 'Reject'}
            </TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 h-6" />
          {/* Edit/Save buttons */}
          {isEmailEditable && (
            <>
              {isEditing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!mail || isSaving}
                      onClick={handleSaveEdit}
                      className={isSaving ? 'bg-blue-50' : ''}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span className="sr-only">Save</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save changes</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!mail || !isEmailEditable}
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit email</TooltipContent>
                </Tooltip>
              )}
              <Separator orientation="vertical" className="mx-1 h-6" />
            </>
          )}
          {/* <Tooltip>
            <Popover>
              <PopoverTrigger asChild>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={!mail}>
                    <Clock className="h-4 w-4" />
                    <span className="sr-only">Snooze</span>
                  </Button>
                </TooltipTrigger>
              </PopoverTrigger>
              <PopoverContent className="flex w-[535px] p-0">
                <div className="flex flex-col gap-2 border-r px-2 py-4">
                  <div className="px-4 text-sm font-medium">Snooze until</div>
                  <div className="grid min-w-[250px] gap-1">
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Later today{' '}
                      <span className="ml-auto text-muted-foreground">
                        {format(addHours(today, 4), 'E, h:m b')}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Tomorrow
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 1), 'E, h:m b')}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      This weekend
                      <span className="ml-auto text-muted-foreground">
                        {format(nextSaturday(today), 'E, h:m b')}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start font-normal"
                    >
                      Next week
                      <span className="ml-auto text-muted-foreground">
                        {format(addDays(today, 7), 'E, h:m b')}
                      </span>
                    </Button>
                  </div>
                </div>
                <div className="p-2">
                  <Calendar />
                </div>
              </PopoverContent>
            </Popover>
            <TooltipContent>Snooze</TooltipContent>
          </Tooltip> */}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail}>
                <Reply className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail}>
                <ReplyAll className="h-4 w-4" />
                <span className="sr-only">Reply all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reply all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!mail}>
                <Forward className="h-4 w-4" />
                <span className="sr-only">Forward</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forward</TooltipContent>
          </Tooltip>
        </div>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!mail}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Mark as unread</DropdownMenuItem>
            <DropdownMenuItem>Star thread</DropdownMenuItem>
            <DropdownMenuItem>Add label</DropdownMenuItem>
            <DropdownMenuItem>Mute thread</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />
      {mail ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-start p-4">
            <div className="flex items-start gap-4 text-sm">
              <Avatar>
                <AvatarImage alt={mail.name} />
                <AvatarFallback>
                  {mail.name
                    .split(' ')
                    .map((chunk) => chunk[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <div className="font-semibold">{mail.name}</div>
                {isEditing ? (
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Subject"
                    className="text-xs h-7 mt-1"
                  />
                ) : (
                  <div className="line-clamp-1 text-xs">{mail.subject}</div>
                )}
                <div className="line-clamp-1 text-xs">
                  <span className="font-medium">To:</span> {mail.email}
                </div>
                {emailDetails && (
                  <EmailMetadata
                    status={emailDetails.status}
                    scheduledAt={emailDetails.scheduled_at}
                    sentAt={emailDetails.sent_at}
                  />
                )}
                {leadDetails && (
                  <div className="flex items-center text-xs text-blue-500 mt-1">
                    <span className="font-medium mr-1">Company:</span>
                    <span>{leadDetails.company_name}</span>
                    <div className="flex ml-2">
                      {leadDetails.job_url && (
                        <button
                          onClick={openJobUrl}
                          className="text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Job post
                        </button>
                      )}
                      {leadDetails.company_url && (
                        <button
                          onClick={openCompanyUrl}
                          className="ml-3 text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Company site
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {mail.date && (
              <div className="ml-auto text-xs text-muted-foreground">
                {format(new Date(mail.date), 'PPpp')}
              </div>
            )}
          </div>
          <Separator />
          <div className="flex-1 p-4 text-sm overflow-auto">
            {isEditing ? (
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder="Email body"
                className="w-full min-h-[200px]"
              />
            ) : mail.text.startsWith('<') ? (
              <div dangerouslySetInnerHTML={{ __html: mail.text }} />
            ) : (
              <div
                className="whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: highlightUrls(mail.text) }}
              />
            )}
          </div>
          <Separator className="mt-auto" />
          <div className="p-4">
            <form>
              <div className="grid gap-4">
                <Textarea
                  className="p-4"
                  placeholder={`Reply ${mail.name}...`}
                />
                <div className="flex items-center">
                  <Label
                    htmlFor="mute"
                    className="flex items-center gap-2 text-xs font-normal"
                  >
                    <Switch id="mute" aria-label="Mute thread" /> Mute this
                    thread
                  </Label>
                  <Button
                    onClick={(e) => e.preventDefault()}
                    size="sm"
                    className="ml-auto"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-muted-foreground">
          No message selected
        </div>
      )}
    </div>
  )
}
