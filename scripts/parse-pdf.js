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
