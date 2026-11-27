# CLAUDE.md: TRAGS Quality Management Platform

Context for Claude Code working in this repository.

## What this is
Internal QA/QC platform for Trading and Agency Services Limited Company W.L.L. (TRAGS), Doha: Qatar Factory for Gas and Petroleum Equipment and TRAGS Security Services are covered too. It replaces the department's Excel registers and the Looker Studio dashboard. Owner: Muhammed Ajmal (QA/QC Coordinator).

- Live: https://trags-qms-platform.ubaisjonk.workers.dev (public landing `/`, signed-in landing `/welcome`, quick raise `/raise`)
- Repo: github.com/MuhammedAjmal1993/trags-qms-platform (private). Push to `main` = Cloudflare Workers Builds deploys automatically.
- Cloudflare account f300452f4780a3cd63dc07b0d9028e2f, Worker `trags-qms-platform`, D1 `trags-qms-db` (60a1a667-aa6f-4a21-bdc7-eeb187c2141a). Free plan.

## Stack and layout
- `worker/`: Hono API on Cloudflare Workers. `index.ts` (routes, cron `scheduled()`), `schema.ts` (self-migrating D1 schema), `core.ts` (record create/update, promotion of columns), `routes/*` (auth, records, stats, sections, ingest, docs, admin, public), `importer.ts` (encrypted register import), `cache.ts` (response cache keyed by `CODE_VERSION` + data version; bump `CODE_VERSION` when a response shape changes).
- `src/`: React 19 + Vite SPA. `pages/` (Dashboard + `DashSections.tsx`, RegisterPage, Hubs, Landing, Public, Admin, Ingest, ...), `components/` (Charts, ui, Brand), `lib/` (excel, forms, auditbook), `nav.ts`, `styles.css`.
- `shared/`: `registers.ts` (every register: columns, roles, options, promoted columns), `logic.ts` (normalisation, dates, UID/duplicate rules). Used by both sides.
- `public/import/`: encrypted data chunks (never served publicly; worker returns 404 for `/import/*`). `public/brand/`: logo, favicon, hero photos.
- `tools/import/`: scripts that built the 26-Nov-2026 data load (see its README). The import key is not in the repo.

## Commands
- `npm ci`, `npm run typecheck`, `npm run build`
- Local: `npx wrangler dev --port 8788` (local D1 under `.wrangler/`). First visit shows the setup page; a local setup code can be inserted with `npx wrangler d1 execute trags-qms-db --local --command "INSERT INTO settings(key,value) VALUES('setup_code_hash', '<sha256 hex of code>')"`.
- Trigger the cron locally: `curl "http://localhost:8788/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"`.
- Never run `wrangler deploy` by hand unless asked; deployment is by push to `main`.

## Hard constraints
- Free plan: 10 ms CPU per request. Keep heavy aggregation in SQL, batch with `env.DB.batch`, avoid large JSON parsing in the worker. D1: 100,000 rows written per day (each indexed row costs several writes). The importer reserves 70,000/day.
- Data rules (from the TRAGS register skills): WON (7 digits) is the key across modules; findings of one report share the report UID; exact duplicates are blocked and highlighted; inferred values are flagged red with a reason (`_flags`), never silently filled; source text goes in descriptions unchanged.
- Public pages (`/`, `/raise`, `/qr`, `/api/public/*`) show only approved content: counts, current certificates, items marked `public = Yes`. No client names, finding details or Quality Manual text. Quick-raise submissions go to the Review queue; nothing enters a register until a QA/QC user accepts it.
- Never approve, sign or close records on a user's behalf in code paths; generated forms leave signature and verification sections blank.
- Do not commit secrets. `import_key` lives only in D1 settings.

## Dashboard
Tabs mirror the Looker Studio "TRAGS Quality Dashboard" (12 pages): Overview, Audits, Findings, Welding (with Welder Performance Card), RFI, Source inspection (NFI), Training, Customer feedback, Trade awards, Findings: 5 years. Main payload `/api/stats/dashboard`; per-tab payloads `/api/stats/section/:name`; welder card `/api/stats/welder/:id`. KPI targets come from settings `kpi_targets` (Admin → Settings), defaults = 2026 quality objectives.

## State on 27-Nov-2026
- All uploaded registers loaded except the tail of WRR and the RFI history (24,599 rows); the cron finishes them over the next nights (status: Admin → Settings, or `GET /api/admin/import`).
- Controlled forms loaded: F21 R8 NCR (Excel), F257 R2 Observation Report (PDF). F271 PDF not yet provided.
- Empty registers waiting for data: Personnel Certifications (PCR), Special Jobs Showcase (SPJ), Source Inspection (SRC; the NFI register is the controlled Register 21).

## Review brief (next task)
Check the whole site for gaps and UI errors and fix them:
1. Every route in `src/App.tsx` and every register in `shared/registers.ts`: loads without console errors, empty states read well, filters/sort/export work, record drawer edit/save works.
2. Layout at 375 px, 768 px, 1280 px and 1920 px: overflow, clipped tiles, chart legends, tables that need horizontal scroll, sidebar rail.
3. Dashboard tabs vs the Looker PDF (`01 - QMS System/00 - QMS Platform Inputs/02 Dashboards`): missing tiles or summaries, number formats, date filter behaviour.
4. Accessibility basics: focus states, button labels on icon-only buttons, contrast on gradient tiles, reduced-motion behaviour.
5. Performance: first load size, lazy chunks, worker CPU on `/api/stats/*` with the full RFI data loaded.
6. Landing page: content accuracy against the data, no client names, image weights.
Report findings before large refactors; keep changes in small commits.
