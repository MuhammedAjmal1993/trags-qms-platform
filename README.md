# TRAGS Quality Management Platform

Web platform that runs the TRAGS QMS registers end to end: Audit Plan, Finding Register, Inspection Log (NFI), RFI, Source Inspection, Welder and Weld Repair registers, Training, Customer Feedback and Lessons Learnt, with the work order number (WON) as the key across every module.

## Stack
- Cloudflare Worker (API, `worker/`) with static assets (React SPA, `src/`)
- D1 database `trags-qms-db` (schema migrates itself on first request after each deploy, `worker/schema.ts`)
- R2 bucket `trags-qms-files` (uploads, attachments, controlled documents, form templates)
- Workers AI (`toMarkdown` text extraction + Llama 3.3 70B structured extraction) for scans, PDFs and Word reports
- Shared register definitions and rules: `shared/registers.ts`, `shared/logic.ts`

## Deploy
Cloudflare Workers Builds is connected to this repository: every push to `main` builds (`npm run build`) and deploys (`npx wrangler deploy`).
Requirements on the Cloudflare account: Workers Paid plan, R2 enabled.

Manual deploy: `npm ci && npm run build && npx wrangler deploy`.

## First run
The first visitor sees the setup page. It needs the one-time setup code stored (hashed) in `settings.setup_code_hash`; the code is removed once the administrator account exists.

## Rules carried from the TRAGS register skills
- Imports map Excel columns by header name, never by position; blank cells stay blank.
- Findings of one report share the report's UID and are inserted as the next rows of that UID group.
- Duplicate keys (exact match) are blocked on entry and highlighted in the grid and in exports.
- Inferred or conflicting values are flagged (red) with the reason; editing the field clears the flag.
- Audit Plan is checked against the Finding Register on every finding change: missing Audit/Surveillance/QWA reports are added (Inspection never), NCR/OBS/OFI counts and status are recomputed, format variants are flagged, not added.
- Every change is recorded in the record history and the activity log.
