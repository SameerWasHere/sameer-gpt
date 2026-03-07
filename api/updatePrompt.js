import axios from 'axios';
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

  const { password, instruction } = req.body;

  // Verify password
  if (password !== process.env.REACT_APP_PASSWORD) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  if (!instruction || instruction.trim() === '') {
    res.status(400).json({ error: 'No instruction provided.' });
    return;
  }

  try {
    // Fetch current prompt from KV
    const currentPrompt = await kv.get('sameer_context');
    if (!currentPrompt) {
      res.status(500).json({ error: 'Could not fetch current prompt.' });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'OpenAI API key is missing.' });
      return;
    }

    // Use GPT-4o-mini to update the prompt
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a prompt editor. You will receive a current prompt/context document and an instruction from the user about what to change. Your job is to return the FULL updated prompt with the changes applied. Rules:
- Keep the same tone, structure, and formatting as the original
- Only modify what the instruction asks for
- If adding new info, place it in the most logical section
- If removing info, cleanly remove it without leaving gaps
- Return ONLY the updated prompt text, nothing else — no explanations, no markdown code blocks, no "here's the updated version"
- Preserve all existing content that isn't being changed`
          },
          {
            role: 'user',
            content: `CURRENT PROMPT:\n\n${currentPrompt}\n\n---\n\nINSTRUCTION: ${instruction}`
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 25000,
      }
    );

    const updatedPrompt = response.data.choices[0].message.content;

    // Save updated prompt to KV
    await kv.set('sameer_context', updatedPrompt);

    res.status(200).json({
      message: 'Prompt updated successfully!',
      instruction: instruction,
    });
  } catch (error) {
    console.error('Error updating prompt:', error.message);
    res.status(500).json({
      error: 'Failed to update prompt.',
      details: error.message,
    });
  }
}
