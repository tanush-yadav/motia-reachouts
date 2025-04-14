# Product Requirements Document: Follow-Up Email Scheduling

## 1. Introduction

This document outlines the requirements for implementing a follow-up email scheduling system within the Auto Reachouts application (`client/` and `steps/`). The objective is to automatically schedule follow-up emails for leads who haven't responded to initial outreach, send them within the same email thread, manage their approval within a unified context, and thereby improve engagement rates.

## 2. Goals

- **Automate Follow-ups**: Automatically schedule one follow-up email when an initial email is scheduled.
- **Maintain Thread Context**: Send follow-up emails as replies within the original email thread using appropriate headers.
- **Unified Approval Context**: Allow users to view and approve/reject follow-ups within the context of the initial email thread in the client UI.
- **Improve Engagement**: Increase the likelihood of receiving responses.
- **Streamline Workflow**: Reduce manual follow-up effort while maintaining clarity.

## 3. Functional Requirements

### 3.1. Scheduling Follow-ups (Backend)

- **Trigger**: When an initial email is scheduled via `steps/schedule-email.step.ts`, a corresponding follow-up email must also be created as a _separate record_ in the database.
- **Timing**: Follow-ups must be scheduled exactly **3 business days** after the initial email's scheduled send date. Business days exclude weekends (Saturday, Sunday).
- **Template**: A specific email template designated for follow-ups must be used (identified by name/ID).
- **Database**: Follow-up email details must be stored in a distinct row in the `emails` table, linked to the initial email.

### 3.2. Sending Follow-ups as Replies (Backend)

- **Thread Identification**:
  - The `Message-ID` of the sent _initial_ email must be captured and stored in the `thread_id` column of the _initial_ email's record.
  - The `References` header must also be stored in the `references_header` column of the _initial_ email's record.
- **Email Sender Modification**:
  - The `EmailSender` interface and `GmailEmailSender` implementation (`steps/send-scheduled-emails.step.ts`) must accept optional `threadId` and `references` parameters.
  - When sending a follow-up email record, the handler must retrieve the `thread_id` and `references_header` from the parent email record.
  - **CRITICAL**: If the parent's `thread_id` or `references_header` cannot be retrieved, the follow-up send **must be aborted**, and the follow-up email status set to 'Error'.
  - The `GmailEmailSender` must set the `In-Reply-To` and `References` headers correctly when sending follow-ups.
- **Subject Line**: Follow-up emails use the subject line defined in the follow-up template.

### 3.3. Follow-up Management Workflow (Client)

- **Approval State**: Follow-up email records use the existing `is_approved` column (`null` initially).
- **Primary List View (`client/src/components/mail-list.tsx`)**:
  - This list primarily displays initial emails (`email_type='initial'`).
  - Filtering options (e.g., tabs in `components/mail.tsx`) should allow viewing specific subsets like 'Follow-ups Pending', 'All', 'Sent', etc.
  - Bulk approval actions via checkboxes in this list view are **removed** for V1 to favor contextual approval.
- **Detail View (`client/src/components/mail-display.tsx`)**: **(Major Change)**
  - When an initial email is selected, this component fetches the initial email data _and_ all associated follow-up email records linked via `parent_email_id`.
  - The view renders the initial email's details first (subject, body, status, etc.), allowing edits if applicable.
  - Below the initial email, the component iterates through and renders each associated follow-up record in sequence (e.g., "Follow-up 1").
  - For each rendered follow-up:
    - Display its scheduled date and current status (`FOLLOWUP_PENDING`, `Approved`, `Rejected`, `Sent`, `Failed`).
    - Display its subject and body. Make these fields editable (using controlled inputs) if the follow-up's status is `FOLLOWUP_PENDING` or `Scheduled`. Provide a save mechanism using the existing `updateEmail` service function.
    - Provide **individual Approve/Reject buttons** specific to _this_ follow-up record. These buttons trigger corresponding service functions (`approveFollowUp(followUpId)`, `rejectFollowUp(followUpId)`). Disable buttons based on the follow-up's current `is_approved` status.

### 3.4. Tracking and Status Updates (Backend)

- **Follow-up Status**: A new status `FOLLOWUP_PENDING` is required, set upon creation. Other statuses (`Sending`, `Sent`, `Failed`, `Scheduled` after approval) are managed as usual.
- **Lead Status Update**: The `leads` table status is not directly changed by follow-up actions.
- **Cancellation (V1 Limitation)**: No automatic cancellation based on reply detection. Users must manually reject/delete pending follow-ups via the detail view if a reply is received.

## 4. Technical Implementation Plan

### 4.1. Database Schema Changes (`emails` table)

Execute migration `migrations/<timestamp>_follow_up_setup.sql`:

