# German B1 Vocabulary App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal interactive German B1 vocabulary study app with pre-generated word data, served via Node.js + Express + SQLite, deployed on Hetzner VPS via Docker.

**Architecture:** Single Express app serves both API and static frontend from `public/`. Word data (meanings, sentences, phrases) is pre-generated via Claude API and stored in SQLite. A volume-mounted `data/db.sqlite` persists across container restarts.

**Tech Stack:** Node.js 20, Express, better-sqlite3, pdf-parse, @anthropic-ai/sdk, supertest (tests), Docker (Alpine), nginx-proxy + Let's Encrypt (VPS)

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and npm scripts |
| `server.js` | Express app: startup guard, DB init, all API endpoints, static serving |
| `scripts/parse-pdf.js` | Extract words from PDF → `data/words.csv` |
| `scripts/generate-data.js` | Read CSV → call Claude API per word → populate `data/db.sqlite` |
| `public/index.html` | Entire frontend: HTML structure + CSS + vanilla JS |
| `tests/api.test.js` | Supertest API tests against a seeded in-memory test DB |
| `tests/helpers/seed-db.js` | Creates a populated temp SQLite DB for tests |
| `Dockerfile` | Node 20 Alpine, copies source, exposes 3000 |
| `docker-compose.yml` | App service with VIRTUAL_HOST, volume mount, proxy-network |
| `.gitignore` | Excludes data/db.sqlite, data/words.csv, .env, node_modules/ |
| `.dockerignore` | Excludes .env, data/db.sqlite, node_modules/, .git/, docs/ |
| `.env.example` | Documents ANTHROPIC_API_KEY requirement |
| `data/.gitkeep` | Ensures data/ directory is tracked |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `data/.gitkeep`
- Create: `public/.gitkeep`
- Create: `scripts/.gitkeep`
- Create: `tests/helpers/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "german-b1-vocab",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "parse": "node scripts/parse-pdf.js",
    "generate": "node scripts/generate-data.js",
    "test": "node --test tests/api.test.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "better-sqlite3": "^9.4.3",
    "pdf-parse": "^1.1.1",
    "@anthropic-ai/sdk": "^0.24.3",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Run npm install**

```bash
cd D:/Tech/language-learning
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create .gitignore**

```
data/db.sqlite
data/words.csv
.env
node_modules/
.superpowers/
```

- [ ] **Step 4: Create .dockerignore**

```
.env
data/db.sqlite
node_modules/
.git/
docs/
.superpowers/
```

- [ ] **Step 5: Create .env.example**

```
ANTHROPIC_API_KEY=your_api_key_here
```

- [ ] **Step 6: Create placeholder directories**

```bash
touch data/.gitkeep
mkdir -p public scripts tests/helpers
```

- [ ] **Step 7: Commit**

```bash
git init
git add package.json package-lock.json .gitignore .dockerignore .env.example data/.gitkeep
git commit -m "chore: project scaffolding"
```

---

## Task 2: PDF Parsing Script

**Files:**
- Create: `scripts/parse-pdf.js`

The PDF contains German words listed alphabetically with lesson codes (L1–L11). The text extraction will produce lines like `Abfall        L1`. The parser needs to handle: multi-column layout artifacts, lines with just letters (section headers like "A", "B"), and the "L" prefix on lesson numbers.

- [ ] **Step 1: Create scripts/parse-pdf.js**

```js
// scripts/parse-pdf.js
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const PDF_PATH = path.join(__dirname, '..', 'Einfach_gut_B1_Wortschatzliste_alphabetisch.pdf');
const OUT_PATH = path.join(__dirname, '..', 'data', 'words.csv');

async function main() {
  const dataBuffer = fs.readFileSync(PDF_PATH);
  const data = await pdfParse(dataBuffer);

  // Each line is either: "Word        L3" or just a letter header "A" or page number
  // Lesson codes appear as L1–L11
  const lines = data.text.split('\n').map(l => l.trim()).filter(Boolean);

  const lessonPattern = /^(.+?)\s+(L\d{1,2})$/;
  const words = [];

  for (const line of lines) {
    const match = line.match(lessonPattern);
    if (!match) continue;

    const word = match[1].trim();
    const lessonStr = match[2]; // e.g. "L11"
    const lesson = parseInt(lessonStr.slice(1), 10);

    // Skip if word looks like a page number or artifact
    if (/^\d+$/.test(word)) continue;

    words.push({ word, lesson });
  }

  // Sort alphabetically (case-insensitive, handle umlauts by basic sort)
  words.sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase(), 'de'));

  // Assign sequential numbers
  const rows = words.map((w, i) => ({ number: i + 1, word: w.word, lesson: w.lesson }));

  // Write CSV
  const header = 'number,word,lesson';
  const csv = [header, ...rows.map(r => `${r.number},"${r.word.replace(/"/g, '""')}",${r.lesson}`)].join('\n');
  fs.writeFileSync(OUT_PATH, csv, 'utf8');

  console.log(`Wrote ${rows.length} words to ${OUT_PATH}`);
  console.log('First 5:', rows.slice(0, 5));
  console.log('Last 5:', rows.slice(-5));
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the parser**

```bash
node scripts/parse-pdf.js
```

Expected output:
```
Wrote ~823 words to data/words.csv
First 5: [{ number: 1, word: 'abdecken', lesson: 11 }, ...]
```

Open `data/words.csv` and spot-check: verify ~820–830 rows, all have number/word/lesson, no blank words, lesson is 1–11.

- [ ] **Step 3: If word count is far off, debug the regex**

The PDF may have encoding quirks. If words are missing, inspect `data.text` by adding:
```js
fs.writeFileSync('data/raw-text.txt', data.text);
```
Then inspect the raw text to adjust the `lessonPattern` regex.

- [ ] **Step 4: Commit**

```bash
git add scripts/parse-pdf.js
git commit -m "feat: add PDF parser script"
```

