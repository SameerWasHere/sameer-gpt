// ContextEditor.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ContextEditor() {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch the current context from the database when the component mounts
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const response = await axios.get('/api/getContext'); // Create this endpoint
        setContext(response.data.context);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch context');
        setLoading(false);
      }
    };

    fetchContext();
  }, []);

  // Handle context update
  const handleUpdateContext = async () => {
    try {
      await axios.post('/api/updateContext', { context });
      alert('Context updated successfully!');
    } catch (err) {
      alert('Failed to update context.');
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="context-editor">
      <h2>Edit Context</h2>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        rows="20"
        cols="80"
      />
      <button onClick={handleUpdateContext}>Update Context</button>
    </div>
  );
}

export default ContextEditor;