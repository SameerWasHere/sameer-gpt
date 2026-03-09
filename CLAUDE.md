# CLAUDE.md — Project Context for Claude Code

## Project
SameerGPT — personal AI chatbot at **sameer.us**. React CRA frontend, Vercel serverless API routes, Vercel KV (Upstash Redis), OpenAI GPT-4o. Includes a Telegram bot integration for real-time monitoring and conversation takeover.

## Key Files

### Frontend
- `src/Chat.js` — Main chat component (landing + chat states, streaming, contenteditable input, background polling for push messages, session persistence via localStorage)
- `src/Chat.css` — All chat styles, theme variables (light/dark), responsive
- `src/App.js` — Root component, visualViewport tracking for iOS keyboard
- `src/App.css` — Global styles, position:fixed container

### API Routes
- `api/chat.js` — Chat API, SSE streaming, conversation logging, Telegram notifications, tap-in/tap-out detection, "who is this?" first-message behavior
- `api/telegram.js` — Telegram bot webhook handler (forum topics, /in, /out, /coach, /learn commands)
- `api/check-response.js` — Frontend polls this for human responses when Sameer is tapped in
- `api/updatePrompt.js` — AI prompt editing via GPT-4o-mini JSON patch
- `api/getConversations.js` — Returns grouped conversation history
- `api/deleteConversations.js` — Clears conversation logs
- `vercel.json` — maxDuration: 30 for API functions

## Telegram Bot Integration
Bot: **@SameerGPTbot** — connected to a Telegram group ("SameerUs") with forum topics enabled.

### How It Works
- Each chat session on sameer.us creates a **separate forum topic** in the Telegram group
- All messages (user + AI responses) are forwarded to the session's topic in real-time
- Sameer can interact from within each topic

### Telegram Commands (typed inside a session topic)
- `/in` — **Direct mode**: intercept the conversation, you ARE the AI. User sees typing indicator until you respond.
- `/coach` — **Coach mode**: you give instructions, AI writes the response incorporating your guidance. User sees typing indicator.
- `/coach [instruction]` — One-off coached response without tapping in
- `/out` — Hand back to AI. If user has an unanswered message, AI auto-responds.
- `/learn` — Analyze your interventions in this session and update the system prompt to sound more like you over time.
- Just type text — sends directly to user (if tapped in) or as a proactive push message

### Telegram DM Commands
- `/start` — Register as owner
- `/sessions` — List active sessions
- `/status` — Check current tap-in state

### Key Redis Keys (Telegram)
- `telegram:owner_chat_id` — Sameer's Telegram chat ID
- `telegram:active_sessions` — JSON object `{ sessionId: timestamp }` tracking active sessions
- `telegram:tapped_in` — Session ID Sameer is currently controlling (string)
- `telegram:tap_mode` — `"direct"` or `"coach"`
- `telegram:topic:{sessionId}` — Telegram forum topic thread ID for a session
- `telegram:topic_session:{threadId}` — Reverse mapping: thread ID → session ID
- `telegram:pending:{sessionId}` — User's unanswered message (when tapped in)
- `telegram:messages:{sessionId}` — Full conversation array (for coach mode context)
- `telegram:response:{sessionId}` — Sameer's response waiting to be delivered to user
- `telegram:interventions:{sessionId}` — Array of interventions for /learn

### Important Implementation Details
- **Type coercion**: Redis returns all-digit strings as numbers. Always use `String()` when comparing session IDs or chat IDs (`String(tappedIn) === String(conversationId)`).
- **Await notifications**: All `notifyTelegram` / `sendTelegram` calls must be awaited or Vercel kills the process before they send.
- **Forum group chat ID**: Hardcoded as `FORUM_CHAT_ID = '-1003840040892'` in both `api/chat.js` and `api/telegram.js`.
- **Streaming simulation**: When Sameer responds (direct or coach), the frontend simulates character-by-character streaming so it looks identical to AI responses.
- **Typing indicator**: When tapped in, typing indicator shows immediately when user sends a message and stays until Sameer responds. Uses `keepLoading` flag to prevent `finally` block from clearing it.
- **Background poll**: Frontend polls `/api/check-response` every 3 seconds for proactive push messages. Skips when `isLoading` is true.

## Chat Features
- `/update` in chat → password → view conversation history → AI-edit prompt
- `/edit` in chat → opens direct context editor (needs admin password)
- Conversations grouped by session ID in Redis hash (`conversations`)
- Streaming via SSE, markdown rendering via react-markdown
- "Who is this?" — AI asks new visitors who they are on their first message
- Session persistence — messages and conversationId saved to localStorage, survive page refresh. "New Chat" clears and starts fresh.

## Env Vars (Vercel)
- `OPENAI_API_KEY` — OpenAI API key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token for @SameerGPTbot
- `REACT_APP_PASSWORD` — Admin password for /update and /edit
- Vercel KV (Upstash Redis) — auto-configured via Vercel integration

## Dev Workflow
- Push to `main` → auto-deploys to sameer.us via Vercel
- Local dev server lacks API keys — always test on production
- `CI=false react-scripts build` prevents warnings-as-errors on Vercel
- Telegram webhook URL: `https://sameer.us/api/telegram` (set via Telegram API)

## Known Issues
- iOS Safari keyboard dismisses after Enter even with contenteditable. Parked for now.
- Redis sorted sets (`zadd`/`zrange`) don't work reliably with Vercel KV — use plain JSON objects with `kv.get`/`kv.set` instead.

## Style Preferences
- User is a Staff PM, not a developer — keep explanations simple
- Push to production frequently so user can test on real device
- No emojis unless asked
- Make decisions, don't ask 5 clarifying questions