---

## Task 3: Test Helper + DB Setup

**Files:**
- Create: `tests/helpers/seed-db.js`

This helper creates a temporary in-memory SQLite DB with the correct schema and a few sample words. All API tests use this instead of the real `data/db.sqlite`.

- [ ] **Step 1: Create tests/helpers/seed-db.js**

```js
// tests/helpers/seed-db.js
const Database = require('better-sqlite3');

function createTestDb() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE words (
      id          INTEGER PRIMARY KEY,
      number      INTEGER NOT NULL UNIQUE,
      word        TEXT NOT NULL,
      lesson      INTEGER NOT NULL,
      type        TEXT,
      gender      TEXT,
      plural      TEXT,
      meanings_en TEXT,
      sentences   TEXT,
      phrases     TEXT
    );

    CREATE TABLE progress (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      last_word_number INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1);
  `);

  const insert = db.prepare(`
    INSERT INTO words (number, word, lesson, type, gender, plural, meanings_en, sentences, phrases)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleSentences = JSON.stringify([
    { en: 'Please throw your trash in the bin.', de: 'Bitte wirf deinen Müll in den Behälter.' },
    { en: 'Waste must be separated carefully.', de: 'Müll muss sorgfältig getrennt werden.' },
    { en: 'Radioactive waste is dangerous.', de: 'Radioaktiver Abfall ist gefährlich.' },
    { en: 'Air pressure drops indicate weather change.', de: 'Druckabfälle deuten auf Wetterwechsel hin.' },
    { en: 'Reduce plastic waste worldwide.', de: 'Reduziere Plastikabfall weltweit.' }
  ]);

  const samplePhrases = JSON.stringify([
    { de: 'Abfall trennen', en: 'to sort or separate waste' },
    { de: 'biologischer Abfall', en: 'organic waste (bio-waste)' }
  ]);

  insert.run(1, 'Abfall', 1, 'noun', 'der', 'die Abfälle', 'waste, trash, garbage', sampleSentences, samplePhrases);
  insert.run(2, 'Abflug', 1, 'noun', 'der', 'die Abflüge', 'departure, takeoff', sampleSentences, samplePhrases);
  insert.run(3, 'Absage', 1, 'noun', 'die', 'die Absagen', 'cancellation, rejection', sampleSentences, samplePhrases);
  insert.run(4, 'Alkohol', 1, 'noun', 'der', null, 'alcohol', sampleSentences, samplePhrases);
  insert.run(5, 'arbeiten', 2, 'verb', null, null, 'to work', sampleSentences, samplePhrases);

  return db;
}

module.exports = { createTestDb };
```

- [ ] **Step 2: Verify the helper works**

```bash
node -e "const {createTestDb}=require('./tests/helpers/seed-db'); const db=createTestDb(); console.log(db.prepare('SELECT count(*) as c FROM words').get());"
```

Expected: `{ c: 5 }`

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/seed-db.js
git commit -m "test: add test DB seed helper"
```

---

## Task 4: API Endpoints + Server (TDD)

**Files:**
- Create: `tests/api.test.js`
- Create: `server.js`

Write all tests first, then implement the server to make them pass.

- [ ] **Step 1: Write tests/api.test.js**

```js
// tests/api.test.js
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createTestDb } = require('./helpers/seed-db');

// We need to inject a test DB into the server.
// server.js exports { app, db } so tests can inject their own DB.
// We temporarily swap the module's db reference.

let app;
let testDb;

before(() => {
  testDb = createTestDb();
  // Set env so server.js skips the startup guard when required
  process.env.TEST_DB = 'true';
  // Inject test DB before requiring server
  process.env.DB_PATH = ':memory:'; // server.js reads this; we'll use dependency injection instead
  // Actually: server.js exports a factory: createApp(db) => app
  const { createApp } = require('../server');
  app = createApp(testDb);
});

after(() => {
  testDb.close();
});

describe('GET /api/words', () => {
  test('returns array of all words with correct shape', async () => {
    const res = await request(app).get('/api/words');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 5);
    const first = res.body[0];
    assert.ok('number' in first);
    assert.ok('word' in first);
    assert.ok('lesson' in first);
    assert.ok('type' in first);
    assert.ok('meanings_en' in first);
  });

  test('words are ordered by number ascending', async () => {
    const res = await request(app).get('/api/words');
    const numbers = res.body.map(w => w.number);
    assert.deepEqual(numbers, [1, 2, 3, 4, 5]);
  });
});

describe('GET /api/word/:number', () => {
  test('returns full word detail for existing word', async () => {
    const res = await request(app).get('/api/word/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.word, 'Abfall');
    assert.ok(Array.isArray(res.body.sentences));
    assert.equal(res.body.sentences.length, 5);
    assert.ok('en' in res.body.sentences[0]);
    assert.ok('de' in res.body.sentences[0]);
    assert.ok(Array.isArray(res.body.phrases));
    assert.ok('gender' in res.body);
    assert.ok('plural' in res.body);
    assert.ok('meanings_en' in res.body);
  });

  test('returns 404 for non-existent word number', async () => {
    const res = await request(app).get('/api/word/9999');
    assert.equal(res.status, 404);
    assert.ok('error' in res.body);
  });
});

describe('GET /api/search', () => {
  test('returns matching words for query', async () => {
    const res = await request(app).get('/api/search?q=ab');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    // Abfall, Abflug, Absage all start with "Ab"
    assert.ok(res.body.length >= 3);
    res.body.forEach(w => assert.ok(w.word.toLowerCase().includes('ab')));
  });

  test('is case-insensitive', async () => {
    const res = await request(app).get('/api/search?q=ABFALL');
    assert.equal(res.status, 200);
    assert.ok(res.body.some(w => w.word === 'Abfall'));
  });

  test('returns all words when q is empty', async () => {
    const res = await request(app).get('/api/search?q=');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 5);
  });

  test('returns same shape as /api/words', async () => {
    const res = await request(app).get('/api/search?q=abfall');
    assert.equal(res.status, 200);
    const word = res.body[0];
    assert.ok('number' in word && 'word' in word && 'lesson' in word && 'type' in word && 'meanings_en' in word);
    // Should NOT include sentences/phrases
    assert.ok(!('sentences' in word));
  });
});

