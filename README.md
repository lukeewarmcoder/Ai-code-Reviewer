# AI Code Reviewer 🧠⚡

An intelligent, full-stack code reviewing platform built for students and developers. It analyzes your code for bugs, runtime complexity, security vulnerabilities, and code cleanliness—while offering performance-optimized versions of your logic.

## 🚀 Features

*   **Intelligent AI Analysis**: Uses the Anthropic API to parse your code and return strictly formatted JSON data covering Bugs, Complexity, Security, and Optimization.
*   **Dual Mode Engine**: AI adapts its explanations for *Beginners* vs. *Advanced* developers.
*   **Monaco Code Editor**: Sleek, VS Code-like editing experience built into the browser.
*   **Results Dashboard**: Animated, tabbed interface to easily navigate the AI's feedback.
*   **Smart Monetization (Stripe)**: Free users get 5 reviews/day (capped at 300 lines of code max). Pro users get unlimited requests and full optimization rewrites.
*   **Robust Backend**: Express API heavily tested with 141 automated test cases covering rate-limiting, database schemas, Claude fallbacks, and Stripe webhook edge cases.

## 🛠️ Tech Stack

*   **Frontend**: Next.js 14, React, Tailwind CSS, Framer Motion, Monaco Editor.
*   **Backend**: Node.js, Express, Better-SQLite3, Drizzle ORM, Zod.
*   **Testing**: Vitest, Supertest.
*   **Auth & Payments**: NextAuth.js (Auth.js v5), Stripe Checkout & Webhooks.

## ⚙️ Getting Started

### 1. Requirements
- Node.js `v18+`
- Anthropic API Key (`sk-ant-***`)
- Stripe Test API Keys (for monetization features)
- GitHub / Google OAuth Keys (for NextAuth)

### 2. Installation
Install root dependencies (Backend):
```bash
cd "ai code review"
npm install
```

Install frontend dependencies (Next.js):
```bash
cd frontend
npm install
```

### 3. Environment Variables
You will need `.env.local` files for both the frontend and backend. See the provided `.env.example` templates for placeholders. 

*Frontend Proxy*: Ensure both the backend and frontend share the same `INTERNAL_API_KEY` for secure server-to-server proxied communication.

### 4. Running the Development Servers

**Start the Express Backend API (Port 3001)**:
```bash
npm run dev
```

**Start the Next.js Frontend (Port 3000)**:
```bash
cd frontend
npm run dev
```

The application will be running at [http://localhost:3000](http://localhost:3000).

---

> Built with 🛠️ & ❤️ as an AI-powered SaaS MVP.
