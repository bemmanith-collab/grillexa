import React, { useEffect, useState } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import BillDetailModal from '../components/BillDetailModal';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { ReceiptIcon } from '../components/icons';
import { formatCurrency } from '../lib/format';

export default function Sales() {
  const { user } = useAuth();
  const isScoped = user.role === 'SALES';
  const myStores = isScoped ? user.stores : [];
  const [sales, setSales] = useState([]);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [dateFilter, setDateFilter] = useState('');
  const [salesLoading, setSalesLoading] = useState(true);

  async function loadSales() {
    setSalesLoading(true);
    setError('');
    try {
      const params = dateFilter ? { date: dateFilter } : {};
      const res = await client.get('/sales', { params });
      setSales(res.data.sales);
    } catch (err) {
      setError('Failed to load sales data.');
    } finally {
      setSalesLoading(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, [dateFilter]);

  async function openDetail(id) {
    const res = await client.get(`/sales/${id}`);
    setDetail(res.data.sale);
  }

  const singleStoreName = isScoped && myStores.length === 1 ? myStores[0].name : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p className="page-subtitle">
            Revenue is only recognized when a consignment is settled — see Settle Consignment to record a new sale
            {singleStoreName && <> · {singleStoreName}</>}
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="page-header">
        <h2 className="section-title" style={{ margin: 0 }}>Bill History</h2>
        <div className="inline-form">
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          {dateFilter && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDateFilter('')}>
              All dates
            </button>
          )}
        </div>
      </div>

      {salesLoading ? (
        <Spinner label="Loading sales…" />
      ) : (
        <div className="card">
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Date</th>
                <th>Store</th>
                {!isScoped && <th>Created By</th>}
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="cell-mono">{s.number}</td>
                  <td>{s.date}</td>
                  <td>{s.store}</td>
                  {!isScoped && <td>{s.createdBy}</td>}
                  <td>{formatCurrency(s.totalAmount)}</td>
                  <td className="actions-cell">
                    <button className="btn-secondary btn-sm" onClick={() => openDetail(s.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={isScoped ? 5 : 6}>
                    <EmptyState
                      icon={ReceiptIcon}
                      message={dateFilter ? 'No sales on this date.' : 'No sales recorded yet.'}
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
        <BillDetailModal title="Sale Bill" bill={detail} onClose={() => setDetail(null)} hideCreatedBy={isScoped} />
      )}
    </div>
  );
}
