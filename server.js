// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash-lite';

function createApp(db) {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes

  // GET /api/words - Get all words
  app.get('/api/words', (req, res) => {
    const words = db.prepare(`
      SELECT id, number, word, lesson, type, gender, plural, meanings_en
      FROM words
      ORDER BY number ASC
    `).all();

    // Attach sentences and phrases for each word
    const wordsWithRelations = words.map(word => {
      const sentences = db.prepare(`
        SELECT id, sentence_en as en, sentence_de as de
        FROM sentences
        WHERE word_id = ?
        ORDER BY id ASC
      `).all(word.id);

      const phrases = db.prepare(`
        SELECT phrase_en as en, phrase_de as de
        FROM phrases
        WHERE word_id = ?
        ORDER BY id ASC
      `).all(word.id);

      return {
        ...word,
        sentences: JSON.stringify(sentences),
        phrases: JSON.stringify(phrases)
      };
    });

    res.json(wordsWithRelations);
  });

  // GET /api/word/:number - Get a single word by number
  app.get('/api/word/:number', (req, res) => {
    const { number } = req.params;

    const word = db.prepare(`
      SELECT id, number, word, lesson, type, gender, plural, meanings_en
      FROM words
      WHERE number = ?
    `).get(number);

    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }

    // Get sentences and phrases
    const sentences = db.prepare(`
      SELECT id, sentence_en as en, sentence_de as de
      FROM sentences
      WHERE word_id = ?
      ORDER BY id ASC
    `).all(word.id);

    const phrases = db.prepare(`
      SELECT phrase_en as en, phrase_de as de
      FROM phrases
      WHERE word_id = ?
      ORDER BY id ASC
    `).all(word.id);

    res.json({
      ...word,
      sentences: JSON.stringify(sentences),
      phrases: JSON.stringify(phrases)
    });
  });

  // GET /api/search - Search words
  app.get('/api/search', (req, res) => {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const searchTerm = `%${q}%`;

    // Try exact word match first
    const exactMatch = db.prepare(`
      SELECT id, number, word, lesson, type, gender, plural, meanings_en
      FROM words
      WHERE word = ?
    `).all(q);

    if (exactMatch.length > 0) {
      const wordsWithRelations = exactMatch.map(word => {
        const sentences = db.prepare(`
          SELECT id, sentence_en as en, sentence_de as de
          FROM sentences
          WHERE word_id = ?
          ORDER BY id ASC
        `).all(word.id);

        const phrases = db.prepare(`
          SELECT phrase_en as en, phrase_de as de
          FROM phrases
          WHERE word_id = ?
          ORDER BY id ASC
        `).all(word.id);

        return {
          ...word,
          sentences: JSON.stringify(sentences),
          phrases: JSON.stringify(phrases)
        };
      });

      return res.json({ words: wordsWithRelations });
    }

    // Fall back to partial search
    const words = db.prepare(`
      SELECT id, number, word, lesson, type, gender, plural, meanings_en
      FROM words
      WHERE word LIKE ?
         OR meanings_en LIKE ?
      ORDER BY number ASC
    `).all(searchTerm, searchTerm);

    const wordsWithRelations = words.map(word => {
      const sentences = db.prepare(`
        SELECT id, sentence_en as en, sentence_de as de
        FROM sentences
        WHERE word_id = ?
        ORDER BY id ASC
      `).all(word.id);

      const phrases = db.prepare(`
        SELECT phrase_en as en, phrase_de as de
        FROM phrases
        WHERE word_id = ?
        ORDER BY id ASC
      `).all(word.id);

      return {
        ...word,
        sentences: JSON.stringify(sentences),
        phrases: JSON.stringify(phrases)
      };
    });

    res.json({ words: wordsWithRelations });
  });

  // GET /api/progress - Get current progress
  app.get('/api/progress', (req, res) => {
    const progress = db.prepare('SELECT last_word_number FROM progress WHERE id = 1').get();

    res.json(progress);
  });

  // POST /api/progress - Update progress
  app.post('/api/progress', (req, res) => {
    const { last_word_number } = req.body;

    if (last_word_number === undefined || last_word_number === null) {
      return res.status(400).json({ error: 'last_word_number is required' });
    }

    if (!Number.isInteger(last_word_number) || last_word_number < 1) {
      return res.status(400).json({ error: 'last_word_number must be a positive integer' });
    }

    db.prepare('UPDATE progress SET last_word_number = ? WHERE id = 1').run(last_word_number);

    const progress = db.prepare('SELECT last_word_number FROM progress WHERE id = 1').get();

    res.json(progress);
  });

  // GET /api/sentence/:id/breakdown - Get grammatical breakdown for a sentence
  app.get('/api/sentence/:id/breakdown', async (req, res) => {
    const sentenceId = parseInt(req.params.id, 10);

    if (!Number.isInteger(sentenceId) || sentenceId < 1) {
      return res.status(400).json({ error: 'Invalid sentence id' });
    }

    // Check cache first
    const cached = db.prepare('SELECT breakdown_json FROM sentence_breakdowns WHERE sentence_id = ?').get(sentenceId);
    if (cached) {
      try {
        return res.json({ breakdown: JSON.parse(cached.breakdown_json) });
      } catch (e) {
        // corrupt cache row — fall through to re-fetch
        db.prepare('DELETE FROM sentence_breakdowns WHERE sentence_id = ?').run(sentenceId);
      }
    }

    // Get sentence from DB
    const sentence = db.prepare('SELECT sentence_de FROM sentences WHERE id = ?').get(sentenceId);
    if (!sentence) {
      return res.status(404).json({ error: 'Sentence not found' });
    }

    // Build prompt
    const prompt = `You are a German language expert. Analyze this German sentence grammatically:

"${sentence.sentence_de}"

Return ONLY valid JSON in this exact format:
{
  "structure_overview": "Brief description of the sentence structure (e.g. Subject + Modal verb + Accusative object + Infinitive at end)",
  "grammar_points": [
    { "category": "Grammar concept name", "explanation": "Clear explanation of how it applies in this sentence" }
  ],
  "word_meanings": [
    { "word": "German word", "type": "noun/verb/adjective/etc", "meaning": "English meaning" }
  ]
}

grammar_points: include Dativ/Akkusativ/Nominativ usage, verb tenses, modal verbs, past participle, Konjunktiv, composite words, word order rules, or any other grammatically notable features in this sentence. Only include points that are actually present.

word_meanings: include the main content words (verbs, nouns, adjectives) — skip articles, common pronouns (ich/du/er/wir) and basic prepositions unless they are the focus of a grammar point.`;

    // Call Gemini API
    let breakdown;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024, responseMimeType: 'application/json' }
          })
        }
      );
      if (!response.ok) {
        return res.status(502).json({ error: 'Gemini API error' });
      }
      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      breakdown = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'Failed to get breakdown from Gemini' });
    }

    // Save to cache
    db.prepare('INSERT INTO sentence_breakdowns (sentence_id, breakdown_json) VALUES (?, ?)').run(sentenceId, JSON.stringify(breakdown));

    return res.json({ breakdown });
  });

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

