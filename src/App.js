import React, { useState } from 'react';
import Chat from './Chat.js';
import './App.css';
import ContextEditor from './ContextEditor.js';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [password, setPassword] = useState('');

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
