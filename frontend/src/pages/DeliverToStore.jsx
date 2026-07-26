import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import Toast from '../components/Toast';
import { TruckIcon, RefreshIcon } from '../components/icons';
import { formatDate } from '../utils/date';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Maps a Consignment to the generic {number, date, store, lines, totalAmount}
// shape BillDetailModal expects, so the delivery note reuses the same
// print/WhatsApp/PDF sharing already built for Sales/Dispatch invoices.
function asBill(consignment) {
  return {
    number: consignment.consignmentNo,
    date: consignment.deliveredAt,
    store: consignment.store,
    totalAmount: consignment.totalDeliveredValue,
    lines: consignment.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      product: i.product,
      quantity: i.deliveredQty,
      unitPrice: i.pricePerUnit,
      amount: i.totalValue,
      type: 'SALE',
    })),
  };
}

export default function DeliverToStore() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  // A scoped user with just one store never needs to pick — same UX as Sales.
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [products, setProducts] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [reorderWarning, setReorderWarning] = useState('');
  const [toast, setToast] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const requests = [client.get('/products'), client.get('/consignments')];
      if (!isScoped) requests.unshift(client.get('/stores'));
      const results = await Promise.all(requests);
      const [productsRes, consignmentsRes] = isScoped ? results : results.slice(1);
      if (!isScoped) {
        setStores(results[0].data.stores);
        setStoreId((current) => current || results[0].data.stores[0]?.id || '');
      }
      setProducts(productsRes.data.products);
      setConsignments(consignmentsRes.data.consignments);
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load delivery data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanLines = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({ productId: Number(l.productId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (!storeId || cleanLines.length === 0) {
      setError('Pick a store and at least one product line with a quantity.');
      return;
    }
    setSubmitting(true);
    try {
      const res = editingId
        ? await client.patch(`/consignments/${editingId}`, { storeId: Number(storeId), date, lines: cleanLines })
        : await client.post('/consignments', { storeId: Number(storeId), date, lines: cleanLines });
      setLines([emptyLine(products)]);
      setFormOpen(false);
      setEditingId(null);
      setReorderWarning('');
      setDetail(res.data.consignment);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} consignment.`);
    } finally {
      setSubmitting(false);
    }
  }

  // Copies the store's most recent delivery into the form, so a repeat order
  // is one click instead of re-keying every line. Products that have since
  // left the catalog are dropped — they'd be unselectable in the line picker
  // and rejected on submit — but they're called out rather than silently
  // shrinking the order.
  async function handleReorder() {
    if (!storeId) {
      setError('Pick a store first.');
      return;
    }
    setError('');
    setReorderWarning('');
    setReordering(true);
    try {
      const res = await client.get(`/consignments/latest/${storeId}`);
      const last = res.data.consignment;
      const inCatalog = (item) => products.some((p) => p.id === item.productId);
      const available = last.items.filter(inCatalog);
      const dropped = last.items.filter((i) => !inCatalog(i));

      if (available.length === 0) {
        setReorderWarning(
          `${last.consignmentNo} only has products that are no longer in the catalog — nothing to reorder.`
        );
        return;
      }

      setLines(
        available.map((i) => ({ productId: i.productId, quantity: i.deliveredQty, unitPrice: i.pricePerUnit }))
      );
      if (dropped.length > 0) {
        setReorderWarning(
          `Skipped ${dropped.length} discontinued ${dropped.length === 1 ? 'product' : 'products'} from ${
            last.consignmentNo
          }: ${dropped.map((i) => i.product).join(', ')}.`
        );
      }
      setToast(`Reordered from ${last.consignmentNo} · ${formatDate(last.deliveredAt)}`);
    } catch (err) {
      setError(
        err.response?.status === 404
          ? 'No past deliveries found'
          : err.response?.data?.error || 'Failed to load the last delivery.'
      );
    } finally {
      setReordering(false);
    }
  }

  function startEdit(c) {
    setError('');
    setReorderWarning('');
    setEditingId(c.id);
    setStoreId(c.storeId);
    setDate(c.deliveredAt);
    setLines(c.items.map((i) => ({ productId: i.productId, quantity: i.deliveredQty, unitPrice: i.pricePerUnit })));
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setEditingId(null);
    setLines([emptyLine(products)]);
    setDate(todayStr());
    setError('');
    setReorderWarning('');
  }

  async function openDetail(id) {
    const res = await client.get(`/consignments/${id}`);
    setDetail(res.data.consignment);
  }

  const noStoresAssigned = isScoped && myStores.length === 0;
  const singleStoreName = isScoped && myStores.length === 1 ? myStores[0].name : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Deliver to Store</h1>
          <p className="page-subtitle">
            Stock sent to stores on consignment — not a sale until it's settled
            {singleStoreName && <> · {singleStoreName}</>}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => (formOpen ? cancelForm() : setFormOpen(true))}
          disabled={noStoresAssigned}
        >
          {formOpen ? 'Cancel' : '+ New Delivery'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {noStoresAssigned && (
        <div className="form-error">Your account isn't assigned to a store yet. Ask an admin to assign one.</div>
      )}

      {formOpen && (
        <div className="card form-card">
          {editingId && <p className="modal-help" style={{ marginTop: 0 }}>Editing {consignments.find((c) => c.id === editingId)?.consignmentNo}</p>}
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              {showStorePicker ? (
                <label>
                  Store
                  <select
                    value={storeId}
                    onChange={(e) => {
                      setStoreId(e.target.value);
                      setReorderWarning('');
                    }}
                  >
                    {!isScoped && <option value="">Select a store…</option>}
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                singleStoreName && (
                  <label>
                    Store
                    <input type="text" value={singleStoreName} disabled />
                  </label>
                )
              )}
              <label>
                Delivery Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              {/* Hidden while editing: the store's latest delivery is often
                  the very one being edited, so "reordering" it would just
                  overwrite the lines with themselves. */}
              {!editingId && (
                <div className="bill-form-action">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleReorder}
                    disabled={!storeId || reordering}
                    title="Fill these lines with the same products and quantities as this store's last delivery"
                  >
                    <RefreshIcon className={reordering ? 'icon-spin' : undefined} />
                    {reordering ? 'Loading…' : 'Reorder from Last Delivery'}
                  </button>
                </div>
              )}
            </div>
            {reorderWarning && <div className="form-warning">{reorderWarning}</div>}
            <LineItemsForm products={products} lines={lines} setLines={setLines} allowReturns={false} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Create Consignment Note'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading deliveries…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Consignment #</th>
                <th>Delivered</th>
                <th>Store</th>
                {!isScoped && <th>Delivered By</th>}
                <th>Status</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consignments.map((c) => (
                <tr key={c.id}>
                  <td className="cell-mono">{c.consignmentNo}</td>
                  <td className="cell-date">{formatDate(c.deliveredAt)}</td>
                  <td>{c.store}</td>
                  {!isScoped && <td>{c.createdBy}</td>}
                  <td>
                    <span className="badge">{c.status.replace('_', ' ')}</span>
                  </td>
                  <td>₹{c.totalDeliveredValue.toFixed(2)}</td>
                  <td className="actions-cell">
                    {c.status === 'DELIVERED' && (
                      <button className="btn-secondary btn-sm" onClick={() => startEdit(c)}>
                        Edit
                      </button>
                    )}
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(c.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {consignments.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 6 : 7}>
                    <EmptyState icon={TruckIcon} message="No deliveries yet." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && (
        <BillDetailModal
          title="Consignment Note"
          bill={asBill(detail)}
          onClose={() => setDetail(null)}
          hideCreatedBy={isScoped}
          documentOptions={{
            bandLabel: 'CONSIGNMENT NOTE — NOT A TAX INVOICE',
            numberLabel: 'Consignment #',
            footerMessage: 'No payment is due yet — this stock is settled later based on what actually sells.',
          }}
        />
      )}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
