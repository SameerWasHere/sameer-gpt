import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './Chat.css';

const EXAMPLE_QUESTIONS = [
  "What does Sameer do for work?",
  "Where did Sameer go to school?",
  "What are Sameer's hobbies?",
  "Tell me about the PowerPod Case",
  "What's Sameer's favorite movie?",
  "What sports teams does Sameer follow?",
  "What's Sameer's go-to food order?",
  "Does Sameer have any hidden talents?",
];

const PRESET_QUESTIONS = [
  "What do you do for work?",
  "Tell me something fun about yourself",
  "What are your hobbies?",
  "Where did you go to school?",
  "What's your favorite restaurant?",
  "Tell me about a project you're proud of",
];

function Chat({ onEditRequest }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [placeholderText, setPlaceholderText] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  // Update flow state
  const [updateMode, setUpdateMode] = useState(null); // null | 'password' | 'instruction' | 'updating'
  const [updatePassword, setUpdatePassword] = useState('');
  const chatWindowRef = useRef(null);
  const lastMessageRef = useRef(null);
  const inputRef = useRef(null);

  // Typing animation for placeholder
  useEffect(() => {
    let questionIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeout;

    const type = () => {
      const currentQuestion = EXAMPLE_QUESTIONS[questionIndex];

      if (!isDeleting) {
        setPlaceholderText(currentQuestion.substring(0, charIndex + 1));
        charIndex++;
        if (charIndex === currentQuestion.length) {
          isDeleting = true;
          timeout = setTimeout(type, 1500);
          return;
        }
        timeout = setTimeout(type, 50);
      } else {
        setPlaceholderText(currentQuestion.substring(0, charIndex - 1));
        charIndex--;
        if (charIndex === 0) {
          isDeleting = false;
          questionIndex = (questionIndex + 1) % EXAMPLE_QUESTIONS.length;
          timeout = setTimeout(type, 300);
          return;
        }
        timeout = setTimeout(type, 30);
      }
    };

    timeout = setTimeout(type, 1000);
    return () => clearTimeout(timeout);
  }, []);

  const addSystemMessage = (content) => {
    setMessages(prev => [...prev, { role: 'system-display', content }]);
  };

  const handleUpdatePassword = async () => {
    if (!updatePassword.trim()) return;
    // We'll verify the password server-side, but store it for the next step
    setUpdateMode('instruction');
    addSystemMessage("Password accepted. What would you like to update? (e.g., \"Add that I just got a dog named Bruno\" or \"Change my favorite restaurant to Nobu\")");
    setUpdatePassword(updatePassword);
    setInput('');
  };

  const handleUpdateInstruction = async (instruction) => {
    setUpdateMode('updating');
    addSystemMessage("Updating your prompt...");
    setInput('');

    try {
      const response = await axios.post('/api/updatePrompt', {
        password: updatePassword,
        instruction: instruction,
      });

      if (response.data.message) {
        addSystemMessage(`Done! I've updated your prompt: "${instruction}"`);
      }
    } catch (error) {
      if (error.response && error.response.status === 401) {
        addSystemMessage("Wrong password. Update cancelled.");
      } else {
        addSystemMessage("Something went wrong updating the prompt. Try again.");
      }
    } finally {
      setUpdateMode(null);
      setUpdatePassword('');
    }
  };

  const sendMessage = async (text) => {
    const messageText = text || input;
    if (messageText.trim() === '') return;

    // Secret commands
    if (messageText.trim() === '/edit') {
      setInput('');
      onEditRequest();
      return;
    }

    if (messageText.trim() === '/update') {
      if (!hasStarted) setHasStarted(true);
      setInput('');
      setUpdateMode('password');
      addSystemMessage("Enter your admin password to update the prompt:");
      return;
    }

    // Handle update flow
    if (updateMode === 'password') {
      setUpdatePassword(messageText);
      setUpdateMode('instruction');
      setInput('');
      addSystemMessage("What would you like to update? Just describe the change naturally.");
      return;
    }

    if (updateMode === 'instruction') {
      const newMessage = { role: 'user', content: messageText };
      setMessages(prev => [...prev, newMessage]);
      await handleUpdateInstruction(messageText);
      return;
    }

    // Normal chat flow
    if (!hasStarted) setHasStarted(true);

    const newMessage = { role: 'user', content: messageText };
    const updatedMessages = [...messages.filter(m => m.role !== 'system-display'), newMessage];
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chatMessages = updatedMessages.filter(m => m.role === 'user' || m.role === 'assistant');
      const response = await axios.post('/api/chat', {
        messages: chatMessages,
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const assistantMessage = response.data.choices[0].message;
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "Hmm, something went wrong. Try again?" }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Oops, hit a snag. Mind trying that again?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0 && lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        if (chatWindowRef.current) {
          chatWindowRef.current.scrollTop += 50;
        }
      }, 200);
    }
  }, [messages]);

  const getPlaceholder = () => {
    if (updateMode === 'password') return 'Enter password...';
    if (updateMode === 'instruction') return 'Describe what to update...';
    if (updateMode === 'updating') return 'Updating...';
    return input ? '' : placeholderText || 'Ask SameerGPT...';
  };

  const getInputType = () => {
    if (updateMode === 'password') return 'password';
    return 'text';
  };

  // Landing state
  if (!hasStarted) {
    return (
      <div className="landing-container">
        <div className="landing-content">
          <img src="/header.gif" alt="Sameer" className="landing-avatar" />
          <h2 className="landing-title">SameerGPT</h2>
          <p className="landing-subtitle">Ask me anything about Sameer — his work, interests, background, and more.</p>
          <div className="landing-input-wrapper">
            <div className="input-area">
              <input
                ref={inputRef}
                type="text"
                placeholder={input ? '' : placeholderText || 'Ask SameerGPT...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendMessage();
                }}
              />
              <button onClick={() => sendMessage()} disabled={!input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
            <div className="preset-questions">
              {PRESET_QUESTIONS.map((q, i) => (
                <button key={i} className="preset-btn" onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div className="landing-links">
            <a href="mailto:sbhutani95@gmail.com" className="landing-link" aria-label="Email">
              <img src="/mail.png" alt="Email" />
              <span>Email</span>
            </a>
            <a href="https://www.linkedin.com/in/sbhutani/" target="_blank" rel="noopener noreferrer" className="landing-link" aria-label="LinkedIn">
              <img src="/linkedin.png" alt="LinkedIn" />
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Chat state
  return (
    <div className="chat-container">
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${msg.role}`}
            ref={index === messages.length - 1 ? lastMessageRef : null}
          >
            {msg.role === 'assistant' && (
              <div className="avatar-bubble">
                <img src="/header.gif" alt="Sameer" className="message-avatar" />
              </div>
            )}
            {msg.role === 'system-display' ? (
              <div className="system-message">{msg.content}</div>
            ) : (
              <div className="message-content">{msg.content}</div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="message assistant">
            <div className="avatar-bubble">
              <img src="/header.gif" alt="Sameer" className="message-avatar" />
            </div>
            <div className="message-content typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>

      <div className="input-wrapper">
        {updateMode && (
          <div className="update-banner">
            {updateMode === 'password' && 'Enter your password'}
            {updateMode === 'instruction' && 'Describe your update'}
            {updateMode === 'updating' && 'Updating prompt...'}
            {updateMode !== 'updating' && (
              <button className="update-cancel" onClick={() => { setUpdateMode(null); setUpdatePassword(''); }}>Cancel</button>
            )}
          </div>
        )}
        <div className="input-area">
          <input
            ref={inputRef}
            type={getInputType()}
            placeholder={getPlaceholder()}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
            disabled={isLoading || updateMode === 'updating'}
          />
          <button onClick={() => sendMessage()} disabled={isLoading || updateMode === 'updating' || !input.trim()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
