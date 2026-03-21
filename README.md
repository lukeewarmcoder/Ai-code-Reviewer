<div align="center">

# 🧠⚡ AI Code Reviewer

**An intelligent, full-stack code reviewing platform built for students and developers.**  
Analyze your code for bugs, complexity, security vulnerabilities, and get AI-optimized rewrites — instantly.

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)](https://nextjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![Anthropic](https://img.shields.io/badge/Anthropic_API-191919?style=flat&logo=anthropic&logoColor=white)](https://anthropic.com)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat&logo=stripe&logoColor=white)](https://stripe.com)
[![Tests](https://img.shields.io/badge/Tests-141_passing-brightgreen?style=flat&logo=vitest)](/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat)](LICENSE)

[Live Demo](#) · [Report Bug](issues) · [Request Feature](issues)

</div>

---

## 📖 Overview

AI Code Reviewer is a production-grade SaaS MVP that leverages the **Anthropic Claude API** to deliver
deep, structured code analysis. It returns strictly-typed JSON feedback across four dimensions:
**Bugs**, **Complexity**, **Security**, and **Optimization** — adapting its tone for Beginner or
Advanced developers.

Built with a clean separation between an **Express REST API** backend and a **Next.js 14** frontend,
with real monetization via **Stripe**, auth via **NextAuth v5**, and 141 automated test cases.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🤖 **AI Analysis Engine** | Claude-powered JSON-structured feedback on Bugs, Complexity, Security & Optimization |
| 🎭 **Dual Mode** | Adapts explanations for Beginner vs. Advanced developers |
| 🖊️ **Monaco Editor** | VS Code-like in-browser editing experience |
| 📊 **Results Dashboard** | Animated, tabbed UI with Framer Motion transitions |
| 💳 **Stripe Monetization** | Free tier: 5 reviews/day · 300 LOC cap · Pro: unlimited + full rewrites |
| 🔐 **Auth** | GitHub & Google OAuth via NextAuth.js (Auth.js v5) |
| 🧪 **Tested** | 141 automated test cases (rate-limiting, DB schemas, Claude fallbacks, Stripe webhooks) |
| 🔒 **Secure Proxy** | Internal API key-gated server-to-server communication |

---

## 🛠️ Tech Stack

**Frontend**
- [Next.js 14](https://nextjs.org) (App Router)
- React · Tailwind CSS · Framer Motion
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- NextAuth.js (Auth.js v5)

**Backend**
- Node.js · Express
- Better-SQLite3 · Drizzle ORM
- Zod (schema validation)
- Vitest · Supertest (testing)

**Services**
- [Anthropic Claude API](https://anthropic.com)
- [Stripe](https://stripe.com) — Checkout & Webhooks

---

## ⚙️ Getting Started

### Prerequisites

- Node.js `v18+`
- Anthropic API Key (`sk-ant-***`)
- Stripe Test API Keys
- GitHub / Google OAuth credentials (for NextAuth)

---

### Installation

**1. Clone the repo**
```bash
git clone https://github.com/lukeewarmcoder/ai-code-reviewer.git
cd "ai-code-reviewer"
```

**2. Install backend dependencies**
```bash
npm install
```

**3. Install frontend dependencies**
```bash
cd frontend && npm install
```

---

### Environment Variables

Both the backend root and `frontend/` require `.env` / `.env.local` files.
Copy from the provided templates:
```bash
# Root (backend)
cp .env.example .env

# Frontend
cp frontend/.env.example frontend/.env.local
```

> ⚠️ **Critical:** Both backend and frontend must share the same `INTERNAL_API_KEY`
> to authenticate server-to-server proxied requests securely.

**Key variables:**

| Variable | Location | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | backend `.env` | Claude API key |
| `STRIPE_SECRET_KEY` | backend `.env` | Stripe secret (test mode) |
| `STRIPE_WEBHOOK_SECRET` | backend `.env` | Stripe webhook signing secret |
| `INTERNAL_API_KEY` | both | Shared proxy auth key |
| `NEXTAUTH_SECRET` | frontend | Auth.js session secret |
| `GITHUB_CLIENT_ID/SECRET` | frontend | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID/SECRET` | frontend | Google OAuth credentials |

---

### Running the Development Servers

**Start the Express backend (Port 3001):**
```bash
npm run dev
```

**Start the Next.js frontend (Port 3000):**
```bash
cd frontend && npm run dev
```

App runs at **[http://localhost:3000](http://localhost:3000)**

---

### Running Tests
```bash
# From root
npm run test

# With coverage
npm run test:coverage
```

> 141 test cases covering: rate-limiting logic, DB schema integrity, Claude API fallbacks,
> Stripe webhook edge cases, and Zod validation boundaries.

---

## 📐 Architecture
```
├── /                        # Express backend (API server — Port 3001)
│   ├── routes/              # API route handlers
│   ├── middleware/          # Auth, rate-limiting, validation
│   ├── db/                  # Drizzle ORM schema + migrations
│   ├── services/            # Claude API integration, Stripe logic
│   └── tests/               # Vitest + Supertest test suites
│
└── frontend/                # Next.js 14 App Router (Port 3000)
    ├── app/                 # App Router pages & layouts
    ├── components/          # Monaco editor, dashboard tabs, UI
    ├── lib/                 # Auth config, API client, utilities
    └── styles/              # Tailwind config
```

---

## 💳 Pricing Tiers

| | Free | Pro |
|---|:---:|:---:|
| Reviews / day | 5 | Unlimited |
| Max lines of code | 300 | Unlimited |
| Bug & Security analysis | ✅ | ✅ |
| Complexity breakdown | ✅ | ✅ |
| Optimized code rewrites | ❌ | ✅ |
| Advanced mode | ❌ | ✅ |

---

## 🗺️ Roadmap

- [ ] Multi-language support (C, Rust, Go)
- [ ] GitHub repo integration (review on push)
- [ ] Team workspaces
- [ ] VS Code extension
- [ ] Historical review timeline

---

## 🤝 Contributing

PRs are welcome. For major changes, open an issue first.
```bash
git checkout -b feature/your-feature
git commit -m "feat: your feature description"
git push origin feature/your-feature
```

---

## 📄 License

MIT © [lukeewarmcoder](https://github.com/lukeewarmcoder)

---

<div align="center">
Built with 🛠️ & ❤️ as an AI-powered SaaS MVP
</div>
```

---

## GitHub Repository Topics

Add these under **Settings → Topics** on the repo page:
```
ai  code-review  anthropic  claude  nextjs  expressjs  stripe  saas
monaco-editor  nextauth  drizzle-orm  sqlite  vitest  tailwindcss  framer-motion
typescript  nodejs  generative-ai  developer-tools  automation
