// AI resume-to-job analysis.
//
// If ANTHROPIC_API_KEY is set in the environment, this calls the real Claude API
// for a genuine LLM-driven assessment. Otherwise it falls back to a transparent
// heuristic scorer (skill overlap + experience match) so the app is fully
// functional out of the box without any API key.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function analyzeCandidateForJob({ job, resumeText, parsedSkills, experienceYears }) {
  if (ANTHROPIC_API_KEY) {
    try {
      return await analyzeWithClaude({ job, resumeText });
    } catch (err) {
      console.error('Claude analysis failed, falling back to heuristic:', err.message);
    }
  }
  return heuristicAnalysis({ job, parsedSkills, experienceYears });
}

async function analyzeWithClaude({ job, resumeText }) {
  const jobSkills = JSON.parse(job.skills || '[]');
  const prompt = `You are an ATS resume screener. Given the job description and a candidate resume, return ONLY valid JSON
(no markdown fences, no prose) with this exact shape:
{"score": <0-100 integer>, "summary": "<1-2 sentence summary>", "strengths": ["...", "..."], "gaps": ["...", "..."]}

JOB TITLE: ${job.title}
REQUIRED SKILLS: ${jobSkills.join(', ')}
JOB REQUIREMENTS: ${job.requirements || ''}

RESUME TEXT:
${resumeText.slice(0, 6000)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.map((c) => c.text || '').join('') || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return {
    score: parsed.score,
    summary: parsed.summary,
    strengths: parsed.strengths || [],
    gaps: parsed.gaps || [],
    engine: 'claude',
  };
}

function heuristicAnalysis({ job, parsedSkills = [], experienceYears }) {
  const jobSkills = JSON.parse(job.skills || '[]').map((s) => s.toLowerCase());
  const candidateSkills = parsedSkills.map((s) => s.toLowerCase());

  const matched = jobSkills.filter((s) => candidateSkills.includes(s));
  const missing = jobSkills.filter((s) => !candidateSkills.includes(s));

  const skillScore = jobSkills.length ? (matched.length / jobSkills.length) * 70 : 35;

  let experienceScore = 15; // default partial credit if unknown
  if (experienceYears != null) {
    experienceScore = experienceYears >= 5 ? 30 : experienceYears >= 2 ? 20 : 10;
  }

  const score = Math.round(Math.min(100, skillScore + experienceScore));

  const strengths = [];
  if (matched.length) strengths.push(`Matches ${matched.length}/${jobSkills.length} required skills (${matched.join(', ')})`);
  if (experienceYears != null) strengths.push(`${experienceYears} years of relevant experience`);
  if (!strengths.length) strengths.push('Profile on file for manual review');

  const gaps = [];
  if (missing.length) gaps.push(`Missing skills: ${missing.join(', ')}`);
  if (experienceYears == null) gaps.push('Experience duration not clearly stated in resume');

  const summary = `Heuristic match: ${matched.length}/${jobSkills.length} required skills found` +
    (experienceYears != null ? `, ${experienceYears} yrs experience.` : '.');

  return { score, summary, strengths, gaps, engine: 'heuristic' };
}
