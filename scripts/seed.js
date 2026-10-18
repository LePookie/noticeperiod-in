// Dummy data for testing the backend and the matching model. Safe to remove: `npm run seed:clear`.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, DATA, tx } from '../db.js';
import { rescore } from '../matcher.js';

const ROLES = [
  { title: 'Backend Engineer', openings: 6, location: 'Bengaluru', min_years: 3, max_years: 9, skills: 'java, spring boot, microservices, kafka, postgresql, redis, aws, docker', description: 'Finlytics is growing its payments platform and needs backend engineers who can own services end to end.\n\nWhat you will do\n- Design and build Java microservices and REST APIs\n- Run Kafka, PostgreSQL and Redis in production\n- Review code and improve reliability and performance\n\nWhat we are looking for\n- 3 to 9 years of backend experience\n- Strong Java and Spring Boot\n- Comfortable with AWS and Docker' },
  { title: 'Data Engineer', openings: 4, location: 'Hyderabad', min_years: 2, max_years: 8, skills: 'python, sql, spark, airflow, etl, snowflake, aws, kafka', description: 'DataNest turns raw business data into reports people trust.\n\nWhat you will do\n- Build and monitor batch and streaming pipelines\n- Model data in Snowflake for analysts\n- Keep jobs fast, tested and well documented\n\nWhat we are looking for\n- 2 to 8 years in data engineering\n- Strong Python and SQL\n- Experience with Spark or Airflow' },
  { title: 'Full Stack Engineer', openings: 5, location: 'Pune', min_years: 2, max_years: 8, skills: 'react, typescript, node.js, javascript, html, css, postgresql, rest', description: 'Cartly is building a faster checkout for online stores.\n\nWhat you will do\n- Build React and TypeScript screens and Node APIs\n- Work with designers and product on weekly releases\n- Fix bugs and improve page speed\n\nWhat we are looking for\n- 2 to 8 years of full stack experience\n- Solid JavaScript, HTML and CSS\n- Good habits around testing and code review' },
  { title: 'QA Automation Engineer', openings: 3, location: 'Any', min_years: 2, max_years: 6, skills: 'selenium, cypress, playwright, java, api testing, postman, jmeter, ci', description: 'QualityHub helps teams ship without breaking things.\n\nWhat you will do\n- Write and maintain Selenium, Cypress or Playwright tests\n- Test APIs with Postman and add checks to CI\n- Find and report issues early\n\nWhat we are looking for\n- 2 to 6 years in test automation\n- Java or JavaScript scripting\n- Clear written bug reports' },
  { title: 'DevOps Engineer', openings: 4, location: 'Gurugram', min_years: 3, max_years: 10, skills: 'kubernetes, docker, terraform, aws, jenkins, linux, ci/cd, prometheus', description: 'CloudPeak runs infrastructure for growing software teams.\n\nWhat you will do\n- Manage Kubernetes clusters and Terraform on AWS\n- Build CI/CD pipelines in Jenkins\n- Set up monitoring with Prometheus and handle on-call\n\nWhat we are looking for\n- 3 to 10 years in DevOps or SRE\n- Strong Linux and Docker\n- Calm under pressure' },
  { title: 'Product Designer', openings: 2, location: 'Mumbai', min_years: 2, max_years: 10, skills: 'figma, user research, prototyping, design systems, wireframes, usability testing', description: 'Pixelry designs tools that small teams love to use.\n\nWhat you will do\n- Run user research and turn it into wireframes\n- Prototype in Figma and test with real users\n- Maintain the design system with engineers\n\nWhat we are looking for\n- 2 to 10 years in product design\n- A portfolio that shows your process\n- Strong communication' }
];
['Finlytics', 'DataNest', 'Cartly', 'QualityHub', 'CloudPeak', 'Pixelry'].forEach((c, i) => ROLES[i].company = c);
const ARCH = [
  { pref: ['Backend engineer', 'Java developer', 'Senior backend engineer'], head: 'Backend Engineer', pool: ROLES[0].skills },
  { pref: ['Data engineer', 'Big data engineer', 'ETL developer'], head: 'Data Engineer', pool: ROLES[1].skills },
  { pref: ['Full stack developer', 'React developer', 'Frontend engineer'], head: 'Full Stack Developer', pool: ROLES[2].skills },
  { pref: ['QA automation engineer', 'SDET', 'Test engineer'], head: 'QA Automation Engineer', pool: ROLES[3].skills },
  { pref: ['DevOps engineer', 'Site reliability engineer', 'Cloud engineer'], head: 'DevOps Engineer', pool: ROLES[4].skills },
  { pref: ['Product designer', 'UX designer', 'UI/UX designer'], head: 'Product Designer', pool: ROLES[5].skills }
].map(a => ({ ...a, pool: a.pool.split(', ') }));
const NOISE = ['git', 'agile', 'jira', 'communication', 'excel', 'linux', 'sql'];
const FIRST = ['Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Rohit', 'Karan', 'Nikhil', 'Siddharth', 'Rahul', 'Manish', 'Priya', 'Ananya', 'Neha', 'Divya', 'Kavya', 'Pooja', 'Sneha', 'Ritika', 'Isha', 'Shruti', 'Varun', 'Harsh', 'Tanvi', 'Meghna'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Gupta', 'Singh', 'Kulkarni', 'Menon', 'Joshi', 'Das', 'Bose', 'Rao', 'Mehta', 'Chopra', 'Pillai', 'Shetty', 'Agarwal', 'Bhatt'];
const COMPANIES = ['a fintech startup', 'a large IT services firm', 'an e-commerce company', 'a SaaS product company', 'a logistics platform', 'a healthtech startup'];
const DEGREES = ['B.Tech, Computer Science', 'B.E., Information Technology', 'MCA', 'B.Sc., Computer Science', 'B.Des'];
const CITY_W = ['Bengaluru', 'Bengaluru', 'Bengaluru', 'Hyderabad', 'Hyderabad', 'Pune', 'Pune', 'Mumbai', 'Chennai', 'Delhi NCR', 'Gurugram', 'Kolkata', 'Open to relocate', 'Other'];
const BAND_W = [['Fresher', 0, 0], ['1-2 years', 1, 2], ['1-2 years', 1, 2], ['2-5 years', 2.5, 5], ['2-5 years', 2.5, 5], ['2-5 years', 2.5, 5], ['5-8 years', 5.5, 8], ['5-8 years', 5.5, 8], ['8-10 years', 8.5, 10], ['10+ years', 11, 16]];
const JOIN_W = [0, 0, 0, 0, 30, 30, 30, 60, 60, 60];
const STATUS_W = ['new', 'new', 'new', 'new', 'new', 'contacted', 'contacted', 'shortlisted', 'rejected'];

let seed = 42;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const some = (a, n) => [...a].sort(() => rnd() - .5).slice(0, n);
const bandOf = y => y === 0 ? 'Fresher' : y <= 2 ? '1-2 years' : y <= 5 ? '2-5 years' : y <= 8 ? '5-8 years' : y <= 10 ? '8-10 years' : '10+ years';
const when = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 19).replace('T', ' ');

