import { kv } from '@vercel/kv';

const ENTRIES_KEY = 'babypool:entries';
const ADMIN_PASSWORD = process.env.BABYPOOL_ADMIN_PASSWORD || 'babypool2026';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, id, password, updates } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  const entries = await kv.lrange(ENTRIES_KEY, 0, -1) || [];
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Entry not found.' });
  }

  if (action === 'togglePaid') {
    const updated = { ...entries[idx], paid: !entries[idx].paid };
    await kv.lset(ENTRIES_KEY, idx, updated);
    return res.json({ success: true });
  }

  if (action === 'update') {
    const updated = { ...entries[idx], ...updates };
    await kv.lset(ENTRIES_KEY, idx, updated);
    return res.json({ success: true });
  }

  if (action === 'delete') {
    await kv.lrem(ENTRIES_KEY, 1, entries[idx]);
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
