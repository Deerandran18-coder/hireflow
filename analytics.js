import { Router } from 'express';
import { db } from '../db/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/overview', requireAuth, requireRole('recruiter', 'admin', 'hiring_manager'), (req, res) => {
  const openJobs = db.prepare(`SELECT COUNT(*) as n FROM jobs WHERE status='open'`).get().n;
  const totalCandidates = db.prepare(`SELECT COUNT(*) as n FROM candidates`).get().n;
  const totalApplications = db.prepare(`SELECT COUNT(*) as n FROM applications`).get().n;
  const hired = db.prepare(`SELECT COUNT(*) as n FROM applications WHERE stage='hired'`).get().n;
  const rejected = db.prepare(`SELECT COUNT(*) as n FROM applications WHERE stage='rejected'`).get().n;
  const inProgress = totalApplications - hired - rejected;

  const byStage = db.prepare(`SELECT stage, COUNT(*) as count FROM applications GROUP BY stage`).all();

  const byJob = db.prepare(`
    SELECT j.title, COUNT(a.id) as applications,
      SUM(CASE WHEN a.stage='hired' THEN 1 ELSE 0 END) as hired
    FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
    GROUP BY j.id ORDER BY applications DESC`).all();

  const avgAiScore = db.prepare(`SELECT AVG(ai_score) as avg FROM applications WHERE ai_score IS NOT NULL`).get().avg;

  const avgTimeToHireDays = db.prepare(`
    SELECT AVG(julianday(updated_at) - julianday(created_at)) as avg_days
    FROM applications WHERE stage='hired'`).get().avg_days;

  const interviewsByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM interviews GROUP BY status`).all();

  const applicationsOverTime = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM applications
    GROUP BY day ORDER BY day ASC LIMIT 30`).all();

  const sourceBreakdown = db.prepare(`SELECT source, COUNT(*) as count FROM candidates GROUP BY source`).all();

  res.json({
    summary: {
      openJobs, totalCandidates, totalApplications, hired, rejected, inProgress,
      avgAiScore: avgAiScore ? Math.round(avgAiScore) : null,
      avgTimeToHireDays: avgTimeToHireDays ? Math.round(avgTimeToHireDays * 10) / 10 : null,
      conversionRate: totalApplications ? Math.round((hired / totalApplications) * 1000) / 10 : 0,
    },
    byStage, byJob, interviewsByStatus, applicationsOverTime, sourceBreakdown,
  });
});

export default router;