const CO = ['Finlytics', 'Cartly', 'DataNest', 'QualityHub', 'CloudPeak', 'Pixelry', 'Orbitly', 'Ledgerly', 'Shipwise', 'Medora', 'Learnly', 'Brightpay'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function makeJobs(years, head) {
  if (!years) return [];
  const n = years < 2 ? 1 : years < 5 ? 2 : 3, cos = some(CO, n), jobs = []; let end = 2026.8, left = years;
  for (let i = 0; i < n; i++) {
    const span = Math.max(.5, left / (n - i)), start = end - span, mo = x => MON[Math.floor((x % 1) * 12) % 12] + ' ' + Math.floor(x);
    jobs.push({ role: i === 2 ? 'Junior ' + head : head, company: cos[i], period: `${mo(start)} - ${i === 0 ? 'Present' : mo(end)}` }); end = start; left -= span;
  }
  return jobs;
}
const jt = j => j ? `${j.role} at ${j.company} (${j.period})` : '';
function resume(name, head, city, years, skills, jobs = []) {
  const [a, b, c] = skills;
  return `${name}\n${head}, ${city}\n\nSUMMARY\n${years ? years + ' years of experience' : 'Recent graduate'} building and shipping products. Comfortable owning work end to end.\n\nSKILLS\n${skills.join(', ')}\n\nEXPERIENCE\n${jobs.map(j => `${j.role}, ${j.company} ${j.period}`).join('\n')}\n- Delivered solutions with ${a} and ${b}.\n- Improved reliability and performance of ${c || a} workloads by ${10 + Math.floor(rnd() * 40)}%.\n- Collaborated with product and QA teams to release every sprint.\n\nEDUCATION\n${pick(DEGREES)}\n`;
}
const people = [];
for (let i = 0; i < 38; i++) {
  const arch = pick(ARCH), [, lo, hi] = pick(BAND_W), years = lo === hi ? lo : Math.round((lo + rnd() * (hi - lo)) * 2) / 2;
  const first = pick(FIRST), last = pick(LAST), city = pick(CITY_W);
  const skills = [...some(arch.pool, 3 + Math.floor(rnd() * 5)), ...some(NOISE, 2)];
  people.push({ name: `${first} ${last}`, years, city, pref: pick(arch.pref), join: pick(JOIN_W), skills, head: arch.head });
}
// Edge cases that show how the matcher behaves
const ALL = a => a.split(', ');
people.push(
  { name: 'Sameer Khan', years: 4, city: 'Bengaluru', pref: 'QA automation engineer', join: 0, skills: ALL(ROLES[3].skills), head: 'QA Automation Engineer', note: 'perfect QA fit, joins now' },
  { name: 'Vikram Rathod', years: 6, city: 'Bengaluru', pref: 'Backend engineer', join: 0, skills: ALL(ROLES[0].skills), head: 'Backend Engineer', note: 'perfect backend fit, joins now' },
  { name: 'Rohan Das', years: 16, city: 'Bengaluru', pref: 'Backend engineer', join: 30, skills: ALL(ROLES[0].skills), head: 'Principal Engineer', note: 'overqualified: 16 yrs vs 3-9 range' },
  { name: 'Ananya Pillai', years: 0, city: 'Pune', pref: 'Backend engineer', join: 0, skills: ['java', 'sql', 'git'], head: 'Fresher', note: 'fresher aiming at a senior range' },
  { name: 'Meera Iyer', years: 5, city: 'Chennai', pref: 'Accounts executive', join: 30, skills: ['tally', 'gst', 'excel', 'reconciliation', 'accounts payable'], head: 'Accounts Executive', note: 'unrelated field, should score low' },
  { name: 'Karthik Nair', years: 7, city: 'Hyderabad', pref: 'Backend engineer', join: 0, skills: [], head: 'Engineer', note: 'unreadable resume (no text)', empty: true }
);

people.forEach(p => { p.jobs = makeJobs(p.years, p.head); });
const clear = () => {
  const rows = db.prepare("select resume_file from candidates where email like '%@example.test'").all();
  rows.forEach(r => fs.rmSync(path.join(DATA, 'resumes', r.resume_file), { force: true }));
  db.prepare("delete from candidates where email like '%@example.test'").run();
  ROLES.forEach(r => db.prepare('delete from roles where title=? and (description=? or company=?)').run(r.title, r.description, r.company));
  rescore(); return rows.length;
};
if (process.argv.includes('--clear')) { console.log(`Removed ${clear()} dummy candidates and the dummy roles.`); process.exit(0); }
if (db.prepare("select count(*) n from candidates where email like '%@example.test'").get().n) { console.log('Dummy data is already loaded. Run `npm run seed:clear` first to reload.'); process.exit(0); }

fs.mkdirSync(path.join(DATA, 'resumes'), { recursive: true });
const insRole = db.prepare('insert into roles(title,openings,location,min_years,max_years,skills,description,company) values(?,?,?,?,?,?,?,?)');
const ins = db.prepare(`insert into candidates(created,name,email,phone,band,years,joining,ctc,location,role_pref,resume_file,resume_name,resume_text,status,exp1,exp2,exp3,education,jobs) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
tx(() => {
  for (const r of ROLES) if (!db.prepare('select 1 from roles where title=?').get(r.title)) insRole.run(r.title, r.openings, r.location, r.min_years, r.max_years, r.skills, r.description, r.company);
  people.forEach((p, i) => {
    const text = p.empty ? '' : resume(p.name, p.head, p.city, p.years, p.skills, p.jobs), file = crypto.randomUUID() + '.txt';
    fs.writeFileSync(path.join(DATA, 'resumes', file), text || '(scanned image, no text)');
    const ctc = Math.min(80, Math.round((3 + p.years * 2.1 + rnd() * 4) * 10) / 10);
    ins.run(when(Math.floor(rnd() * 30)), p.name, `${p.name.toLowerCase().replace(/\s+/g, '.')}${i}@example.test`, '90000' + String(10000 + Math.floor(rnd() * 89999)),
      bandOf(p.years), p.years, p.join, ctc, p.city, p.pref, file, `${p.name.replace(/\s+/g, '_')}_Resume.txt`, text, pick(STATUS_W), jt(p.jobs[0]), jt(p.jobs[1]), jt(p.jobs[2]), pick(DEGREES), JSON.stringify(p.jobs));
  });
});
rescore();

console.log(`Loaded ${ROLES.length} roles and ${people.length} dummy candidates (emails end in @example.test).\n`);
const rows = db.prepare('select name, years, joining, location, scores from candidates').all().map(c => ({ ...c, scores: JSON.parse(c.scores) }));
for (const r of ROLES) {
  console.log(`Top 5 for ${r.title} (${r.location}, ${r.min_years}-${r.max_years} yrs)`);
  rows.map(c => ({ c, s: c.scores.find(x => x.title === r.title) })).sort((a, b) => b.s.score - a.s.score).slice(0, 5)
    .forEach(({ c, s }) => console.log(`  ${String(s.score).padStart(3)}%  ${c.name.padEnd(18)} ${String(c.years).padStart(4)} yrs  joins ${c.joining}d  [${s.skills.join(', ')}]`));
}
console.log('\nEdge cases (best score they got):');
people.filter(p => p.note).forEach(p => { const c = rows.find(x => x.name === p.name); console.log(`  ${String(c.scores[0]?.score ?? '-').padStart(3)}%  ${p.name.padEnd(16)} ${p.note}`); });
