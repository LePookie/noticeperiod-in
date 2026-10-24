import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { db, DATA, BANDS, JOIN, STATUS, CITIES } from './db.js';
import { rescore } from './matcher.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, 'public');
const PROD = process.env.NODE_ENV === 'production';
const PHONE_OTP_CONFIGURED = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
const BETA_TEST_MODE = process.env.BETA_TEST_MODE === 'true' || (!process.env.BETA_TEST_MODE && !PHONE_OTP_CONFIGURED);

// ---------- passwords and sessions ----------
const hash = pw => { const s = crypto.randomBytes(16).toString('hex'); return `${s}:${crypto.scryptSync(pw, s, 64).toString('hex')}`; };
const check = (pw, h) => { const [s, k] = h.split(':'), d = crypto.scryptSync(pw, s, 64), kb = Buffer.from(k, 'hex'); return kb.length === d.length && crypto.timingSafeEqual(d, kb); };
const DUMMY = hash('not-a-real-password');
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const email_ok = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const e = process.env.ADMIN_EMAIL.trim().toLowerCase();
  if (!db.prepare('select 1 from admins where email=?').get(e)) { db.prepare('insert into admins(email,hash) values(?,?)').run(e, hash(process.env.ADMIN_PASSWORD)); console.log('Created admin ' + e); }
}
if (!db.prepare('select 1 from admins').get()) console.warn('!! No admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart.');
function who(req) {
  const t = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('np_sid='))?.slice(7);
  if (!t) return null;
  const s = db.prepare('select s.token, s.expires, a.id, a.email from sessions s join admins a on a.id = s.admin_id where s.token=?').get(sha(t));
  return s && s.expires > Date.now() ? s : null;
}
const cookie = (v, age) => `np_sid=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${PROD ? '; Secure' : ''}`;
const hits = new Map();
const tooMany = (key, max, ms) => { const n = Date.now(), h = (hits.get(key) || []).filter(t => n - t < ms); h.push(n); hits.set(key, h); return h.length > max; };

function list(q) {
  const w = ['1=1'], a = [];
  if (q.band) { w.push('band=?'); a.push(q.band); }
  if (q.joining) { w.push('joining<=?'); a.push(+q.joining); }
  if (q.status) { w.push('status=?'); a.push(q.status); }
  if (q.minYears) { w.push('years>=?'); a.push(+q.minYears); }
  if (q.q) { w.push('(name like ? or email like ? or phone like ? or role_pref like ?)'); const s = `%${q.q}%`; a.push(s, s, s, s); }
  const rows = db.prepare(`select id, created, verified, name, email, phone, band, years, joining, ctc, location, role_pref, resume_name, status, notes, jobs, scores
    from candidates where ${w.join(' and ')} order by created desc`).all(...a).map(c => {
    const scores = JSON.parse(c.scores);
    return { ...c, scores, jobs: JSON.parse(c.jobs || '[]'), match: q.role ? scores.find(s => String(s.id) === String(q.role)) || null : scores[0] || null };
  });
  return rows.sort((x, y) => (y.match?.score ?? -1) - (x.match?.score ?? -1) || x.joining - y.joining);
}

// ---------- app ----------
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  formAction: ["'self'"], baseUri: ["'self'"], 'upgrade-insecure-requests': null } } }));
app.get(['/admin', '/admin.html'], (req, res) => who(req) ? res.sendFile(path.join(PUB, 'admin.html')) : res.redirect('/login'));
app.get(['/login', '/login.html'], (req, res, next) => who(req) ? res.redirect('/admin') : next());
app.use(express.static(PUB, { extensions: ['html'], setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
const bad = (res, error) => res.status(400).json({ error });

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 << 20 },
  fileFilter: (_r, f, cb) => cb(/\.(pdf|docx|txt)$/i.test(f.originalname) ? null : new Error('Resume must be a PDF, DOCX or TXT file.'), true) });
