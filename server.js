// server.js
const express = require('express');
const path = require('path');

function createApp(db) {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API Routes

  // GET /api/words - Get all words with pagination
  app.get('/api/words', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 20;
    const offset = (page - 1) * perPage;

    // Get total count
    const countResult = db.prepare('SELECT COUNT(*) as total FROM words').get();
    const total = countResult.total;
    const totalPages = Math.ceil(total / perPage);

    // Get paginated words
    const words = db.prepare(`
      SELECT number, word, lesson, type, gender, plural, meanings_en, sentences, phrases
      FROM words
      ORDER BY number ASC
      LIMIT ? OFFSET ?
    `).all(perPage, offset);

    res.json({
      words,
      page,
      perPage,
      total,
      totalPages
    });
  });

  // GET /api/word/:number - Get a single word by number
  app.get('/api/word/:number', (req, res) => {
    const { number } = req.params;

    const word = db.prepare(`
      SELECT number, word, lesson, type, gender, plural, meanings_en, sentences, phrases
      FROM words
      WHERE number = ?
    `).get(number);

    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }

    res.json(word);
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
      SELECT number, word, lesson, type, gender, plural, meanings_en, sentences, phrases
      FROM words
      WHERE word = ?
    `).all(q);

    if (exactMatch.length > 0) {
      return res.json({ words: exactMatch });
    }

    // Fall back to partial search
    const words = db.prepare(`
      SELECT number, word, lesson, type, gender, plural, meanings_en, sentences, phrases
      FROM words
      WHERE word LIKE ?
         OR meanings_en LIKE ?
         OR sentences LIKE ?
         OR phrases LIKE ?
      ORDER BY number ASC
    `).all(searchTerm, searchTerm, searchTerm, searchTerm);

    res.json({ words });
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

// Create database connection and start server if run directly
if (require.main === module) {
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'data', 'words.db');
  const db = new Database(dbPath);

  const app = createApp(db);
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports = { createApp };
