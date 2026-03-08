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
  const text = message.text.trim();

  // Register owner on /start
  if (text === '/start') {
    await kv.set('telegram:owner_chat_id', chatId.toString());
    await sendTelegram(chatId,
      'Connected to SameerGPT!\n\n' +
      'You\'ll get notified when someone chats on sameer.us.\n\n' +
      'Commands:\n' +
      '/in - Take over (you ARE the AI)\n' +
      '/coach - Coach mode (you instruct, AI writes)\n' +
      '/out - Hand back to AI\n' +
      '/status - Check current state'
    );
    return res.status(200).json({ ok: true });
  }

  // Only owner can use commands
  const ownerId = await kv.get('telegram:owner_chat_id');
  if (chatId.toString() !== ownerId) {
    return res.status(200).json({ ok: true });
  }

  if (text === '/in') {
    const activeSession = await kv.get('telegram:active_session');
    if (!activeSession) {
      await sendTelegram(chatId, 'No active session right now.');
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', activeSession);
    await kv.set('telegram:tap_mode', 'direct');
    await sendTelegram(chatId, 'DIRECT mode. You ARE the AI — your messages go straight to the user.\n\nType /out when done.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/coach') {
    const activeSession = await kv.get('telegram:active_session');
    if (!activeSession) {
      await sendTelegram(chatId, 'No active session right now.');
      return res.status(200).json({ ok: true });
    }
    await kv.set('telegram:tapped_in', activeSession);
    await kv.set('telegram:tap_mode', 'coach');
    await sendTelegram(chatId, 'COACH mode. Tell the AI how to respond — it\'ll write the message.\n\nType /out when done.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/out') {
    const was = await kv.get('telegram:tapped_in');
    await kv.del('telegram:tapped_in');
    await kv.del('telegram:tap_mode');
    if (was) {
      await sendTelegram(chatId, 'You\'re OUT. AI is back in control.');
    } else {
      await sendTelegram(chatId, 'You weren\'t tapped in.');
    }
    return res.status(200).json({ ok: true });
  }

  if (text === '/status') {
    const activeSession = await kv.get('telegram:active_session');
    const tappedIn = await kv.get('telegram:tapped_in');
    const tapMode = await kv.get('telegram:tap_mode');
    const parts = [];
    if (tappedIn) {
      parts.push(`Mode: TAPPED IN (${tapMode === 'coach' ? 'COACH — you instruct AI' : 'DIRECT — you are the AI'})`);
    } else {
      parts.push('Mode: AI is handling it');
    }
    parts.push(activeSession ? `Active session: ...${activeSession.slice(-6)}` : 'No active sessions');
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
    // Coach mode: send instruction to AI, get response
    await sendTelegram(chatId, '(thinking...)');
    const aiResponse = await coachResponse(text, tappedIn);
    if (aiResponse) {
      await kv.set(`telegram:response:${tappedIn}`, aiResponse, { ex: 300 });
      await sendTelegram(chatId, `AI wrote:\n\n${aiResponse}`);
    } else {
      await sendTelegram(chatId, 'Failed to generate response. Try again.');
    }
  } else {
    // Direct mode: send message as-is
    await kv.set(`telegram:response:${tappedIn}`, text, { ex: 300 });
    await sendTelegram(chatId, '(sent)');
  }

  return res.status(200).json({ ok: true });
}
