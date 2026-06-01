# SameerGPT — sameer.us

Personal site for **sameer.us**: an AI chatbot, a Telegram takeover bot, and a
lightweight **Projects** publishing platform. Create React App frontend +
Vercel serverless functions + Vercel KV (Upstash Redis).

## Surfaces

| URL | What it is |
| --- | --- |
| `/` | SameerGPT — AI chatbot (streaming, Telegram-monitored) |
| `/projects` | Projects dashboard — PIN-gated admin view of published projects |
| `/<id>` | A published project page (clean root URL, e.g. `/babypool`) |
| `/babypool`, `/babypool/admin` | Baby Pool guessing game + admin |

## Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Var | Required | Used by | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | yes | chatbot | OpenAI key for GPT-4o |
| `TELEGRAM_BOT_TOKEN` | yes | Telegram bot | @SameerGPTbot token |
| `REACT_APP_PASSWORD` | yes | chat admin | password for `/update` and `/edit` |
| Vercel KV (auto) | yes | chat, telegram | auto-configured by the Vercel KV/Upstash integration |
| **`GITHUB_TOKEN`** | **for Projects admin** | `api/claude-admin` | fine-grained PAT scoped to this repo with **Contents: read/write**. Without it, the Projects "Manage" actions return a clear "not configured" error. |
| `CLAUDE_PIN_HASH` | optional | Projects admin | SHA-256 of the dashboard PIN. Defaults to the hash of the built-in PIN. Set this to change the PIN without editing code. |
| `GITHUB_REPO` | optional | Projects admin | defaults to `SameerWasHere/sameer-gpt` |
| `GITHUB_BRANCH` | optional | Projects admin | defaults to `main` |

Local dev (`npm start`) has no API keys, so chat/admin features only work in
production. **Never commit `.env`** — it's gitignored.

## The Projects publishing platform

Projects are self-contained HTML pages served at clean root URLs (`/<id>`).

- **Manifest:** `public/projects/manifest.json` lists every project. Each entry
  has `id`, `title`, `description`, `category`, `date`, `access`, and either a
  `filename` (a file under `public/projects/artifacts/`) or a `url` (for
  external pages like `/babypool`).
- **Public projects** load directly. **Protected projects** are AES-256-GCM
  encrypted (key derived from the password via PBKDF2); only the ciphertext is
  in the repo, so the URL is useless without the password.
- **Routing:** `middleware.js` maps `/<id>` to the viewer for real browsers and
  to an Open Graph preview for link-unfurling crawlers. Anything that isn't a
  manifest project passes through untouched.
- **Dashboard (`/projects`):** PIN-gated. From here you can flip a project
  between public/protected and set passwords; changes are committed to GitHub
  via `api/claude-admin` (needs `GITHUB_TOKEN`), which triggers a redeploy.

### Add a protected project

```bash
node scripts/encrypt-artifact.mjs path/to/page.html "the-password" my-project
```

This writes `public/projects/artifacts/my-project.enc.json` and prints a
manifest snippet (with the password's SHA-256 hash) to paste into
`public/projects/manifest.json`. For a public project, just drop the `.html`
file in `public/projects/artifacts/` and add a manifest entry with that
`filename` and `"access": "public"`.

> **Security note:** the dashboard PIN is a lightweight client-side gate, not
> hard security. Because the admin API can write to the repo, prefer strong,
> unique passwords for protected projects and treat the PIN as low-assurance.

## Deploy

Push to `main` → Vercel auto-deploys to sameer.us. The build uses
`CI=false react-scripts build` so warnings don't fail the build.
