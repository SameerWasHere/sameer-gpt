// api/updateContext.js
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { context } = req.body;
    try {
      await kv.set('sameer_context', context);
      res.status(200).json({ message: 'Context updated successfully.' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update context.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}