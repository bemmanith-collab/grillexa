import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { StoreIcon } from '../components/icons';

export default function Stores() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stores');
      setStores(res.data.stores);
    } catch (err) {
      setError('Failed to load stores.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await client.post('/stores', form);
      setForm({ name: '', address: '' });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add store.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditForm({ name: s.name, address: s.address || '' });
  }

  async function handleSaveEdit(id) {
    setError('');
    try {
      await client.patch(`/stores/${id}`, { name: editForm.name, address: editForm.address });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update store.');
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await client.delete(`/stores/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete store.');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Stores</h1>
          <p className="page-subtitle">{stores.length} retail stores</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add Store'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form className="inline-form" onSubmit={handleCreate}>
            <input
              placeholder="Store name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="Address (optional)"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Adding…' : 'Add Store'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading stores…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            className="line-input"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="line-input"
                            value={editForm.address}
                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                          />
                        </td>
                        <td className="actions-cell">
                          <button className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => handleSaveEdit(s.id)}>
                            Save
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="cell-strong">{s.name}</td>
                        <td>{s.address || '—'}</td>
                        {isAdmin && (
                          <td className="actions-cell">
                            <button className="btn-secondary btn-sm" onClick={() => startEdit(s)}>
                              Edit
                            </button>
                            <button className="btn-danger btn-sm" onClick={() => handleDelete(s.id, s.name)}>
                              Delete
                            </button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
              {stores.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 3 : 2}>
                    <EmptyState icon={StoreIcon} message="No stores yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