// Initialize database schema
function initializeSchema(db) {
  // Check if words table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='words'
  `).get();

  if (!tableExists) {
    console.log('Initializing database schema...');

    db.exec(`
      CREATE TABLE words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number INTEGER NOT NULL UNIQUE,
        word TEXT NOT NULL,
        lesson TEXT NOT NULL,
        type TEXT,
        gender TEXT,
        plural TEXT,
        meanings_en TEXT,
        sentences TEXT,
        phrases TEXT
      );

      CREATE TABLE sentences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        sentence_en TEXT NOT NULL,
        sentence_de TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES words(id)
      );

      CREATE TABLE phrases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        phrase_en TEXT NOT NULL,
        phrase_de TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES words(id)
      );

      CREATE TABLE progress (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_word_number INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1);

      CREATE TABLE IF NOT EXISTS sentence_breakdowns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sentence_id INTEGER NOT NULL UNIQUE,
        breakdown_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sentence_id) REFERENCES sentences(id)
      );
    `);

    console.log('Database schema initialized.');
  }

  // Migration: ensure sentence_breakdowns exists on pre-existing databases
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentence_breakdowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_id INTEGER NOT NULL UNIQUE,
      breakdown_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sentence_id) REFERENCES sentences(id)
    );
  `);
}

// Create database connection and start server if run directly
if (require.main === module) {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'data', 'db.sqlite');
  const db = new Database(dbPath);

  // Initialize schema if needed
  initializeSchema(db);

  const app = createApp(db);
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = { createApp };
