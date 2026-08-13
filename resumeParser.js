import fs from 'fs';

// Extracts raw text from an uploaded resume file (PDF or plain text).
export async function extractResumeText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf' || filePath.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    }
    // Fallback: treat as plain text (txt, or docx-as-text best effort)
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Resume text extraction failed:', err.message);
    return '';
  }
}

const SKILL_DICTIONARY = [
  'JavaScript', 'TypeScript', 'React', 'Redux', 'Angular', 'Vue', 'Node.js', 'Express',
  'Python', 'Django', 'Flask', 'FastAPI', 'Java', 'Spring', 'Go', 'Rust', 'C++', 'C#',
  '.NET', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'CI/CD', 'Jenkins', 'Terraform',
  'Jest', 'Cypress', 'Selenium', 'Testing', 'HTML', 'CSS', 'Sass', 'Tailwind',
  'Machine Learning', 'Data Science', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch',
  'Agile', 'Scrum', 'Git', 'Microservices', 'System Design', 'Kafka', 'RabbitMQ',
];

// Lightweight, dependency-free "parsing" via regex/keyword heuristics.
// This stands in for a more sophisticated NLP/resume-parsing service.
export function parseResumeText(text) {
  const lower = text.toLowerCase();

  const skills = SKILL_DICTIONARY.filter((skill) =>
    lower.includes(skill.toLowerCase())
  );

  // crude "years of experience" extraction, e.g. "6 years", "6+ years"
  let experienceYears = null;
  const expMatch = text.match(/(\d+(?:\.\d+)?)\+?\s*(?:years|yrs)/i);
  if (expMatch) experienceYears = parseFloat(expMatch[1]);

  // crude email/phone extraction as a sanity check
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = text.match(/(\+?\d[\d\s\-()]{8,}\d)/);

  // crude education extraction
  const educationKeywords = ['B.Tech', 'M.Tech', 'Bachelor', 'Master', 'MBA', 'B.Sc', 'M.Sc', 'PhD', 'B.E', 'M.E'];
  const education = [];
  for (const kw of educationKeywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const snippet = text.slice(idx, idx + 80).split('\n')[0];
      education.push(snippet.trim());
    }
  }

  return {
    skills,
    experienceYears,
    education,
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null,
  };
}
