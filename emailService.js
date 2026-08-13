import nodemailer from 'nodemailer';
import { db } from '../db/db.js';
import { v4 as uuid } from 'uuid';

// If real SMTP credentials are provided via env vars, use them.
// Otherwise fall back to a JSON transport that "sends" mail by logging it —
// this keeps the whole notification pipeline (and the DB record of every
// email sent) fully functional with zero external configuration.
const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : nodemailer.createTransport({ jsonTransport: true });

export async function sendEmail({ to, subject, body, type = 'general', relatedId = null }) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'ATS Platform <noreply@ats-platform.demo>',
      to,
      subject,
      text: body,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO notifications (id,to_email,subject,body,type,related_id,status) VALUES (?,?,?,?,?,?,?)`
  ).run(id, to, subject, body, type, relatedId, 'sent');

  if (!hasSmtpConfig) {
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
  }
  return id;
}

// Templates ---------------------------------------------------------------

export const templates = {
  applicationReceived: (candidateName, jobTitle) => ({
    subject: `We received your application for ${jobTitle}`,
    body: `Hi ${candidateName},\n\nThanks for applying to the ${jobTitle} role. Our team is reviewing your profile and will be in touch soon.\n\nBest,\nRecruiting Team`,
  }),
  stageChanged: (candidateName, jobTitle, stage) => ({
    subject: `Update on your application for ${jobTitle}`,
    body: `Hi ${candidateName},\n\nYour application for ${jobTitle} has moved to the "${stage}" stage. We'll reach out with next steps shortly.\n\nBest,\nRecruiting Team`,
  }),
  interviewScheduled: (candidateName, jobTitle, when, link) => ({
    subject: `Interview scheduled: ${jobTitle}`,
    body: `Hi ${candidateName},\n\nYour interview for ${jobTitle} is scheduled at ${when}.\nMeeting link: ${link || 'TBD'}\n\nGood luck!\nRecruiting Team`,
  }),
  assessmentAssigned: (candidateName, assessmentTitle, dueAt) => ({
    subject: `Coding assessment assigned: ${assessmentTitle}`,
    body: `Hi ${candidateName},\n\nYou've been assigned the "${assessmentTitle}" coding assessment. Please complete it by ${dueAt || 'the deadline shown in your portal'}.\n\nBest,\nRecruiting Team`,
  }),
  offerSent: (candidateName, jobTitle) => ({
    subject: `Offer letter: ${jobTitle}`,
    body: `Hi ${candidateName},\n\nCongratulations! Please find attached your offer letter for the ${jobTitle} position. Log into the candidate portal to review and respond.\n\nBest,\nRecruiting Team`,
  }),
  rejected: (candidateName, jobTitle) => ({
    subject: `Update on your application for ${jobTitle}`,
    body: `Hi ${candidateName},\n\nThank you for your interest in the ${jobTitle} role. After careful consideration, we've decided to move forward with other candidates at this time. We appreciate your time and wish you the best.\n\nBest,\nRecruiting Team`,
  }),
};
