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
      created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE sentences (
      id           INTEGER PRIMARY KEY,
      word_id      INTEGER NOT NULL,
      sentence_en  TEXT NOT NULL,
      sentence_de  TEXT NOT NULL,
      FOREIGN KEY (word_id) REFERENCES words(id)
    );

    CREATE TABLE phrases (
      id        INTEGER PRIMARY KEY,
      word_id   INTEGER NOT NULL,
      phrase_en TEXT NOT NULL,
      phrase_de TEXT NOT NULL,
      FOREIGN KEY (word_id) REFERENCES words(id)
    );

    CREATE TABLE progress (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      last_word_number INTEGER NOT NULL DEFAULT 1
    );

    INSERT OR IGNORE INTO progress (id, last_word_number) VALUES (1, 1);

    CREATE TABLE IF NOT EXISTS sentence_breakdowns (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence_id  INTEGER NOT NULL UNIQUE,
      breakdown_json TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sentence_id) REFERENCES sentences(id)
    );
  `);

  const insertWord = db.prepare(`
    INSERT INTO words (number, word, lesson, type, gender, plural, meanings_en)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSentence = db.prepare(`
    INSERT INTO sentences (word_id, sentence_en, sentence_de)
    VALUES (?, ?, ?)
  `);

  const insertPhrase = db.prepare(`
    INSERT INTO phrases (word_id, phrase_en, phrase_de)
    VALUES (?, ?, ?)
  `);

  // Insert words
  insertWord.run(1, 'Abfall', 1, 'noun', 'der', 'die Abfälle', 'waste, trash, garbage');
  insertWord.run(2, 'Abflug', 1, 'noun', 'der', 'die Abflüge', 'departure, takeoff');
  insertWord.run(3, 'Absage', 1, 'noun', 'die', 'die Absagen', 'cancellation, rejection');
  insertWord.run(4, 'Alkohol', 1, 'noun', 'der', null, 'alcohol');
  insertWord.run(5, 'arbeiten', 2, 'verb', null, null, 'to work');

  // Insert sentences for word 1 (Abfall)
  insertSentence.run(1, 'Please throw your trash in the bin.', 'Bitte wirf deinen Müll in den Behälter.');
  insertSentence.run(1, 'Waste must be separated carefully.', 'Müll muss sorgfältig getrennt werden.');
  insertSentence.run(1, 'Radioactive waste is dangerous.', 'Radioaktiver Abfall ist gefährlich.');
  insertSentence.run(1, 'Air pressure drops indicate weather change.', 'Druckabfälle deuten auf Wetterwechsel hin.');
  insertSentence.run(1, 'Reduce plastic waste worldwide.', 'Reduziere Plastikabfall weltweit.');

  // Insert sentences for other words (using same sentences for simplicity)
  [2, 3, 4, 5].forEach(wordId => {
    insertSentence.run(wordId, 'Please throw your trash in the bin.', 'Bitte wirf deinen Müll in den Behälter.');
    insertSentence.run(wordId, 'Waste must be separated carefully.', 'Müll muss sorgfältig getrennt werden.');
  });

  // Insert phrases for word 1 (Abfall)
  insertPhrase.run(1, 'to sort or separate waste', 'Abfall trennen');
  insertPhrase.run(1, 'organic waste (bio-waste)', 'biologischer Abfall');

  // Insert phrases for other words
  insertPhrase.run(2, 'departure time', 'Abflugzeit');
  insertPhrase.run(3, 'to cancel an appointment', 'eine Absage machen');
  insertPhrase.run(4, 'alcohol consumption', 'Alkoholkonsum');
  insertPhrase.run(5, 'to work from home', 'von zu Hause aus arbeiten');

  return db;
}

module.exports = { createTestDb };