```sql
-- Add columns to link follow-ups and store threading info
ALTER TABLE emails
ADD COLUMN parent_email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
ADD COLUMN email_type TEXT NOT NULL DEFAULT 'initial', -- 'initial' or 'followup'
ADD COLUMN thread_id TEXT, -- Stores Message-ID of the initial email
ADD COLUMN references_header TEXT; -- Stores References header value

-- Add the new status for follow-ups pending approval
-- Modify check constraint or ENUM for 'status' column to include 'FOLLOWUP_PENDING'
-- Example for ENUM: ALTER TYPE email_status_enum ADD VALUE 'FOLLOWUP_PENDING';

-- Add index for faster lookup of follow-ups by parent
CREATE INDEX IF NOT EXISTS idx_emails_parent_email_id ON emails (parent_email_id);
```

### 4.2. Backend (`steps/`) Changes

- **`steps/schedule-email.step.ts`**:
  - Modify `handler`: After creating the initial email (`email_type='initial'`), create a second record:
    - `email_type = 'followup'`, `parent_email_id = <initial_email_id>`.
    - Calculate `scheduled_at` (initial `scheduled_at` + 3 business days via utility function).
    - Use designated follow-up template content.
    - `status = 'FOLLOWUP_PENDING'`, `is_approved = null`.
    - Copy `lead_id`, `to_email`, etc.
- **`steps/send-scheduled-emails.step.ts`**:
  - **Query Modification**: Fetch emails where `is_approved = true` AND (`status = 'Scheduled'` OR `status = 'FOLLOWUP_PENDING'`) AND `scheduled_at <= now()`. (Adjust status logic if approval changes status).
  - **Email Sending Logic**:
    - _After_ sending `email_type = 'initial'`, retrieve `messageId` and update `thread_id` and `references_header` on the initial email record. Handle errors.
    - _Before_ sending `email_type = 'followup'`:
      - Query parent using `parent_email_id` for `thread_id`, `references_header`.
      - **CRITICAL**: If this query fails, or if `thread_id` or `references_header` are null on the parent record, the sending attempt for this follow-up email **must be aborted**. The follow-up email's status should be updated to 'Error' with an appropriate message (e.g., 'Parent thread info missing'), and the process should continue to the next email.
      - Pass `thread_id`, `references_header` to `emailSender.sendEmail`.
  - **`EmailSender` Interface & `GmailEmailSender` Class**:
    - Update `sendEmail` signature: add optional `threadId?: string`, `references?: string`.
    - Update `GmailEmailSender`: add `inReplyTo: threadId`, `references: references` to `mailOptions` if provided.

### 4.3. Client UI (`client/src/`) Changes

- **`lib/emailService.ts`**:
  - Modify `getEmailById(id)`: Fetch email with `id`. If it's 'initial', also query for emails where `parent_email_id = id`. Return `{ ...initialEmail, followUps: [...] }`.
  - Add: `approveFollowUp(followUpId: string)` and `rejectFollowUp(followUpId: string)` to update `is_approved` for a single ID.
  - Ensure `updateEmail(id, updates)` works for both initial and follow-up IDs.
  - Modify `convertEmailToMailFormat`: Include `email_type`.
- **`components/mail.tsx`**:
  - Implement filter controls (e.g., tabs) for 'All', 'Initial', 'Follow-ups Pending', 'Sent', etc. Logic updates the `getEmails` query based on the filter.
  - Remove bulk action buttons related to list selection.
- **`components/mail-list.tsx`**:
  - Primarily display initial emails based on data from `components/mail.tsx`.
  - Remove list item checkboxes.
  - Visually indicate email type if filter shows mixed types.
- **`components/mail-display.tsx`**: **(Major Change)**
  - Fetch data using the enhanced `getEmailById`.
  - Render the initial email section (editable subject/body/to_email if status allows).
  - Iterate through `followUps` array:
    - Render a distinct section for each follow-up.
    - Display follow-up's schedule date, status.
    - Render editable subject/body for the follow-up (if status allows).
    - Render individual Approve/Reject buttons for the follow-up, calling `approveFollowUp`/`rejectFollowUp`.

## 5. Considerations and Future Enhancements

- **Reply Detection (V1 Limitation)**: Manual user action required in V1.
- **Multiple Follow-ups**: Current design allows extension but implementation focuses on one.
- **Template Management**: Separate requirement for managing follow-up templates.
- **Error Handling**: Define behavior for specific failure points (fetching parent thread info, updating thread info).
- **Business Day Calculation**: Utility function needed; V1 may ignore holidays.

## 6. Success Metrics

- Count of follow-up emails scheduled and sent successfully.
- Comparison of reply rates (if tracked).
- User feedback on the unified detail view workflow.

## 7. Rollout Plan

1.  Implement/test database schema changes.
2.  Implement/test backend step changes (`schedule-email`, `send-scheduled-emails`).
3.  Implement/test `EmailSender` modifications.
4.  Implement/test client data service changes (`emailService.ts`).
5.  Implement/test client UI changes (`mail.tsx`, `mail-list.tsx`, `mail-display.tsx`).
6.  Conduct end-to-end testing focusing on the detail view interaction.
7.  Deploy.
