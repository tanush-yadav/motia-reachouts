# Product Requirements Document: Follow-Up Email Scheduling

## 1. Introduction

This document outlines the requirements for implementing a follow-up email scheduling system within the Auto Reachouts application. The goal is to automatically schedule and send follow-up emails to leads who haven't responded to the initial outreach, improving engagement and response rates.

## 2. Goals

- **Automate Follow-ups**: Automatically schedule follow-up emails based on defined criteria (e.g., no reply after X days).
- **Maintain Thread Context**: Send follow-ups as replies within the original email thread.
- **Separate Approval**: Allow users to approve follow-up emails independently from initial emails.
- **Improve Engagement**: Increase the likelihood of receiving responses from leads.
- **Streamline Workflow**: Reduce manual effort required for following up.

## 3. Functional Requirements

### 3.1. Scheduling Follow-ups

- **Trigger**: A follow-up should be scheduled automatically when an initial email is scheduled.
- **Timing**: Follow-ups should be scheduled for a configurable number of days (e.g., 3-5 business days) after the initial email's scheduled send date.
- **Template**: Use a designated "follow-up" email template. This template should be customizable.
- **Database**: Store follow-up email details (schedule date, template, status) in the `emails` table.

### 3.2. Sending Follow-ups as Replies

- **Thread Identification**: The system must identify and store the `Message-ID` and `References` headers of the initial sent email. This is crucial for threading.
- **Email Sender Modification**: The `EmailSender` (whether Gmail or Postal) needs to be updated to support sending emails as replies using the stored `Message-ID` and `References`.
  - **Nodemailer (Gmail)**: Requires setting `inReplyTo` and `references` headers in `mailOptions`.
  - **Postal**: Needs investigation on how its API supports sending replies within a thread.
- **Subject Line**: Follow-up emails should typically reuse the original subject line, prefixed with "Re:".

### 3.3. Follow-up Approval Workflow

- **Separate Approval State**: Follow-up emails will have their own `is_approved` status in the database, distinct from the initial email.
- **UI for Approval**: The client UI (`client/`) needs to be updated to display pending follow-up emails.
- **Bulk Actions**: Implement "Select All" and "Approve Selected" functionality in the UI for efficient approval of follow-ups.
- **Filtering**: Allow users to filter the email list to show only pending follow-up emails.

### 3.4. Tracking and Status Updates

- **Follow-up Status**: Introduce new statuses like `FollowUpScheduled`, `FollowUpPendingApproval`, `FollowUpSent`, `FollowUpError`.
- **Lead Status Update**: Update the `leads` table status to reflect when a follow-up has been sent or if an error occurred.
- **Cancellation**: Implement logic to automatically cancel a scheduled follow-up if a reply is detected from the lead before the follow-up send date (requires reply detection, see Section 5).

## 4. Technical Implementation Plan

### 4.1. Database Schema Changes (`emails` table)

- Add `parent_email_id` (UUID, nullable): Links a follow-up email to its original email.
- Add `email_type` (TEXT, default 'initial'): Differentiates between 'initial' and 'followup' emails.
- Add `thread_id` (TEXT, nullable): Stores the `Message-ID` of the initial email for threading.
- Add `references_header` (TEXT, nullable): Stores the `References` header value for threading.

**(Action)**: Create a new SQL migration script (`follow-up-setup.sql`) to apply these changes.

### 4.2. Backend (`steps/`) Changes

- **`schedule-email.step.ts`**:
  - When scheduling an initial email (`email_type = 'initial'`), also create a _second_ email record with `email_type = 'followup'`.
  - Link the follow-up to the initial email using `parent_email_id`.
  - Calculate the `scheduled_at` date for the follow-up (e.g., initial send date + 3 days).
  - Use a designated 'follow-up' template.
  - Set the follow-up's initial status to `FollowUpScheduled` and `is_approved = null`.
  - Emit an `email.followup.approval.required` event.
- **`send-scheduled-emails.step.ts`**:
  - Modify the query to fetch _approved_ emails (both initial and follow-up) scheduled for sending.
  - **Crucially**: Update the `emailSender.sendEmail` call. If `email_type` is 'followup', pass the `thread_id` and `references_header` from the parent email record to the sender function.
  - After sending the _initial_ email, retrieve its `Message-ID` from the sending service (Gmail/Postal) and update the initial email record's `thread_id` and `references_header` fields in the database. This is essential for the follow-up to be threaded correctly.
- **`EmailSender` Interface/Implementations**:
  - Update the `EmailSender` interface and its implementations (`GmailEmailSender`, potentially `PostalEmailSender`) to accept optional `threadId` and `references` parameters.
  - Implement the logic to set the correct headers (`In-Reply-To`, `References`) when these parameters are provided.

### 4.3. Client UI (`client/`) Changes

- **`lib/emailService.ts`**:
  - Update `getEmails` to potentially filter by `email_type` or fetch related emails.
  - Add functions to approve/reject follow-up emails (similar to `updateApprovalStatus`).
  - Modify `convertEmailToMailFormat` to visually distinguish follow-up emails (e.g., different icon, label).
- **`components/mail.tsx` (or relevant UI component)**:
  - Display follow-up emails in the list.
  - Add filtering options for 'Initial Emails', 'Follow-ups Pending Approval'.
  - Implement checkbox selection for emails.
  - Add "Approve Selected" and potentially "Reject Selected" buttons.
  - Ensure the display clearly shows if an email is an initial outreach or a follow-up.

## 5. Considerations and Future Enhancements

- **Reply Detection**: How will the system detect if a lead has replied? This is critical to cancel scheduled follow-ups. Options:
  - **Manual**: User manually updates the lead status.
  - **IMAP Integration**: Connect to the sending mailbox via IMAP to monitor for replies (complex).
  - **Webhook (if supported)**: If the email service (like Postal) provides webhooks for replies.
  - **Assumption**: For V1, we might assume manual cancellation or rely on the user not approving follow-ups if a reply was received.
- **Multiple Follow-ups**: This design focuses on one follow-up. Supporting sequences (2nd follow-up, 3rd follow-up) would require extending the `email_type` logic and scheduling process.
- **Template Management**: Need a way to manage and select different follow-up templates.
- **Error Handling**: Robust error handling for follow-up scheduling and sending. What happens if retrieving the `Message-ID` fails?
- **Throttling/Rate Limiting**: Ensure follow-up sending respects the same batching and delay logic as initial emails.
- **Unsubscribe Handling**: Ensure follow-ups are not sent if a user unsubscribes.

## 6. Success Metrics

- Number of follow-up emails successfully sent.
- Open and click rates for follow-up emails (requires reliable tracking).
- Increase in overall reply rate compared to initial outreach alone.
- User feedback on the ease of managing follow-up approvals.

## 7. Rollout Plan

1. **Backend Development**: Implement database changes and backend step modifications.
2. **Email Sender Update**: Modify email sending logic for threading.
3. **Client UI Development**: Build the UI components for follow-up management and approval.
4. **Testing**: Thoroughly test scheduling, sending (as replies), and approval workflows.
5. **Deployment**: Deploy backend and frontend changes.
