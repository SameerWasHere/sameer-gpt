import axios from 'axios';
import { kv } from '@vercel/kv'; // Import Vercel KV

// Function to get the context from Vercel KV
const getContext = async () => {
  try {
    // Fetch the context stored under the key 'sameer_context'
    const context = await kv.get('sameer_context');
    return context || 'Default context if none is found'; // Fallback if context is not found
  } catch (error) {
    console.error('Error fetching context from KV:', error);
    return 'Default context if none is found'; // Handle error gracefully
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
      const { messages } = req.body;

      // Check if API key is present
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error('OpenAI API key is missing.');
        res.status(401).json({ error: 'OpenAI API key is missing.' });
        return;
      }

      // Fetch context from KV
      const context = await getContext();

      // Append context as the first system message
      const fullMessages = [
        {
          role: 'system',
          content: context,
        },
        ...messages,
      ];

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: fullMessages, // Use fullMessages with the fetched context
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      res.status(200).json(response.data);
    } catch (error) {
      console.error('Error details:', {
        message: error.message,
        response: error.response ? error.response.data : null,
        status: error.response ? error.response.status : null,
      });

      // Forward the error response from OpenAI to the client
      res.status(error.response ? error.response.status : 500).json({
        error: 'Server Error',
        message: error.message,
        details: error.response ? error.response.data : null,
      });
    }
  } else {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 