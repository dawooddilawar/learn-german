# German B1 Vocabulary App — Design Spec
**Date:** 2026-03-25
**Domain:** learngerman.dawooddilawar.com

---

## Overview

A personal interactive web app for studying ~823 German B1 vocabulary words sourced from *Einfach gut B1 Wortschatzliste alphabetisch*. Pre-generated word data (meanings, example sentences, common phrases) is stored in SQLite. The app supports sequential study with EN↔DE sentence toggling, search, alphabetical/lesson-based navigation, and server-side progress persistence.

---

## Data Pipeline

### Step 1 — PDF → CSV
**Script:** `scripts/parse-pdf.js`
- Uses `pdf-parse` to extract text from `Einfach_gut_B1_Wortschatzliste_alphabetisch.pdf`
- Parses each line to extract: word, lesson number (L1–L11)
- Assigns sequential number (1–823) in alphabetical order
- Output: `data/words.csv` with columns: `number, word, lesson`

### Step 2 — CSV → Enriched SQLite
**Script:** `scripts/generate-data.js`
- Reads `data/words.csv`
- For each word, calls Claude API (`claude-sonnet-4-6`) to generate:
  - English meaning(s) — concise, covering main senses
  - Word type (noun/verb/adjective/adverb/other)
  - Gender (der/die/das — nouns only)
  - Plural form (nouns only)
  - 5 example sentences, each with English and German versions
  - 2–4 common phrases (German expression = English meaning)
- Resumable: inserts a complete row only after successful enrichment. A word is considered done if a row with its `number` already exists and `meanings_en IS NOT NULL` in the `words` table. The script skips those and continues from where it left off. The `progress` table is frontend-only and is never read or written by this script.
- Output: populates `data/db.sqlite`

### SQLite Schema

**Table: `words`**
```sql
CREATE TABLE words (
  id          INTEGER PRIMARY KEY,
  number      INTEGER NOT NULL UNIQUE,
  word        TEXT NOT NULL,
  lesson      INTEGER NOT NULL,
  type        TEXT,
  gender      TEXT,
  plural      TEXT,
  meanings_en TEXT,  -- plain string, e.g. "waste, trash, garbage; also a decrease in value"
  sentences   TEXT,  -- JSON: [{en: "...", de: "..."}, ...]
  phrases     TEXT   -- JSON: [{de: "...", en: "..."}, ...]
);
```

**Table: `progress`**
```sql
CREATE TABLE progress (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  last_word_number INTEGER NOT NULL DEFAULT 1
);
-- Seeded with a single row on startup: INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1)
-- Updates use: INSERT OR REPLACE INTO progress (id, last_word_number) VALUES (1, ?)
```

`GET /api/progress` always returns a row — the server seeds `(id=1, last_word_number=1)` on startup if the table is empty, so the response is always `{ last_word_number: <int> }`.

---

## Backend

**Stack:** Node.js 20 + Express + `better-sqlite3`

`server.js` serves both the REST API and static frontend files from `public/`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/words` | All words: `[{number, word, lesson, type, meanings_en}]` — used to populate nav and search |
| GET | `/api/word/:number` | Full word detail: `{number, word, lesson, type, gender, plural, meanings_en, sentences, phrases}`. Returns `404 { error: "Not found" }` if no word with that number exists in DB. |
| GET | `/api/search?q=` | Case-insensitive contains match on `word`. Returns `[{number, word, lesson, type, meanings_en}]` — same shape as `/api/words`. Empty or missing `q` returns all words (consistent backend contract; however, the frontend calls `/api/words` on initial load and after clearing search — not this endpoint). |
| GET | `/api/progress` | `{ last_word_number }` |
| POST | `/api/progress` | Body: `{ last_word_number: <int> }` — saves last viewed word. Validates via `SELECT 1 FROM words WHERE number = ?` — returns `400 { error: "Invalid word number" }` if the value is missing, non-integer, or does not exist as a `number` in the `words` table. Uses `INSERT OR REPLACE` upsert on success; returns `200 { ok: true }`. |

> Note: POST and GET `/api/progress` use the same field name `last_word_number` for consistency.

### Static Serving
- `GET /` → serves `public/index.html`
- All other non-API routes → `public/index.html`

**Port:** 3000 (internal)

---

## Frontend

**Stack:** Plain HTML + Vanilla JS + CSS (no build step). Single `public/index.html` with inline or linked CSS/JS.

**Typography:** Inter (body/UI) + Lora (word title)
**Theme:** Warm parchment — `#faf8f4` background, `#2e7d52` green accents, `#b87333` amber accents, `#1a2744` dark navy for titles

### Layout

