import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { BoxIcon } from '../components/icons';

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', price: '', threshold: '10' });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/products');
      setProducts(res.data.products);
    } catch (err) {
      setError('Failed to load products.');
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
      await client.post('/products', {
        name: form.name,
        sku: form.sku,
        price: Number(form.price) || 0,
        threshold: Number(form.threshold) || 0,
      });
      setForm({ name: '', sku: '', price: '', threshold: '10' });
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add product.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({ name: p.name, sku: p.sku, price: p.price, threshold: p.threshold });
  }

  async function handleSaveEdit(id) {
    setError('');
    try {
      await client.patch(`/products/${id}`, {
        name: editForm.name,
        sku: editForm.sku,
        price: Number(editForm.price) || 0,
        threshold: Number(editForm.threshold) || 0,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update product.');
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError('');
    try {
      await client.delete(`/products/${id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete product.');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-subtitle">{products.length} products in the catalog</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form className="inline-form" onSubmit={handleCreate}>
            <input
              placeholder="Product name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              placeholder="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              required
            />
            <input
              placeholder="Price (₹)"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <input
              placeholder="Low-stock threshold"
              type="number"
              min="0"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Adding…' : 'Add Product'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading products…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Low-stock threshold</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <tr key={p.id}>
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
                            value={editForm.sku}
                            onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="line-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.price}
                            onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="line-input"
                            type="number"
                            min="0"
                            value={editForm.threshold}
                            onChange={(e) => setEditForm({ ...editForm, threshold: e.target.value })}
                          />
                        </td>
                        <td className="actions-cell">
                          <button className="btn-secondary btn-sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => handleSaveEdit(p.id)}>
                            Save
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="cell-strong">{p.name}</td>
                        <td className="cell-mono">{p.sku}</td>
                        <td>₹{p.price.toFixed(2)}</td>
                        <td>{p.threshold}</td>
                        <td className="actions-cell">
                          <button className="btn-secondary btn-sm" onClick={() => startEdit(p)}>
                            Edit
                          </button>
                          {isAdmin && (
                            <button className="btn-danger btn-sm" onClick={() => handleDelete(p.id, p.name)}>
                              Delete
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={BoxIcon} message="No products yet." />
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
