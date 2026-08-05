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
import { ReceiptIcon, RefreshIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';
import { filterToCatalog, describeDropped } from '../lib/reorder';
import { formatDate, todayStr } from '../utils/date';

export default function DirectSale() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  // A scoped user with just one store never needs to pick — same UX as Sales.
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [storeId, setStoreId] = useState(isScoped ? myStores[0]?.id || '' : '');
  const [date, setDate] = useState(todayStr());
  const [lines, setLines] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [reorderWarning, setReorderWarning] = useState('');
  const [toast, setToast] = useState('');
  // True while the customer fields hold details a reorder pulled from a past
  // bill, so switching stores can safely drop them. Any keystroke in those
  // fields clears it — hand-typed details are never wiped.
  const [customerFromReorder, setCustomerFromReorder] = useState(false);
  const [search, setSearch] = useState('');

  // Phone isn't a column, but "find that walk-in's last bill by their number"
  // is the common counter request, so it's matched and named in the
  // placeholder. "Created By" is only matched for unscoped users, since it's
  // only a column for them.
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        s.number.toLowerCase().includes(q) ||
        s.store.toLowerCase().includes(q) ||
        (s.customerName || '').toLowerCase().includes(q) ||
        (s.customerPhone || '').toLowerCase().includes(q) ||
        (!isScoped && (s.createdBy || '').toLowerCase().includes(q))
    );
  }, [sales, search, isScoped]);

  function editCustomer(setField) {
    return (e) => {
      setField(e.target.value);
      setCustomerFromReorder(false);
    };
  }


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
      const requests = [client.get('/products'), client.get('/sales', { params: { direct: true } })];
      if (!isScoped) requests.unshift(client.get('/stores'));
      const results = await Promise.all(requests);
      const [productsRes, salesRes] = isScoped ? results : results.slice(1);
      if (!isScoped) {
        setStores(results[0].data.stores);
        setStoreId((current) => current || results[0].data.stores[0]?.id || '');
      }
      setProducts(productsRes.data.products);
      setSales(salesRes.data.sales);
      setLines((current) => (current.length ? current : [emptyLine(productsRes.data.products)]));
    } catch (err) {
      setError('Failed to load direct sale data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setLines([emptyLine(products)]);
    // Otherwise back-dating one bill silently dates every later bill that
    // session to the same past day.
    setDate(todayStr());
    setCustomerName('');
    setCustomerPhone('');
    setCustomerGstin('');
    setCustomerFromReorder(false);
    setReorderWarning('');
  }

  // Copies the store's most recent bill into the form, for the very common
  // repeat order. The customer name/phone/GSTIN come across too: the bill is
  // raised in the store's own name, so for a given store those details are
  // the same every time rather than belonging to a different walk-in person.
  // They're only reused within one store — see the store picker, which drops
  // them on a switch so store A's GSTIN can't land on store B's bill.
  async function handleReorder() {
    if (!storeId) {
      setError('Pick a store first.');
      return;
    }
    setError('');
    setReorderWarning('');
    setReordering(true);
    try {
      const res = await client.get(`/sales/latest/${storeId}`, { params: { direct: true } });
      const last = res.data.sale;
      // A RETURN line credited the customer who brought that item back —
      // repeating it here would credit an unrelated walk-in.
      const saleLines = last.lines.filter((l) => l.type !== 'RETURN');
      const returnCount = last.lines.length - saleLines.length;
      const { lines: reordered, dropped } = filterToCatalog(saleLines, products);

      const caveats = [];
      if (dropped.length > 0) caveats.push(`skipped ${describeDropped(dropped)}`);
      if (returnCount > 0) {
        caveats.push(`left out ${returnCount} return ${returnCount === 1 ? 'line' : 'lines'}`);
      }

      if (reordered.length === 0) {
        setReorderWarning(
          `Nothing to reorder from ${last.number} — ${caveats.join(' and ') || 'it has no sale lines'}.`
        );
        return;
      }

      setLines(reordered.map((l) => ({ ...l, type: 'SALE', reason: '' })));
      setCustomerName(last.customerName || '');
      setCustomerPhone(last.customerPhone || '');
      setCustomerGstin(last.customerGstin || '');
      setCustomerFromReorder(true);
      if (caveats.length > 0) {
        setReorderWarning(`Reordered ${last.number}, but ${caveats.join(' and ')}.`);
      }
      setToast(`Reordered from ${last.number} · ${formatDate(last.date)}`);
    } catch (err) {
      setError(
        err.response?.status === 404
          ? 'No past direct sales found'
          : err.response?.data?.error || 'Failed to load the last sale.'
      );
    } finally {
      setReordering(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const cleanLines = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        // A blank price means "use the catalogue price", so the key is
        // omitted rather than sent as 0 — the server treats an explicit 0
        // as a deliberate override and would save the bill at zero.
        ...(l.unitPrice === '' || l.unitPrice == null ? {} : { unitPrice: Number(l.unitPrice) }),
        type: l.type === 'RETURN' ? 'RETURN' : 'SALE',
        reason: l.type === 'RETURN' ? l.reason : undefined,
      }));
    if (!storeId || cleanLines.length === 0) {
      setError('Pick a store and at least one product line with a quantity.');
      return;
    }
    setSubmitting(true);
    const payload = {
      storeId: Number(storeId),
      date,
      lines: cleanLines,
      customerName,
      customerPhone,
      customerGstin,
    };
    try {
      const res = editingId
        ? await client.patch(`/sales/${editingId}`, payload)
        : await client.post('/sales', payload);
      resetForm();
      setFormOpen(false);
      setDetail(res.data.sale);
      loadAll();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${editingId ? 'update' : 'record'} direct sale.`);
    } finally {
      setSubmitting(false);
    }
  }

  // Loads the bill by id rather than reusing the row: the list response
  // carries no line items, and the lines are the whole point of editing.
  async function startEdit(id) {
    setError('');
    try {
      const res = await client.get(`/sales/${id}`);
      const sale = res.data.sale;
      setEditingId(sale.id);
      setStoreId(sale.storeId);
      setDate(sale.date);
      setLines(
        sale.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          type: l.type,
          reason: l.reason || '',
        }))
      );
      setCustomerName(sale.customerName || '');
      setCustomerPhone(sale.customerPhone || '');
      setCustomerGstin(sale.customerGstin || '');
      setCustomerFromReorder(false);
      setReorderWarning('');
      setFormOpen(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load that bill.');
    }
  }

  async function openDetail(id) {
    const res = await client.get(`/sales/${id}`);
    setDetail(res.data.sale);
  }

  const noStoresAssigned = isScoped && myStores.length === 0;
  const singleStoreName = isScoped && myStores.length === 1 ? myStores[0].name : null;


  const pager = useDatePages(filteredSales, (i) => i.date);
  const searching = Boolean(search.trim());
  const shown = searching ? filteredSales : pager.visible;
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Direct Sale</h1>
          <p className="page-subtitle">
            Cash sale straight to a walk-in customer — billed and paid for immediately
            {singleStoreName && <> · {singleStoreName}</>}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { if (formOpen) resetForm(); setFormOpen((v) => !v); }}
          disabled={noStoresAssigned}
        >
          {formOpen ? 'Cancel' : '+ New Direct Sale'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
      {noStoresAssigned && (
        <div className="form-error">Your account isn't assigned to a store yet. Ask an admin to assign one.</div>
      )}

      {formOpen && (
        <div className="card form-card" ref={formRef}>
          {editingId && (
            <p className="modal-help" style={{ marginTop: 0 }}>
              Editing {sales.find((s) => s.id === editingId)?.number} — the bill keeps its number, so a
              printed copy still matches.
            </p>
          )}
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
                      // These belong to the store we just left.
                      if (customerFromReorder) {
                        setCustomerName('');
                        setCustomerPhone('');
                        setCustomerGstin('');
                        setCustomerFromReorder(false);
                      }
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
                Sale Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                Customer Name <span className="form-optional">(optional)</span>
                <input type="text" value={customerName} onChange={editCustomer(setCustomerName)} placeholder="Walk-in customer" />
              </label>
              <label>
                Phone <span className="form-optional">(optional)</span>
                <input type="text" value={customerPhone} onChange={editCustomer(setCustomerPhone)} />
              </label>
              <label>
                GSTIN <span className="form-optional">(optional)</span>
                <input type="text" value={customerGstin} onChange={editCustomer(setCustomerGstin)} />
              </label>
              <div className="bill-form-action">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleReorder}
                  disabled={!storeId || reordering}
                  title="Fill these lines with the same products and quantities as this store's last direct sale"
                >
                  <RefreshIcon className={reordering ? 'icon-spin' : undefined} />
                  {reordering ? 'Loading…' : 'Reorder from Last Sale'}
                </button>
              </div>
            </div>
            {reorderWarning && <div className="form-warning">{reorderWarning}</div>}
            <LineItemsForm products={products} lines={lines} setLines={setLines} />
            <div className="modal-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Record Sale & Print Bill'}
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
                  ? 'Search by bill #, store, customer or phone…'
                  : 'Search by bill #, store, customer, phone or created by…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {!loading && !searching && <DatePager pager={pager} noun="bill" />}

      {loading ? (
        <Spinner label="Loading direct sales…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Store</th>
                <th>Customer</th>
                {!isScoped && <th>Created By</th>}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td className="cell-mono">{s.number}</td>
                  <td className="cell-date">{formatDate(s.date)}</td>
                  <td>{s.store}</td>
                  <td>{s.customerName || <span className="cell-muted">—</span>}</td>
                  {!isScoped && <td>{s.createdBy}</td>}
                  <td>{formatCurrency(s.totalAmount)}</td>
                  <td className="actions-cell">
                    {/* Bills generated by settling a consignment are edited
                        from Settle Consignment — the API rejects them here. */}
                    {!s.consignmentId && (
                      <button className="btn-secondary btn-sm" onClick={() => startEdit(s.id)}>
                        Edit
                      </button>
                    )}
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(s.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 6 : 7}>
                    <EmptyState
                      icon={ReceiptIcon}
                      message={
                        sales.length === 0
                          ? 'No direct sales recorded yet.'
                          : 'No direct sales match your search.'
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {detail && <BillDetailModal title="Sale Bill" bill={detail} onClose={() => setDetail(null)} hideCreatedBy={isScoped} />}

      <Toast message={toast} onDone={() => setToast('')} />
    </div>
  );
}
