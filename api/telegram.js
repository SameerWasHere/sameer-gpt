import { kv } from '@vercel/kv';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FORUM_CHAT_ID = '-1003840040892';

async function sendTelegram(chatId, text, threadId) {
  try {
    const body = { chat_id: chatId, text };
    if (threadId) body.message_thread_id = threadId;
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return data.result?.message_id || null;
  } catch (e) {
    console.error('Telegram send error:', e.message);
    return null;
  }
}

async function createTopic(sessionId) {
  try {
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
    const threadId = data.result?.message_thread_id;
    if (threadId) {
      await kv.set(`telegram:topic:${sessionId}`, threadId, { ex: 7200 });
      await kv.set(`telegram:topic_session:${threadId}`, sessionId, { ex: 7200 });
    }
    return threadId;
  } catch (e) {
    console.error('Create topic error:', e.message);
    return null;
  }
}

// Send a message in a session's topic. Creates topic if first message.
async function sendInTopic(sessionId, text) {
  let threadId = await kv.get(`telegram:topic:${sessionId}`);
  if (!threadId) {
    threadId = await createTopic(sessionId);
  }
  if (threadId) {
    await sendTelegram(FORUM_CHAT_ID, text, threadId);
  }
}

async function getSessions() {
  const sessions = await kv.get('telegram:active_sessions') || {};
  const cutoff = Date.now() - 3600000;
  for (const id of Object.keys(sessions)) {
    if (sessions[id] < cutoff) delete sessions[id];
  }
  return sessions;
}

