import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import StoreAssignModal from '../components/StoreAssignModal';

const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SALES', storeIds: [] });
  const [creating, setCreating] = useState(false);
  const [assignModal, setAssignModal] = useState(null);

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

  async function patchUser(id, payload) {
    setError('');
    try {
      await client.patch(`/users/${id}`, payload);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (form.role === 'SALES' && form.storeIds.length === 0) {
      setError('Sales accounts must be assigned at least one store.');
      return;
    }
    setCreating(true);
    try {
      await client.post('/users', { ...form, storeIds: form.role === 'SALES' ? form.storeIds : undefined });
      setForm({ name: '', email: '', password: '', role: 'SALES', storeIds: [] });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  function handleRoleChange(u, role) {
    if (role === 'SALES') {
      setAssignModal({ context: 'role-change', userId: u.id, role, initialSelectedIds: u.stores.map((s) => s.id) });
      return;
    }
    patchUser(u.id, { role });
  }

  async function handleAssignConfirm(ids) {
    if (!assignModal) return;
    if (assignModal.context === 'create') {
      setForm((f) => ({ ...f, storeIds: ids }));
      return;
    }
    const payload = assignModal.context === 'role-change' ? { role: assignModal.role, storeIds: ids } : { storeIds: ids };
    await client.patch(`/users/${assignModal.userId}`, payload);
    load();
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
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value, storeIds: e.target.value === 'SALES' ? form.storeIds : [] })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {form.role === 'SALES' && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAssignModal({ context: 'create', initialSelectedIds: form.storeIds })}
              >
                {form.storeIds.length > 0 ? `${form.storeIds.length} store(s) selected` : 'Assign stores…'}
              </button>
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
                <th>Stores</th>
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
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.role === 'SALES' ? (
                      <div className="store-cell">
                        <span>{u.stores.length > 0 ? u.stores.map((s) => s.name).join(', ') : 'No stores assigned'}</span>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() =>
                            setAssignModal({ context: 'manage', userId: u.id, initialSelectedIds: u.stores.map((s) => s.id) })
                          }
                        >
                          Manage stores
                        </button>
                      </div>
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

      {assignModal && (
        <StoreAssignModal
          stores={stores}
          currentUserId={assignModal.userId ?? null}
          initialSelectedIds={assignModal.initialSelectedIds}
          onClose={() => setAssignModal(null)}
          onConfirm={handleAssignConfirm}
        />
      )}
    </div>
  );
}