```
┌─────────────────────────── topbar (sticky) ─────────────────────────┐
│ B1 Wortschatz   [search]   [Go to # ___] [Go]         #1 of 823     │
├────────────┬────────────────────────────────────────────────────────┤
│  sidebar   │  word detail (scrollable)                               │
│            │                                                         │
│  By Lesson │  [Word Title - Lora 44px]                               │
│  L1  82    │  meaning text                                           │
│  L2  91    │  [noun · masculine tag] [Lesson 1 tag]                  │
│  ...       │                                                         │
│            │  meta grid: Gender / Plural                             │
│  By Letter │                                                         │
│  A B C D   │  ── EXAMPLES ──────────────────────────                 │
│  E F G H   │  [sentence card - click toggles EN↔DE]  x5             │
│  ...       │                                                         │
│            │  ── COMMON PHRASES ─────────────────────                │
│            │  phrase cards  x2–4                                     │
├────────────┴────────────────────────────────────────────────────────┤
│  [← Previous]        Abfall · #1  [progress bar]      [Next →]      │
└─────────────────────────────────────────────────────────────────────┘
```

### UX Model
The app is strictly **one-word-at-a-time** (Focus View). There is no word list panel. The sidebar provides jump points (lesson groups and alphabet letters) that set the current word; Prev/Next then navigate sequentially from there. Search filters the navigable set.

### Navigation Behaviour
- **Lesson click:** clears search, switches to lesson-order sort, jumps to the first word of that lesson.
- **Letter click:** clears search, switches to alphabetical sort, jumps to the first word starting with that letter.
- **Sort toggle:** clears search, resets to word #1 of the new sort order. Sort state is preserved independently of search.
- **Search:** real-time filter on the full word list. When the user begins typing, the current word and current sort order are stored as `preSearchWord` and `preSearchSort`. Prev/Next navigate within the filtered results only; disabled if only 1 result. Clearing the search restores `preSearchWord` and `preSearchSort` — this counts as a word navigation and resets all sentence card states to EN. `/api/search` is called for non-empty queries; `/api/words` is used on initial load and after clearing search.
- **Jump to #:** navigates by `number` column value; clears search. If input is out of range or non-integer, shows a brief inline error ("Word not found") and does not navigate.
- **Prev/Next (no filter):** sequential within current sort order across all words.
- **Progress:** auto-saved to server 500ms after navigating to a new word; loaded on page open.

### Sentence Toggle
Each sentence card shows English by default. Clicking once toggles to German (green, non-italic); clicking again toggles back to English — bidirectional per card. All card states reset to English whenever the user navigates to a different word (including via search navigation, prev/next, jump-to-#, or lesson/letter click).

### Phrase Cards
Phrases are reference items, not toggleable. Each phrase card displays: **German expression** = English meaning. No EN↔DE toggle. Displayed in DE-first format as they appear in `phrases` JSON (`de` key shown bold, `en` key shown after `=`).

---

## Docker & Deployment

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### docker-compose.yml
```yaml
version: '3.3'
services:
  app:
    build: .
    environment:
      - VIRTUAL_HOST=learngerman.dawooddilawar.com
      - LETSENCRYPT_HOST=learngerman.dawooddilawar.com
      - VIRTUAL_PORT=3000
    volumes:
      - ./data/db.sqlite:/app/data/db.sqlite
    networks:
      - proxy-network
    restart: always

networks:
  proxy-network:
    external: true
```

### Startup Guard
On startup, `server.js` checks that `data/db.sqlite` exists and that the `words` table contains at least one row. If not, it logs a clear error (`"ERROR: data/db.sqlite missing or empty. Run scripts/generate-data.js first."`) and exits with code 1. This prevents the server from starting silently with an empty database.

### Deployment Steps
1. Run `node scripts/parse-pdf.js` locally → `data/words.csv`
2. Run `node scripts/generate-data.js` locally (Claude API batch, resumable) → `data/db.sqlite`
3. Push source code to VPS (git or scp) — `data/db.sqlite` is gitignored
4. `scp data/db.sqlite user@vps:/path/to/language-learning/data/db.sqlite` — transfer DB separately **before** starting the container
5. `docker compose up -d --build`
6. SSL auto-provisioned by nginx-proxy + Let's Encrypt companion on VPS

### .gitignore
```
data/db.sqlite
data/words.csv
.env
node_modules/
```

### .dockerignore
```
.env
data/db.sqlite
node_modules/
.git/
docs/
```

> `.env` is only needed locally for `generate-data.js` (holds `ANTHROPIC_API_KEY`). It must never be copied into the Docker image. The server container does not need any API keys at runtime.

> The volume mount `./data/db.sqlite:/app/data/db.sqlite` provides the database at runtime — the image intentionally does not contain it. The `.dockerignore` excludes it from the build context only. The scp step in deployment ensures the file is present on the host before `docker compose up`.

---

## Project Structure

```
language-learning/
├── data/
│   ├── words.csv           # generated by parse-pdf.js
│   └── db.sqlite           # generated by generate-data.js
├── public/
│   ├── index.html          # full app (HTML + JS + CSS)
│   └── fonts/              # Inter + Lora (or CDN)
├── scripts/
│   ├── parse-pdf.js        # PDF → CSV
│   └── generate-data.js    # CSV → enriched SQLite via Claude API
├── server.js               # Express app + API
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env                    # ANTHROPIC_API_KEY (for generate-data.js only)
```

---

## Out of Scope
- User accounts / multi-user support
- Audio pronunciation
- Spaced repetition / quiz mode
- Mobile app