async function getRecentSession() {
  const sessions = await getSessions();
  const entries = Object.entries(sessions);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

async function coachResponse(instruction, sessionId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const context = await kv.get('sameer_context') || 'Default context';
  const conversationMessages = await kv.get(`telegram:messages:${sessionId}`) || [];

  const fullMessages = [
    { role: 'system', content: context },
    ...conversationMessages,
    {
      role: 'system',
      content: `IMPORTANT — the real Sameer is secretly guiding this conversation. He's watching the chat and has advice for how you should respond to the user's latest message. Incorporate his guidance naturally into your response while staying completely in character. The user must not know Sameer is here — respond as if you came up with this yourself.\n\nSameer's coaching: "${instruction}"`,
    },
  ];

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
  return data.choices?.[0]?.message?.content || null;
}

async function generateAiResponse(sessionId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const context = await kv.get('sameer_context') || 'Default context';
  const conversationMessages = await kv.get(`telegram:messages:${sessionId}`) || [];
  const fullMessages = [
    { role: 'system', content: context },
    ...conversationMessages,
  ];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-4o', messages: fullMessages, max_tokens: 1000 }),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { message } = req.body || {};
  if (!message?.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim().replace(/@\w+/g, '');
  const messageThreadId = message.message_thread_id;

  // Only respond in the forum group or DM with owner
  const ownerId = await kv.get('telegram:owner_chat_id');
  const isForumGroup = String(chatId) === FORUM_CHAT_ID;
  const isOwnerDM = String(chatId) === String(ownerId);

  // /start in DM
  if (text === '/start' && !isForumGroup) {
    await kv.set('telegram:owner_chat_id', chatId.toString());
    await sendTelegram(chatId,
      'Connected to SameerGPT!\n\n' +
      'Session chats will appear as topics in your SameerUs group.\n\n' +
      'In each topic, just type to interact:\n' +
      '- Type a message = send directly to user\n' +
      '- /coach [advice] = AI responds with your guidance\n' +
      '- /in = intercept (AI stops, you respond)\n' +
      '- /out = hand back to AI'
    );
    return res.status(200).json({ ok: true });
  }

  if (!isForumGroup && !isOwnerDM) {
    return res.status(200).json({ ok: true });
  }

  // Messages in forum topics — find which session this topic belongs to
  if (isForumGroup && messageThreadId) {
    const sessionId = await kv.get(`telegram:topic_session:${messageThreadId}`);
    if (!sessionId) {
      return res.status(200).json({ ok: true });
    }

    const sid = String(sessionId);

    if (text === '/in') {
      await kv.set('telegram:tapped_in', sid);
      await kv.set('telegram:tap_mode', 'direct');
      await sendInTopic(sid, 'DIRECT mode. You ARE the AI.\nJust type your messages. /out to hand back.');
      return res.status(200).json({ ok: true });
    }

    if (text === '/coach') {
      await kv.set('telegram:tapped_in', sid);
      await kv.set('telegram:tap_mode', 'coach');
      await sendInTopic(sid, 'COACH mode. Tell the AI what to say.\n/out to hand back.');
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith('/coach ')) {
      const instruction = text.slice(7).trim();
      if (instruction) {
        await sendInTopic(sid, '(generating coached response...)');
        const aiResponse = await coachResponse(instruction, sid);
        if (aiResponse) {
          await kv.set(`telegram:response:${sid}`, aiResponse, { ex: 300 });
          await sendInTopic(sid, `Sent to user:\n\n${aiResponse}`);
        } else {
          await sendInTopic(sid, 'Failed to generate response.');
        }
        return res.status(200).json({ ok: true });
      }
    }

    if (text === '/out') {
      const tappedIn = await kv.get('telegram:tapped_in');
      if (tappedIn && String(tappedIn) === sid) {
        await kv.del('telegram:tapped_in');
        await kv.del('telegram:tap_mode');
        const pendingMsg = await kv.get(`telegram:pending:${sid}`);
        if (pendingMsg) {
          await sendInTopic(sid, 'You\'re OUT. AI is responding to the pending message.');
          const aiResponse = await generateAiResponse(sid);
          if (aiResponse) {
            await kv.set(`telegram:response:${sid}`, aiResponse, { ex: 300 });
            await kv.del(`telegram:pending:${sid}`);
          }
        } else {
          await sendInTopic(sid, 'You\'re OUT. AI is back in control.');
        }
      } else {
        await sendInTopic(sid, 'You\'re not tapped into this session.');
      }
      return res.status(200).json({ ok: true });
    }

    // Plain text — send to user
    if (text.startsWith('/')) {
      return res.status(200).json({ ok: true });
    }

    const tappedIn = await kv.get('telegram:tapped_in');
    const tapMode = await kv.get('telegram:tap_mode');

    if (tappedIn && String(tappedIn) === sid) {
      if (tapMode === 'coach') {
        await sendInTopic(sid, '(generating coached response...)');
        const aiResponse = await coachResponse(text, sid);
        if (aiResponse) {
          await kv.set(`telegram:response:${sid}`, aiResponse, { ex: 300 });
          await sendInTopic(sid, `Sent:\n\n${aiResponse}`);
        } else {
          await sendInTopic(sid, 'Failed to generate. Try again.');
        }
      } else {
        await kv.set(`telegram:response:${sid}`, text, { ex: 300 });
        await sendInTopic(sid, '(sent)');
      }
    } else {
      // Not tapped in — send as proactive push
      await kv.set(`telegram:response:${sid}`, text, { ex: 300 });
      await sendInTopic(sid, '(sent as push message)');
    }

    return res.status(200).json({ ok: true });
  }

  // DM commands (fallback)
  if (isOwnerDM) {
    if (text === '/sessions') {
      const sessions = await getSessions();
      const entries = Object.entries(sessions);
      if (entries.length === 0) {
        await sendTelegram(chatId, 'No active sessions.');
        return res.status(200).json({ ok: true });
      }
      entries.sort((a, b) => b[1] - a[1]);
      const lines = entries.map(([id, ts]) => {
        const ago = Math.round((Date.now() - ts) / 60000);
        return `[${id.slice(-4)}] — ${ago}m ago`;
      });
      const tappedIn = await kv.get('telegram:tapped_in');
      let status = `Active sessions:\n\n${lines.join('\n')}`;
      if (tappedIn) {
        const mode = await kv.get('telegram:tap_mode');
        status += `\n\nTapped into [${String(tappedIn).slice(-4)}] (${mode || 'direct'})`;
      }
      await sendTelegram(chatId, status);
      return res.status(200).json({ ok: true });
    }

    if (text === '/status') {
      const tappedIn = await kv.get('telegram:tapped_in');
      const tapMode = await kv.get('telegram:tap_mode');
      if (tappedIn) {
        await sendTelegram(chatId, `Tapped into [${String(tappedIn).slice(-4)}] (${tapMode === 'coach' ? 'COACH' : 'DIRECT'})`);
      } else {
        await sendTelegram(chatId, 'AI is handling all sessions.');
      }
      return res.status(200).json({ ok: true });
    }
  }

  return res.status(200).json({ ok: true });
}
