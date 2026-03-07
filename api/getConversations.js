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
    const allConvos = await kv.hgetall('conversations');

    if (!allConvos || Object.keys(allConvos).length === 0) {
      return res.status(200).json({ count: 0, conversations: [] });
    }

    const conversations = Object.values(allConvos)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

    res.status(200).json({
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    console.error('Error fetching conversations:', error.message);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
}
