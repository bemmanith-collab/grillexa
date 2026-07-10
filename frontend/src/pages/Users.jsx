import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';

const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SALES', storeId: '' });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [usersRes, storesRes] = await Promise.all([client.get('/users'), client.get('/stores')]);
      setUsers(usersRes.data.users);
      setStores(storesRes.data.stores);
    } catch (err) {
      setError('Failed to load users.');
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
    if (form.role === 'SALES' && !form.storeId) {
      setError('Sales accounts must be assigned to a store.');
      return;
    }
    setCreating(true);
    try {
      await client.post('/users', { ...form, storeId: form.role === 'SALES' ? Number(form.storeId) : undefined });
      setForm({ name: '', email: '', password: '', role: 'SALES', storeId: '' });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(id, role, storeId) {
    setError('');
    if (role === 'SALES' && !storeId) {
      setError('Assign a store before switching this account to Sales.');
      return;
    }
    try {
      await client.patch(`/users/${id}`, { role, ...(storeId ? { storeId: Number(storeId) } : {}) });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role.');
    }
  }

  async function handleStoreChange(id, storeId) {
    setError('');
    try {
      await client.patch(`/users/${id}`, { storeId: Number(storeId) });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update store.');
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setError('');
    try {
      await client.delete(`/users/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p className="page-subtitle">{users.length} accounts</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form className="inline-form" onSubmit={handleCreate}>
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              placeholder="Temporary password"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {form.role === 'SALES' && (
              <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} required>
                <option value="">Assign store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Adding…' : 'Add User'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading users…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Store</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="cell-strong">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="role-select"
                      value={u.role}
                      disabled={u.id === currentUser.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value, u.storeId)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.role === 'SALES' ? (
                      <select
                        className="role-select"
                        value={u.storeId || ''}
                        onChange={(e) => handleStoreChange(u.id, e.target.value)}
                      >
                        <option value="" disabled>Assign store…</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="form-hint">—</span>
                    )}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn-danger btn-sm"
                      disabled={u.id === currentUser.id}
                      onClick={() => handleDelete(u.id, u.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
