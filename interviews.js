import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendEmail, templates } from '../services/emailService.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'interviewer') {
    rows = db.prepare(`
      SELECT i.*, c.name as candidate_name, j.title as job_title
      FROM interviews i
      JOIN applications a ON a.id = i.application_id
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE i.interviewer_id = ?
      ORDER BY i.scheduled_at ASC`).all(req.user.id);
  } else if (req.user.role === 'candidate') {
    const candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
    rows = candidate ? db.prepare(`
      SELECT i.*, u.name as interviewer_name, j.title as job_title
      FROM interviews i
      JOIN applications a ON a.id = i.application_id
      JOIN users u ON u.id = i.interviewer_id
      JOIN jobs j ON j.id = a.job_id
      WHERE a.candidate_id = ?
      ORDER BY i.scheduled_at ASC`).all(candidate.id) : [];
  } else {
    rows = db.prepare(`
      SELECT i.*, c.name as candidate_name, u.name as interviewer_name, j.title as job_title
      FROM interviews i
      JOIN applications a ON a.id = i.application_id
      JOIN candidates c ON c.id = a.candidate_id
      JOIN users u ON u.id = i.interviewer_id
      JOIN jobs j ON j.id = a.job_id
      ORDER BY i.scheduled_at ASC`).all();
  }
  res.json(rows);
});

router.post('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), async (req, res) => {
  const { application_id, interviewer_id, scheduled_at, duration_minutes, round_name, mode, meeting_link } = req.body;
  if (!application_id || !interviewer_id || !scheduled_at) {
    return res.status(400).json({ error: 'application_id, interviewer_id, scheduled_at are required' });
  }
  const id = uuid();
  db.prepare(`INSERT INTO interviews (id,application_id,interviewer_id,scheduled_at,duration_minutes,round_name,mode,meeting_link)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    id, application_id, interviewer_id, scheduled_at, duration_minutes || 45, round_name || 'Technical Round', mode || 'video', meeting_link || null
  );

  db.prepare(`UPDATE applications SET stage='interview', updated_at=datetime('now') WHERE id=? AND stage NOT IN ('offer','hired','rejected')`).run(application_id);

  const app = db.prepare(`SELECT a.*, c.name as cname, c.email as cemail, j.title as jtitle FROM applications a
    JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id WHERE a.id=?`).get(application_id);
  if (app) {
    const t = templates.interviewScheduled(app.cname, app.jtitle, new Date(scheduled_at).toLocaleString(), meeting_link);
    await sendEmail({ to: app.cemail, subject: t.subject, body: t.body, type: 'interview_scheduled', relatedId: id });
  }

  res.status(201).json(db.prepare('SELECT * FROM interviews WHERE id=?').get(id));
});

router.put('/:id/feedback', requireAuth, requireRole('interviewer', 'admin'), (req, res) => {
  const { feedback, rating, recommendation, status } = req.body;
  const iv = db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id);
  if (!iv) return res.status(404).json({ error: 'Interview not found' });
  if (req.user.role === 'interviewer' && iv.interviewer_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your interview' });
  }
  db.prepare(`UPDATE interviews SET feedback=?, rating=?, recommendation=?, status=? WHERE id=?`)
    .run(feedback ?? iv.feedback, rating ?? iv.rating, recommendation ?? iv.recommendation, status || 'completed', req.params.id);
  res.json(db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id));
});

router.put('/:id', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const iv = db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id);
  if (!iv) return res.status(404).json({ error: 'Interview not found' });
  const { scheduled_at, status, meeting_link } = req.body;
  db.prepare(`UPDATE interviews SET scheduled_at=?, status=?, meeting_link=? WHERE id=?`)
    .run(scheduled_at || iv.scheduled_at, status || iv.status, meeting_link ?? iv.meeting_link, req.params.id);
  res.json(db.prepare('SELECT * FROM interviews WHERE id=?').get(req.params.id));
});

export default router;
