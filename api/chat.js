import { kv } from '@vercel/kv';

const getContext = async () => {
  try {
    const context = await kv.get('sameer_context');
    return context || 'Default context if none is found';
  } catch (error) {
    console.error('Error fetching context from KV:', error);
    return 'Default context if none is found';
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
      const { messages, stream } = req.body;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(401).json({ error: 'OpenAI API key is missing.' });
        return;
      }

      const context = await getContext();
      const fullMessages = [
        { role: 'system', content: context },
        ...messages,
      ];

      if (stream) {
        // Streaming response
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
              // Log the conversation
              const lastUserMsg = messages[messages.length - 1];
              if (lastUserMsg && fullContent) {
                try {
                  await kv.lpush('conversation_log', JSON.stringify({
                    question: lastUserMsg.content,
                    answer: fullContent,
                    timestamp: new Date().toISOString(),
                  }));
                } catch (logErr) {
                  console.error('Failed to log conversation:', logErr.message);
                }
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
        // Non-streaming fallback
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

        // Log the conversation
        const lastUserMsg = messages[messages.length - 1];
        const assistantMsg = data.choices?.[0]?.message;
        if (lastUserMsg && assistantMsg) {
          try {
            await kv.lpush('conversation_log', JSON.stringify({
              question: lastUserMsg.content,
              answer: assistantMsg.content,
              timestamp: new Date().toISOString(),
            }));
          } catch (logErr) {
            console.error('Failed to log conversation:', logErr.message);
          }
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
