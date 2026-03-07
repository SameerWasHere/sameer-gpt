import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { password } = req.body;

  if (password !== process.env.REACT_APP_PASSWORD) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  try {
    await kv.del('conversations');
    await kv.del('conversation_log');
    res.status(200).json({ message: 'Conversation history cleared.' });
  } catch (error) {
    console.error('Error deleting conversations:', error.message);
    res.status(500).json({ error: 'Failed to delete conversations.' });
  }
}
