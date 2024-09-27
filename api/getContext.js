// api/getContext.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  try {
    const context = await kv.get('sameer_context');
    res.status(200).json({ context });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch context.' });
  }
}