# HireFlow — Applicant Tracking System

A full-stack recruitment platform connecting recruiters, hiring managers, interviewers, and
candidates on one pipeline. Built with **React (Vite)** on the frontend and **Node.js/Express +
SQLite** on the backend.

## Features

| Module | What it does |
|---|---|
| **Job Management** | Create/edit/close job postings with skills, salary bands, and hiring-manager ownership. |
| **Candidate Management** | Central candidate directory with a per-job application pipeline (`applied → screening → interview → assessment → offer → hired/rejected`). |
| **Resume Upload & Parsing** | Upload PDF/TXT/DOC resumes; the server extracts text and parses skills, years of experience, and education via keyword/regex heuristics. |
| **AI Resume Analysis** | Automatically scores each application against the job's required skills, with a summary, strengths, and gaps. Uses the real Claude API if you provide a key, otherwise falls back to a transparent heuristic scorer — no key required to run the app. |
| **Interview Scheduling** | Recruiters/HMs schedule interviews with a chosen interviewer; interviewers see their queue and submit structured feedback + recommendation. |
| **Coding Assessments** | Recruiters build a JS coding challenge (starter code + test cases), assign it to a candidate, and the candidate solves it in-browser. Submissions are auto-graded against the test cases. |
| **Email Notifications** | Every pipeline event (applied, stage change, interview scheduled, assessment assigned, offer sent) sends an email. No SMTP configured? Emails are logged and stored in an audit table instead — fully functional out of the box. |
| **Analytics Dashboard** | Pipeline funnel, conversion rate, avg AI score, avg time-to-hire, applications over time, source breakdown, and per-job stats, all charted with Recharts. |
| **Offer Letter Generation** | Generates a real PDF offer letter (via PDFKit), sendable to the candidate, who can accept/decline from their portal. |
| **Candidate Portal** | Candidates register, upload a resume once, browse open jobs, apply (triggering AI analysis), track application status, take assigned coding assessments, and respond to offers. |

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3 (file-based SQL database, zero setup), JWT auth, bcrypt, multer (uploads), pdfkit (offer PDFs), pdf-parse (resume text extraction), nodemailer.
- **Frontend:** React 18, Vite, React Router, Recharts, Axios. Plain CSS (no build-heavy CSS framework) for fast, dependency-light styling.

## What's mocked vs. production-ready

This is a fully functional demo/reference implementation. Everything runs end-to-end with real
data flowing through a real database — nothing is faked in the UI. A few integrations are
pluggable stand-ins so the app works with **zero external API keys**:

- **AI Resume Analysis** — uses a heuristic skill/experience matcher by default. Set
  `ANTHROPIC_API_KEY` in `server/.env` to switch to real Claude-powered analysis (see
  `server/src/services/aiAnalysis.js`).
- **Email sending** — uses a mock transport that logs emails to the console and records them in
  the `notifications` table (visible in the app's Notifications page). Set `SMTP_HOST`/`SMTP_USER`/
  `SMTP_PASS` in `server/.env` to send real email via any SMTP provider.
- **Coding assessment grading** — candidate JavaScript is executed with `new Function(...)` in the
  same Node process for demo simplicity. **Do not use this as-is in production** — untrusted code
  execution needs a real sandbox (e.g. a locked-down container, Firecracker microVM, or a service
  like Judge0/Piston). This is called out again inline in `server/src/routes/assessments.js`.

Everything else (auth, jobs, candidates, applications/pipeline, resume parsing, interview
scheduling, offer PDFs, analytics) is genuinely implemented against the SQLite database, not
mocked.

## Project Structure

```
ats/
├── server/                  # Express API
│   ├── src/
│   │   ├── db/               # SQLite schema (db.js) + demo data seed (seed.js)
│   │   ├── middleware/auth.js
│   │   ├── routes/            # auth, jobs, candidates, resumes, interviews,
│   │   │                      # assessments, offers, analytics, notifications, users
│   │   └── services/          # resumeParser, aiAnalysis, emailService, pdfGenerator
│   ├── uploads/               # resume + offer-PDF storage (created automatically)
│   ├── .env.example
│   └── package.json
└── client/                  # React (Vite) frontend
    └── src/
        ├── pages/             # staff-facing pages
        ├── pages/portal/      # candidate portal pages
        ├── components/        # Layout, StageBadge
        ├── context/AuthContext.jsx
        └── api.js             # axios client with JWT interceptor
```

## Getting Started

### 1. Backend

```bash
cd server
cp .env.example .env       # edit if you want real AI/email — optional
npm install
npm run seed                # creates ats.db with demo accounts + sample data
npm run dev                 # starts on http://localhost:4000
```

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev                 # starts on http://localhost:5173, proxies /api to :4000
```

Open **http://localhost:5173**.

### Demo accounts (password for all: `password123`)

| Role | Email |
|---|---|
| Recruiter | recruiter@demo.com |
| Hiring Manager | manager@demo.com |
| Interviewer | interviewer@demo.com |
| Candidate | candidate@demo.com |
| Admin | admin@demo.com |

Or register a brand-new candidate account from the login screen.

### Suggested walkthrough

1. Log in as **recruiter** → create a job → view the seeded application with its AI match score.
2. Create a coding assessment and assign it to the seeded application.
3. Log in as **candidate** → "My Assessments" → solve the challenge (must define a `solve()`
   function) → submit and see auto-graded results.
4. Back as **recruiter**: schedule an interview, then log in as **interviewer** to leave feedback.
5. As **recruiter**: generate an offer letter (real PDF), send it.
6. As **candidate**: accept the offer from "My Offers".
7. Check **Analytics** and **Notifications** as recruiter to see the funnel and the email audit
   trail.

## Environment Variables (server/.env)

```
PORT=4000
JWT_SECRET=change-this-to-a-long-random-string

# Optional — real AI resume scoring via Claude. Omit to use the built-in heuristic scorer.
ANTHROPIC_API_KEY=

# Optional — real SMTP email sending. Omit to use the mock/logging transport.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="ATS Platform <noreply@yourcompany.com>"
```

## API Overview

All endpoints are under `/api` and (except `/auth/register` and `/auth/login`) require a
`Authorization: Bearer <token>` header, obtained from `/auth/login`.

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET/POST/PUT/DELETE /jobs`
- `GET/POST /candidates`, `POST /candidates/:id/apply`, `GET /candidates/applications/all`,
  `GET /candidates/my/applications`, `GET /candidates/my/profile`,
  `PUT /candidates/applications/:id/stage`
- `POST /resumes/:candidateId/upload`
- `GET/POST /interviews`, `PUT /interviews/:id/feedback`
- `GET/POST /assessments`, `POST /assessments/:id/assign`,
  `GET /assessments/assignments/my`, `POST /assessments/assignments/:id/submit`
- `GET/POST /offers`, `POST /offers/:id/send`, `POST /offers/:id/respond`, `GET /offers/:id/pdf`
- `GET /analytics/overview`
- `GET /notifications`
- `GET /users?role=interviewer`

## Notes on scaling this to production

- Swap SQLite for Postgres/MySQL for concurrent multi-instance deployments (the schema in
  `db.js` is close to standard SQL and ports easily).
- Move resume/offer file storage to S3 or similar object storage instead of local disk.
- Put the coding-assessment grader behind a real sandboxed execution service.
- Add refresh tokens / shorter-lived JWTs plus rate limiting on `/auth`.
- Add pagination to list endpoints (`/jobs`, `/candidates`, `/candidates/applications/all`) once
  data volume grows.
