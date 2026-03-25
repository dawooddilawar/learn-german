const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/db.sqlite');
const db = new Database(DB_PATH);

console.log('📊 Database Verification\n');
console.log('='.repeat(60));

// Count words
const wordCount = db.prepare('SELECT COUNT(*) as count FROM words').get();
console.log(`\n✓ Total words: ${wordCount.count}`);

// Sample word data
console.log('\n📝 Sample words:');
console.log('='.repeat(60));
const words = db.prepare(`
  SELECT word, meanings_en, type, gender, plural
  FROM words
  LIMIT 3
`).all();

words.forEach(word => {
  console.log(`\nWord: ${word.word}`);
  console.log(`  Meaning: ${word.meanings_en}`);
  console.log(`  Type: ${word.type}`);
  console.log(`  Gender: ${word.gender || 'N/A'}`);
  console.log(`  Plural: ${word.plural || 'N/A'}`);
});

// Sample sentences
console.log('\n\n📚 Sample sentences:');
console.log('='.repeat(60));
const sentences = db.prepare(`
  SELECT w.word, s.sentence_en, s.sentence_de
  FROM sentences s
  JOIN words w ON s.word_id = w.id
  LIMIT 3
`).all();

sentences.forEach(s => {
  console.log(`\n[${s.word}]`);
  console.log(`  EN: ${s.sentence_en}`);
  console.log(`  DE: ${s.sentence_de}`);
});

// Sample phrases
console.log('\n\n💬 Sample phrases:');
console.log('='.repeat(60));
const phrases = db.prepare(`
  SELECT w.word, p.phrase_en, p.phrase_de
  FROM phrases p
  JOIN words w ON p.word_id = w.id
  LIMIT 3
`).all();

phrases.forEach(p => {
  console.log(`\n[${p.word}]`);
  console.log(`  EN: ${p.phrase_en}`);
  console.log(`  DE: ${p.phrase_de}`);
});

console.log('\n' + '='.repeat(60));
db.close();
