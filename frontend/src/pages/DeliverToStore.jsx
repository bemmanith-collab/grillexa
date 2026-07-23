import React, { useEffect, useState } from 'react';
import client from '../api/client';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { TruckIcon } from '../components/icons';

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
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [storesRes, productsRes, consignmentsRes] = await Promise.all([
        client.get('/stores'),
        client.get('/products'),
        client.get('/consignments'),
      ]);
      setStores(storesRes.data.stores);
      setProducts(productsRes.data.products);
      setConsignments(consignmentsRes.data.consignments);
      setStoreId((current) => current || storesRes.data.stores[0]?.id || '');
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load delivery data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
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
      const res = await client.post('/consignments', { storeId: Number(storeId), date, lines: cleanLines });
      setLines([emptyLine(products)]);
      setFormOpen(false);
      setDetail(res.data.consignment);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create consignment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(id) {
    const res = await client.get(`/consignments/${id}`);
    setDetail(res.data.consignment);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Deliver to Store</h1>
          <p className="page-subtitle">Stock sent to stores on consignment — not a sale until it's settled</p>
        </div>
        <button className="btn-primary" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? 'Cancel' : '+ New Delivery'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {formOpen && (
        <div className="card form-card">
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              <label>
                Store
                <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Delivery Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            <LineItemsForm products={products} lines={lines} setLines={setLines} allowReturns={false} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Delivering…' : 'Create Consignment Note'}
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
                <th>Delivered By</th>
                <th>Status</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {consignments.map((c) => (
                <tr key={c.id}>
                  <td className="cell-mono">{c.consignmentNo}</td>
                  <td>{c.deliveredAt}</td>
                  <td>{c.store}</td>
                  <td>{c.createdBy}</td>
                  <td>
                    <span className="badge">{c.status.replace('_', ' ')}</span>
                  </td>
                  <td>₹{c.totalDeliveredValue.toFixed(2)}</td>
                  <td className="actions-cell">
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(c.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {consignments.length === 0 && (
                <tr>
                  <td colSpan={7}>
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
          documentOptions={{
            bandLabel: 'CONSIGNMENT NOTE — NOT A TAX INVOICE',
            numberLabel: 'Consignment #',
            footerMessage: 'No payment is due yet — this stock is settled later based on what actually sells.',
          }}
        />
      )}
    </div>
  );
}
