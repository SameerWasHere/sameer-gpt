# CLAUDE.md — Project Context for Claude Code

## Project
SameerGPT — personal AI chatbot at **sameer.us**. React CRA frontend, Vercel serverless API routes, Vercel KV (Upstash Redis), OpenAI GPT-4o.

## Key Files
- `src/Chat.js` — Main chat component (landing + chat states, streaming, contenteditable input)
- `src/Chat.css` — All chat styles, theme variables (light/dark), responsive
- `src/App.js` — Root component, visualViewport tracking for iOS keyboard
- `src/App.css` — Global styles, position:fixed container
- `api/chat.js` — Chat API, SSE streaming, conversation logging
- `api/updatePrompt.js` — AI prompt editing via GPT-4o-mini JSON patch
- `api/getConversations.js` — Returns grouped conversation history
- `api/deleteConversations.js` — Clears conversation logs
- `vercel.json` — maxDuration: 30 for API functions

## Commands & Features
- `/update` in chat → password → view conversation history → AI-edit prompt
- `/edit` in chat → opens direct context editor (needs admin password)
- Conversations grouped by session ID in Redis hash
- Streaming via SSE, markdown rendering via react-markdown

## Dev Workflow
- Push to `main` → auto-deploys to sameer.us via Vercel
- Local dev server lacks API keys — always test on production
- `CI=false react-scripts build` prevents warnings-as-errors on Vercel
- Puppeteer scripts: `screenshot-both.mjs`, `screenshot-chat.mjs`

## Known Issues
- iOS Safari keyboard dismisses after Enter even with contenteditable. Tried everything (form onSubmit, preventDefault, refocus, contenteditable). Accessory bar is fixed but keyboard close persists. Parked for now.

## Style Preferences
- User is a beginner — keep explanations simple
- Push to production frequently so user can test on real device
- No emojis unless asked
