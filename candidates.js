import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendEmail, templates } from '../services/emailService.js';
import { analyzeCandidateForJob } from '../services/aiAnalysis.js';

const router = Router();

// Candidate's own profile lookup (used by the portal to know their candidate_id)
router.get('/my/profile', requireAuth, requireRole('candidate'), (req, res) => {
  let candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
  if (!candidate) {
    // Should not normally happen (created at registration), but create lazily if missing.
    const id = uuid();
    db.prepare(`INSERT INTO candidates (id,user_id,name,email,source) VALUES (?,?,?,?,?)`)
      .run(id, req.user.id, req.user.name, req.user.email, 'portal_signup');
    candidate = db.prepare('SELECT * FROM candidates WHERE id=?').get(id);
  }
  res.json(formatCandidate(candidate));
});

// List candidates (recruiter/HM/interviewer view)
router.get('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager', 'interviewer'), (req, res) => {
  const rows = db.prepare('SELECT * FROM candidates ORDER BY created_at DESC').all();
  res.json(rows.map(formatCandidate));
});

router.get('/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Candidate not found' });
  if (req.user.role === 'candidate' && c.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  res.json(formatCandidate(c));
});

// Create a candidate profile manually (recruiter adding someone) or self (portal)
router.post('/', requireAuth, (req, res) => {
  const { name, email, phone, location, source } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const id = uuid();
  const userId = req.user.role === 'candidate' ? req.user.id : null;
  db.prepare(`INSERT INTO candidates (id,user_id,name,email,phone,location,source) VALUES (?,?,?,?,?,?,?)`)
    .run(id, userId, name, email, phone || null, location || null, source || 'direct');
  res.status(201).json(formatCandidate(db.prepare('SELECT * FROM candidates WHERE id=?').get(id)));
});

// ---- Applications ----

// Apply to a job (creates application + triggers AI analysis + email)
router.post('/:candidateId/apply', requireAuth, async (req, res) => {
  const { job_id } = req.body;
  const candidate = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.candidateId);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(job_id);
  if (!candidate || !job) return res.status(404).json({ error: 'Candidate or job not found' });

  const existing = db.prepare('SELECT * FROM applications WHERE job_id=? AND candidate_id=?').get(job_id, candidate.id);
  if (existing) return res.status(409).json({ error: 'Already applied to this job' });

  const id = uuid();
  db.prepare(`INSERT INTO applications (id,job_id,candidate_id,stage) VALUES (?,?,?,?)`)
    .run(id, job_id, candidate.id, 'applied');

  // Fire-and-forget-ish AI analysis (awaited here for simplicity/demo)
  try {
    const analysis = await analyzeCandidateForJob({
      job,
      resumeText: candidate.resume_text || '',
      parsedSkills: JSON.parse(candidate.parsed_skills || '[]'),
      experienceYears: candidate.parsed_experience_years,
    });
    db.prepare(`UPDATE applications SET ai_score=?, ai_summary=?, ai_strengths=?, ai_gaps=? WHERE id=?`)
      .run(analysis.score, analysis.summary, JSON.stringify(analysis.strengths), JSON.stringify(analysis.gaps), id);
  } catch (e) {
    console.error('AI analysis failed on apply:', e.message);
  }

  const t = templates.applicationReceived(candidate.name, job.title);
  await sendEmail({ to: candidate.email, subject: t.subject, body: t.body, type: 'application_received', relatedId: id });

  logActivity(id, req.user.id, 'applied', `Applied to ${job.title}`);
  res.status(201).json(db.prepare('SELECT * FROM applications WHERE id=?').get(id));
});

router.get('/applications/all', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager', 'interviewer'), (req, res) => {
  const { job_id, stage } = req.query;
  let sql = `SELECT a.*, c.name as candidate_name, c.email as candidate_email, j.title as job_title
             FROM applications a
             JOIN candidates c ON c.id = a.candidate_id
             JOIN jobs j ON j.id = a.job_id
             WHERE 1=1`;
  const params = [];
  if (job_id) { sql += ' AND a.job_id=?'; params.push(job_id); }
  if (stage) { sql += ' AND a.stage=?'; params.push(stage); }
  sql += ' ORDER BY a.updated_at DESC';
  const rows = db.prepare(sql).all(...params).map(formatApplication);
  res.json(rows);
});

router.get('/my/profile', requireAuth, requireRole('candidate'), (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
  if (!candidate) return res.status(404).json({ error: 'No candidate profile found' });
  res.json(formatCandidate(candidate));
});

router.get('/my/applications', requireAuth, requireRole('candidate'), (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
  if (!candidate) return res.json([]);
  const rows = db.prepare(
    `SELECT a.*, j.title as job_title, j.department, j.location FROM applications a
     JOIN jobs j ON j.id = a.job_id WHERE a.candidate_id=? ORDER BY a.updated_at DESC`
  ).all(candidate.id).map(formatApplication);
  res.json(rows);
});

router.put('/applications/:id/stage', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), async (req, res) => {
  const { stage, rejection_reason } = req.body;
  const validStages = ['applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected', 'withdrawn'];
  if (!validStages.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });

  const app = db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  db.prepare(`UPDATE applications SET stage=?, rejection_reason=?, updated_at=datetime('now') WHERE id=?`)
    .run(stage, rejection_reason || null, req.params.id);

  const candidate = db.prepare('SELECT * FROM candidates WHERE id=?').get(app.candidate_id);
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(app.job_id);
  const t = stage === 'rejected' ? templates.rejected(candidate.name, job.title) : templates.stageChanged(candidate.name, job.title, stage);
  await sendEmail({ to: candidate.email, subject: t.subject, body: t.body, type: 'stage_changed', relatedId: req.params.id });

  logActivity(req.params.id, req.user.id, 'stage_changed', `Moved to ${stage}`);
  res.json(formatApplication(db.prepare('SELECT * FROM applications WHERE id=?').get(req.params.id)));
});

router.get('/applications/:id/activity', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT al.*, u.name as actor_name FROM activity_log al LEFT JOIN users u ON u.id = al.actor_id WHERE application_id=? ORDER BY created_at ASC`).all(req.params.id);
  res.json(rows);
});

function logActivity(applicationId, actorId, action, details) {
  db.prepare(`INSERT INTO activity_log (id,application_id,actor_id,action,details) VALUES (?,?,?,?,?)`)
    .run(uuid(), applicationId, actorId, action, details);
}

function formatCandidate(c) {
  return {
    ...c,
    parsed_skills: JSON.parse(c.parsed_skills || '[]'),
    parsed_education: JSON.parse(c.parsed_education || '[]'),
  };
}

function formatApplication(a) {
  return {
    ...a,
    ai_strengths: JSON.parse(a.ai_strengths || '[]'),
    ai_gaps: JSON.parse(a.ai_gaps || '[]'),
  };
}

export default router;
