import { kv } from '@vercel/kv';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(chatId, text, replyToMessageId) {
  try {
    const body = { chat_id: chatId, text };
    if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
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

// Send a message in a session's thread. Creates anchor if first message.
async function sendInThread(chatId, sessionId, text) {
  const threadKey = `telegram:thread:${sessionId}`;
  let anchorId = await kv.get(threadKey);

  if (!anchorId) {
    // First message for this session — create anchor
    const label = String(sessionId).slice(-4);
    anchorId = await sendTelegram(chatId, `--- New chat [${label}] ---`);
    if (anchorId) {
      await kv.set(threadKey, anchorId, { ex: 7200 });
      await kv.set(`telegram:msg_session:${anchorId}`, sessionId, { ex: 7200 });
    }
  }

  // Send as reply to anchor
  const msgId = await sendTelegram(chatId, text, anchorId);
  if (msgId) {
    await kv.set(`telegram:msg_session:${msgId}`, sessionId, { ex: 7200 });
  }
  return msgId;
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

// Find session from a replied-to message
async function getSessionFromReply(message) {
  const replyMsgId = message.reply_to_message?.message_id;
  if (!replyMsgId) return null;
  const sessionId = await kv.get(`telegram:msg_session:${replyMsgId}`);
  return sessionId ? String(sessionId) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { message } = req.body || {};
  if (!message?.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = message.text.trim().replace(/@\w+/g, '');

  // Register owner on /start
  if (text === '/start') {
    await kv.set('telegram:owner_chat_id', chatId.toString());
    await sendTelegram(chatId,
      'Connected to SameerGPT!\n\n' +
      'Each chat session gets its own thread.\n\n' +
      'Reply to any thread to interact:\n' +
      '- Reply with text = send directly to user\n' +
      '- Reply /coach [advice] = AI responds with your guidance\n' +
      '- Reply /in = intercept (AI stops, you respond)\n' +
      '- Reply /out = hand back to AI\n\n' +
      'Or use without reply:\n' +
      '/in, /out, /sessions, /status'
    );
    return res.status(200).json({ ok: true });
  }

  const ownerId = await kv.get('telegram:owner_chat_id');
  if (String(chatId) !== String(ownerId)) {
    return res.status(200).json({ ok: true });
  }

  // Check if this is a reply to a session thread
  const replySessionId = await getSessionFromReply(message);

  // --- Reply-based commands (session-aware) ---

  if (replySessionId) {
    // Reply /in to a thread → tap into that session
    if (text === '/in') {
      await kv.set('telegram:tapped_in', replySessionId);
      await kv.set('telegram:tap_mode', 'direct');
      await sendInThread(chatId, replySessionId, `DIRECT mode. You ARE the AI for this chat.\nType /out to hand back.`);
      return res.status(200).json({ ok: true });
    }

    // Reply /coach to a thread → coach mode for that session
    if (text === '/coach') {
      await kv.set('telegram:tapped_in', replySessionId);
      await kv.set('telegram:tap_mode', 'coach');
      await sendInThread(chatId, replySessionId, `COACH mode. Tell the AI what to say.\nType /out to hand back.`);
      return res.status(200).json({ ok: true });
    }

    // Reply /coach [instruction] → one-off coach response without tapping in
    if (text.startsWith('/coach ')) {
      const instruction = text.slice(7).trim();
      if (instruction) {
        await sendInThread(chatId, replySessionId, '(generating coached response...)');
        const aiResponse = await coachResponse(instruction, replySessionId);
        if (aiResponse) {
          await kv.set(`telegram:response:${replySessionId}`, aiResponse, { ex: 300 });
          await sendInThread(chatId, replySessionId, `Sent to user:\n\n${aiResponse}`);
        } else {
          await sendInThread(chatId, replySessionId, 'Failed to generate response.');
        }
        return res.status(200).json({ ok: true });
      }
    }

    // Reply /out → release that session
    if (text === '/out') {
      const tappedIn = await kv.get('telegram:tapped_in');
      if (tappedIn && String(tappedIn) === String(replySessionId)) {
        await kv.del('telegram:tapped_in');
        await kv.del('telegram:tap_mode');
        // Check for unanswered message
        const pendingMsg = await kv.get(`telegram:pending:${replySessionId}`);
        if (pendingMsg) {
          await sendInThread(chatId, replySessionId, 'You\'re OUT. AI is responding to the pending message.');
          const aiResponse = await generateAiResponse(replySessionId);
          if (aiResponse) {
            await kv.set(`telegram:response:${replySessionId}`, aiResponse, { ex: 300 });
            await kv.del(`telegram:pending:${replySessionId}`);
          }
        } else {
          await sendInThread(chatId, replySessionId, 'You\'re OUT. AI is back in control.');
        }
      } else {
        await sendInThread(chatId, replySessionId, 'You weren\'t tapped into this session.');
      }
      return res.status(200).json({ ok: true });
    }

    // Reply with plain text → send to user
    const tappedIn = await kv.get('telegram:tapped_in');
    const tapMode = await kv.get('telegram:tap_mode');

    // If tapped into THIS session, send response
    if (tappedIn && String(tappedIn) === String(replySessionId)) {
      if (tapMode === 'coach') {
        await sendInThread(chatId, replySessionId, '(generating coached response...)');
        const aiResponse = await coachResponse(text, replySessionId);
        if (aiResponse) {
          await kv.set(`telegram:response:${replySessionId}`, aiResponse, { ex: 300 });
          await sendInThread(chatId, replySessionId, `Sent:\n\n${aiResponse}`);
        } else {
          await sendInThread(chatId, replySessionId, 'Failed to generate. Try again.');
        }
      } else {
        await kv.set(`telegram:response:${replySessionId}`, text, { ex: 300 });
        await sendInThread(chatId, replySessionId, '(sent)');
      }
    } else {
      // Not tapped in — send as proactive push
      await kv.set(`telegram:response:${replySessionId}`, text, { ex: 300 });
      await sendInThread(chatId, replySessionId, '(sent as push message)');
    }
    return res.status(200).json({ ok: true });
  }

  // --- Non-reply commands (global) ---

  if (text === '/in' || text.startsWith('/in ')) {
    const label = text.slice(3).trim();
    const session = label ? null : await getRecentSession();
    const targetSession = label
      ? Object.keys(await getSessions()).find(id => id.endsWith(label)) || null
      : session;
    if (!targetSession) {
      await sendTelegram(chatId, label ? `No session matching "${label}".` : 'No active sessions.');
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', targetSession);
    await kv.set('telegram:tap_mode', 'direct');
    await sendInThread(chatId, targetSession, 'DIRECT mode. You ARE the AI.\nReply to this thread to respond. Type /out to hand back.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/coach' || text.startsWith('/coach ')) {
    const label = text.slice(6).trim();
    const session = label ? null : await getRecentSession();
    const targetSession = label
      ? Object.keys(await getSessions()).find(id => id.endsWith(label)) || null
      : session;
    if (!targetSession) {
      await sendTelegram(chatId, label ? `No session matching "${label}".` : 'No active sessions.');
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', targetSession);
    await kv.set('telegram:tap_mode', 'coach');
    await sendInThread(chatId, targetSession, 'COACH mode. Tell the AI what to say.\nReply to this thread. Type /out to hand back.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/out') {
    const was = await kv.get('telegram:tapped_in');
    await kv.del('telegram:tapped_in');
    await kv.del('telegram:tap_mode');
    if (was) {
      const pendingMsg = await kv.get(`telegram:pending:${was}`);
      if (pendingMsg) {
        await sendInThread(chatId, was, 'You\'re OUT. AI is responding to the pending message.');
        const aiResponse = await generateAiResponse(was);
        if (aiResponse) {
          await kv.set(`telegram:response:${was}`, aiResponse, { ex: 300 });
          await kv.del(`telegram:pending:${was}`);
        }
      } else {
        await sendTelegram(chatId, 'You\'re OUT. AI is back in control.');
      }
    } else {
      await sendTelegram(chatId, 'You weren\'t tapped in.');
    }
    return res.status(200).json({ ok: true });
  }

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

  // Unrecognized message and not a reply
  const tappedIn = await kv.get('telegram:tapped_in');
  if (tappedIn) {
    const tapMode = await kv.get('telegram:tap_mode');
    if (tapMode === 'coach') {
      await sendInThread(chatId, String(tappedIn), '(generating coached response...)');
      const aiResponse = await coachResponse(text, String(tappedIn));
      if (aiResponse) {
        await kv.set(`telegram:response:${tappedIn}`, aiResponse, { ex: 300 });
        await sendInThread(chatId, String(tappedIn), `Sent:\n\n${aiResponse}`);
      } else {
        await sendInThread(chatId, String(tappedIn), 'Failed to generate. Try again.');
      }
    } else {
      await kv.set(`telegram:response:${tappedIn}`, text, { ex: 300 });
      await sendInThread(chatId, String(tappedIn), '(sent)');
    }
  } else {
    await sendTelegram(chatId, 'No active session. Reply to a thread or use /in first.');
  }

  return res.status(200).json({ ok: true });
}
