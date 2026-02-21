# Intent Engine

A lightweight, multilingual intent detection engine designed for chat applications (like WhatsApp). It uses regex-based matching to identify user intents from messages in English and Hindi/Hinglish.

## Features

- **Multilingual Support**: Detects intents in English and Hindi (Hinglish).
- **Text Normalization**: Automatically cleans and normalizes user input before processing.
- **Regex-based Matching**: Flexible pattern matching with specificity-based scoring.
- **Intent Confidence**: Provides confidence levels (HIGH, MEDIUM, LOW) based on match quality.
- **Extensible**: Easily add new intents and patterns via `src/config/intents.json`.

## Project Structure

```text
intent-engine/
├── src/
│   ├── config/            # Intent configurations (JSON)
│   ├── detector/          # Core intent detection logic
│   ├── normalizer/        # Text cleaning and normalization
│   ├── utils/             # Helper functions
│   └── index.js           # Main entry point and manual testers
├── tests/                 # Unit tests (Jest)
└── package.json           # Scripts and dependencies
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/addz9015/IntentDesign.git
   cd intent-engine
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Usage

You can run the engine with a few demo messages:

```bash
npm start
```

Or use it in your own code:

```javascript
const processMessage = require('./src/index');

const result = processMessage("mera order kaha hai");
console.log(result);
// Output: { intent: 'ORDER_STATUS', language: 'hi', confidence: 'MEDIUM', ... }
```

### Running Tests

To run the unit tests and view coverage:

```bash
npm test
```

## Contributing

1. Add new intents/patterns to `src/config/intents.json`.
2. Ensure patterns are specific enough to avoid false positives.
3. Run tests before submitting changes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.