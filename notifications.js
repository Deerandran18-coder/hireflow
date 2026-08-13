import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// View the email notification audit log (recruiters/admin)
router.get('/', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200').all();
  res.json(rows);
});

export default router;
