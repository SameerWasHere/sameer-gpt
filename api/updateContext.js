// api/updateContext.js
// Reads (GET) and writes (POST) the chatbot context. /api/getContext is
// rewritten to this same function in vercel.json so the old GET URL keeps
// working — merging the two keeps us under the Hobby plan's 12-function cap.
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const context = await kv.get('sameer_context');
      return res.status(200).json({ context });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch context.' });
    }
  }

  if (req.method === 'POST') {
    const { context } = req.body || {};
    try {
      await kv.set('sameer_context', context);
      return res.status(200).json({ message: 'Context updated successfully.' });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update context.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
