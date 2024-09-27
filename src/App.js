// App.js
import React, { useState } from 'react';
import Chat from './Chat.js';
import './App.css';
import ContextEditor from './ContextEditor.js'; // Ensure the path is correct

function App() {
  const [clickCount, setClickCount] = useState(0);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Handler for GIF click
  const handleGifClick = () => {
    setClickCount((prevCount) => prevCount + 1);
    if (clickCount + 1 === 5) {
      setShowPasswordPanel(true);
      setClickCount(0); // Reset the click count
    }
  };

  // Handler for password submission
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    // Access the password from the environment variable
    const storedPassword = process.env.REACT_APP_PASSWORD; // Make sure the environment variable is set in Vercel
    if (password === storedPassword) {
      setIsAuthenticated(true);
      setShowPasswordPanel(false);
    } else {
      alert('Incorrect password, try again.');
    }
  };

  return (
    <div className="app-container">
      {/* Header Area */}
      <div className="header-area">
        {/* Mail Logo */}
        <a href="mailto:sbhutani95@gmail.com" className="header-icon left-icon" aria-label="Send Email">
          <img src="/mail.png" alt="Mail Icon" />
        </a>

        {/* Center Content */}
        <div className="header-center">
          <img
            src="/header.gif"
            alt="Header GIF"
            className="header-gif"
            onClick={handleGifClick}
          />
          <h1 className="title">SameerGPT</h1>
        </div>

        {/* LinkedIn Logo */}
        <a
          href="https://www.linkedin.com/in/sbhutani/"
          target="_blank"
          rel="noopener noreferrer"
          className="header-icon right-icon"
          aria-label="LinkedIn Profile"
        >
          <img src="/linkedin.png" alt="LinkedIn Icon" />
        </a>
      </div>

      {/* Password Panel */}
      {showPasswordPanel && (
        <div className="password-panel">
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              placeholder="Enter Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Submit</button>
          </form>
        </div>
      )}

      {/* Context Editor */}
      {isAuthenticated ? (
        <ContextEditor />
      ) : (
        <Chat />
      )}
    </div>
  );
}

export default App;