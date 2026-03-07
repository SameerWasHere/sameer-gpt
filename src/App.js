import React, { useState, useEffect } from 'react';
import Chat from './Chat.js';
import './App.css';
import ContextEditor from './ContextEditor.js';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [password, setPassword] = useState('');

  // Set --app-height from visualViewport for iOS keyboard handling
  useEffect(() => {
    const setAppHeight = () => {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };

    setAppHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight);
      window.visualViewport.addEventListener('scroll', setAppHeight);
    } else {
      window.addEventListener('resize', setAppHeight);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setAppHeight);
        window.visualViewport.removeEventListener('scroll', setAppHeight);
      } else {
        window.removeEventListener('resize', setAppHeight);
      }
    };
  }, []);

  const handleEditRequest = () => {
    setShowPasswordPanel(true);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    const storedPassword = process.env.REACT_APP_PASSWORD;
    if (password === storedPassword) {
      setIsAuthenticated(true);
      setShowPasswordPanel(false);
    } else {
      alert('Incorrect password, try again.');
    }
  };

  const handleExitEditor = () => {
    setIsAuthenticated(false);
  };

  return (
    <div className="app-container">
      {showPasswordPanel && (
        <div className="password-overlay" onClick={() => setShowPasswordPanel(false)}>
          <div className="password-panel" onClick={(e) => e.stopPropagation()}>
            <p className="password-label">Enter admin password</p>
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button type="submit">Go</button>
            </form>
          </div>
        </div>
      )}

      {isAuthenticated ? (
        <ContextEditor onExit={handleExitEditor} />
      ) : (
        <Chat onEditRequest={handleEditRequest} />
      )}
    </div>
  );
}

export default App;
