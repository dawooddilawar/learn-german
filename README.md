# German B1 Vocabulary App

A web application for learning German B1 level vocabulary. Track your progress through 993 essential words with example sentences, grammar contexts, and part-of-speech information.

## Features

- **993 B1 Vocabulary Words**: Comprehensive list from "Einfach gut!" textbook
- **Smart Navigation**: Next/Previous buttons with progress tracking
- **Example Sentences**: See words used in context
- **Grammar Information**: Part of speech, gender, and usage notes
- **Progress Persistence**: Your position is saved automatically
- **Fast & Lightweight**: Pure vanilla JavaScript, no frameworks
- **REST API**: Test-driven backend with Express.js
- **Docker Ready**: One-command deployment

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Parse vocabulary from PDF (first time only)
npm run parse

# Generate initial dataset (needs Google API key)
npm run generate

# Start the server
npm start
```

Visit `http://localhost:3000`

### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Environment Variables

Create a `.env` file:

```
GOOGLE_API_KEY=your_api_key_here
PORT=3000
```

## Scripts

- `npm start` - Start the Express server
- `npm run parse` - Parse vocabulary from PDF source
- `npm run generate` - Generate example sentences and grammar info
- `npm test` - Run API tests

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite with better-sqlite3
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Deployment**: Docker, Docker Compose
- **Testing**: Supertest, Node.js built-in test runner

## Deployment

Run with Docker:

```bash
docker-compose up -d
```

Or run directly with Node.js:

```bash
npm install
npm start
```

## Project Structure

```
├── public/          # Static frontend files
├── server.js        # Express server
├── database.js      # SQLite database layer
├── scripts/         # Utility scripts (PDF parsing, data generation)
├── tests/           # API tests
├── data/            # SQLite database (generated)
├── docker-compose.yml
└── Dockerfile
```

## License

MIT
