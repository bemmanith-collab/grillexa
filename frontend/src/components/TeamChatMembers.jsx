import React, { useCallback, useEffect, useState } from 'react';
import { X, UserPlus, UserMinus, ShieldCheck } from 'lucide-react';
import client from '../api/client';
import Spinner from './Spinner';

// Who is in the room. Everyone can see the list; only a moderator gets the
// buttons — and the server checks again on every call, because a panel that
// hides a button is a courtesy, not access control.
export default function TeamChatMembers({ moderator, onClose }) {
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    client.get('/team-chat/members')
      .then((res) => { setData(res.data); setError(''); })
      .catch(() => setError('Could not load the member list.'));
  }, []);

  useEffect(load, [load]);

  // Escape closes, like every other modal in the app.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const add = async (userId) => {
    setBusyId(userId);
    try {
      await client.post('/team-chat/members', { userId });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add that person.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (userId, name) => {
    // No confirm dialog: removal is reversible from the same panel, and the
    // person's messages stay in the thread either way.
    setBusyId(userId);
    try {
      await client.delete(`/team-chat/members/${userId}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || `Could not remove ${name}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="members-title">
        <div className="modal-header">
          <h2 id="members-title">Chat members</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}
          {!data ? <Spinner /> : (
            <>
              <ul className="member-list">
                {data.members.map((m) => (
                  <li key={m.userId}>
                    <span className="member-name">
                      {m.name}
                      {m.isMe && <span className="member-you">you</span>}
                      {m.role === 'ADMIN' && <ShieldCheck size={13} aria-label="Admin" />}
                    </span>
                    <span className="member-role">{m.role.toLowerCase()}</span>
                    {moderator && !m.isMe && (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => remove(m.userId, m.name)}
                        disabled={busyId === m.userId}
                      >
                        <UserMinus size={14} /> Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {moderator && data.canAdd?.length > 0 && (
                <>
                  <h3 className="member-subhead">Not in the chat</h3>
                  <ul className="member-list">
                    {data.canAdd.map((u) => (
                      <li key={u.id}>
                        <span className="member-name">{u.name}</span>
                        <span className="member-role">{u.role.toLowerCase()}</span>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => add(u.id)}
                          disabled={busyId === u.id}
                        >
                          <UserPlus size={14} /> Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {moderator && data.canAdd?.length === 0 && (
                <p className="form-hint">Everyone with an account is already in the chat.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
