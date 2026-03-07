import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Markdown from 'react-markdown';
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
  "What music do you listen to?",
  "What sports teams do you follow?",
  "Do you have any hidden talents?",
  "What's your favorite movie?",
];

function Chat({ onEditRequest }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [placeholderText, setPlaceholderText] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [updateMode, setUpdateMode] = useState(null);
  const [updatePassword, setUpdatePassword] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [conversationId] = useState(() => Date.now().toString());
  const [isPageReady, setIsPageReady] = useState(false);
  const chatWindowRef = useRef(null);
  const lastMessageRef = useRef(null);
  const inputRef = useRef(null);
  const tickerRef = useRef(null);
  const touchStartRef = useRef({ x: 0, scrollLeft: 0 });

  // Page ready fade-in
  useEffect(() => {
    const timer = setTimeout(() => setIsPageReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Mobile keyboard: scroll chat to bottom when keyboard opens/closes
  useEffect(() => {
    const scrollChatToBottom = () => {
      if (chatWindowRef.current) {
        requestAnimationFrame(() => {
          if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
          }
        });
      }
    };

    const handleViewportResize = () => {
      // Scroll chat to bottom after keyboard opens so latest messages are visible
      scrollChatToBottom();
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };
  }, []);

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

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setHasStarted(false);
    setInput('');
    setIsLoading(false);
    setUpdateMode(null);
    setUpdatePassword('');
    setStreamingContent('');
  }, []);

  const fetchAndShowSummary = async (pwd) => {
    addSystemMessage("Fetching conversation history...");
    try {
      const response = await axios.post('/api/getConversations', { password: pwd });
      const { count, conversations } = response.data;

      if (count === 0) {
        addSystemMessage("No conversations recorded yet. Type an update instruction, /delete to clear history, or Cancel to exit.");
      } else {
        const totalExchanges = conversations.reduce((sum, c) => sum + (c.exchanges?.length || 0), 0);
        let summary = `${count} conversation${count !== 1 ? 's' : ''} (${totalExchanges} total Q&As):\n\n`;
        conversations.forEach((c, i) => {
          const date = c.startedAt ? new Date(c.startedAt).toLocaleDateString() : '';
          const numQ = c.exchanges?.length || 0;
          summary += `--- Conversation ${i + 1} (${numQ} Q&A${numQ !== 1 ? 's' : ''})${date ? ` — ${date}` : ''} ---\n`;
          (c.exchanges || []).forEach((ex) => {
            const shortA = ex.answer;
            summary += `  Q: "${ex.question}"\n  A: "${shortA}"\n`;
          });
          summary += '\n';
        });
        summary += "Now you can:\n• Type an update instruction to improve the prompt\n• Type /delete to clear conversation history\n• Cancel to exit";
        addSystemMessage(summary);
      }
      setUpdateMode('instruction');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        addSystemMessage("Wrong password. Update cancelled.");
        setUpdateMode(null);
        setUpdatePassword('');
      } else {
        addSystemMessage("Couldn't fetch conversation history. You can still type an update instruction.");
        setUpdateMode('instruction');
      }
    }
  };

  const handleDeleteConversations = async () => {
    addSystemMessage("Clearing conversation history...");
    try {
      await axios.post('/api/deleteConversations', { password: updatePassword });
      addSystemMessage("Conversation history cleared! Type an update instruction or Cancel to exit.");
    } catch (error) {
      addSystemMessage("Failed to clear history. Try again.");
    }
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
        addSystemMessage(`Done! Updated: "${instruction}"`);
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
      addSystemMessage("Enter your admin password:");
      return;
    }

    // Handle update flow
    if (updateMode === 'password') {
      setUpdatePassword(messageText);
      setInput('');
      await fetchAndShowSummary(messageText);
      return;
    }

    if (updateMode === 'instruction') {
      if (messageText.trim() === '/delete') {
        setInput('');
        await handleDeleteConversations();
        return;
      }
      const newMessage = { role: 'user', content: messageText };
      setMessages(prev => [...prev, newMessage]);
      setInput('');
      await handleUpdateInstruction(messageText);
      return;
    }

    // Normal chat flow with streaming
    if (!hasStarted) setHasStarted(true);

    // Commit any previous streaming content to messages before starting new one
    if (streamingContent) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamingContent }]);
      setStreamingContent('');
    }

    const newMessage = { role: 'user', content: messageText };
    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chatMessages = [...messages, newMessage].filter(m => m.role === 'user' || m.role === 'assistant');

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, stream: true, conversationId }),
      });

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          if (line === 'data: [DONE]') {
            setIsLoading(false);
            return;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulated += data.content;
                setStreamingContent(accumulated);
              }
            } catch (e) {
              // Skip
            }
          }
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Oops, hit a snag. Mind trying that again?" }]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-scroll — use rAF to ensure it fires after layout
  useEffect(() => {
    requestAnimationFrame(() => {
      if (chatWindowRef.current) {
        chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
      }
    });
  }, [messages, streamingContent]);

  const getPlaceholder = () => {
    if (updateMode === 'password') return 'Enter password...';
    if (updateMode === 'instruction') return 'Describe update or type /delete...';
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
      <div className={`landing-container ${isPageReady ? 'ready' : ''}`}>
        <div className="landing-content">
          <img src="/header.gif" alt="Sameer" className="landing-avatar" />
          <h2 className="landing-title">SameerGPT</h2>
          <p className="landing-subtitle">This is AI Sameer, ask me anything</p>
          <div className="landing-input-wrapper">
            <div className="input-area">
              <input
                ref={inputRef}
                type="text"
                placeholder={input ? '' : placeholderText || 'Ask SameerGPT...'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              />
              <button onClick={() => sendMessage()} disabled={!input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
          <div
            className="ticker-container"
            ref={tickerRef}
            onTouchStart={(e) => {
              const container = tickerRef.current;
              if (!container) return;
              touchStartRef.current = { x: e.touches[0].clientX, scrollLeft: container.scrollLeft };
              container.classList.add('ticker-dragging');
            }}
            onTouchMove={(e) => {
              const container = tickerRef.current;
              if (!container) return;
              const dx = e.touches[0].clientX - touchStartRef.current.x;
              container.scrollLeft = touchStartRef.current.scrollLeft - dx;
            }}
            onTouchEnd={() => {
              const container = tickerRef.current;
              if (container) container.classList.remove('ticker-dragging');
            }}
          >
            <div className="ticker-track">
              {[...PRESET_QUESTIONS, ...PRESET_QUESTIONS].map((q, i) => (
                <button key={i} className="ticker-btn" onClick={() => sendMessage(q)}>
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
      <div className="chat-header">
        <button className="new-chat-btn" onClick={handleNewChat} title="New chat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          New Chat
        </button>
      </div>
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
              <div className="message-content">
                {msg.role === 'assistant' ? (
                  <Markdown>{msg.content}</Markdown>
                ) : (
                  msg.content
                )}
              </div>
            )}
          </div>
        ))}
        {streamingContent && (
          <div className="message assistant">
            <div className="avatar-bubble">
              <img src="/header.gif" alt="Sameer" className="message-avatar" />
            </div>
            <div className="message-content">
              <Markdown>{streamingContent}</Markdown>
            </div>
          </div>
        )}
        {isLoading && !streamingContent && (
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
            {updateMode === 'summary' && 'Loading conversations...'}
            {updateMode === 'instruction' && 'Type update or /delete'}
            {updateMode === 'updating' && 'Updating prompt...'}
            {updateMode !== 'updating' && updateMode !== 'summary' && (
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
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
            disabled={isLoading || updateMode === 'updating' || updateMode === 'summary'}
          />
          <button onClick={() => sendMessage()} disabled={isLoading || updateMode === 'updating' || updateMode === 'summary' || !input.trim()}>
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