describe('GET /api/progress', () => {
  test('returns last_word_number', async () => {
    const res = await request(app).get('/api/progress');
    assert.equal(res.status, 200);
    assert.ok('last_word_number' in res.body);
    assert.equal(typeof res.body.last_word_number, 'number');
  });
});

describe('POST /api/progress', () => {
  test('saves a valid word number', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({ last_word_number: 3 })
      .set('Content-Type', 'application/json');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    // Verify it persisted
    const getRes = await request(app).get('/api/progress');
    assert.equal(getRes.body.last_word_number, 3);
  });

  test('returns 400 for word number not in DB', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({ last_word_number: 9999 })
      .set('Content-Type', 'application/json');
    assert.equal(res.status, 400);
    assert.ok('error' in res.body);
  });

  test('returns 400 for missing body field', async () => {
    const res = await request(app)
      .post('/api/progress')
      .send({})
      .set('Content-Type', 'application/json');
    assert.equal(res.status, 400);
    assert.ok('error' in res.body);
  });
});

describe('Static serving', () => {
  test('GET / returns HTML', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('html'));
  });
});
```

- [ ] **Step 2: Run tests — verify they all FAIL**

```bash
npm test
```

Expected: errors like `Cannot find module '../server'`. All tests fail.

- [ ] **Step 3: Create server.js**

```js
// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'db.sqlite');

// Startup guard (skipped in test mode via createApp injection)
function checkDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('ERROR: data/db.sqlite missing. Run: node scripts/generate-data.js');
    process.exit(1);
  }
  const db = new Database(DB_PATH);
  const count = db.prepare('SELECT count(*) as c FROM words').get();
  if (!count || count.c === 0) {
    console.error('ERROR: data/db.sqlite is empty. Run: node scripts/generate-data.js');
    db.close();
    process.exit(1);
  }
  return db;
}

function seedProgress(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY, number INTEGER NOT NULL UNIQUE, word TEXT NOT NULL,
      lesson INTEGER NOT NULL, type TEXT, gender TEXT, plural TEXT,
      meanings_en TEXT, sentences TEXT, phrases TEXT
    );
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_word_number INTEGER NOT NULL DEFAULT 1
    );
  `);
  db.prepare('INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1)').run();
}

function createApp(db) {
  seedProgress(db);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // GET /api/words
  app.get('/api/words', (req, res) => {
    const words = db.prepare(
      'SELECT number, word, lesson, type, meanings_en FROM words ORDER BY number ASC'
    ).all();
    res.json(words);
  });

  // GET /api/word/:number
  app.get('/api/word/:number', (req, res) => {
    const num = parseInt(req.params.number, 10);
    if (isNaN(num)) return res.status(404).json({ error: 'Not found' });
    const row = db.prepare(
      'SELECT number, word, lesson, type, gender, plural, meanings_en, sentences, phrases FROM words WHERE number = ?'
    ).get(num);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...row,
      sentences: JSON.parse(row.sentences || '[]'),
      phrases: JSON.parse(row.phrases || '[]'),
    });
  });

  // GET /api/search?q=
  app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').trim();
    const words = q
      ? db.prepare(
          "SELECT number, word, lesson, type, meanings_en FROM words WHERE LOWER(word) LIKE '%' || LOWER(?) || '%' ORDER BY number ASC"
        ).all(q)
      : db.prepare(
          'SELECT number, word, lesson, type, meanings_en FROM words ORDER BY number ASC'
        ).all();
    res.json(words);
  });

  // GET /api/progress
  app.get('/api/progress', (req, res) => {
    const row = db.prepare('SELECT last_word_number FROM progress WHERE id = 1').get();
    res.json({ last_word_number: row ? row.last_word_number : 1 });
  });

  // POST /api/progress
  app.post('/api/progress', (req, res) => {
    const { last_word_number } = req.body || {};
    if (last_word_number === undefined || !Number.isInteger(last_word_number)) {
      return res.status(400).json({ error: 'Invalid word number' });
    }
    const exists = db.prepare('SELECT 1 FROM words WHERE number = ?').get(last_word_number);
    if (!exists) return res.status(400).json({ error: 'Invalid word number' });
    db.prepare('INSERT OR REPLACE INTO progress (id, last_word_number) VALUES (1, ?)').run(last_word_number);
    res.json({ ok: true });
  });

  // Fallback: serve index.html for non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

// Only start listening when run directly (not when required by tests)
if (require.main === module) {
  const db = checkDb();
  const app = createApp(db);
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = { createApp };
```

- [ ] **Step 4: Create a minimal public/index.html so static test passes**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>B1 Wortschatz</title></head>
<body><h1>Loading...</h1></body>
</html>
```

- [ ] **Step 5: Run tests — all should pass**

```bash
npm test
```

Expected: all tests pass. If any fail, read the error and fix `server.js`.

- [ ] **Step 6: Commit**

```bash
git add server.js public/index.html tests/api.test.js
git commit -m "feat: Express server with all API endpoints (TDD)"
```

---

## Task 5: Data Generation Script

**Files:**
- Create: `scripts/generate-data.js`

This script reads `data/words.csv`, calls Claude API for each word, and writes enriched rows to `data/db.sqlite`. It is resumable: skips words where a row with non-NULL `meanings_en` already exists.

- [ ] **Step 1: Create scripts/generate-data.js**

```js
// scripts/generate-data.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');

