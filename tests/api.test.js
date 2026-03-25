// tests/api.test.js
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { createTestDb } = require('./helpers/seed-db');
const { createApp } = require('../server');

test.describe('API Endpoints', () => {
  let db;
  let app;

  test.beforeEach(() => {
    db = createTestDb();
    app = createApp(db);
  });

  test.describe('GET /api/words', () => {
    test('should return all words', async () => {
      const response = await request(app)
        .get('/api/words')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.ok(Array.isArray(response.body));
      assert.strictEqual(response.body.length, 5);
    });

    test('should include all word fields', async () => {
      const response = await request(app)
        .get('/api/words')
        .expect(200);

      const word = response.body[0];
      assert.strictEqual(word.number, 1);
      assert.strictEqual(word.word, 'Abfall');
      assert.strictEqual(word.lesson, 1);
      assert.strictEqual(word.type, 'noun');
      assert.strictEqual(word.gender, 'der');
      assert.strictEqual(word.plural, 'die Abfälle');
      assert.ok(word.meanings_en);
      assert.ok(Array.isArray(JSON.parse(word.sentences)));
      assert.ok(Array.isArray(JSON.parse(word.phrases)));
    });
  });

  test.describe('GET /api/word/:number', () => {
    test('should return a single word by number', async () => {
      const response = await request(app)
        .get('/api/word/1')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.strictEqual(response.body.word, 'Abfall');
      assert.strictEqual(response.body.number, 1);
      assert.strictEqual(response.body.gender, 'der');
    });

    test('should return 404 for non-existent word', async () => {
      const response = await request(app)
        .get('/api/word/999')
        .expect('Content-Type', /json/)
        .expect(404);

      assert.strictEqual(response.body.error, 'Word not found');
    });

    test('should include parsed sentences and phrases', async () => {
      const response = await request(app)
        .get('/api/word/1')
        .expect(200);

      const sentences = JSON.parse(response.body.sentences);
      const phrases = JSON.parse(response.body.phrases);

      assert.ok(Array.isArray(sentences));
      assert.ok(sentences.length > 0);
      assert.strictEqual(sentences[0].en, 'Please throw your trash in the bin.');

      assert.ok(Array.isArray(phrases));
      assert.ok(phrases.length > 0);
      assert.strictEqual(phrases[0].de, 'Abfall trennen');
    });
  });

  test.describe('GET /api/search', () => {
    test('should search by German word', async () => {
      const response = await request(app)
        .get('/api/search?q=Abfall')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.strictEqual(response.body.words.length, 1);
      assert.strictEqual(response.body.words[0].word, 'Abfall');
    });

    test('should search by English meaning', async () => {
      const response = await request(app)
        .get('/api/search?q=waste')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.ok(response.body.words.length > 0);
      assert.ok(response.body.words.some(w => w.word === 'Abfall'));
    });

    test('should search in example sentences', async () => {
      const response = await request(app)
        .get('/api/search?q=trash')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.ok(response.body.words.length > 0);
    });

    test('should return empty array for no matches', async () => {
      const response = await request(app)
        .get('/api/search?q=nonexistent')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.strictEqual(response.body.words.length, 0);
    });

    test('should return 400 for missing query parameter', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect('Content-Type', /json/)
        .expect(400);

      assert.strictEqual(response.body.error, 'Query parameter "q" is required');
    });
  });

  test.describe('GET /api/progress', () => {
    test('should return current progress', async () => {
      const response = await request(app)
        .get('/api/progress')
        .expect('Content-Type', /json/)
        .expect(200);

      assert.strictEqual(response.body.last_word_number, 1);
    });
  });

  test.describe('POST /api/progress', () => {
    test('should update progress', async () => {
      const response = await request(app)
        .post('/api/progress')
        .send({ last_word_number: 3 })
        .expect('Content-Type', /json/)
        .expect(200);

      assert.strictEqual(response.body.last_word_number, 3);

      // Verify the update persisted
      const getResponse = await request(app)
        .get('/api/progress')
        .expect(200);

      assert.strictEqual(getResponse.body.last_word_number, 3);
    });

    test('should return 400 for missing last_word_number', async () => {
      const response = await request(app)
        .post('/api/progress')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      assert.strictEqual(response.body.error, 'last_word_number is required');
    });

    test('should return 400 for invalid last_word_number', async () => {
      const response = await request(app)
        .post('/api/progress')
        .send({ last_word_number: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      assert.strictEqual(response.body.error, 'last_word_number must be a positive integer');
    });

    test('should return 400 for negative last_word_number', async () => {
      const response = await request(app)
        .post('/api/progress')
        .send({ last_word_number: -1 })
        .expect('Content-Type', /json/)
        .expect(400);

      assert.strictEqual(response.body.error, 'last_word_number must be a positive integer');
    });
  });

  test.describe('Static file serving', () => {
    test('should serve index.html at root', async () => {
      const response = await request(app)
        .get('/')
        .expect('Content-Type', /html/)
        .expect(200);

      assert.ok(response.text.includes('<!DOCTYPE html>'));
    });

    test('should serve static files from public directory', async () => {
      const response = await request(app)
        .get('/index.html')
        .expect('Content-Type', /html/)
        .expect(200);

      assert.ok(response.text.includes('<!DOCTYPE html>'));
    });
  });

  test.describe('SPA fallback', () => {
    test('should return index.html for non-API routes', async () => {
      const response = await request(app)
        .get('/some/random/route')
        .expect('Content-Type', /html/)
        .expect(200);

      assert.ok(response.text.includes('<!DOCTYPE html>'));
    });
  });

  test.describe('Error handling', () => {
    test('should return 404 for invalid API endpoints', async () => {
      const response = await request(app)
        .get('/api/invalid')
        .expect('Content-Type', /json/)
        .expect(404);

      assert.strictEqual(response.body.error, 'Not found');
    });
  });
});
