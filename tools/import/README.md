# Register import tools

Used once (26-Nov-2026) to load the uploaded TRAGS registers into D1 on the free plan.

1. `x_*.py` read the source Excel/Word files (paths in `common.py`, set `IN` to the local "01 Registers (Excel)" folder) and write normalised JSON to a raw folder.
2. `pack.ts` turns the raw JSON into insert chunks sized for the daily D1 write budget (run with `npx tsx`).
3. `encrypt.py` encrypts the chunks into `public/import/` with the key in `IMPORT_KEY`.
4. The worker cron (`worker/importer.ts`) applies one or two chunks a minute, up to 70,000 rows written per UTC day.

Paths inside the scripts point to the original build folder (`/tmp/build`); adjust before re-running.
The import key is not in this repository. A new batch needs a new batch id in the manifest.
