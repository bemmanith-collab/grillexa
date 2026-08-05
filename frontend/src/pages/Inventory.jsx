import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Search, Handshake, ReceiptText, Coins, Truck, Undo2, Wallet } from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import WastageModal from '../components/WastageModal';
import StockDetailModal from '../components/StockDetailModal';
import DailyWisdom from '../components/DailyWisdom';
import SearchSelect, { RECENT_STORES } from '../components/SearchSelect';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { BoxIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';
import { formatDate, todayStr } from '../utils/date';

const ALL_STORES = { id: 'all', name: 'All Stores' };

export default function Inventory() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  const showStorePicker = !isScoped || myStores.length > 1;
  const [stores, setStores] = useState(isScoped ? myStores : []);
  // "all" is the default: after a day of supplying thirty stores you want one
  // set of totals, not thirty tabs. Picking a single store is still how you
  // record wastage, which has to land on one specific store's ledger row.
  const [storeId, setStoreId] = useState(isScoped && myStores.length === 1 ? myStores[0].id : 'all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wastageTarget, setWastageTarget] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isScoped) return;
    client.get('/stores').then((res) => setStores(res.data.stores));
  }, [isScoped]);

  async function load(sid) {
    if (!sid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Pending settlements and consignment value come back with the stock
      // itself — totalled in the database, so neither depends on how many
      // consignments a page of the list happens to hold.
      const res = await client.get('/stock/today', { params: { storeId: sid, date: todayStr() } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load stock.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(storeId);
  }, [storeId]);

  async function handleWastageSubmit(entry, quantity) {
    const res = await client.post(`/stock/${entry.storeId}/${entry.productId}/wastage`, { quantity });
    setData((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === res.data.entry.id ? res.data.entry : e)),
    }));
  }

  const isAllStores = storeId === 'all';
  const sumOf = (field) => data?.entries.reduce((sum, e) => sum + (e[field] || 0), 0) || 0;
  const totalSupplied = sumOf('received');
  const totalSold = sumOf('sold');
  const totalReturned = sumOf('returned');
  const totalWastage = sumOf('wastage');
  const totalOnConsignment = sumOf('consignmentQty');

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.entries;
    return data.entries.filter((e) => e.product.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Today's Stock</h1>
          <p className="page-subtitle">
            {data ? formatDate(data.date) : ''}
            {data?.store && <> · {data.store}</>}
            {isAllStores && data?.storeCount != null && (
              <> · {data.storeCount} {data.storeCount === 1 ? 'store' : 'stores'} reported today</>
            )}
          </p>
        </div>
        <div className="page-header-actions">
          {showStorePicker && stores.length > 0 && (
            <SearchSelect options={stores} value={storeId} firstOption={ALL_STORES} onChange={setStoreId} recentKey={RECENT_STORES} />
          )}
        </div>
      </div>

      <DailyWisdom variant={user.role === 'SALES' ? 'prominent' : 'subtle'} />

      {error && <div className="form-error">{error}</div>}
      {isScoped && myStores.length === 0 && (
        <div className="form-error">Your account isn't assigned to a store yet. Ask an admin to assign one.</div>
      )}

      {!storeId ? null : loading || !data ? (
        <Spinner label="Loading today's stock…" />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-icon stat-icon-blue"><Truck size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalSupplied}</div>
                <div className="stat-label">Units Supplied Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-green"><CheckCircle2 size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalSold}</div>
                <div className="stat-label">Units Sold Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-amber"><Undo2 size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalReturned}</div>
                <div className="stat-label">Units Returned Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-amber"><XCircle size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalWastage}</div>
                <div className="stat-label">Units Wasted Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-blue"><Handshake size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{totalOnConsignment}</div>
                <div className="stat-label">Units On Consignment</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-amber"><ReceiptText size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{data.pendingSettlements}</div>
                <div className="stat-label">Pending Settlements</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-green"><Coins size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{formatCurrency(data.consignmentValue)}</div>
                <div className="stat-label">Consignment Value</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon stat-icon-green"><Wallet size={20} strokeWidth={1.8} /></div>
              <div>
                <div className="stat-value">{formatCurrency(data.directRevenue)}</div>
                <div className="stat-label">Direct Sale Revenue</div>
              </div>
            </div>
          </div>

          <div className="card form-card">
            <div className="search-input">
              <Search size={16} />
              <input
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
            <table className="data-table data-table-zebra">
              <thead>
                {/* On Consignment sits right after the product: it's the
                    figure this business actually works from, and as the
                    second-to-last column it was the one scrolled off the
                    right edge of a phone. */}
                <tr>
                  <th>Product</th>
                  <th>On Consignment</th>
                  <th>Supplied</th>
                  <th>Sold</th>
                  <th>Returned</th>
                  <th>Wastage</th>
                  {!isAllStores && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  // An all-store row is a total, not a ledger row: there's no
                  // single store to record wastage against and no per-store
                  // history to drill into, so both are left to the store view.
                  <tr
                    key={e.id}
                    className={isAllStores ? undefined : 'row-clickable'}
                    onClick={isAllStores ? undefined : () => setDetailEntry(e)}
                  >
                    <td className="cell-strong">{e.product}</td>
                    <td className="cell-strong">{e.consignmentQty}</td>
                    <td>{e.received}</td>
                    <td>{e.sold}</td>
                    <td>{e.returned}</td>
                    <td>{e.wastage}</td>
                    {!isAllStores && (
                      <td className="actions-cell">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setWastageTarget(e);
                          }}
                        >
                          Record Wastage
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={isAllStores ? 6 : 7}>
                      <EmptyState icon={BoxIcon} message="No products in the catalog yet." />
                    </td>
                  </tr>
                )}
                {data.entries.length > 0 && filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={isAllStores ? 6 : 7}>
                      <EmptyState icon={Search} message="No products match your search or filter." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {wastageTarget && (
        <WastageModal
          entry={wastageTarget}
          onClose={() => setWastageTarget(null)}
          onSubmit={(quantity) => handleWastageSubmit(wastageTarget, quantity)}
        />
      )}

      {detailEntry && (
        <StockDetailModal
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onRecordWastage={() => {
            setWastageTarget(detailEntry);
            setDetailEntry(null);
          }}
        />
      )}

    </div>
  );
}
