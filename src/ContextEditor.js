import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ContextEditor({ onExit }) {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        const response = await axios.get('/api/getContext');
        setContext(response.data.context);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch context');
        setLoading(false);
      }
    };
    fetchContext();
  }, []);

  const handleUpdateContext = async () => {
    try {
      await axios.post('/api/updateContext', { context });
      alert('Context updated successfully!');
    } catch (err) {
      alert('Failed to update context.');
    }
  };

  if (loading) return <div className="context-editor"><p>Loading...</p></div>;
  if (error) return <div className="context-editor"><p>{error}</p></div>;

  return (
    <div className="context-editor">
      <div className="context-editor-header">
        <h2>Edit Prompt</h2>
      </div>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
      />
      <div className="context-editor-actions">
        <button onClick={handleUpdateContext}>Save Changes</button>
        <button className="secondary" onClick={onExit}>Back to Chat</button>
      </div>
    </div>
  );
}

export default ContextEditor;
