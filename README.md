# GovData Insight Dashboard

An interactive web dashboard for exploring and analyzing Government of India documents, including the Allocation of Business Rules and Public Enterprises data.

![Dashboard Preview](screenshot.png)

## Features

- **📊 Dashboard Analytics**: View statistics on documents, word counts, and legislative acts found
- **📈 Interactive Charts**: Visualize ministry references and document size distributions using Chart.js
- **🔍 Deep Search**: Search across all documents with highlighted results and context snippets
- **📄 Document Explorer**: Browse and preview extracted document content

## Data Sources

The dashboard analyzes extracted text from official Government of India PDF documents including:
- Government of India (Allocation of Business) Rules, 1961
- Public Enterprises documentation
- Various ministry and department records

## Technology Stack

- **HTML5** - Semantic structure
- **CSS3** - Modern dark theme with glassmorphism effects
- **JavaScript (ES2023 modules)** - Hardened application logic with safer DOM APIs
- **Chart.js** - Data visualization


## Security & Modernization Updates

- Uses safer DOM rendering patterns (`textContent`, `createElement`) to reduce XSS exposure.
- Adds a strict Content Security Policy (CSP) to limit script, style, and embedding sources.
- Removes unnecessary third-party runtime scripts and keeps dependencies minimal.
- Introduces debounced search + normalized in-memory document indexing for better performance.

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/government-works.git
   ```

2. Open `index.html` in your browser

No build process or server required - it's a static website!

## Project Structure

```
government-works/
├── index.html      # Main dashboard page
├── style.css       # Styles and theme
├── script.js       # Application logic
├── data.js         # Extracted document data
└── README.md       # This file
```

## License

This project is for educational and research purposes. Government documents are public domain.

---

*Built with ❤️ for transparency in governance*