async function textOf(f) {
  const ext = path.extname(f.originalname).toLowerCase();
  try { if (ext === '.pdf') return (await pdf(f.buffer)).text; if (ext === '.docx') return (await mammoth.extractRawText({ buffer: f.buffer })).value; } catch {}
  return ext === '.txt' ? f.buffer.toString('utf8') : '';
}
const bandOf = y => y === 0 ? 'Fresher' : y <= 2 ? '1-2 years' : y <= 5 ? '2-5 years' : y <= 8 ? '5-8 years' : y <= 10 ? '8-10 years' : '10+ years';
function normalizePhone(value) {
  const input = String(value || '').trim(), digits = input.replace(/\D/g, '');
  const international = input.startsWith('+') ? digits : digits.length === 10 ? `91${digits}` : digits;
  return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
}
function findCandidateByPhone(phone) {
  return db.prepare('select id,email,phone from candidates order by id desc').all().find(c => normalizePhone(c.phone) === phone) || null;
}
const linkedinOk = value => /^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-z0-9-_%]+\/?$/i.test(String(value || '').trim());
const cleanSkills = value => [...new Set(String(value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
const cleanBlocks = value => [...new Set(String(value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
async function twilioVerify(path, params) {
  if (!PHONE_OTP_CONFIGURED) throw new Error('WhatsApp phone verification is not configured yet.');
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(process.env.TWILIO_VERIFY_SERVICE_SID)}/${path}`;
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Twilio Verify request failed:', response.status, data.code || '', data.message || '');
    throw new Error('WhatsApp verification could not be completed. Check the number and try again.');
  }
  return data;
}
async function startPhoneVerification(phone) {
  return twilioVerify('Verifications', { To: phone, Channel: process.env.PHONE_OTP_CHANNEL || 'whatsapp' });
}
async function checkPhoneVerification(phone, code) {
  const result = await twilioVerify('VerificationCheck', { To: phone, Code: code });
  return result.status === 'approved';
}
function createCandidateSession(email, res) {
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('insert into csessions values(?,?,?)').run(sha(t), email, Date.now() + 7 * 864e5);
  res.setHeader('Set-Cookie', `np_me=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${PROD ? '; Secure' : ''}`);
}
// Resume parsing: contact details, education, and up to three jobs as {role, company, period}
const MON = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const RANGE = new RegExp(`((?:${MON}\\s+)?(?:19|20)\\d\\d)\\s*(?:-|–|—|to)\\s*((?:${MON}\\s+)?(?:19|20)\\d\\d|present|current|now|till date)`, 'i');
const ROLEW = /\b(engineer|developer|manager|analyst|designer|lead|architect|consultant|tester|qa|sdet|intern|executive|associate|specialist|administrator|devops|scientist|director|officer|head|trainee|programmer|writer|recruiter|accountant|coordinator|researcher|strategist|marketer|assistant|representative|owner)\b/i;
const EDUW = /\b(b\.?tech|b\.?e\.?|m\.?tech|mca|bca|mba|b\.?sc|m\.?sc|b\.?com|b\.?des|diploma|bachelor|master)\b/i;
const tidy = s => s.replace(/^[\s,–—|-]+|[\s,–—|-]+$/g, '').replace(/\s+/g, ' ').trim();
function parseJobs(lines) {
  const jobs = [], now = new Date().getFullYear(); let months = 0, inEdu = false;
  lines.forEach((l, i) => {
    if (/^(education|academic)/i.test(l)) inEdu = true; else if (/^(experience|work|employment|professional|skills|projects|certifications|summary)\b/i.test(l)) inEdu = false;
    const m = l.match(RANGE); if (!m || inEdu || EDUW.test(l)) return;
    const y1 = +m[1].match(/(?:19|20)\d\d/)[0], y2 = /\d{4}/.test(m[2]) ? +m[2].match(/(?:19|20)\d\d/)[0] : now;
    months += Math.max(0, y2 - y1) * 12; if (jobs.length >= 3) return;
    const parts = l.replace(m[0], ' ').split(/\s+(?:at|@)\s+|\s*[|,•–—()]\s*|\s+-\s+/i).map(tidy).filter(Boolean);
    const near = [lines[i - 1], lines[i + 1]].filter(x => x && !RANGE.test(x) && x.length < 80 && !/^(experience|work|employment|education|skills|summary)/i.test(x));
    let role = parts.find(p => ROLEW.test(p)) || '', company = parts.find(p => p !== role) || '';
    if (!role) role = near.find(x => ROLEW.test(x)) || '';
    if (!company) company = near.find(x => x !== role && !ROLEW.test(x) && x.split(' ').length <= 5) || '';
    jobs.push({ role: role.slice(0, 80), company: company.slice(0, 80), period: `${tidy(m[1])} - ${/^(present|current|now|till date)$/i.test(tidy(m[2])) ? 'Present' : tidy(m[2])}`.slice(0, 40) });
  });
  return { jobs, years: Math.round(months / 6) / 2 };
}
function parseResume(t) {
  const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const email = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || '';
  const phone = (t.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0] || '').replace(/^\+?91[\s-]?/, '').replace(/\D/g, '');
  const name = lines.slice(0, 5).find(l => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(' ').length <= 4) || '';
  const education = lines.find(l => EDUW.test(l)) || '';
  return { name, email, phone, education: education.slice(0, 250), ...parseJobs(lines) };
}
const cleanJobs = arr => (Array.isArray(arr) ? arr : []).slice(0, 3).map(j => ({ role: String(j?.role || '').trim().slice(0, 80), company: String(j?.company || '').trim().slice(0, 80), period: String(j?.period || '').trim().slice(0, 40) })).filter(j => j.role || j.company);
const readJobs = b => cleanJobs([1, 2, 3].map(n => ({ role: b[`j${n}_role`], company: b[`j${n}_company`], period: b[`j${n}_period`] })));
const jobText = j => j ? [j.role, j.company && 'at ' + j.company, j.period && `(${j.period})`].filter(Boolean).join(' ') : '';
app.post('/api/parse', up.single('resume'), async (req, res, next) => {
  try {
    if (tooMany('p' + req.ip, 30, 36e5)) return res.status(429).json({ error: 'Too many uploads. Try again later.' });
    if (!req.file) return bad(res, 'Attach a resume.');
    res.json(parseResume(await textOf(req.file)));
  } catch (e) { next(e); }
});
app.post('/api/hiring-interest', express.json({ limit: '10kb' }), (req, res) => {
  if (tooMany('h' + req.ip, 8, 36e5)) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  const b = req.body || {}, clean = (value, length = 200) => String(value || '').trim().slice(0, length), email = clean(b.email).toLowerCase();
  const personalDomains = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com']);
  let website;
  try { website = new URL(clean(b.website)).href; } catch { return bad(res, 'Enter your company website, including https://.'); }
  if (!clean(b.name, 100) || !clean(b.company, 150) || !clean(b.roleTitle, 120)) return bad(res, 'Complete your name, company and the role you need to fill.');
  if (!email_ok(email) || personalDomains.has(email.split('@')[1])) return bad(res, 'Use your official company email address.');
  if (!['immediate', '30', '60'].includes(clean(b.joiningTimeline, 20))) return bad(res, 'Choose the joining timeline.');
  db.prepare('insert into hiring_interests(name,email,company,website,role_title,joining_timeline) values(?,?,?,?,?,?)').run(clean(b.name, 100), email, clean(b.company, 150), website, clean(b.roleTitle, 120), clean(b.joiningTimeline, 20));
  res.status(201).json({ ok: true });
});
app.post('/api/apply', up.single('resume'), async (req, res, next) => {
  try {
    if (tooMany('a' + req.ip, 15, 36e5)) return res.status(429).json({ error: 'Too many submissions. Try again later.' });
    const b = req.body, years = Number(b.years), relevantYears = Number(b.relevantYears), joining = Number(b.joining), ctc = Number(b.ctc), currentCtc = Number(b.currentCtc), email = String(b.email || '').trim().toLowerCase();
    const cl = (k, n = 300) => String(b[k] || '').trim().slice(0, n), jobs = readJobs(b), skills = cleanSkills(b.skills), blockedCompanies = cleanBlocks(b.blockedCompanies);
    if (!cl('name', 100)) return bad(res, 'Add your full name.');
    if (!email_ok(email)) return bad(res, 'That email address does not look right.');
    const phone = normalizePhone(b.phone);
    if (!phone) return bad(res, 'Enter a valid phone number with country code, for example +91 98765 43210.');
    if (!linkedinOk(b.linkedin)) return bad(res, 'Add your LinkedIn profile URL, for example https://www.linkedin.com/in/your-name.');
    if (!(years >= 0 && years <= 50)) return bad(res, 'Add your total years of experience (0 if fresher).');
    if (!(relevantYears >= 0 && relevantYears <= years)) return bad(res, 'Relevant experience must be between 0 and your total experience.');
    if (!(currentCtc >= 0 && currentCtc <= 500)) return bad(res, 'Add your current CTC in LPA.');
    if (skills.length < 2) return bad(res, 'Add at least two skills, separated by commas.');
    if (!cl('rolePref', 100)) return bad(res, 'Tell us the role you are looking for.');
    if (!(ctc > 0 && ctc <= 500)) return bad(res, 'Add your expected CTC in LPA, e.g. 12.5.');
    if (![0, 30, 60].includes(joining)) return bad(res, 'This list is for people who can join within 2 months.');
    if (!CITIES.includes(b.location)) return bad(res, 'Choose your city.');
    if (!CITIES.includes(b.preferredLocation)) return bad(res, 'Choose your preferred work location.');
    if (!['onsite', 'hybrid', 'remote'].includes(b.workPreference)) return bad(res, 'Choose how you prefer to work.');
    if (b.consent !== 'yes') return bad(res, 'Please tick the consent box so we can create your account.');
    if (!req.file) return bad(res, 'Attach your resume.');
    if (db.prepare('select 1 from candidates where email=? or phone=? or linkedin=?').get(email, phone, cl('linkedin', 200))) return res.status(409).json({ error: 'An account already exists with that email, phone number or LinkedIn profile.' });
    const file = crypto.randomUUID() + path.extname(req.file.originalname).toLowerCase();
    fs.writeFileSync(path.join(DATA, 'resumes', file), req.file.buffer);
    const r = db.prepare(`insert into candidates(name,email,phone,band,years,joining,ctc,location,role_pref,resume_file,resume_name,resume_text,exp1,exp2,exp3,education,jobs,linkedin,relevant_years,current_ctc,skills,preferred_location,work_preference,privacy_notice_version) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(cl('name', 100), email, phone, bandOf(years), years, joining, ctc, b.location, cl('rolePref', 100), file, req.file.originalname,
        (await textOf(req.file)).replace(/\0/g, '').slice(0, 200000), jobText(jobs[0]), jobText(jobs[1]), jobText(jobs[2]), cl('education'), JSON.stringify(jobs), cl('linkedin', 200), relevantYears, currentCtc, JSON.stringify(skills), b.preferredLocation, b.workPreference, 'v2-draft');
    const candidateId = r.lastInsertRowid;
    const addBlock = db.prepare('insert or ignore into candidate_blocks(candidate_id,company_name) values(?,?)');
    blockedCompanies.forEach(company => addBlock.run(candidateId, company));
    db.prepare('insert into candidate_consents(candidate_id,purpose,notice_version) values(?,?,?)').run(candidateId, 'profile-processing', 'v2-draft');
    rescore(r.lastInsertRowid);
    if (BETA_TEST_MODE) {
      db.prepare('update candidates set verified=1 where id=?').run(candidateId);
      createCandidateSession(email, res);
      return res.status(201).json({ ok: true, betaLogin: true });
    }
    await startPhoneVerification(phone);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- candidate accounts: phone verification, then a session cookie ----------
app.post('/api/login', express.json({ limit: '10kb' }), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (tooMany('o' + req.ip, 8, 9e5)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    if (!phone) return bad(res, 'Enter a valid phone number with country code.');
    const candidate = findCandidateByPhone(phone);
    if (BETA_TEST_MODE) {
      if (!candidate) return res.status(404).json({ error: 'No account found for that phone number. Apply first to create one.' });
      db.prepare('update candidates set verified=1 where id=?').run(candidate.id);
      createCandidateSession(candidate.email, res);
      return res.json({ ok: true, betaLogin: true });
    }
    if (!PHONE_OTP_CONFIGURED) return res.status(503).json({ error: 'Phone verification is not configured yet. Please try again later.' });
    if (candidate) await startPhoneVerification(phone);
    res.json({ ok: true, codeSent: !!candidate });
  } catch (e) { next(e); }
});
app.post('/api/verify', express.json({ limit: '10kb' }), async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone), code = String(req.body?.code || '').trim();
    if (!phone || !/^\d{4,10}$/.test(code)) return bad(res, 'Enter the phone number and verification code.');
    if (tooMany('v' + req.ip, 10, 9e5)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
    const candidate = findCandidateByPhone(phone);
    if (!candidate) return bad(res, 'No account found for that phone number.');
    if (!await checkPhoneVerification(phone, code)) return bad(res, 'That code is not right or has expired.');
    db.prepare('update candidates set verified=1 where id=?').run(candidate.id);
    createCandidateSession(candidate.email, res); res.json({ ok: true });
  } catch (e) { next(e); }
});
const meOf = req => { const t = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('np_me='))?.slice(6);
  const s = t && db.prepare('select email, expires from csessions where token=?').get(sha(t)); return s && s.expires > Date.now() ? s.email : null; };
const STAGE = { new: 'Profile under review', contacted: 'We have reached out to you', shortlisted: 'You are shortlisted', placed: 'Placed. Congratulations!', rejected: 'No match right now' };
const mine = (req, res) => { res.set('Cache-Control', 'no-store'); const e = meOf(req); if (!e) res.status(401).json({ error: 'Please sign in.' }); return e; };
app.get('/api/me', (req, res) => {
  const e = mine(req, res); if (!e) return;
  const c = db.prepare('select id,name,email,phone,years,relevant_years,joining,ctc,current_ctc,location,preferred_location,work_preference,linkedin,skills,paused,role_pref,jobs,education,resume_name,status,created,scores from candidates where email=? order by id desc').get(e);
  const blocks = db.prepare('select company_name from candidate_blocks where candidate_id=? order by company_name').all(c.id).map(row => row.company_name);
  res.json({ ...c, jobs: JSON.parse(c.jobs || '[]'), skills: JSON.parse(c.skills || '[]'), blocks, stage: c.paused ? 'Profile paused' : (STAGE[c.status] || STAGE.new), status: undefined, id: undefined, scores: c.paused ? [] : JSON.parse(c.scores).slice(0, 5).map(({ id, title, company, score, skills }) => ({ id, title, company, score, skills })) });
});
app.patch('/api/me', express.json({ limit: '20kb' }), (req, res) => {
  const e = mine(req, res); if (!e) return;
  const b = req.body, joining = Number(b.joining), ctc = Number(b.ctc), relevantYears = Number(b.relevantYears), currentCtc = Number(b.currentCtc), skills = cleanSkills(b.skills), cl = (k, n = 300) => String(b[k] || '').trim().slice(0, n);
  if (![0, 30, 60].includes(joining)) return bad(res, 'Joining time must be immediate, 1 month or 2 months.');
  if (!(ctc > 0 && ctc <= 500)) return bad(res, 'Add your expected CTC in LPA.');
  if (!(currentCtc >= 0 && currentCtc <= 500)) return bad(res, 'Add your current CTC in LPA.');
  if (!(relevantYears >= 0 && relevantYears <= 50)) return bad(res, 'Add your relevant experience.');
  if (skills.length < 2) return bad(res, 'Add at least two skills.');
  if (!CITIES.includes(b.location)) return bad(res, 'Choose your city.');
  if (!CITIES.includes(b.preferredLocation)) return bad(res, 'Choose your preferred work location.');
  if (!['onsite', 'hybrid', 'remote'].includes(b.workPreference)) return bad(res, 'Choose how you prefer to work.');
  if (!cl('rolePref', 100)) return bad(res, 'Tell us the role you are looking for.');
  const jobs = cleanJobs(b.jobs), id = db.prepare('select max(id) id from candidates where email=?').get(e).id;
  db.prepare('update candidates set joining=?,ctc=?,current_ctc=?,relevant_years=?,skills=?,location=?,preferred_location=?,work_preference=?,role_pref=?,exp1=?,exp2=?,exp3=?,education=?,jobs=? where id=?').run(joining, ctc, currentCtc, relevantYears, JSON.stringify(skills), b.location, b.preferredLocation, b.workPreference, cl('rolePref', 100), jobText(jobs[0]), jobText(jobs[1]), jobText(jobs[2]), cl('education'), JSON.stringify(jobs), id);
  rescore(id); res.json({ ok: true });
});
app.patch('/api/me/privacy', express.json({ limit: '10kb' }), (req, res) => {
  const e = mine(req, res); if (!e) return;
  const candidate = db.prepare('select id from candidates where email=? order by id desc').get(e);
  const paused = req.body?.paused ? 1 : 0, blocks = cleanBlocks(req.body?.blockedCompanies);
  db.prepare('update candidates set paused=? where id=?').run(paused, candidate.id);
  db.prepare('delete from candidate_blocks where candidate_id=?').run(candidate.id);
  const addBlock = db.prepare('insert into candidate_blocks(candidate_id,company_name) values(?,?)');
  blocks.forEach(company => addBlock.run(candidate.id, company));
  db.prepare('insert into candidate_consents(candidate_id,purpose,notice_version) values(?,?,?)').run(candidate.id, paused ? 'profile-paused' : 'privacy-settings-updated', 'v2-draft');
  res.json({ ok: true, paused: Boolean(paused), blocks });
});
app.delete('/api/me', (req, res) => {
  const e = mine(req, res); if (!e) return;
  db.prepare('select resume_file from candidates where email=?').all(e).forEach(r => fs.rmSync(path.join(DATA, 'resumes', path.basename(r.resume_file)), { force: true }));
  db.prepare('delete from candidates where email=?').run(e); db.prepare('delete from csessions where email=?').run(e);
  res.setHeader('Set-Cookie', 'np_me=; Path=/; Max-Age=0'); res.json({ ok: true });
});
app.get('/api/me/role/:id', (req, res) => {
  const e = mine(req, res); if (!e) return;
  const c = db.prepare('select scores from candidates where email=? order by id desc').get(e);
  const sc = JSON.parse(c?.scores || '[]').find(x => String(x.id) === req.params.id), r = sc && db.prepare('select * from roles where id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'That role is not available.' });
  res.json({ title: r.title, company: r.company, location: r.location, openings: r.openings, min_years: r.min_years, max_years: r.max_years, description: r.description, score: sc.score, matched: sc.skills,
    missing: r.skills.split(',').map(x => x.trim()).filter(x => x && !sc.skills.includes(x.toLowerCase())) });
});
app.get('/api/me/resume', (req, res) => {
  const e = mine(req, res); if (!e) return;
  const c = db.prepare('select resume_file, resume_name from candidates where email=? order by id desc').get(e);
  c ? res.download(path.join(DATA, 'resumes', path.basename(c.resume_file)), c.resume_name) : res.status(404).json({ error: 'No resume on file.' });
});
app.post('/api/me/resume', up.single('resume'), async (req, res, next) => {
  try {
    const e = mine(req, res); if (!e) return;
    if (!req.file) return bad(res, 'Attach a resume.');
    const c = db.prepare('select id, resume_file from candidates where email=? order by id desc').get(e);
    const file = crypto.randomUUID() + path.extname(req.file.originalname).toLowerCase();
    fs.writeFileSync(path.join(DATA, 'resumes', file), req.file.buffer);
    db.prepare('update candidates set resume_file=?, resume_name=?, resume_text=? where id=?').run(file, req.file.originalname, (await textOf(req.file)).replace(/\0/g, '').slice(0, 200000), c.id);
    fs.rmSync(path.join(DATA, 'resumes', path.basename(c.resume_file)), { force: true });
    rescore(c.id); res.json({ ok: true, resume_name: req.file.originalname });
  } catch (x) { next(x); }
});
app.post('/api/me/logout', (req, res) => { res.setHeader('Set-Cookie', 'np_me=; Path=/; Max-Age=0'); res.json({ ok: true }); });

app.post('/api/admin/login', express.json({ limit: '10kb' }), (req, res) => {
  if (tooMany('l' + req.ip, 10, 9e5)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes.' });
  const a = db.prepare('select * from admins where email=?').get(String(req.body?.email || '').trim().toLowerCase());
  if (!(check(String(req.body?.password || ''), a ? a.hash : DUMMY) && a)) return res.status(401).json({ error: 'That email or password is not right.' });
  db.prepare('delete from sessions where expires < ?').run(Date.now());
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('insert into sessions values(?,?,?)').run(sha(t), a.id, Date.now() + 8 * 36e5);
  res.setHeader('Set-Cookie', cookie(t, 28800)); res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  const s = who(req); if (s) db.prepare('delete from sessions where token=?').run(s.token);
  res.setHeader('Set-Cookie', cookie('', 0)); res.json({ ok: true });
});

const admin = express.Router();
admin.use((req, res, next) => { req.admin = who(req); res.set('Cache-Control', 'no-store'); req.admin ? next() : res.status(401).json({ error: 'Please sign in.' }); }, express.json({ limit: '100kb' }));
admin.get('/meta', (req, res) => res.json({ BANDS, JOIN, STATUS, email: req.admin.email }));
admin.get('/candidates', (req, res) => res.json(list(req.query)));
admin.patch('/candidates/:id', (req, res) => {
  const { status, notes } = req.body;
  if (status !== undefined && !STATUS.includes(status)) return bad(res, 'Unknown status.');
  db.prepare('update candidates set status=coalesce(?,status), notes=coalesce(?,notes) where id=?').run(status ?? null, notes ?? null, req.params.id); res.json({ ok: true });
});
admin.delete('/candidates/:id', (req, res) => {
  const c = db.prepare('select resume_file from candidates where id=?').get(req.params.id);
  if (c) { fs.rmSync(path.join(DATA, 'resumes', path.basename(c.resume_file)), { force: true }); db.prepare('delete from candidates where id=?').run(req.params.id); }
  res.json({ ok: true });
});
admin.get('/resume/:id', (req, res) => {
  const c = db.prepare('select resume_file, resume_name from candidates where id=?').get(req.params.id);
  c ? res.download(path.join(DATA, 'resumes', path.basename(c.resume_file)), c.resume_name) : res.status(404).json({ error: 'Not found.' });
});
admin.get('/roles', (_q, res) => res.json(db.prepare('select * from roles order by openings desc, title').all()));
admin.post('/roles', (req, res) => {
  const r = req.body; if (!r.title?.trim()) return bad(res, 'Role title is required.');
  const v = [r.title.trim(), Math.max(0, parseInt(r.openings) || 0), String(r.location || 'Any').trim(), +r.min_years || 0, +r.max_years || 50, String(r.skills || ''), String(r.description || ''), String(r.company || '').trim()];
  r.id ? db.prepare('update roles set title=?,openings=?,location=?,min_years=?,max_years=?,skills=?,description=?,company=? where id=?').run(...v, r.id)
       : db.prepare('insert into roles(title,openings,location,min_years,max_years,skills,description,company) values(?,?,?,?,?,?,?,?)').run(...v);
  rescore(); res.json({ ok: true });
});
admin.delete('/roles/:id', (req, res) => { db.prepare('delete from roles where id=?').run(req.params.id); rescore(); res.json({ ok: true }); });

admin.get('/team', (req, res) => res.json(db.prepare('select id, email, created from admins order by id').all().map(a => ({ ...a, me: a.id === req.admin.id }))));
admin.post('/team', (req, res) => {
  const e = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (!email_ok(e)) return bad(res, 'Enter a valid email address.');
  if (pw.length < 10) return bad(res, 'Use a password of at least 10 characters.');
  if (db.prepare('select 1 from admins where email=?').get(e)) return bad(res, 'That email already has access.');
  db.prepare('insert into admins(email,hash) values(?,?)').run(e, hash(pw)); res.status(201).json({ ok: true });
});
admin.delete('/team/:id', (req, res) => {
  if (+req.params.id === req.admin.id) return bad(res, 'You cannot remove your own access.');
  db.prepare('delete from admins where id=?').run(req.params.id); res.json({ ok: true });
});
admin.post('/password', (req, res) => {
  const a = db.prepare('select hash from admins where id=?').get(req.admin.id), n = String(req.body.next || '');
  if (!check(String(req.body.current || ''), a.hash)) return bad(res, 'Your current password is not right.');
  if (n.length < 10) return bad(res, 'Use a password of at least 10 characters.');
  db.prepare('update admins set hash=? where id=?').run(hash(n), req.admin.id);
  db.prepare('delete from sessions where admin_id=? and token<>?').run(req.admin.id, req.admin.token); res.json({ ok: true });
});

admin.get('/export.xlsx', async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Ranked candidates', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [['Rank', 6], ['Name', 24], ['Phone', 16], ['Email', 30], ['Experience band', 16], ['Years', 8], ['Can join', 15], ['Expected CTC (LPA)', 18],
      ['City', 16], ['Looking for', 26], ['Best-fit role', 26], ['Match %', 10], ['Matched skills', 34], ['Status', 12], ['Applied', 18], ['Latest role', 26], ['Latest company', 24]].map(([header, width]) => ({ header, width }));
    list(req.query).forEach((c, i) => ws.addRow([i + 1, c.name, c.phone, c.email, c.band, c.years, JOIN[c.joining], c.ctc, c.location, c.role_pref,
      [c.match?.company, c.match?.title].filter(Boolean).join(' - ') || 'No open role', c.match?.score ?? '', c.match?.skills.join(', ') || '', c.status, c.created, c.jobs[0]?.role || '', c.jobs[0]?.company || '']));
    ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D6B55' } }; });
    ws.autoFilter = { from: 'A1', to: 'Q1' };
    ws.getColumn(12).eachCell((c, r) => { if (r > 1 && typeof c.value === 'number') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.value >= 70 ? 'FFCDEBDD' : c.value >= 40 ? 'FFFFF0B8' : 'FFF4D3D0' } }; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="noticeperiod-candidates-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res); res.end();
  } catch (e) { next(e); }
});
app.use('/api/admin', admin);
app.use((e, _q, res, _n) => { if (e.code !== 'LIMIT_FILE_SIZE') console.error(e); res.status(400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 5 MB or smaller.' : e.message || 'Something went wrong.' }); });
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`noticeperiod.in running at http://localhost:${port}`));
