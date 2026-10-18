# noticeperiod.in

Quick-joiner intake and ranking. Node 22.13+, SQLite (built in), no native modules.

## Run
    cp .env.example .env     # set ADMIN_EMAIL and ADMIN_PASSWORD
    npm install
    npm start                # http://localhost:3000

- `/` public form. `/login` team sign-in. `/admin` recruiter desk. `/legal` policy drafts.
- Everything lives in `DATA_DIR` (default `./data`): `noticeperiod.db` plus `resumes/`. Back this folder up.
- Teammates are added from the Team tab. Sessions last 8 hours and are stored server-side.
- For a private beta without email delivery, set `BETA_TEST_MODE=true` and list tester addresses in `BETA_TEST_EMAILS` (comma-separated). The sign-in code is shown in the page only for those addresses. Turn this off and configure Resend before public use.

## Matching
Each candidate is scored 0-100 against every open role: skill overlap 30, resume/role text similarity (TF-IDF) 20,
experience-range fit 20, joining speed 15, location 10, role-title fit 5. Scores refresh when roles change.
Once you have a few hundred recruiter outcomes (status = shortlisted/placed/rejected), a gradient-boosted model can replace the weights.

## Deploy
Needs a persistent disk, because SQLite is a file. Free Render and similar ephemeral hosts will lose your data.
Options: a small VPS with `pm2` and Caddy for HTTPS; Railway or Fly.io with a volume mounted at `DATA_DIR`; an Oracle Cloud Always Free VM.
Set `NODE_ENV=production` behind HTTPS.

## Before launch
Fill the bracketed details in `public/legal.html` and have a lawyer review it. Decide a retention period and delete old profiles.
