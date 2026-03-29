// server.js
const express = require('express');
const path = require('path');

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
        SELECT sentence_en as en, sentence_de as de
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
      SELECT sentence_en as en, sentence_de as de
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
          SELECT sentence_en as en, sentence_de as de
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
        SELECT sentence_en as en, sentence_de as de
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
