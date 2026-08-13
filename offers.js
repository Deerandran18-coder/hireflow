import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { generateOfferLetterPdf } from '../services/pdfGenerator.js';
import { sendEmail, templates } from '../services/emailService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const offersDir = path.join(__dirname, '..', '..', 'uploads', 'offers');

const router = Router();

router.get('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, c.name as candidate_name, j.title as job_title
    FROM offers o
    JOIN applications a ON a.id = o.application_id
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    ORDER BY o.created_at DESC`).all();
  res.json(rows);
});

router.get('/my', requireAuth, requireRole('candidate'), (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE user_id=?').get(req.user.id);
  if (!candidate) return res.json([]);
  const rows = db.prepare(`
    SELECT o.*, j.title as job_title FROM offers o
    JOIN applications a ON a.id = o.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = ?
    ORDER BY o.created_at DESC`).all(candidate.id);
  res.json(rows);
});

router.post('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), async (req, res) => {
  const { application_id, salary, bonus, equity, start_date } = req.body;
  const app = db.prepare(`SELECT a.*, c.name as cname, j.title as jtitle FROM applications a
    JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id WHERE a.id=?`).get(application_id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const id = uuid();
  const pdfPath = path.join(offersDir, `${id}.pdf`);
  await generateOfferLetterPdf({
    outputPath: pdfPath,
    candidateName: app.cname,
    jobTitle: app.jtitle,
    salary, bonus, equity, startDate: start_date,
  });

  db.prepare(`INSERT INTO offers (id,application_id,salary,bonus,equity,start_date,status,pdf_path,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, application_id, salary, bonus || null, equity || null, start_date, 'draft', pdfPath, req.user.id);

  res.status(201).json(db.prepare('SELECT * FROM offers WHERE id=?').get(id));
});

router.post('/:id/send', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), async (req, res) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id=?').get(req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  db.prepare(`UPDATE offers SET status='sent', sent_at=datetime('now') WHERE id=?`).run(req.params.id);
  db.prepare(`UPDATE applications SET stage='offer', updated_at=datetime('now') WHERE id=?`).run(offer.application_id);

  const app = db.prepare(`SELECT a.*, c.name as cname, c.email as cemail, j.title as jtitle FROM applications a
    JOIN candidates c ON c.id=a.candidate_id JOIN jobs j ON j.id=a.job_id WHERE a.id=?`).get(offer.application_id);
  const t = templates.offerSent(app.cname, app.jtitle);
  await sendEmail({ to: app.cemail, subject: t.subject, body: t.body, type: 'offer_sent', relatedId: req.params.id });

  res.json(db.prepare('SELECT * FROM offers WHERE id=?').get(req.params.id));
});

router.post('/:id/respond', requireAuth, requireRole('candidate'), (req, res) => {
  const { decision } = req.body; // 'accepted' | 'declined'
  if (!['accepted', 'declined'].includes(decision)) return res.status(400).json({ error: 'decision must be accepted or declined' });
  const offer = db.prepare('SELECT * FROM offers WHERE id=?').get(req.params.id);
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  db.prepare(`UPDATE offers SET status=?, responded_at=datetime('now') WHERE id=?`).run(decision, req.params.id);
  if (decision === 'accepted') {
    db.prepare(`UPDATE applications SET stage='hired', updated_at=datetime('now') WHERE id=?`).run(offer.application_id);
  }
  res.json(db.prepare('SELECT * FROM offers WHERE id=?').get(req.params.id));
});

router.get('/:id/pdf', requireAuth, (req, res) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id=?').get(req.params.id);
  if (!offer || !offer.pdf_path) return res.status(404).json({ error: 'Offer PDF not found' });
  res.sendFile(offer.pdf_path);
});

export default router;
