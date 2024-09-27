import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chat.css';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const chatWindowRef = useRef(null); // Reference to the chat window
  const lastMessageRef = useRef(null); // Reference to the last message

  const sendMessage = async () => {
    if (input.trim() === '') return;

    const newMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput('');

    try {
      // Send only the updated messages to the backend
      const response = await axios.post('/api/chat', {
        messages: updatedMessages,
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const assistantMessage = response.data.choices[0].message;
        setMessages([...updatedMessages, assistantMessage]);
      } else {
        alert('Received an unexpected response from the server.');
      }
    } catch (error) {
      alert('An error occurred while fetching the response.');
    }
  };

  // Add an initial message when the component mounts with a 2-second delay
  useEffect(() => {
    const initialMessage = {
      role: 'assistant',
      content:
        'Hello! I am SameerGPT, ask me anything about Sameer Bhutani to learn about his professional experience, get contact info, and more!',
    };

    const timer = setTimeout(() => {
      setMessages([initialMessage]);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Auto-scroll to the latest message when messages update
  useEffect(() => {
    if (messages.length > 1 && lastMessageRef.current) {
      // Scroll the last message into view
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Add extra scroll to make sure the message is fully visible
      setTimeout(() => {
        if (chatWindowRef.current) {
          chatWindowRef.current.scrollTop += 50; // Adjust this value if needed
        }
      }, 200);
    }
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${msg.role}`}
            ref={index === messages.length - 1 ? lastMessageRef : null} // Reference the last message
          >
            {msg.content}
          </div>
        ))}
      </div>
      <div className="input-area">
        <input
          type="text"
          placeholder="Ask SameerGPT..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') sendMessage();
          }}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;