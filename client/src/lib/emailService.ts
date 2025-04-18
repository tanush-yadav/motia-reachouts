import { EmailType, supabase, TemplateType } from './supabase'

export async function getEmails() {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .order('sent_at', { ascending: false })

  if (error) {
    console.error('Error fetching emails:', error)
    return []
  }

  return data as EmailType[]
}

export async function getEmailById(id: string) {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching email:', error)
    return null
  }

  return data as EmailType
}

export async function getLeadById(id: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching lead:', error)
    return null
  }

  return data
}

export async function deleteEmail(id: string) {
  const { error } = await supabase.from('emails').delete().eq('id', id)

  if (error) {
    console.error('Error deleting email:', error)
    throw error
  }

  return true
}

export async function updateApprovalStatus(id: string, isApproved: boolean, variation?: number) {
  const updateData: any = { is_approved: isApproved }

  // If approving and a variation number is provided, include it in the update
  if (isApproved && variation !== undefined) {
    updateData.approved_variation = variation
  }

  const { error } = await supabase
    .from('emails')
    .update(updateData)
    .eq('id', id)

  if (error) {
    console.error('Error updating approval status:', error)
    throw error
  }

  return true
}

// Convert Supabase email type to Mail type used in the UI
export function convertEmailToMailFormat(email: EmailType) {
  const name = email.to_email.split('@')[0] || 'Unknown'

  // Determine which body to use (approved variation or default)
  let emailBody = email.body || '';
  if (email.is_approved && email.approved_variation) {
    if (email.approved_variation === 1 && email.body_1) {
      emailBody = email.body_1;
    } else if (email.approved_variation === 2 && email.body_2) {
      emailBody = email.body_2;
    } else if (email.approved_variation === 3 && email.body_3) {
      emailBody = email.body_3;
    }
  }

  return {
    id: email.id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    email: email.to_email,
    subject: email.subject || 'No Subject',
    text: emailBody,
    date: email.sent_at,
    read: true, // Assuming all emails are read
    labels: [email.status.toLowerCase()],
    is_approved: email.is_approved,
    lead_id: email.lead_id,
  }
}

export async function updateEmail(id: string, updates: Partial<EmailType>) {
  const { error } = await supabase.from('emails').update(updates).eq('id', id)

  if (error) {
    console.error('Error updating email:', error)
    throw error
  }

  return true
}

// --- Template Functions ---

export async function getTemplates(): Promise<TemplateType[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching templates:', error)
    return []
  }

  return data as TemplateType[]
}

export async function updateTemplate(
  id: string,
  updates: { subject?: string; body?: string }
) {
  const { error } = await supabase
    .from('templates')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating template:', error)
    throw error
  }

  return true
}

export async function createTemplate(template: {
  name: string
  subject: string
  body: string
}) {
  const { data, error } = await supabase
    .from('templates')
    .insert(template)
    .select()
    .single()

  if (error) {
    console.error('Error creating template:', error)
    throw error
  }

  return data as TemplateType
}
