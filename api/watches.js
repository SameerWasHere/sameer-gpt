// Pending watch links for /watches.
//
// A tiny inbox: the watches page (after the admin PIN) posts links to watches
// the user wants to add. Claude reads them later, looks up the details, and
// writes proper tiles into public/projects/artifacts/watches.html.
//
// GET    -> { pending: [{ id, url, addedAt }] }                  (public read)
// POST   -> { pending }  after adding     body { url }           (needs x-claude-pin)
// DELETE -> { pending }  after removing    body { id } or ?id=    (needs x-claude-pin)
//
// Stored in the same Vercel KV the chatbot/qmeter use, under 'watches_pending'
// as a plain JSON array — Vercel KV sorted sets (zadd/zrange) are flaky, so we
// keep a single JSON value via kv.get/kv.set.
import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

const KEY = 'watches_pending_links';

const EXPECTED_PIN_HASH =
  process.env.CLAUDE_PIN_HASH ||
  'ad5ef4b29e148afd784de5373b210eb00879dfbf08922c96dc6ce4fc1e064fd9'; // sha256('1495')

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function readPending() {
  try {
    const v = await kv.get(KEY);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return []; // KV unavailable -> behave as empty so the page still loads
  }
}

function checkPin(req) {
  const pin = req.headers['x-claude-pin'];
  return !!pin && sha256(pin) === EXPECTED_PIN_HASH;
}

function normalizeUrl(u) {
  let s = String(u || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    new URL(s);
  } catch (e) {
    return null;
  }
  return s.length <= 2000 ? s : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ pending: await readPending() });
  }

  if (req.method === 'POST') {
    if (!checkPin(req)) return res.status(401).json({ error: 'Invalid PIN' });
    const url = normalizeUrl((req.body || {}).url);
    if (!url) return res.status(400).json({ error: 'Provide a valid URL.' });

    const list = await readPending();
    if (list.some((p) => p.url === url)) {
      return res.status(200).json({ pending: list, duplicate: true });
    }
    const entry = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      url,
      addedAt: new Date().toISOString().slice(0, 10),
    };
    list.push(entry);
    try {
      await kv.set(KEY, list);
    } catch (e) {
      return res.status(500).json({ error: 'Storage unavailable.' });
    }
    return res.status(200).json({ pending: list, added: entry });
  }

  if (req.method === 'DELETE') {
    if (!checkPin(req)) return res.status(401).json({ error: 'Invalid PIN' });
    const id = (req.body && req.body.id) || req.query.id;
    if (!id) return res.status(400).json({ error: 'Provide an id.' });
    const list = (await readPending()).filter((p) => p.id !== id);
    try {
      await kv.set(KEY, list);
    } catch (e) {
      return res.status(500).json({ error: 'Storage unavailable.' });
    }
    return res.status(200).json({ pending: list });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
