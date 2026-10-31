# AI Business Assistant

### An AI-powered workspace for smarter business operations, reporting, and productivity.

AI Business Assistant is a web-based application designed to simplify everyday business activities using Artificial Intelligence. It helps users draft professional emails, summarize business documents, extract meeting insights, manage tasks, and generate business performance reports from key financial metrics.

The application combines AI-powered automation with business reporting and task management in one centralized dashboard.

![Dashboard](docs/screenshots/dashboard.png)

---

## Key Features

### 1. AI Email Assistant
- Generate professional emails, replies, and follow-ups.
- Rewrite informal messages into polished business communication.
- Choose between formal, professional, and friendly tones.
- Save, search, copy, and download email drafts.

### 2. Document Summarization
- Upload PDF, TXT, MD, and CSV files or paste text.
- Extract key information, dates, financial figures, and important points.
- Identify actionable tasks, owners, and deadlines.
- Convert extracted action items into tasks.

### 3. Meeting Assistant
- Convert meeting notes and transcripts into structured summaries.
- Identify key decisions and action items.
- Extract task owners, deadlines, and priority indicators.
- Create tasks directly from meeting insights.

### 4. Business Performance Reporting
- Analyze revenue, expenses, profit, and profit margins.
- Compare current and previous reporting periods.
- Calculate performance changes and financial trends.
- Generate reports with observations, recommendations, risks, and next steps.
- Export reports in Markdown and HTML formats or print them to PDF.

### 5. Task Management
- Create, update, and prioritize business tasks.
- Track task status and upcoming deadlines.
- Identify overdue tasks.
- Filter tasks by status and priority.

### 6. Interactive Dashboard
- View business activity and task statistics.
- Monitor task completion and upcoming deadlines.
- Track recent activities and document summaries.
- Access business tools from one centralized workspace.

---

## Technology Stack

| Category | Technologies |
|---|---|
| Backend | Node.js, Express.js |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Database | SQLite |
| AI Integration | OpenAI, Anthropic, Gemini, OpenRouter |
| APIs | REST API |
| Deployment | Docker |

---

## AI Integration

The application supports multiple AI providers through a flexible integration layer:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter

Users can configure an API key for a preferred provider.

**Offline Support:** The application also includes a built-in deterministic NLP engine that provides fallback functionality when external AI credentials are unavailable.

This ensures that core application features remain accessible without depending entirely on external AI services.

---

## Application Architecture

The application follows a modular architecture with separate frontend, backend, database, and AI processing layers.

```text
AI-Business-Assistant/
│
├── server/
│   ├── ai/              # AI provider integration
│   ├── lib/             # Text processing utilities
│   ├── routes/          # API endpoints
│   ├── index.js         # Express server
│   ├── db.js            # SQLite database
│   └── auth.js          # Authentication
│
├── public/
│   ├── css/             # Application styling
│   ├── js/              # Frontend logic
│   └── index.html       # Application entry point
│
├── docs/
│   └── screenshots/     # Application screenshots
│
├── .env.example
├── Dockerfile
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 22 or above
- npm

### 1. Clone the Repository

```bash
git clone https://github.com/ChaitaliManjare24/AI-Business-Analyst.git
```

### 2. Navigate to the Project

```bash
cd AI-Business-Analyst
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Application

```bash
npm start
```

### 5. Access the Application

Open your browser and visit:

```text
http://localhost:4173
```

The application initializes the SQLite database and creates a demo workspace on first startup.

---

## Demo Access

Explore the application using the demo account:

| Field | Details |
|---|---|
| Email | demo@bizassist.ai |
| Password | Demo1234 |

You can also register a new account to explore the application with a fresh workspace.

---

## Configure AI Providers (Optional)

To enable hosted AI capabilities:

1. Create a `.env` file using `.env.example` as a reference.
2. Add an API key for your preferred provider.
3. Restart the application.

Example:

```env
OPENAI_API_KEY=your_api_key
```

Alternatively, configure an Anthropic, Gemini, or OpenRouter API key.

**Note:** API keys are stored and accessed on the server side and should never be committed to the repository.

---

## Security Features

- Password hashing using scrypt.
- Server-side session management.
- CSRF protection.
- Rate limiting for authentication.
- Input validation and secure file upload handling.
- User-specific data isolation.
- Security headers and Content Security Policy.

---

## Future Enhancements

Potential areas for further development include:

- Integration with marketing analytics platforms.
- Campaign performance tracking and KPI dashboards.
- Automated business intelligence reporting.
- Advanced data visualization and trend analysis.
- Integration with external business productivity tools.

---

## Project Objective

The goal of this project is to demonstrate how AI, business reporting, and workflow automation can be combined to simplify business operations and support data-driven decision-making.

**AI Business Assistant brings everyday business tasks, actionable insights, and performance reporting into one workspace.**

---

## Author

**Chaitali Manjare**

---

*Built to explore practical applications of Artificial Intelligence, business analytics, and workflow automation.*
