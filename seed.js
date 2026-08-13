import { db } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const hash = (pw) => bcrypt.hashSync(pw, 10);

function upsertUser(name, email, password, role) {
  const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare(`INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)`)
    .run(id, name, email, hash(password), role);
  return id;
}

const recruiter = upsertUser('Riya Recruiter', 'recruiter@demo.com', 'password123', 'recruiter');
const hm = upsertUser('Harish Manager', 'manager@demo.com', 'password123', 'hiring_manager');
const interviewer = upsertUser('Ivy Interviewer', 'interviewer@demo.com', 'password123', 'interviewer');
const candidateUser = upsertUser('Chris Candidate', 'candidate@demo.com', 'password123', 'candidate');
upsertUser('Amy Admin', 'admin@demo.com', 'password123', 'admin');

let job = db.prepare('SELECT id FROM jobs LIMIT 1').get();
if (!job) {
  const jobId = uuid();
  db.prepare(`INSERT INTO jobs (id,title,department,location,employment_type,description,requirements,skills,salary_min,salary_max,status,created_by,hiring_manager_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    jobId, 'Senior Frontend Engineer', 'Engineering', 'Bengaluru, IN', 'full_time',
    'We are looking for a Senior Frontend Engineer to build delightful, performant web experiences.',
    '5+ years experience with React, strong CSS/JS fundamentals, experience with testing.',
    JSON.stringify(['React', 'TypeScript', 'CSS', 'Testing', 'Redux']),
    2500000, 3800000, 'open', recruiter, hm
  );

  const candId = uuid();
  db.prepare(`INSERT INTO candidates (id,user_id,name,email,phone,location,resume_text,parsed_skills,parsed_experience_years,parsed_education,source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    candId, candidateUser, 'Chris Candidate', 'candidate@demo.com', '+91-9000000000', 'Bengaluru, IN',
    'Experienced frontend engineer with 6 years building React applications, TypeScript, and leading small teams. Familiar with Jest and Cypress testing.',
    JSON.stringify(['React', 'TypeScript', 'Jest', 'CSS']), 6,
    JSON.stringify([{ degree: 'B.Tech Computer Science', school: 'NIT Trichy', year: 2018 }]),
    'direct'
  );

  const appId = uuid();
  db.prepare(`INSERT INTO applications (id,job_id,candidate_id,stage,ai_score,ai_summary,ai_strengths,ai_gaps)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    appId, jobId, candId, 'screening', 82,
    'Strong match on core React/TypeScript skills with solid experience level.',
    JSON.stringify(['6 years React experience', 'Testing experience (Jest)', 'TypeScript proficiency']),
    JSON.stringify(['No explicit Redux experience mentioned', 'No CSS-in-JS mentioned'])
  );

  console.log('Seeded demo data. Login with:');
  console.log('  recruiter@demo.com / password123');
  console.log('  manager@demo.com / password123');
  console.log('  interviewer@demo.com / password123');
  console.log('  candidate@demo.com / password123');
  console.log('  admin@demo.com / password123');
} else {
  console.log('Data already seeded.');
}
