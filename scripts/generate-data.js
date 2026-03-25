require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Configuration
const CSV_PATH = path.join(__dirname, '../data/words.csv');
const DB_PATH = path.join(__dirname, '../data/db.sqlite');
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

// Test mode: set to true to process only 5 words
const TEST_MODE = false;
const TEST_BATCH_SIZE = 5;

// Delay between API calls to avoid rate limiting (ms)
const API_DELAY = 2000;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 10000, 20000]; // Exponential backoff: 5s, 10s, 20s

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL,
    word TEXT NOT NULL UNIQUE,
    lesson INTEGER,
    meanings_en TEXT,
    type TEXT,
    gender TEXT,
    plural TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL,
    sentence_en TEXT NOT NULL,
    sentence_de TEXT NOT NULL,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL,
    phrase_en TEXT NOT NULL,
    phrase_de TEXT NOT NULL,
    FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_word_number ON words(number);
  CREATE INDEX IF NOT EXISTS idx_word_word ON words(word);
  CREATE INDEX IF NOT EXISTS idx_sentences_word_id ON sentences(word_id);
  CREATE INDEX IF NOT EXISTS idx_phrases_word_id ON phrases(word_id);
`);

// Check if word is already processed
function isWordProcessed(word) {
  const stmt = db.prepare('SELECT meanings_en FROM words WHERE word = ? AND meanings_en IS NOT NULL');
  const result = stmt.get(word);
  return !!result;
}

// Parse CSV file
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  const words = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 3) {
      words.push({
        number: parseInt(values[0]),
        word: values[1].replace(/"/g, ''),
        lesson: parseInt(values[2])
      });
    }
  }

  return words;
}

// Call Google Gemini API with retry logic
async function callGeminiAPI(word) {
  const prompt = `You are a German language expert. For the German word "${word}", provide:
1. meanings_en: A concise English meaning string
2. type: one of: noun, verb, adjective, adverb, conjunction, preposition, other
3. gender: der/die/das (only if noun, otherwise null)
4. plural: the plural form with article (only if noun, otherwise null)
5. sentences: exactly 5 example sentences, each with "en" and "de" keys
6. phrases: 2-4 common phrases, each with "de" (German) and "en" (English) keys

Respond with ONLY valid JSON in this exact format:
{
  "meanings_en": "...",
  "type": "...",
  "gender": "..." or null,
  "plural": "..." or null,
  "sentences": [{"en": "...", "de": "..."}, ...],
  "phrases": [{"de": "...", "en": "..."}, ...]
}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);

        // If it's a 503 or 429 error and we have retries left, wait and retry
        if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES - 1) {
          const retryDelay = RETRY_DELAYS[attempt];
          console.log(`  ⏳ Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${retryDelay/1000}s...`);
          await delay(retryDelay);
          continue;
        }

        throw error;
      }

      const data = await response.json();

      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid API response structure');
      }

      const content = data.candidates[0].content.parts[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;

    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        console.error(`  Error calling Gemini API for "${word}":`, error.message);
        throw error;
      }
      // For other errors, also retry
      if (attempt < MAX_RETRIES - 1) {
        const retryDelay = RETRY_DELAYS[attempt];
        console.log(`  ⚠️  Error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${retryDelay/1000}s...`);
        await delay(retryDelay);
      }
    }
  }
}

// Insert word and its data into database
function insertWordData(wordData, apiData) {
  const insertWord = db.prepare(`
    INSERT OR REPLACE INTO words (number, word, lesson, meanings_en, type, gender, plural)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertWord.run(
    wordData.number,
    wordData.word,
    wordData.lesson,
    apiData.meanings_en,
    apiData.type,
    apiData.gender || null,
    apiData.plural || null
  );

  const wordId = db.prepare('SELECT id FROM words WHERE word = ?').get(wordData.word).id;

  // Insert sentences
  if (apiData.sentences && apiData.sentences.length > 0) {
    const insertSentence = db.prepare(`
      INSERT INTO sentences (word_id, sentence_en, sentence_de)
      VALUES (?, ?, ?)
    `);

    for (const sentence of apiData.sentences) {
      insertSentence.run(wordId, sentence.en, sentence.de);
    }
  }

  // Insert phrases
  if (apiData.phrases && apiData.phrases.length > 0) {
    const insertPhrase = db.prepare(`
      INSERT INTO phrases (word_id, phrase_en, phrase_de)
      VALUES (?, ?, ?)
    `);

    for (const phrase of apiData.phrases) {
      insertPhrase.run(wordId, phrase.en, phrase.de);
    }
  }

  return wordId;
}

// Delay utility
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main processing function
async function processWords() {
  console.log('🚀 Starting data generation...\n');

  const words = parseCSV(CSV_PATH);
  const totalWords = TEST_MODE ? Math.min(TEST_BATCH_SIZE, words.length) : words.length;
  const wordsToProcess = TEST_MODE ? words.slice(0, TEST_BATCH_SIZE) : words;

  console.log(`📊 Total words to process: ${totalWords}`);
  console.log(`📝 CSV contains: ${words.length} words\n`);

  if (TEST_MODE) {
    console.log('⚠️  TEST MODE: Processing only', TEST_BATCH_SIZE, 'words\n');
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const wordData of wordsToProcess) {
    const progress = `[${processed + 1}/${totalWords}]`;

    // Check if already processed
    if (isWordProcessed(wordData.word)) {
      console.log(`${progress} ${wordData.word}... ⊘ (already processed)`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`${progress} ${wordData.word}... `);

      // Call Gemini API
      const apiData = await callGeminiAPI(wordData.word);

      // Insert into database
      insertWordData(wordData, apiData);

      console.log('✓');
      processed++;

      // Delay to avoid rate limiting
      if (processed < totalWords) {
        await delay(API_DELAY);
      }

    } catch (error) {
      console.error('✗ Error:', error.message);
      errors++;
    }
  }

  // Final statistics
  console.log('\n' + '='.repeat(50));
  console.log('📈 Processing complete!');
  console.log('='.repeat(50));
  console.log(`✓ Successfully processed: ${processed}`);
  console.log(`⊘ Skipped (already done): ${skipped}`);
  console.log(`✗ Errors: ${errors}`);
  console.log(`📊 Total in database: ${db.prepare('SELECT COUNT(*) as count FROM words').get().count}`);

  if (TEST_MODE) {
    console.log('\n⚠️  TEST MODE completed!');
    console.log(`To process all ${words.length} words, set TEST_MODE = false in the script.`);
  }

  console.log('\n💾 Database saved to:', DB_PATH);
}

// Run the script
processWords()
  .then(() => {
    db.close();
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    db.close();
    process.exit(1);
  });