const CSV_PATH = path.join(__dirname, '..', 'data', 'words.csv');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function initDb(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY,
      number INTEGER NOT NULL UNIQUE,
      word TEXT NOT NULL,
      lesson INTEGER NOT NULL,
      type TEXT,
      gender TEXT,
      plural TEXT,
      meanings_en TEXT,
      sentences TEXT,
      phrases TEXT
    );
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_word_number INTEGER NOT NULL DEFAULT 1
    );
  `);
  db.prepare('INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1)').run();
}

function parseCsv(csvPath) {
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1); // skip header
  return lines
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      // Format: number,"word",lesson
      const match = line.match(/^(\d+),"(.*)",(\d+)$/);
      if (!match) return null;
      return { number: parseInt(match[1]), word: match[2].replace(/""/g, '"'), lesson: parseInt(match[3]) };
    })
    .filter(Boolean);
}

async function generateWordData(word) {
  const prompt = `You are a German language expert. For the German word "${word}", provide:
1. meanings_en: A concise English meaning string (e.g. "waste, trash, garbage; also a decrease in value")
2. type: one of: noun, verb, adjective, adverb, conjunction, preposition, other
3. gender: der/die/das (only if noun, otherwise null)
4. plural: the plural form with article (e.g. "die Abfälle") (only if noun, otherwise null)
5. sentences: exactly 5 example sentences, each with "en" and "de" keys
6. phrases: 2-4 common phrases/collocations, each with "de" (German expression) and "en" (English meaning) keys

