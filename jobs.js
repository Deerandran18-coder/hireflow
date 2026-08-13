import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Public-ish listing (candidates can browse open jobs too)
router.get('/', requireAuth, (req, res) => {
  const { status } = req.query;
  let rows;
  if (req.user.role === 'candidate') {
    rows = db.prepare(`SELECT * FROM jobs WHERE status='open' ORDER BY created_at DESC`).all();
  } else if (status) {
    rows = db.prepare(`SELECT * FROM jobs WHERE status=? ORDER BY created_at DESC`).all(status);
  } else {
    rows = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
  }
  res.json(rows.map(formatJob));
});

router.get('/:id', requireAuth, (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(formatJob(job));
});

router.post('/', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  const { title, department, location, employment_type, description, requirements, skills, salary_min, salary_max, hiring_manager_id, status } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = uuid();
  db.prepare(`INSERT INTO jobs (id,title,department,location,employment_type,description,requirements,skills,salary_min,salary_max,status,created_by,hiring_manager_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, title, department || null, location || null, employment_type || 'full_time',
    description || null, requirements || null, JSON.stringify(skills || []),
    salary_min || null, salary_max || null, status || 'open', req.user.id, hiring_manager_id || null
  );
  res.status(201).json(formatJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(id)));
});

router.put('/:id', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const fields = ['title', 'department', 'location', 'employment_type', 'description', 'requirements', 'salary_min', 'salary_max', 'status', 'hiring_manager_id'];
  const updates = { ...job };
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.skills !== undefined) updates.skills = JSON.stringify(req.body.skills);

  db.prepare(`UPDATE jobs SET title=?,department=?,location=?,employment_type=?,description=?,requirements=?,skills=?,salary_min=?,salary_max=?,status=?,hiring_manager_id=?,updated_at=datetime('now') WHERE id=?`)
    .run(updates.title, updates.department, updates.location, updates.employment_type, updates.description, updates.requirements, updates.skills, updates.salary_min, updates.salary_max, updates.status, updates.hiring_manager_id, req.params.id);

  res.json(formatJob(db.prepare('SELECT * FROM jobs WHERE id=?').get(req.params.id)));
});

router.delete('/:id', requireAuth, requireRole('recruiter', 'admin'), (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id=?').run(req.params.id);
  res.status(204).end();
});

function formatJob(job) {
  return { ...job, skills: JSON.parse(job.skills || '[]') };
}

export default router;
