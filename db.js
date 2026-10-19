import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(here, 'data');
fs.mkdirSync(path.join(DATA, 'resumes'), { recursive: true });
const db = new DatabaseSync(process.env.DATABASE_PATH || path.join(DATA, 'noticeperiod.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
create table if not exists admins(id integer primary key, email text unique not null, hash text not null, created text default (datetime('now')));
create table if not exists sessions(token text primary key, admin_id integer not null references admins(id) on delete cascade, expires integer not null);
create table if not exists roles(id integer primary key, title text not null, openings integer default 1, location text default 'Any',
  min_years real default 0, max_years real default 50, skills text default '', description text default '');
create table if not exists candidates(id integer primary key, created text default (datetime('now')), name text, email text, phone text, band text,
  years real, joining integer, ctc real, location text, role_pref text, resume_file text, resume_name text, resume_text text,
  status text default 'new', notes text default '', scores text default '[]');`);

const BANDS = ['Fresher', '1-2 years', '2-5 years', '5-8 years', '8-10 years', '10+ years'];
const JOIN = { 0: 'Immediately', 30: 'Within 1 month', 60: '2 months', 90: '3 months' };
const STATUS = ['new', 'contacted', 'shortlisted', 'placed', 'rejected'];
const CITIES = ['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Chennai', 'Delhi NCR', 'Gurugram', 'Kolkata', 'Open to relocate', 'Other'];
const tx = fn => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } };

for (const s of ["alter table candidates add column exp1 text default ''", "alter table candidates add column exp2 text default ''", "alter table candidates add column exp3 text default ''",
  "alter table candidates add column education text default ''", "alter table candidates add column verified integer default 0", "alter table candidates add column jobs text default '[]'", "alter table roles add column company text default ''",
  "alter table candidates add column linkedin text default ''", "alter table candidates add column relevant_years real default 0", "alter table candidates add column current_ctc real default 0", "alter table candidates add column skills text default '[]'", "alter table candidates add column preferred_location text default ''", "alter table candidates add column work_preference text default 'hybrid'", "alter table candidates add column paused integer default 0", "alter table candidates add column privacy_notice_version text default 'v2-draft'"]) { try { db.exec(s); } catch {} }
db.exec(`create table if not exists otps(email text primary key, code text, expires integer, tries integer default 0);
create table if not exists csessions(token text primary key, email text, expires integer);
create table if not exists candidate_blocks(id integer primary key, candidate_id integer not null references candidates(id) on delete cascade, company_name text not null, created text default (datetime('now')), unique(candidate_id, company_name));
create table if not exists candidate_consents(id integer primary key, candidate_id integer not null references candidates(id) on delete cascade, purpose text not null, notice_version text not null, created text default (datetime('now')), revoked text);
create index if not exists c_email on candidates(email); create index if not exists c_created on candidates(created); create unique index if not exists c_linkedin_unique on candidates(linkedin) where linkedin <> ''; create index if not exists blocks_candidate on candidate_blocks(candidate_id);`);

export { db, DATA, tx, BANDS, JOIN, STATUS, CITIES };
