# MKUYU Real Estate Management System

A private office system for managing real-estate projects, properties, clients, contracts, installment schedules, payments, receipts, reminders, documents, appointments, and management reports.

## Features

- Authenticated private workspace with locally stored sessions.
- Projects, properties, clients, contracts, appointments, and documents.
- Optional property image galleries with cover images and a 12-image limit.
- Contract-linked clients while retaining manual client-name support.
- Deposit and monthly installment schedule generation.
- Automatic reminders for upcoming and overdue installments.
- Payments linked to contracts and individual installments.
- Automatic installment settlement, reopening, and reminder resynchronization when a payment moves or is deleted.
- Receipt uploads, receipt downloads, replacement, and cleanup.
- Dashboard income based on actual recorded payments.
- MKUYU-branded report previews and Excel, PDF, Word, and PowerPoint exports.
- Consistent SQLite workspace backups with download support.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Windows, macOS, or Linux.

## Installation

```bash
npm install
```

Copy `.env.example` to `.env` for local configuration if needed. The application creates the runtime `data/` directory automatically.

## Running

```bash
npm start
```

Open `http://localhost:3000` in a browser. The first visit presents the private-workspace setup form. After setup, use the same application to sign in.

For development:

```bash
npm run dev
```

Demo data is inserted only when explicitly requested:

```bash
npm run seed
```

The seed command is idempotent and does not overwrite an existing populated project set.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/system.db` | SQLite database path |
| `DATA_DIR` | `data` | Runtime root for uploads and backups |
| `E2E_PORT` | `3177` | Port used by the E2E test server |

`DB_PATH` and `DATA_DIR` may be absolute or relative to the project root.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm test
```

The unit test uses a temporary database and temporary data directory. The E2E test starts an isolated server on port `3177`, uses a temporary database and runtime directory, and removes those temporary resources when complete.

Syntax-check the main JavaScript files with:

```bash
node --check backend/src/server.js
node --check backend/src/routes/api.js
node --check backend/src/uploads.js
node --check frontend/js/app.js
node --check e2e_test.mjs
```

## Data and uploads

The default runtime layout is:

```text
data/
  system.db
  uploads/
    documents/
    properties/
    reports/
  backups/
```

Uploaded files are limited to 15 MB per file. Property images accept PNG, JPEG, GIF, WebP, and BMP. Documents and reports accept the office formats configured by the API. The API stores uploaded files under generated names and never trusts a client-supplied directory path.

## Backups

Create a consistent SQLite copy from the sidebar **Backup workspace** button or the API:

```text
POST /api/v1/backups
GET  /api/v1/backups
GET  /api/v1/backups/:name/download
DELETE /api/v1/backups/:name
```

Backup files are written to `DATA_DIR/backups`. To restore one, stop the application, copy the backup over the configured database path, remove stale `-wal` and `-shm` sidecars, and restart the application. Keep a separate copy of the original database before restoring.

## Security notes

- Keep `.env`, the SQLite database, backups, and uploaded documents out of Git.
- Use HTTPS and a restricted CORS policy when exposing the application outside a trusted local network.
- Back up the database regularly and test a restore procedure.
- The default session lifetime is seven days; sign out on shared devices.
- File validation covers extension, MIME type, size, and storage-path boundaries. For internet-facing deployments, add malware scanning and a stricter reverse-proxy policy.

## Repository hygiene

Runtime data and generated validation files are ignored by Git. Do not commit `.env`, `data/`, `node_modules/`, backups, uploads, passwords, tokens, or customer records.

## Current validation status

The implementation is covered by an isolated unit suite and an end-to-end API suite covering authentication, client-linked contracts, schedules, reminders, receipts, payment movement/deletion, income totals, optional property images, upload rejection, and backups. Run the suites before deploying after any change.
