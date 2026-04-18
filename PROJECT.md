# Finance Dashboard — Project File

## What It Is
A personal finance PWA for tracking income, expenses, accounts, budgets, and recurring transactions. Dark UI, mobile-friendly, self-hosted with Supabase backend.

## Core Purpose
At-a-glance dashboard showing financial position — not lists, tiles. Click through for detail. Minimal and fast.

## Key Features
- CSV import from multiple NZ banks (Kiwibank sub-accounts supported)
- Account tiles with monthly in/out
- Transaction categorisation with icons
- Budget tracking
- Recurring transaction management
- Transfer detection and labelling
- Service accounts (mortgage, utilities)
- Net position tracking
- Data export (JSON)

## Tech Stack
- Frontend: Vanilla JS SPA, Chart.js, HTML5/CSS3
- Backend: Supabase (PostgreSQL + Auth)
- Hosting: Vercel
- PWA with service worker

## Core Principles
- Dashboard = at a glance only, click through for detail
- Minimal tiles not lists
- No cloud complexity — Supabase handles auth and storage

## Current Version
Service worker: `finance-v39`

## Key Quirks
- Kiwibank sub-accounts use format `38-9020-0211287-XX` (two-digit suffix per account)
- Supabase RLS blocks anon key queries — always use authenticated client
- SW cache MUST be bumped on every frontend deploy or users get stale version
- Old transactions imported before `account` field existed need backfill patch on re-import
