import { kv } from '@vercel/kv';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const FORUM_CHAT_ID = '-1003840040892';

const notifyTelegram = async (text, sessionId) => {
  try {
    if (!BOT_TOKEN) return;

    // Get or create forum topic for this session
    let threadId = sessionId ? await kv.get(`telegram:topic:${sessionId}`) : null;
    if (!threadId && sessionId) {
      // Create a new forum topic
      const label = String(sessionId).slice(-4);
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createForumTopic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: FORUM_CHAT_ID,
          name: `Chat ${label} — ${time}`,
        }),
      });
      const data = await resp.json();
      threadId = data.result?.message_thread_id;
      if (threadId) {
        await kv.set(`telegram:topic:${sessionId}`, threadId, { ex: 7200 });
        await kv.set(`telegram:topic_session:${threadId}`, sessionId, { ex: 7200 });
      }
    }

    const body = { chat_id: FORUM_CHAT_ID, text };
    if (threadId) body.message_thread_id = threadId;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('Telegram notify error:', e.message);
  }
};

const getContext = async () => {
  try {
    const context = await kv.get('sameer_context');
    return context || 'Default context if none is found';
  } catch (error) {
    console.error('Error fetching context from KV:', error);
    return 'Default context if none is found';
  }
};

const logConversation = async (conversationId, question, answer) => {
  try {
    // Try to get existing conversation
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { messages, stream, conversationId } = req.body;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(401).json({ error: 'OpenAI API key is missing.' });
        return;
      }

      const context = await getContext();

      // Track active sessions for Telegram tap-in
      const sessionLabel = conversationId ? conversationId.slice(-4) : '';
      if (conversationId) {
        try {
          const sessions = await kv.get('telegram:active_sessions') || {};
          sessions[conversationId] = Date.now();
          const cutoff = Date.now() - 3600000;
          for (const id of Object.keys(sessions)) {
            if (sessions[id] < cutoff) delete sessions[id];
          }
          await kv.set('telegram:active_sessions', sessions);
        } catch (e) {
          console.error('Session tracking error:', e.message);
        }
      }

      // Check if Sameer is tapped in for this session
      const tappedIn = await kv.get('telegram:tapped_in');
      if (tappedIn && String(tappedIn) === String(conversationId)) {
        const lastMsg = messages[messages.length - 1];
        await kv.set(`telegram:pending:${conversationId}`, lastMsg.content, { ex: 300 });
        // Save full conversation so coach mode has context
        await kv.set(`telegram:messages:${conversationId}`, messages, { ex: 3600 });
        await notifyTelegram(`User: ${lastMsg.content}`, conversationId);

        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.write(`data: ${JSON.stringify({ waitingForHuman: true })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.status(200).json({ waitingForHuman: true });
        }
        return;
      }

      // Build messages with system context
      const isFirstMessage = messages.length === 1;
      const fullMessages = [
        { role: 'system', content: context },
      ];
      if (isFirstMessage) {
        fullMessages.push({
          role: 'system',
          content: 'This is the first message from someone new. Before diving into their question, casually ask who they are — like you got a text from an unknown number. Keep it friendly and natural, like "Hey! Who\'s this?" Then briefly address what they asked.',
        });
      }
      fullMessages.push(...messages);

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: fullMessages,
            max_tokens: 1000,
            stream: true,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          res.status(response.status).end(error);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line === 'data: [DONE]') {
              const lastUserMsg = messages[messages.length - 1];
              if (lastUserMsg && fullContent && conversationId) {
                await logConversation(conversationId, lastUserMsg.content, fullContent);
              }
              // Notify Telegram (must await or Vercel kills the process)
              if (lastUserMsg && fullContent) {
                await notifyTelegram(`User: ${lastUserMsg.content}\n\nAI: ${fullContent}`, conversationId);
              }
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices[0]?.delta?.content;
                if (content) {
                  fullContent += content;
                  res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
              } catch (e) {
                // Skip malformed chunks
              }
            }
          }
        }

        res.end();
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: fullMessages,
            max_tokens: 1000,
          }),
        });

        const data = await response.json();

        const lastUserMsg = messages[messages.length - 1];
        const assistantMsg = data.choices?.[0]?.message;
        if (lastUserMsg && assistantMsg && conversationId) {
          await logConversation(conversationId, lastUserMsg.content, assistantMsg.content);
        }
        // Notify Telegram (must await or Vercel kills the process)
        if (lastUserMsg && assistantMsg) {
          await notifyTelegram(`User: ${lastUserMsg.content}\n\nAI: ${assistantMsg.content}`, conversationId);
        }

        res.status(200).json(data);
      }
    } catch (error) {
      console.error('Error details:', error.message);
      res.status(500).json({
        error: 'Server Error',
        message: error.message,
      });
    }
  } else {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
