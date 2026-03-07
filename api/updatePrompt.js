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

  if (password !== process.env.REACT_APP_PASSWORD) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  if (!instruction || instruction.trim() === '') {
    res.status(400).json({ error: 'No instruction provided.' });
    return;
  }

  try {
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

    // Ask GPT to return a JSON edit operation instead of the full prompt
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You edit a prompt document. Given the current prompt and an instruction, return a JSON object with the edit to apply. Use one of these formats:

For replacing text: {"action":"replace","find":"exact text to find","replace":"new text"}
For appending to a section: {"action":"append","after":"exact line to insert after","text":"new text to add"}
For removing text: {"action":"replace","find":"exact text to remove","replace":""}

Rules:
- The "find" value must be an EXACT substring from the current prompt
- Keep the same casual tone as the existing prompt
- Return ONLY the JSON object, nothing else
- For multi-line edits, use \\n for newlines`
          },
          {
            role: 'user',
            content: `CURRENT PROMPT:\n\n${currentPrompt}\n\n---\n\nINSTRUCTION: ${instruction}`
          }
        ],
        temperature: 0.2,
        max_tokens: 500,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 20000,
      }
    );

    const gptResponse = response.data.choices[0].message.content.trim();

    // Parse the JSON edit operation
    let edit;
    try {
      // Strip markdown code blocks if GPT wraps it
      const cleaned = gptResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      edit = JSON.parse(cleaned);
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse edit instruction from AI.' });
      return;
    }

    let updatedPrompt = currentPrompt;

    if (edit.action === 'replace' && edit.find) {
      if (updatedPrompt.includes(edit.find)) {
        updatedPrompt = updatedPrompt.replace(edit.find, edit.replace || '');
      } else {
        res.status(500).json({ error: 'Could not find the text to edit. Try rephrasing your update.' });
        return;
      }
    } else if (edit.action === 'append' && edit.after && edit.text) {
      if (updatedPrompt.includes(edit.after)) {
        updatedPrompt = updatedPrompt.replace(edit.after, edit.after + '\n' + edit.text);
      } else {
        // Fallback: append to the end
        updatedPrompt = updatedPrompt + '\n' + edit.text;
      }
    } else {
      res.status(500).json({ error: 'Invalid edit format from AI. Try rephrasing.' });
      return;
    }

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
