import { kv } from '@vercel/kv';

const logConversation = async (conversationId, question, answer) => {
  try {
    const existing = await kv.hget('conversations', conversationId);
    const convo = existing || { exchanges: [], startedAt: new Date().toISOString() };
    convo.exchanges.push({ question, answer, timestamp: new Date().toISOString() });
    convo.lastUpdated = new Date().toISOString();
    await kv.hset('conversations', { [conversationId]: convo });
  } catch (err) {
    console.error('Failed to log conversation:', err.message);
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { conversationId } = req.query;
  if (!conversationId) return res.status(400).json({ error: 'Missing conversationId' });

  const response = await kv.get(`telegram:response:${conversationId}`);
  if (response) {
    await kv.del(`telegram:response:${conversationId}`);

    // Log the conversation
    const pendingMsg = await kv.get(`telegram:pending:${conversationId}`);
    if (pendingMsg) {
      await logConversation(conversationId, pendingMsg, response);
      await kv.del(`telegram:pending:${conversationId}`);
    }

    return res.status(200).json({ response });
  }

  return res.status(200).json({ waiting: true });
}
