import { kv } from '@vercel/kv';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) {
    console.error('Telegram send error:', e.message);
  }
}

async function getSessions() {
  // Returns { sessionId: timestamp, ... } sorted by most recent
  const sessions = await kv.get('telegram:active_sessions') || {};
  // Clean out old ones (1 hour)
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
  // Sort by timestamp descending, return most recent
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

async function findSessionByLabel(label) {
  const sessions = await getSessions();
  return Object.keys(sessions).find(id => id.endsWith(label)) || null;
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
      content: `The real Sameer is secretly coaching you. Follow this instruction for your next response. Stay in character — the user doesn't know Sameer is here. Instruction: ${instruction}`,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { message } = req.body || {};
  if (!message?.text) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  // Strip @botname suffix that Telegram sometimes appends to commands
  const text = message.text.trim().replace(/@\w+/g, '');

  // Register owner on /start
  if (text === '/start') {
    await kv.set('telegram:owner_chat_id', chatId.toString());
    await sendTelegram(chatId,
      'Connected to SameerGPT!\n\n' +
      'You\'ll get notified when someone chats on sameer.us.\n\n' +
      'Commands:\n' +
      '/in - Take over most recent session (you ARE the AI)\n' +
      '/in XXXX - Take over session by ID\n' +
      '/coach - Coach most recent session (you instruct, AI writes)\n' +
      '/coach XXXX - Coach a specific session\n' +
      '/out - Hand back to AI\n' +
      '/sessions - See active sessions\n' +
      '/status - Check current state'
    );
    return res.status(200).json({ ok: true });
  }

  // Only owner can use commands
  const ownerId = await kv.get('telegram:owner_chat_id');
  if (String(chatId) !== String(ownerId)) {
    return res.status(200).json({ ok: true });
  }

  // /in or /in XXXX
  if (text === '/in' || text.startsWith('/in ')) {
    const label = text.slice(3).trim();
    const session = label ? await findSessionByLabel(label) : await getRecentSession();
    if (!session) {
      const allSessions = await getSessions();
      const count = Object.keys(allSessions).length;
      const debugMsg = label
        ? `No session matching "${label}". Active sessions: ${count}`
        : `No active sessions found. (${count} tracked)`;
      await sendTelegram(chatId, debugMsg);
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', session);
    await kv.set('telegram:tap_mode', 'direct');
    await sendTelegram(chatId, `DIRECT mode [${session.slice(-4)}]. You ARE the AI.\n\nJust type a message and it'll appear on their screen. Type /out when done.`);
    return res.status(200).json({ ok: true });
  }

  // /coach or /coach XXXX
  if (text === '/coach' || text.startsWith('/coach ')) {
    const label = text.slice(6).trim();
    const session = label ? await findSessionByLabel(label) : await getRecentSession();
    if (!session) {
      const allSessions = await getSessions();
      const count = Object.keys(allSessions).length;
      const debugMsg = label
        ? `No session matching "${label}". Active sessions: ${count}`
        : `No active sessions found. (${count} tracked)`;
      await sendTelegram(chatId, debugMsg);
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', session);
    await kv.set('telegram:tap_mode', 'coach');
    await sendTelegram(chatId, `COACH mode [${session.slice(-4)}]. Tell the AI what to say and it\'ll write it.\n\nType /out when done.`);
    return res.status(200).json({ ok: true });
  }

  if (text === '/out') {
    const was = await kv.get('telegram:tapped_in');
    await kv.del('telegram:tapped_in');
    await kv.del('telegram:tap_mode');
    if (was) {
      // Check if the user sent a message that hasn't been answered
      const pendingMsg = await kv.get(`telegram:pending:${was}`);
      if (pendingMsg) {
        await sendTelegram(chatId, 'You\'re OUT. User has an unanswered message — AI is responding now.');
        // Generate AI response for the pending message
        const apiKey = process.env.OPENAI_API_KEY;
        const context = await kv.get('sameer_context') || 'Default context';
        const conversationMessages = await kv.get(`telegram:messages:${was}`) || [];
        const fullMessages = [
          { role: 'system', content: context },
          ...conversationMessages,
        ];
        const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
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
        const data = await aiResp.json();
        const aiResponse = data.choices?.[0]?.message?.content;
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
      status += `\n\nCurrently tapped into [${tappedIn.slice(-4)}] (${mode || 'direct'})`;
    }
    await sendTelegram(chatId, status);
    return res.status(200).json({ ok: true });
  }

  if (text === '/status') {
    const tappedIn = await kv.get('telegram:tapped_in');
    const tapMode = await kv.get('telegram:tap_mode');
    const parts = [];
    if (tappedIn) {
      parts.push(`Mode: TAPPED IN to [${tappedIn.slice(-4)}] (${tapMode === 'coach' ? 'COACH' : 'DIRECT'})`);
    } else {
      parts.push('Mode: AI is handling it');
    }
    await sendTelegram(chatId, parts.join('\n'));
    return res.status(200).json({ ok: true });
  }

  // Regular message = response to user (if tapped in)
  const tappedIn = await kv.get('telegram:tapped_in');
  if (!tappedIn) {
    await sendTelegram(chatId, 'You\'re not tapped in. Use /in or /coach first.');
    return res.status(200).json({ ok: true });
  }

  const tapMode = await kv.get('telegram:tap_mode');

  if (tapMode === 'coach') {
    await sendTelegram(chatId, '(thinking...)');
    const aiResponse = await coachResponse(text, tappedIn);
    if (aiResponse) {
      await kv.set(`telegram:response:${tappedIn}`, aiResponse, { ex: 300 });
      await sendTelegram(chatId, `AI wrote:\n\n${aiResponse}`);
    } else {
      await sendTelegram(chatId, 'Failed to generate response. Try again.');
    }
  } else {
    await kv.set(`telegram:response:${tappedIn}`, text, { ex: 300 });
    await sendTelegram(chatId, '(sent)');
  }

  return res.status(200).json({ ok: true });
}