Respond with ONLY valid JSON in this exact format:
{
  "meanings_en": "...",
  "type": "...",
  "gender": "..." or null,
  "plural": "..." or null,
  "sentences": [{"en": "...", "de": "..."}, ...],
  "phrases": [{"de": "...", "en": "..."}, ...]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  // Strip markdown code fences if present
  const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(jsonStr);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set. Create a .env file.');
    process.exit(1);
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error('ERROR: data/words.csv not found. Run: node scripts/parse-pdf.js');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  initDb(db);

  const words = parseCsv(CSV_PATH);
  console.log(`Total words: ${words.length}`);

  const insertWord = db.prepare(`
    INSERT OR REPLACE INTO words (number, word, lesson, type, gender, plural, meanings_en, sentences, phrases)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const checkDone = db.prepare('SELECT 1 FROM words WHERE number = ? AND meanings_en IS NOT NULL');

  let processed = 0;
  let skipped = 0;

  for (const { number, word, lesson } of words) {
    if (checkDone.get(number)) {
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`[${number}/${words.length}] ${word}... `);
      const data = await generateWordData(word);
      insertWord.run(
        number, word, lesson,
        data.type || null,
        data.gender || null,
        data.plural || null,
        data.meanings_en || null,
        JSON.stringify(data.sentences || []),
        JSON.stringify(data.phrases || [])
      );
      console.log('✓');
      processed++;

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`\nERROR on "${word}":`, err.message);
      // Continue to next word — script is resumable
    }
  }

  db.close();
  console.log(`\nDone. Processed: ${processed}, Skipped (already done): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Create .env file locally**

```bash
echo "ANTHROPIC_API_KEY=your_actual_key_here" > .env
```

Replace `your_actual_key_here` with your real key.

- [ ] **Step 3: Run a small test batch (first 5 words)**

Temporarily edit the `for` loop to break after 5 iterations:
```js
let count = 0;
for (const { number, word, lesson } of words) {
  if (count++ >= 5) break;
  // ... rest of loop
```

Run:
```bash
node scripts/generate-data.js
```

Expected: 5 words processed with ✓ marks, `data/db.sqlite` created.

Verify:
```bash
node -e "const db=require('better-sqlite3')('data/db.sqlite'); console.log(db.prepare('SELECT number,word,meanings_en FROM words LIMIT 5').all());"
```

Expected: 5 rows with non-null meanings_en, sentences (JSON string), phrases (JSON string).

- [ ] **Step 4: Remove the test break, run full generation**

Remove the `count` break, then:
```bash
node scripts/generate-data.js
```

This will take ~15–25 minutes for 823 words. The script is resumable — if interrupted, just run again and it will skip completed words.

- [ ] **Step 5: Verify final count**

```bash
node -e "const db=require('better-sqlite3')('data/db.sqlite'); console.log(db.prepare('SELECT count(*) as c FROM words WHERE meanings_en IS NOT NULL').get());"
```

Expected: `{ c: 823 }` (or close to it if any words failed — re-run the script to fill gaps).

- [ ] **Step 6: Commit the script (NOT the db.sqlite)**

```bash
git add scripts/generate-data.js .env.example
git commit -m "feat: add data generation script (Claude API batch)"
```

---

## Task 6: Frontend — Structure, Theme & Sidebar

**Files:**
- Modify: `public/index.html` (full rewrite from placeholder)

Build the complete HTML structure, CSS theme, and sidebar. The word detail area will be empty for now (filled in Task 7).

- [ ] **Step 1: Replace public/index.html with full structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>B1 Wortschatz</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700&display=swap" rel="stylesheet">
<style>
/* ── Reset & Base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: #faf8f4; color: #2c1810; min-height: 100vh; display: flex; flex-direction: column; }

/* ── Topbar ── */
.topbar {
  background: rgba(255,255,255,0.85); backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(232,224,213,0.8);
  padding: 10px 24px; display: flex; align-items: center; gap: 14px;
  position: sticky; top: 0; z-index: 10; height: 52px;
}
.logo { font-family: 'Lora', serif; font-size: 15px; font-weight: 700; color: #1a2744; white-space: nowrap; }
.logo span { color: #2e7d52; }
.search-wrap { position: relative; flex: 1; max-width: 280px; }
.search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #a89880; pointer-events: none; }
.search-input {
  width: 100%; padding: 7px 12px 7px 32px;
  border: 1.5px solid #e8e0d5; border-radius: 10px;
  font-size: 13px; font-family: inherit; background: #faf8f4; color: #2c1810;
  outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.search-input:focus { border-color: #2e7d52; box-shadow: 0 0 0 3px rgba(46,125,82,0.1); }
.jump-wrap { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #7a6555; }
.jump-input {
  width: 56px; border: 1.5px solid #e8e0d5; border-radius: 8px;
  padding: 6px 8px; font-size: 12px; font-family: inherit;
  background: #faf8f4; color: #2c1810; outline: none;
}
.jump-btn, .sort-btn {
  background: #2e7d52; color: #fff; border: none; border-radius: 8px;
  padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer;
  font-family: inherit; transition: background 0.15s; white-space: nowrap;
}
.jump-btn:hover, .sort-btn:hover { background: #246642; }
.sort-btn { background: #fff; color: #4a3728; border: 1.5px solid #e8e0d5; }
.sort-btn:hover { border-color: #2e7d52; color: #2e7d52; background: #f0f7f3; }
.sort-btn.active { background: #2e7d52; color: #fff; border-color: #2e7d52; }
.jump-error { font-size: 11px; color: #c0392b; white-space: nowrap; }
.word-counter { font-size: 12px; color: #a89880; margin-left: auto; white-space: nowrap; }

/* ── Layout ── */
.layout { display: flex; flex: 1; height: calc(100vh - 52px - 56px); overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 158px; flex-shrink: 0; background: #fff;
  border-right: 1px solid #e8e0d5; overflow-y: auto;
  padding: 14px 8px; scrollbar-width: thin; scrollbar-color: #e8e0d5 transparent;
}
.nav-section { font-size: 9px; font-weight: 700; letter-spacing: 0.12em; color: #b0a090; text-transform: uppercase; padding: 0 6px; margin-bottom: 6px; }
.nav-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 8px; border-radius: 8px; cursor: pointer;
  font-size: 12px; font-weight: 500; color: #7a6555;
  transition: all 0.15s; margin-bottom: 1px;
}
.nav-item:hover { background: #f0f7f3; color: #2e7d52; }
.nav-item.active { background: #2e7d52; color: #fff; }
.nav-badge {
  font-size: 10px; font-weight: 600; background: rgba(0,0,0,0.07);
  border-radius: 20px; padding: 0 5px; opacity: 0.65;
}
.nav-item.active .nav-badge { background: rgba(255,255,255,0.25); opacity: 1; }
.nav-divider { border: none; border-top: 1px solid #f0ebe3; margin: 10px 2px; }
.alpha-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
.alpha-btn {
  padding: 5px 2px; text-align: center; border-radius: 6px;
  font-size: 11px; font-weight: 600; cursor: pointer; color: #9a8070;
  transition: all 0.15s;
}
.alpha-btn:hover { background: #f0f7f3; color: #2e7d52; }
.alpha-btn.active { background: #2e7d52; color: #fff; }

/* ── Word Detail ── */
.word-detail {
  flex: 1; overflow-y: auto; padding: 32px 44px 40px;
  scrollbar-width: thin; scrollbar-color: #e8e0d5 transparent; max-width: 720px;
}
.word-title { font-family: 'Lora', serif; font-size: 42px; font-weight: 700; color: #1a2744; line-height: 1.1; margin-bottom: 6px; }
.word-meaning { font-size: 15px; color: #5a4535; line-height: 1.6; max-width: 520px; margin-bottom: 14px; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
.tag { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.02em; }
.tag-type { background: #f0f7f3; color: #2e7d52; border: 1px solid #c6e0d0; }
.tag-lesson { background: #fdf4e8; color: #b87333; border: 1px solid #f0d9b0; }
.meta-grid {
  display: grid; grid-template-columns: auto 1fr; gap: 6px 18px;
  background: #fff; border-radius: 12px; padding: 14px 18px;
  border: 1px solid #ede7de; max-width: 340px; margin-bottom: 28px;
  box-shadow: 0 1px 3px rgba(44,24,16,0.04); font-size: 13px;
}
.meta-key { font-weight: 600; color: #2e7d52; }
.meta-val { color: #4a3728; }
.meta-val strong { color: #1a2744; font-weight: 700; }
.section-header { display: flex; align-items: center; gap: 10px; margin: 24px 0 12px; }
.section-header h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #2e7d52; text-transform: uppercase; white-space: nowrap; }
.section-line { flex: 1; height: 1px; background: #ede7de; }
.section-hint { font-size: 11px; color: #a89880; white-space: nowrap; }
.sentence-card {
  background: #fff; border: 1.5px solid #ede7de; border-radius: 12px;
  padding: 13px 16px; margin-bottom: 8px; cursor: pointer;
  display: flex; justify-content: space-between; align-items: flex-start;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
  box-shadow: 0 1px 3px rgba(44,24,16,0.04);
}
.sentence-card:hover { border-color: #2e7d52; box-shadow: 0 4px 12px rgba(46,125,82,0.1); transform: translateY(-1px); }
.sentence-text { font-size: 14px; color: #4a3728; font-style: italic; line-height: 1.55; flex: 1; }
.sentence-text.de { color: #1a5c35; font-style: normal; font-weight: 500; }
.toggle-pill { flex-shrink: 0; margin-left: 12px; background: #fdf4e8; color: #b87333; border-radius: 20px; font-size: 10px; font-weight: 700; padding: 2px 8px; transition: background 0.15s; }
.sentence-card:hover .toggle-pill { background: #f0e8d0; }
.phrases-list { display: flex; flex-direction: column; gap: 8px; }
.phrase-item {
  background: #fff; border-radius: 10px; padding: 10px 16px;
  font-size: 13px; border: 1px solid #ede7de; color: #4a3728; line-height: 1.5;
  box-shadow: 0 1px 2px rgba(44,24,16,0.03);
}
.phrase-item strong { color: #1a2744; font-weight: 700; }
.phrase-eq { color: #a89880; margin: 0 5px; }
.word-placeholder { color: #b0a090; font-size: 15px; margin-top: 60px; text-align: center; }

/* ── Bottom Nav ── */
.bottom-nav {
  background: rgba(255,255,255,0.9); backdrop-filter: blur(12px);
  border-top: 1px solid rgba(232,224,213,0.8);
  padding: 0 44px; display: flex; align-items: center;
  justify-content: space-between; height: 56px; flex-shrink: 0;
}
.nav-btn {
  display: flex; align-items: center; gap: 7px;
  border: 1.5px solid #e8e0d5; border-radius: 10px; padding: 7px 18px;
  cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 500;
  color: #4a3728; background: #fff; transition: all 0.15s;
}
.nav-btn:hover:not(:disabled) { border-color: #2e7d52; color: #2e7d52; background: #f0f7f3; }
.nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.nav-btn.primary { background: #2e7d52; color: #fff; border-color: #2e7d52; box-shadow: 0 2px 8px rgba(46,125,82,0.2); }
.nav-btn.primary:hover:not(:disabled) { background: #246642; box-shadow: 0 4px 12px rgba(46,125,82,0.3); }
.nav-center { text-align: center; }
.nav-word-label { font-size: 12px; font-weight: 600; color: #1a2744; margin-bottom: 3px; }
.progress-bar-wrap { width: 100px; height: 3px; background: #e8e0d5; border-radius: 10px; margin: 0 auto; }
.progress-bar-fill { height: 100%; background: #2e7d52; border-radius: 10px; transition: width 0.3s; }
</style>
</head>
<body>

<!-- Topbar -->
<div class="topbar">
  <div class="logo">B1 <span>Wortschatz</span></div>
  <div class="search-wrap">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input id="searchInput" class="search-input" type="text" placeholder="Search words...">
  </div>
  <div class="jump-wrap">
    <span>Go to</span>
    <input id="jumpInput" class="jump-input" type="number" placeholder="1" min="1">
    <button class="jump-btn" onclick="jumpToNumber()">Go</button>
    <span id="jumpError" class="jump-error" style="display:none">Not found</span>
  </div>
  <button id="sortBtn" class="sort-btn" onclick="toggleSort()">Sort: A–Z</button>
  <div id="wordCounter" class="word-counter"># of —</div>
</div>

<!-- Layout -->
<div class="layout">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="nav-section">By Lesson</div>
    <div id="lessonNav"></div>
    <div class="nav-divider"></div>
    <div class="nav-section">By Letter</div>
    <div id="alphaNav" class="alpha-grid"></div>
  </div>

  <!-- Word Detail -->
  <div class="word-detail" id="wordDetail">
    <div class="word-placeholder">Loading...</div>
  </div>
</div>

<!-- Bottom Nav -->
<div class="bottom-nav">
  <button id="prevBtn" class="nav-btn" onclick="navigate(-1)">← Previous</button>
  <div class="nav-center">
    <div id="navLabel" class="nav-word-label">—</div>
    <div class="progress-bar-wrap"><div id="progressBar" class="progress-bar-fill" style="width:0%"></div></div>
  </div>
  <button id="nextBtn" class="nav-btn primary" onclick="navigate(1)">Next →</button>
</div>

<script>
// ── State ──
let allWords = [];          // [{number, word, lesson, type, meanings_en}]
let displayList = [];       // current filtered + sorted list
let currentIndex = 0;       // index in displayList
let sortMode = 'alpha';     // 'alpha' | 'lesson'
let preSearchIndex = null;  // index in displayList before search started
let preSearchSort = null;   // sort mode before search started
let saveTimer = null;

// ── Initialise ──
async function init() {
  allWords = await fetch('/api/words').then(r => r.json());
  buildSidebar();
  const progress = await fetch('/api/progress').then(r => r.json());
  applySort('alpha', false);
  const idx = displayList.findIndex(w => w.number === progress.last_word_number);
  currentIndex = idx >= 0 ? idx : 0;
  await loadWord();
}

// ── Sidebar ──
function buildSidebar() {
  // Lesson nav
  const lessons = {};
  allWords.forEach(w => { lessons[w.lesson] = (lessons[w.lesson] || 0) + 1; });
  const lessonNav = document.getElementById('lessonNav');
  lessonNav.innerHTML = Object.keys(lessons).sort((a,b)=>+a-+b).map(l =>
    `<div class="nav-item" data-lesson="${l}" onclick="jumpToLesson(${l})">
       L${l} <span class="nav-badge">${lessons[l]}</span>
     </div>`
  ).join('');

  // Alpha nav
  const letters = [...new Set(allWords.map(w => w.word[0].toUpperCase()))].sort((a,b)=>a.localeCompare(b,'de'));
  const alphaNav = document.getElementById('alphaNav');
  alphaNav.innerHTML = letters.map(l =>
    `<div class="alpha-btn" data-letter="${l}" onclick="jumpToLetter('${l}')">${l}</div>`
  ).join('');
}

// ── Sort ──
function applySort(mode, keepWord = true) {
  const currentNumber = displayList[currentIndex]?.number;
  sortMode = mode;
  const q = document.getElementById('searchInput').value.trim();
  const source = q ? allWords.filter(w => w.word.toLowerCase().includes(q.toLowerCase())) : [...allWords];
  displayList = mode === 'lesson'
    ? source.slice().sort((a,b) => a.lesson - b.lesson || a.number - b.number)
    : source.slice().sort((a,b) => a.number - b.number); // already alpha by number from server
  if (keepWord && currentNumber) {
    const idx = displayList.findIndex(w => w.number === currentNumber);
    currentIndex = idx >= 0 ? idx : 0;
  }
  document.getElementById('sortBtn').textContent = mode === 'lesson' ? 'Sort: L1→L11' : 'Sort: A–Z';
  document.getElementById('sortBtn').classList.toggle('active', mode === 'lesson');
  updateSidebarActive();
}

function toggleSort() {
  document.getElementById('searchInput').value = '';
  preSearchIndex = null;
  preSearchSort = null;
  applySort(sortMode === 'alpha' ? 'lesson' : 'alpha', false);
  currentIndex = 0;
  loadWord();
}

// ── Navigation ──
function jumpToLesson(lesson) {
  document.getElementById('searchInput').value = '';
  preSearchIndex = null;
  applySort('lesson', false);
  currentIndex = displayList.findIndex(w => w.lesson === lesson);
  if (currentIndex < 0) currentIndex = 0;
  loadWord();
}

function jumpToLetter(letter) {
  document.getElementById('searchInput').value = '';
  preSearchIndex = null;
  applySort('alpha', false);
  currentIndex = displayList.findIndex(w => w.word.toUpperCase().startsWith(letter));
  if (currentIndex < 0) currentIndex = 0;
  loadWord();
}

function jumpToNumber() {
  const val = parseInt(document.getElementById('jumpInput').value, 10);
  const errEl = document.getElementById('jumpError');
  document.getElementById('searchInput').value = '';
  preSearchIndex = null;
  applySort(sortMode, false);
  const idx = displayList.findIndex(w => w.number === val);
  if (isNaN(val) || idx < 0) {
    errEl.style.display = '';
    setTimeout(() => errEl.style.display = 'none', 2000);
    return;
  }
  errEl.style.display = 'none';
  currentIndex = idx;
  loadWord();
}

function navigate(dir) {
  const newIdx = currentIndex + dir;
  if (newIdx < 0 || newIdx >= displayList.length) return;
  currentIndex = newIdx;
  loadWord();
}

// ── Search ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('searchInput').addEventListener('input', function() {
    const q = this.value.trim();
    if (q && preSearchIndex === null) {
      preSearchIndex = currentIndex;
      preSearchSort = sortMode;
    }
    if (!q && preSearchIndex !== null) {
      // Restore pre-search state
      const prevNumber = displayList[preSearchIndex]?.number;
      applySort(preSearchSort, false);
      const idx = displayList.findIndex(w => w.number === prevNumber);
      currentIndex = idx >= 0 ? idx : 0;
      preSearchIndex = null;
      preSearchSort = null;
      loadWord();
      return;
    }
    const filtered = q
      ? allWords.filter(w => w.word.toLowerCase().includes(q.toLowerCase()))
      : [...allWords];
    displayList = sortMode === 'lesson'
      ? filtered.sort((a,b) => a.lesson - b.lesson || a.number - b.number)
      : filtered.sort((a,b) => a.number - b.number);
    currentIndex = 0;
    if (displayList.length > 0) loadWord();
    updateNavButtons();
  });

  document.getElementById('jumpInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') jumpToNumber();
  });
});

// ── Load Word ──
async function loadWord() {
  if (displayList.length === 0) {
    document.getElementById('wordDetail').innerHTML = '<div class="word-placeholder">No words found.</div>';
    return;
  }
  const w = displayList[currentIndex];
  const data = await fetch(`/api/word/${w.number}`).then(r => r.json());
  renderWord(data);
  updateNavButtons();
  updateCounter();
  updateSidebarActive();
  saveProgress(w.number);
}

// ── Render Word ──
function renderWord(data) {
  const metaRows = [];
  if (data.gender) metaRows.push(`<span class="meta-key">Gender</span><span class="meta-val"><strong>${data.gender}</strong> ${data.word}</span>`);
  if (data.plural) metaRows.push(`<span class="meta-key">Plural</span><span class="meta-val">${data.plural}</span>`);

  const sentences = (data.sentences || []).map((s, i) => `
    <div class="sentence-card" data-en="${escHtml(s.en)}" data-de="${escHtml(s.de)}" data-lang="en" onclick="toggleSentence(this)">
      <span class="sentence-text">${escHtml(s.en)}</span>
      <span class="toggle-pill">EN ↔ DE</span>
    </div>`).join('');

  const phrases = (data.phrases || []).map(p =>
    `<div class="phrase-item"><strong>${escHtml(p.de)}</strong><span class="phrase-eq">=</span>${escHtml(p.en)}</div>`
  ).join('');

  document.getElementById('wordDetail').innerHTML = `
    <div class="word-title">${escHtml(data.word)}</div>
    <div class="word-meaning">${escHtml(data.meanings_en || '')}</div>
    <div class="tags">
      ${data.type ? `<span class="tag tag-type">${escHtml(data.type)}${data.gender ? ' · ' + escHtml(data.gender.replace(/^(der|die|das)\s*/i,'').toLowerCase() === 'der' ? 'masculine' : data.gender.replace(/^(der|die|das)\s*/i,'').toLowerCase() === 'die' ? 'feminine' : 'neuter') : ''}</span>` : ''}
      <span class="tag tag-lesson">Lesson ${data.lesson}</span>
    </div>
    ${metaRows.length ? `<div class="meta-grid">${metaRows.join('')}</div>` : ''}
    <div class="section-header">
      <h3>Examples</h3><div class="section-line"></div>
      <span class="section-hint">click to toggle EN ↔ DE</span>
    </div>
    ${sentences}
    ${phrases ? `
    <div class="section-header" style="margin-top:28px">
      <h3>Common Phrases</h3><div class="section-line"></div>
    </div>
    <div class="phrases-list">${phrases}</div>` : ''}
  `;
  document.getElementById('wordDetail').scrollTop = 0;
}

function toggleSentence(card) {
  const isEn = card.dataset.lang === 'en';
  const textEl = card.querySelector('.sentence-text');
  textEl.textContent = isEn ? card.dataset.de : card.dataset.en;
  textEl.classList.toggle('de', isEn);
  card.dataset.lang = isEn ? 'de' : 'en';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── UI Updates ──
function updateNavButtons() {
  document.getElementById('prevBtn').disabled = currentIndex <= 0;
  const nextBtn = document.getElementById('nextBtn');
  nextBtn.disabled = currentIndex >= displayList.length - 1;
  // Disable prev/next if search returns 1 result
  if (displayList.length <= 1) {
    document.getElementById('prevBtn').disabled = true;
    nextBtn.disabled = true;
  }
}

function updateCounter() {
  document.getElementById('wordCounter').textContent = `#${displayList[currentIndex]?.number} of ${allWords.length}`;
  document.getElementById('navLabel').textContent = `${displayList[currentIndex]?.word} · #${displayList[currentIndex]?.number}`;
  const pct = allWords.length > 0 ? (displayList[currentIndex]?.number / allWords.length * 100).toFixed(1) : 0;
  document.getElementById('progressBar').style.width = pct + '%';
}

function updateSidebarActive() {
  const w = displayList[currentIndex];
  if (!w) return;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', +el.dataset.lesson === w.lesson));
  document.querySelectorAll('.alpha-btn').forEach(el => el.classList.toggle('active', w.word.toUpperCase().startsWith(el.dataset.letter)));
}

// ── Progress ──
function saveProgress(number) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_word_number: number })
    }).catch(() => {}); // silently ignore network errors
  }, 500);
}

// ── Boot ──
init();
</script>
</body>
</html>
```

- [ ] **Step 2: Seed a local data/db.sqlite for frontend verification**

```bash
node -e "
const db = require('better-sqlite3')('data/db.sqlite');
db.exec(\`CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY, number INTEGER NOT NULL UNIQUE, word TEXT NOT NULL, lesson INTEGER NOT NULL, type TEXT, gender TEXT, plural TEXT, meanings_en TEXT, sentences TEXT, phrases TEXT);
CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK (id=1), last_word_number INTEGER NOT NULL DEFAULT 1);\`);
db.prepare('INSERT OR IGNORE INTO progress VALUES (1,1)').run();
const s=JSON.stringify([{en:'Test sentence.',de:'Testsatz.'},{en:'Second sentence.',de:'Zweiter Satz.'},{en:'Third.',de:'Dritter.'},{en:'Fourth.',de:'Vierter.'},{en:'Fifth.',de:'Fünfter.'}]);
const p=JSON.stringify([{de:'Abfall trennen',en:'separate waste'},{de:'biologischer Abfall',en:'organic waste'}]);
db.prepare('INSERT OR REPLACE INTO words VALUES (1,1,\"Abfall\",1,\"noun\",\"der\",\"die Abfälle\",\"waste, trash, garbage\",?,?)').run(s,p);
db.prepare('INSERT OR REPLACE INTO words VALUES (2,2,\"Abflug\",1,\"noun\",\"der\",\"die Abflüge\",\"departure, takeoff\",?,?)').run(s,p);
db.close(); console.log('seeded 2 words into data/db.sqlite');
"
```

Then start the server:
```bash
node server.js
```

Open http://localhost:3000 and verify:
- Word "Abfall" is displayed with meaning, tags, meta grid
- Clicking a sentence card toggles EN↔DE and back
- Prev is disabled, Next navigates to Abflug
- L1 in sidebar is highlighted
- Search for "ab" filters results
- Progress is saved (check: reload page, should stay on last word)

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: complete frontend (HTML + CSS + vanilla JS)"
```

---

## Task 7: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

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

- [ ] **Step 3: Build and test the Docker image locally**

```bash
docker build -t german-b1-vocab .
docker run --rm -p 3000:3000 -v "$(pwd)/data/db.sqlite:/app/data/db.sqlite" german-b1-vocab
```

Open http://localhost:3000 — should work identically to the non-Docker run.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: Docker setup for Hetzner VPS deployment"
```

---

## Task 8: Deploy to VPS

- [ ] **Step 1: Run full data generation (if not already done)**

```bash
node scripts/generate-data.js
```

Wait for all ~823 words to complete. Re-run if interrupted — it will skip already-done words.

- [ ] **Step 2: Push source code to VPS**

```bash
# Option A: git
git remote add vps user@your-vps-ip:/path/to/repo
git push vps main

# Option B: rsync (excludes node_modules, data, .git automatically)
rsync -av --exclude='.git' --exclude='node_modules' --exclude='data' \
  . user@your-vps-ip:/opt/language-learning/
```

- [ ] **Step 3: Transfer the database to VPS**

```bash
scp data/db.sqlite user@your-vps-ip:/opt/language-learning/data/db.sqlite
```

**This must happen before `docker compose up`** — the startup guard will exit if db.sqlite is missing.

- [ ] **Step 4: Start the container on VPS**

```bash
ssh user@your-vps-ip
cd /opt/language-learning
docker compose up -d --build
```

- [ ] **Step 5: Verify SSL and app are working**

```bash
# Check container is running
docker compose ps

# Check logs
docker compose logs -f app
```

Open https://learngerman.dawooddilawar.com — SSL should auto-provision within 60 seconds via the nginx-proxy + Let's Encrypt companion already running on your VPS.

- [ ] **Step 6: Final end-to-end check**

- Navigate through several words with prev/next
- Search for a word
- Toggle a sentence card EN↔DE
- Reload the page — confirm it returns to the last word viewed
- Click a lesson in the sidebar — confirm it jumps and switches sort

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | Project scaffolding, deps installed |
| 2 | `scripts/parse-pdf.js` → `data/words.csv` |
| 3 | `tests/helpers/seed-db.js` — test DB factory |
| 4 | `server.js` + `tests/api.test.js` — all API endpoints TDD |
| 5 | `scripts/generate-data.js` — 823 words enriched via Claude API |
| 6 | `public/index.html` — complete interactive frontend |
| 7 | `Dockerfile` + `docker-compose.yml` |
| 8 | Deployed to learngerman.dawooddilawar.com with SSL |
