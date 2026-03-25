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
