import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const { role } = req.query;
  const rows = role
    ? db.prepare('SELECT id,name,email,role FROM users WHERE role=?').all(role)
    : db.prepare('SELECT id,name,email,role FROM users').all();
  res.json(rows);
});

export default router;
