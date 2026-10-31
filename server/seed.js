'use strict';
/**
 * Demo workspace seeding. Creates a ready-to-explore account so the app can be
 * demonstrated without any setup: demo@bizassist.ai / Demo1234
 */
const { get, run } = require('./db');
const { hashPassword } = require('./auth');
const local = require('./ai/local');

const DEMO_EMAIL = 'demo@bizassist.ai';
const DEMO_PASSWORD = 'Demo1234';

const iso = (offsetDays, hour = 9) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10);

function ensureDemoUser() {
  const existing = get('SELECT id FROM users WHERE email = ?', DEMO_EMAIL);
  if (existing) return existing.id;

  const { hash, salt } = hashPassword(DEMO_PASSWORD);
  const info = run(
    'INSERT INTO users (email, name, password_hash, salt, company, role, created_at) VALUES (?,?,?,?,?,?,?)',
    DEMO_EMAIL, 'Ava Sharma', hash, salt, 'Northwind Studio', 'Founder', iso(-42)
  );
  const uid = Number(info.lastInsertRowid);
  seedWorkspace(uid);
  return uid;
}

function seedWorkspace(uid) {
  const task = (title, priority, status, dueDays, source = 'manual', createdDays = -10, notes = '') => {
    run(
      `INSERT INTO tasks (user_id, title, notes, priority, status, due_date, source_type, created_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uid, title, notes, priority, status, dateOnly(dueDays), source, iso(createdDays),
      status === 'completed' ? iso(createdDays + 1) : null
    );
  };

  task('Send Q3 pricing proposal to Meridian Retail', 'high', 'pending', 1, 'email', -2, 'Owner: Ava · Includes updated rate card');
  task('Confirm venue deposit for client workshop', 'high', 'pending', 3, 'meeting', -4);
  task('Review supplier contract renewal terms', 'medium', 'in_progress', 6, 'document', -6, 'Legal review before signature');
  task('Prepare September cash-flow forecast', 'high', 'pending', -1, 'manual', -9, 'Overdue — blocking the board pack');
  task('Publish new case study to website', 'low', 'pending', 12, 'document', -8);
  task('Reply to partnership enquiry from Lumen Co.', 'medium', 'completed', -2, 'email', -7);
  task('Book team offsite venue', 'low', 'completed', -4, 'meeting', -12);
  task('Update onboarding checklist for new hires', 'medium', 'completed', -6, 'manual', -15);
  task('Chase outstanding invoice #1042', 'high', 'pending', 0, 'email', -3, 'Due today · 45 days overdue');
  task('Draft newsletter for October send', 'low', 'pending', 9, 'manual', -5);

  // ---------------------------------------------------------------- meeting
  const meetingNotes = `Weekly leadership sync — 12 September
Attendees: Ava Sharma, Daniel Okafor, Priya Nair, Tom Ellis

Ava opened by reviewing last week's numbers. Revenue for August came in at $128,000, which is 12% above July. Expenses also rose to $71,000 because of the new contractor spend.

Daniel reported that the Meridian Retail pilot is going well. They have 24 active users after three weeks and asked for a pricing proposal before the end of the month. Daniel will send the updated rate card by Friday.

Priya raised the onboarding issue. New clients are waiting up to nine days for their accounts to be set up. The team agreed to simplify the onboarding checklist and target a five-day turnaround from October.

Tom noted the marketing site conversion rate has fallen to 1.8% from 2.6% last quarter. We decided to run an A/B test on the pricing page, starting next Monday.

Action items:
- Daniel will send the Meridian rate card by Friday.
- Priya to rewrite the onboarding checklist before 30 September.
- Tom to set up the pricing page A/B test next Monday.
- Ava needs to approve the Q4 budget by 20 September.

Next meeting is scheduled for 19 September.`;

  const meeting = local.analyseMeeting(meetingNotes, { title: 'Weekly leadership sync' });
  const mInfo = run(
    `INSERT INTO meetings (user_id, title, attendees, summary, decisions, actions, raw_text, engine, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid, 'Weekly leadership sync', 'Ava Sharma, Daniel Okafor, Priya Nair, Tom Ellis',
    meeting.summary, JSON.stringify(meeting.decisions.length ? meeting.decisions : [
      'Agreed to simplify the onboarding checklist and target a five-day turnaround from October.',
      'Decided to run an A/B test on the pricing page starting next Monday.'
    ]),
    JSON.stringify(meeting.actions.slice(0, 5)), meetingNotes, 'local', iso(-6, 10)
  );
  void mInfo;

  // --------------------------------------------------------------- document
  const docText = `Northwind Studio — Client Growth Report, August 2024
Prepared by the Client Success team.

Executive overview
Northwind Studio closed August with 48 active retainer clients, up from 41 in July. Total retained revenue reached $128,000, a 12% increase month on month. Average revenue per client fell slightly from $2,780 to $2,666, which reflects the intake of smaller accounts through the self-serve funnel.

Delivery performance
Average project delivery time was 18 working days, against a target of 15. Three projects exceeded their deadline by more than a week, all of them affected by delayed client approvals. Client satisfaction held at 4.6 out of 5 across 27 survey responses.

Marketing and pipeline
Website conversion fell to 1.8% from 2.6% in the prior quarter. Paid acquisition cost per lead rose from $38 to $52. Referrals remain the strongest channel, contributing 34% of new business. The newsletter grew to 6,200 subscribers, an increase of 800.

Risks and actions
Cash collection needs attention: $42,000 in invoices were more than 30 days overdue at month end, with $18,000 of that beyond 60 days. The finance lead will introduce automated payment reminders from 15 September. The team will also run a pricing page experiment starting 23 September to address the conversion decline.

Key dates
- Board pack due 20 September 2024.
- Q4 planning workshop on 4 October 2024.
- Contract renewals for the top 8 clients by 30 November 2024.`;

  const doc = local.analyseDocument(docText, { title: 'Client Growth Report — August 2024' });
  run(
    `INSERT INTO documents (user_id, title, source_name, mime, word_count, reading_minutes, summary,
      key_points, dates, figures, actions, raw_text, engine, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    uid, 'Client Growth Report — August 2024', 'client-growth-aug-2024.pdf', 'application/pdf',
    doc.word_count, doc.reading_minutes, doc.summary, JSON.stringify(doc.key_points),
    JSON.stringify(doc.dates), JSON.stringify(doc.figures), JSON.stringify(doc.actions), docText, 'local', iso(-5, 14)
  );

  // ------------------------------------------------------------------ email
  const email = local.draftEmail({
    mode: 'new', tone: 'professional', recipient: 'Daniel Okafor',
    senderName: 'Ava Sharma',
    brief: 'Ask Daniel for the updated Meridian Retail rate card before the proposal deadline, confirm the pilot numbers and suggest a short call.',
    points: [
      'Meridian needs the updated rate card by Friday to hit their internal deadline',
      'Pilot has 24 active users after three weeks, which is ahead of plan',
      'Offer a 20 minute call on Thursday to walk through the pricing'
    ],
    length: 'medium'
  });
  run(
    `INSERT INTO emails (user_id, mode, tone, recipient, subject, body, brief, engine, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid, 'new', 'professional', 'Daniel Okafor', email.subject, email.body,
    'Ask for the Meridian rate card and confirm pilot numbers', 'local', iso(-2, 16)
  );

  const followup = local.draftEmail({
    mode: 'followup', tone: 'formal', recipient: 'Meridian Retail',
    senderName: 'Ava Sharma',
    brief: 'Follow up on the pilot proposal sent last week, restate the deadline, offer to answer questions.',
    points: ['Proposal was sent on the 5th', 'Decision needed before the end of the month', 'Happy to present to their leadership team'],
    length: 'short'
  });
  run(
    `INSERT INTO emails (user_id, mode, tone, recipient, subject, body, brief, engine, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid, 'followup', 'formal', 'Meridian Retail', followup.subject, followup.body,
    'Follow-up on pilot proposal', 'local', iso(-1, 11)
  );

  // ---------------------------------------------------------------- reports
  const report = local.buildReport({
    businessName: 'Northwind Studio',
    period: 'August 2024',
    currency: 'USD',
    audience: 'board and leadership team',
    metrics: [
      { name: 'Revenue', current: 128000, previous: 114286 },
      { name: 'Operating expenses', current: 71000, previous: 58000 },
      { name: 'Active clients', current: 48, previous: 41 },
      { name: 'Website conversion rate', current: 1.8, previous: 2.6 },
      { name: 'Cost per lead', current: 52, previous: 38 },
      { name: 'Overdue invoices', current: 42000, previous: 15000 }
    ],
    notes: 'August saw strong top-line growth driven by retainer renewals and an increase in self-serve signups. Delivery slipped on three projects due to delayed client approvals. Cash collection is the main pressure point with $42,000 overdue, $18,000 of it beyond 60 days. The marketing site conversion decline is under investigation with a pricing page experiment scheduled for 23 September.'
  });
  run(
    `INSERT INTO reports (user_id, title, period, metrics, content_md, engine, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    uid, report.title, 'August 2024', JSON.stringify(report.metrics), report.markdown, 'local', iso(-4, 17)
  );

  // --------------------------------------------------------------- activity
  const events = [
    [-0.2, 'task', 'Completed task “Reply to partnership enquiry from Lumen Co.”'],
    [-1, 'email', 'Drafted email “Follow-up: Meridian Retail pilot proposal”'],
    [-2, 'email', 'Drafted email “Meridian Retail rate card and pilot review”'],
    [-4, 'report', 'Generated report “Northwind Studio — August 2024 Performance Report”'],
    [-5, 'document', 'Summarised PDF “Client Growth Report — August 2024”'],
    [-6, 'meeting', 'Processed meeting “Weekly leadership sync”'],
    [-6.2, 'task', 'Added 4 action items from “Weekly leadership sync”']
  ];
  for (const [offset, type, message] of events) {
    run('INSERT INTO activity (user_id, type, message, created_at) VALUES (?,?,?,?)', uid, type, message, iso(offset, 10));
  }
}

module.exports = { ensureDemoUser, seedWorkspace, DEMO_EMAIL, DEMO_PASSWORD };
