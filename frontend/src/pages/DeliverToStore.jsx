import React, { useEffect, useMemo, useState, useRef } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Search } from 'lucide-react';
import LineItemsForm, { emptyLine } from '../components/LineItemsForm';
import SearchSelect, { SELECT_A_STORE, RECENT_STORES } from '../components/SearchSelect';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import DatePager, { useDatePages } from '../components/DatePager';
import Toast from '../components/Toast';
import { TruckIcon, RefreshIcon } from '../components/icons';
import { filterToCatalog, describeDropped } from '../lib/reorder';
import { formatDate, todayStr } from '../utils/date';

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
  const [search, setSearch] = useState('');

  // "Delivered By" is only a column for unscoped users, so only they can
  // search on it — a SALES user matching a name they can't see would be
  // filtering by something invisible.
  const filteredConsignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return consignments;
    return consignments.filter(
      (c) =>
        c.consignmentNo.toLowerCase().includes(q) ||
        c.store.toLowerCase().includes(q) ||
        c.status.replace('_', ' ').toLowerCase().includes(q) ||
        (!isScoped && (c.createdBy || '').toLowerCase().includes(q))
    );
  }, [consignments, search, isScoped]);


  // The form renders above the list, and the list is long now that tables are
  // no longer capped to a fixed height. Tapping Edit on a row far down opened
  // the form off-screen above, so it looked like the button did nothing.
  const formRef = useRef(null);
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [formOpen, editingId]);

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
      .map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        // Blank means "catalogue price"; an explicit 0 is a real override.
        ...(l.unitPrice === '' || l.unitPrice == null ? {} : { unitPrice: Number(l.unitPrice) }),
      }));
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
      // Back to today, like cancelForm does. Without this, editing an old
      // delivery leaves its date in the field, and the next "+ New Delivery"
      // (which only reopens the form) is created days in the past.
      setDate(todayStr());
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
      const { lines: reordered, dropped } = filterToCatalog(
        last.items.map((i) => ({
          productId: i.productId,
          product: i.product,
          quantity: i.deliveredQty,
        })),
        products
      );

      if (reordered.length === 0) {
        setReorderWarning(
          `${last.consignmentNo} only has products that are no longer in the catalog — nothing to reorder.`
        );
        return;
      }

      setLines(reordered);
      if (dropped.length > 0) {
        setReorderWarning(`Reordered ${last.consignmentNo}, but skipped ${describeDropped(dropped)}.`);
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


  const pager = useDatePages(filteredConsignments, (i) => i.deliveredAt);
  const searching = Boolean(search.trim());
  const shown = searching ? filteredConsignments : pager.visible;
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
        <div className="card form-card" ref={formRef}>
          {editingId && <p className="modal-help" style={{ marginTop: 0 }}>Editing {consignments.find((c) => c.id === editingId)?.consignmentNo}</p>}
          <form onSubmit={handleSubmit}>
            <div className="bill-form-header">
              {showStorePicker ? (
                <label>
                  Store
                  <SearchSelect
                    options={stores}
                    value={storeId}
                    firstOption={isScoped ? undefined : SELECT_A_STORE}
                    recentKey={RECENT_STORES}
                    onChange={(id) => {
                      setStoreId(id);
                      setReorderWarning('');
                    }}
                  />
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

      {!loading && (
        <div className="card form-card">
          <div className="search-input">
            <Search size={16} />
            <input
              placeholder={
                isScoped
                  ? 'Search by consignment #, store or status…'
                  : 'Search by consignment #, store, status or delivered by…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {!loading && !searching && <DatePager pager={pager} noun="delivery" plural="deliveries" />}

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
              {shown.map((c) => (
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
              {shown.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 6 : 7}>
                    <EmptyState
                      icon={TruckIcon}
                      message={consignments.length === 0 ? 'No deliveries yet.' : 'No deliveries match your search.'}
                    />
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
