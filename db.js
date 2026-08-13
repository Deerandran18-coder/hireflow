import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'ats.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','recruiter','hiring_manager','interviewer','candidate')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  department TEXT,
  location TEXT,
  employment_type TEXT DEFAULT 'full_time',
  description TEXT,
  requirements TEXT,
  skills TEXT,               -- JSON array of strings
  salary_min INTEGER,
  salary_max INTEGER,
  status TEXT DEFAULT 'open' CHECK(status IN ('draft','open','on_hold','closed')),
  created_by TEXT REFERENCES users(id),
  hiring_manager_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),   -- linked if candidate has portal account
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  resume_path TEXT,
  resume_text TEXT,
  parsed_skills TEXT,     -- JSON array
  parsed_experience_years REAL,
  parsed_education TEXT,  -- JSON array
  source TEXT DEFAULT 'direct',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id),
  candidate_id TEXT REFERENCES candidates(id),
  stage TEXT DEFAULT 'applied' CHECK(stage IN
    ('applied','screening','interview','assessment','offer','hired','rejected','withdrawn')),
  ai_score REAL,
  ai_summary TEXT,
  ai_strengths TEXT,     -- JSON array
  ai_gaps TEXT,          -- JSON array
  rejection_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id),
  interviewer_id TEXT REFERENCES users(id),
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 45,
  round_name TEXT DEFAULT 'Technical Round',
  mode TEXT DEFAULT 'video',
  meeting_link TEXT,
  status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled','no_show')),
  feedback TEXT,
  rating INTEGER,
  recommendation TEXT CHECK(recommendation IN ('strong_yes','yes','no','strong_no') OR recommendation IS NULL),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  language TEXT DEFAULT 'javascript',
  starter_code TEXT,
  test_cases TEXT,     -- JSON array of {input, expected}
  time_limit_minutes INTEGER DEFAULT 60,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assessment_assignments (
  id TEXT PRIMARY KEY,
  assessment_id TEXT REFERENCES assessments(id),
  application_id TEXT REFERENCES applications(id),
  status TEXT DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','submitted','graded')),
  submitted_code TEXT,
  test_results TEXT,   -- JSON array of {pass, input, expected, actual}
  score REAL,
  assigned_at TEXT DEFAULT (datetime('now')),
  submitted_at TEXT,
  due_at TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id),
  salary INTEGER,
  bonus INTEGER,
  equity TEXT,
  start_date TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','declined','withdrawn')),
  pdf_path TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  responded_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT,
  related_id TEXT,
  status TEXT DEFAULT 'sent',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id),
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

export default db;
