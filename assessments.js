import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendEmail, templates } from '../services/emailService.js';

const router = Router();

// ---- Assessment templates (question bank) ----

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM assessments ORDER BY created_at DESC').all();
  res.json(rows.map(formatAssessment));
});

router.post('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const { title, description, language, starter_code, test_cases, time_limit_minutes } = req.body;
  if (!title || !test_cases) return res.status(400).json({ error: 'title and test_cases are required' });
  const id = uuid();
  db.prepare(`INSERT INTO assessments (id,title,description,language,starter_code,test_cases,time_limit_minutes,created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    id, title, description || '', language || 'javascript', starter_code || '', JSON.stringify(test_cases), time_limit_minutes || 60, req.user.id
  );
  res.status(201).json(formatAssessment(db.prepare('SELECT * FROM assessments WHERE id=?').get(id)));
});

// ---- Assigning to a candidate application ----

router.post('/:id/assign', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), async (req, res) => {
  const { application_id, due_at } = req.body;
  const assessment = db.prepare('SELECT * FROM assessments WHERE id=?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const id = uuid();
  db.prepare(`INSERT INTO assessment_assignments (id,assessment_id,application_id,due_at) VALUES (?,?,?,?)`)
    .run(id, req.params.id, application_id, due_at || null);

  db.prepare(`UPDATE applications SET stage='assessment', updated_at=datetime('now') WHERE id=? AND stage NOT IN ('offer','hired','rejected')`).run(application_id);

  const app = db.prepare(`SELECT a.*, c.name as cname, c.email as cemail FROM applications a JOIN candidates c ON c.id=a.candidate_id WHERE a.id=?`).get(application_id);
  if (app) {
    const t = templates.assessmentAssigned(app.cname, assessment.title, due_at);
    await sendEmail({ to: app.cemail, subject: t.subject, body: t.body, type: 'assessment_assigned', relatedId: id });
  }

  res.status(201).json(db.prepare('SELECT * FROM assessment_assignments WHERE id=?').get(id));
});

router.get('/assignments/my', requireAuth, requireRole('candidate'), (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
  if (!candidate) return res.json([]);
  const rows = db.prepare(`
    SELECT aa.*, asmt.title, asmt.description, asmt.language, asmt.starter_code, asmt.time_limit_minutes
    FROM assessment_assignments aa
    JOIN applications app ON app.id = aa.application_id
    JOIN assessments asmt ON asmt.id = aa.assessment_id
    WHERE app.candidate_id = ?
    ORDER BY aa.assigned_at DESC`).all(candidate.id);
  res.json(rows.map((r) => ({ ...r, test_results: JSON.parse(r.test_results || '[]') })));
});

router.get('/assignments/:id', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT aa.*, asmt.title, asmt.description, asmt.language, asmt.starter_code, asmt.test_cases, asmt.time_limit_minutes
    FROM assessment_assignments aa JOIN assessments asmt ON asmt.id = aa.assessment_id WHERE aa.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Assignment not found' });
  // Hide expected outputs from candidate view, show inputs only
  const testCases = JSON.parse(row.test_cases || '[]');
  const visibleTests = req.user.role === 'candidate' ? testCases.map((t) => ({ input: t.input })) : testCases;
  res.json({ ...row, test_cases: visibleTests, test_results: JSON.parse(row.test_results || '[]') });
});

// ---- Submission + auto-grading ----
// NOTE: This runs candidate JavaScript in-process for demo purposes only.
// A production system MUST execute untrusted code in an isolated sandbox
// (e.g. a locked-down container, Firecracker VM, or a service like Judge0/Piston),
// never with direct access to the host process.

router.post('/assignments/:id/submit', requireAuth, requireRole('candidate'), (req, res) => {
  const { code } = req.body;
  const assignment = db.prepare(`
    SELECT aa.*, asmt.test_cases, asmt.language FROM assessment_assignments aa
    JOIN assessments asmt ON asmt.id = aa.assessment_id WHERE aa.id=?`).get(req.params.id);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

  const testCases = JSON.parse(assignment.test_cases || '[]');
  const results = runJsTests(code, testCases);
  const score = testCases.length ? Math.round((results.filter((r) => r.pass).length / testCases.length) * 100) : 0;

  db.prepare(`UPDATE assessment_assignments SET status='graded', submitted_code=?, test_results=?, score=?, submitted_at=datetime('now') WHERE id=?`)
    .run(code, JSON.stringify(results), score, req.params.id);

  res.json({ score, results });
});

function runJsTests(code, testCases) {
  return testCases.map((tc) => {
    try {
      // Candidate code must define a function named `solve`.
      const fn = new Function(`${code}\nreturn typeof solve === 'function' ? solve : null;`)();
      if (!fn) return { input: tc.input, expected: tc.expected, actual: null, pass: false, error: 'No `solve` function defined' };
      const actual = fn(...(Array.isArray(tc.input) ? tc.input : [tc.input]));
      const pass = JSON.stringify(actual) === JSON.stringify(tc.expected);
      return { input: tc.input, expected: tc.expected, actual, pass };
    } catch (err) {
      return { input: tc.input, expected: tc.expected, actual: null, pass: false, error: err.message };
    }
  });
}

function formatAssessment(a) {
  return { ...a, test_cases: JSON.parse(a.test_cases || '[]') };
}

export default router;
