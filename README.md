# Mission Job Dashboard

> A personal job application command center — built in a single HTML file, deployed on GitHub Pages, backed by Supabase.

**Live:** https://prajjwal17.github.io/mission-job-dashboard/

---

## What It Does

A full-featured job hunting dashboard I built to manage my entire job search in one place. No frameworks, no build step — just a single `index.html` that does a lot.

### Features

| Feature | Description |
|---|---|
| 🎯 **Curated Roles** | 25 hand-picked target companies with role-specific notes and fit analysis |
| 🌐 **All Companies** | 625 companies across 7 domains, searchable and filterable |
| 🔥 **Job Drives** | 202 live job listings from Instagram influencer job drives (Unstop, Remote, Non-Tech, Tech) |
| 📋 **Application Board** | Kanban-style tracker with status dropdowns — To Apply → Applied → Shortlisted → Interview → Selected |
| 🤖 **AI Tools** | Cover letter generator + ATS resume optimizer, both powered by Groq (Llama 3.3 70B) |
| 🎓 **Prep Guide** | Company-specific interview prep for 10 target companies |
| 🔄 **Real-time Sync** | Board updates sync instantly across all devices via Supabase Realtime |

---

## Tech Stack

```
Frontend      Vanilla JS + HTML/CSS (zero frameworks, zero build step)
Auth          Supabase Magic Link (passwordless email auth)
Database      Supabase PostgreSQL + Row Level Security
Real-time     Supabase Realtime (Postgres CDC → WebSocket)
AI            Groq API — Llama 3.3 70B (cover letters + ATS analysis)
Hosting       GitHub Pages (free, auto-deploys on push)
Data Sources  Excel files from Instagram job drive influencers (pandas extraction)
```

---

## Architecture

```
prajjwal-job-master-dashboard.html   ← entire frontend (single file)
│
├── Auth Layer          Supabase magic link → session stored in browser
├── Data Layer          202 jobs embedded as JS array (extracted from Excel via pandas)
├── Board Layer         CRUD → Supabase PostgreSQL, filtered by user_id via RLS
├── Realtime Layer      Supabase channel subscription → live DOM updates
└── AI Layer            Groq API called directly from browser (key stored in localStorage)

site/
└── index.html          ← copy of dashboard, served by GitHub Pages
```

---

## Database Schema

```sql
create table applications (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references auth.users(id) on delete cascade,
  title      text        not null,
  salary     text        default '',
  source     text        default '',
  link       text        default '',
  status     text        default 'To Apply',
  date       date,
  notes      text        default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: users only see their own rows
alter table applications enable row level security;
create policy "Users manage own apps" on applications
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime enabled
alter publication supabase_realtime add table applications;
```

---

## AI Tools

Both tools use **Groq's free tier** (Llama 3.3 70B) called directly from the browser.

**Cover Letter Generator**
- Paste any JD → get a 280-word personalized cover letter in ~3 seconds
- Highlights 2-3 resume achievements that directly match the JD
- Starts with a hook, ends with a call to action — no generic filler

**ATS Resume Optimizer**
- Paste JD → get: ATS match score, missing keywords, rewritten summary, specific bullet rewrites, skills to add, red flags, and one quick win
- References actual text from both the resume and JD

Get a free Groq API key at [console.groq.com](https://console.groq.com)

---

## Running Locally

No build step needed. Just open the file:

```bash
# Clone
git clone https://github.com/Prajjwal17/mission-job-dashboard.git

# Open directly in browser
start index.html     # Windows
open index.html      # Mac
```

For Supabase features (board sync, auth) to work locally, add your Supabase URL + anon key — they're already wired in the deployed version.

---

## Updating & Deploying

The source file lives at `E:\PROJECTS\Mission Job\prajjwal-job-master-dashboard.html`. After any changes:

```bash
cd "E:\PROJECTS\Mission Job\site"
cp "..\prajjwal-job-master-dashboard.html" index.html
git add index.html && git commit -m "Update dashboard" && git push
```

GitHub Pages auto-redeploys in ~30 seconds.

---

## Data Pipeline (Job Drives)

The 202 job listings were extracted from Excel files shared by Instagram job influencers using a Python/pandas script. Sources:

| Source | Count | Type |
|---|---|---|
| Unstop Fresher Listings | 53 | Entry-level, all domains |
| Remote Closing Soon | 35 | Urgent remote jobs |
| Non-Tech Roles | 40 | Business, marketing, ops |
| Tech Roles | 24 | Engineering, dev, AI |
| Remote Companies (kaamkibaatein) | 50 | India-hiring remote cos |

---

*Built by Prajjwal Pandey — April 2026*
