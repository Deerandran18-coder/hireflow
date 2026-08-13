import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { extractResumeText, parseResumeText } from '../services/resumeParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'resumes');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.pdf', '.txt', '.doc', '.docx'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only PDF, DOC, DOCX, or TXT files are allowed'), ok);
  },
});

const router = Router();

router.post('/:candidateId/upload', requireAuth, upload.single('resume'), async (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.candidateId);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: resume)' });

  const text = await extractResumeText(req.file.path, req.file.mimetype);
  const parsed = parseResumeText(text);

  db.prepare(`UPDATE candidates SET resume_path=?, resume_text=?, parsed_skills=?, parsed_experience_years=?, parsed_education=?,
      phone = COALESCE(?, phone) WHERE id=?`)
    .run(
      req.file.path, text, JSON.stringify(parsed.skills), parsed.experienceYears,
      JSON.stringify(parsed.education), parsed.phone, req.params.candidateId
    );

  const updated = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.candidateId);
  res.json({
    candidate: { ...updated, parsed_skills: JSON.parse(updated.parsed_skills || '[]'), parsed_education: JSON.parse(updated.parsed_education || '[]') },
    parsed,
  });
});

export default router;
