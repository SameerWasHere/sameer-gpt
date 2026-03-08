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
      '/in - Take over the conversation\n' +
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
    await sendTelegram(chatId, 'You\'re IN. Your messages will go directly to the user.\n\nType /out when done.');
    return res.status(200).json({ ok: true });
  }

  if (text === '/out') {
    const was = await kv.get('telegram:tapped_in');
    await kv.del('telegram:tapped_in');
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
    const parts = [];
    parts.push(tappedIn ? 'Mode: TAPPED IN (you\'re responding)' : 'Mode: AI is handling it');
    parts.push(activeSession ? `Active session: ...${activeSession.slice(-6)}` : 'No active sessions');
    await sendTelegram(chatId, parts.join('\n'));
    return res.status(200).json({ ok: true });
  }

  // Regular message = response to user (if tapped in)
  const tappedIn = await kv.get('telegram:tapped_in');
  if (tappedIn) {
    await kv.set(`telegram:response:${tappedIn}`, text, { ex: 300 });
    await sendTelegram(chatId, '(sent)');
  } else {
    await sendTelegram(chatId, 'You\'re not tapped in. Use /in first to take over.');
  }

  return res.status(200).json({ ok: true });
}
