# DRANVI FAMILY OS Local Server

This repo can run as a local self-owned archive before moving to a NAS.

## Start

Double-click:

```text
START_FAMILY_OS.cmd
```

or run:

```bash
node server/app.js
```

Then open:

```text
http://localhost:3000/admin/
```

## Local Archive Files

The local source of truth lives here:

```text
data/dranvi-family.json
uploads/plants/
```

Back up both paths together.

## Flow

1. Create a plant in `/admin/`.
2. Add the first letter and "입양 준비 완료!" log.
3. Copy or print the generated guardian QR.
4. The guardian opens the QR link and writes future logs.
5. Logs and uploaded photos are saved on this PC.

## API

```text
GET  /api/plants
POST /api/admin/plants
POST /api/plants/:slug/logs
```

The guardian key is stored as a SHA-256 hash in the local archive file.
