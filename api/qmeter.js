// Q Meter state — how unhinged Q is right now, shared across everyone.
//
// GET  -> { level }            current level 1-10 (defaults if unset)
// POST -> { level }            set the level; requires the projects PIN in the
//                              'x-claude-pin' header (hashed + compared server-side)
//
// Stored in the same Vercel KV the chatbot uses, under the key 'qmeter_level'.
import { kv } from '@vercel/kv';
import crypto from 'node:crypto';

const KEY = 'qmeter_level';
const DEFAULT_LEVEL = 8;
const MIN = 1;
const MAX = 10; // 10 = "Off the Charts"

const EXPECTED_PIN_HASH =
  process.env.CLAUDE_PIN_HASH ||
  'ad5ef4b29e148afd784de5373b210eb00879dfbf08922c96dc6ce4fc1e064fd9'; // sha256('1495')

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const clampLevel = (n) => Math.min(MAX, Math.max(MIN, Math.round(Number(n))));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let level = DEFAULT_LEVEL;
    try {
      const v = await kv.get(KEY);
      if (v != null && !isNaN(Number(v))) level = clampLevel(v);
    } catch (e) {
      // KV unavailable -> fall back to default so the page still reads something
    }
    return res.status(200).json({ level });
  }

  if (req.method === 'POST') {
    const pin = req.headers['x-claude-pin'];
    if (!pin || sha256(pin) !== EXPECTED_PIN_HASH) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    const { level } = req.body || {};
    if (level == null || isNaN(Number(level))) {
      return res.status(400).json({ error: 'Provide a numeric level (1-10).' });
    }
    const lvl = clampLevel(level);
    try {
      await kv.set(KEY, lvl);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to save level.' });
    }
    return res.status(200).json({ ok: true, level: lvl });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
