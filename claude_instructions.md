# Context for Claude: Frontend UI (Monaco Editor & Results Dashboard)

> ⚠️ **CRITICAL QUOTA INSTRUCTIONS FOR CLAUDE** ⚠️
> You are operating under strict token/quota limits. To avoid exhausting limits:
> - **DO NOT include conversational filler**.
> - **DO NOT rewrite entire existing files**. Just provide the exact necessary snippets or modified blocks.
> - **DO NOT write elaborate explanations.** Output ONLY the necessary bash commands and TypeScript (Next.js) code blocks.

## Goal
Build the Next.js Frontend UI strictly according to the PRD. The backend AI Engine (Express) is completely finished (`POST /api/review` handles the AI generation, limits, and SQLite saving). Now we need the client UI!

### PRD UI Rules
- **Main Page:** Code Editor (Monaco), Language Dropdown, Review Button.
- **Results Tabs:** 🐛 Bugs | 📈 Complexity | 🔐 Security | ✨ Clean Code | 🚀 Optimized Code.
- **Styling:** Dark theme default, Tailwind CSS, Lucide icons.

## What you need to do (Coding part)

### 1. Install Dependencies
Run in `frontend/`:
- `npm install @monaco-editor/react lucide-react clsx tailwind-merge framer-motion` (or any equivalent minimal UI libs you need for tabs).

### 2. Create the Editor Component (`frontend/components/EditorView.tsx`)
Create a Client Component (`"use client"`) that:
- Renders the Monaco Editor in a dark theme (`vs-dark`).
- Has a `<select>` for Language (JavaScript, Python, Java, C++).
- Has a "Review Code" submit button that triggers the API call to `http://localhost:3000/api/review` (or wherever your backend is running — we'll set proxy or full URL). 

### 3. Create the Results Component (`frontend/components/ResultsTabs.tsx`)
Create a Client Component that takes the `AIReviewResult` JSON object as props:
- Renders a horizontal tab list (Bugs, Complexity, Security, Clean Code, Optimized Code).
- **Bugs Tab**: Maps over the `bugs` array and displays them.
- **Complexity Tab**: Displays `time`, `space`, and the `explanation` string.
- **Optimized Code Tab**: Renders the `improvedCode` string inside a `<pre><code>` block.

### 4. Wire up the Main Page (`frontend/app/page.tsx`)
Update the Next.js main page to:
- Render the `EditorView` on the left (or top) and the `ResultsTabs` on the right (or bottom) once results arrive.
- Handle the loading state and error states (e.g., if the user hits the "Free limits exceeded" 400 error from the backend, display it gracefully).
- Ensure the API keys or Auth session tokens are correctly passed so the Express backend allows the request.

**Again, output ONLY the commands and exact code blocks needed. Skip full architectural explanations.**
