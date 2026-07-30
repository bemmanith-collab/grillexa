import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Spinner from './components/Spinner';

const Login = lazy(() => import('./pages/Login'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Dispatches = lazy(() => import('./pages/Dispatches'));
const DeliverToStore = lazy(() => import('./pages/DeliverToStore'));
const DirectSale = lazy(() => import('./pages/DirectSale'));
const SettleConsignment = lazy(() => import('./pages/SettleConsignment'));
const Products = lazy(() => import('./pages/Products'));
const Sales = lazy(() => import('./pages/Sales'));
const StockHistory = lazy(() => import('./pages/StockHistory'));
const Users = lazy(() => import('./pages/Users'));
const Stores = lazy(() => import('./pages/Stores'));
const Reports = lazy(() => import('./pages/Reports'));

// Copies each column heading onto its cells as data-label, which the phone
// card layout prints beside the value (see .data-table in index.css). Done in
// one place rather than as data-label="…" repeated across eleven tables: a
// table added later gets it for nothing, and none can be forgotten. Runs on
// every render — these tables are tens of rows, not thousands.
function useTableLabels() {
  useEffect(() => {
    for (const table of document.querySelectorAll('table.data-table')) {
      const headings = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      if (!headings.length) continue;
      for (const row of table.querySelectorAll('tbody tr')) {
        [...row.children].forEach((cell, i) => {
          if (headings[i]) cell.setAttribute('data-label', headings[i]);
          else cell.removeAttribute('data-label');
        });
      }
    }
  });
}

export default function App() {
  const { user, loading } = useAuth();
  useTableLabels();

  if (loading) return <Spinner />;

  return (
    <div className={user ? 'app-shell' : ''}>
      {user && <Sidebar />}
      <main className={user ? 'app-main' : ''}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Inventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sales"
              element={
                <ProtectedRoute>
                  <Sales />
                </ProtectedRoute>
              }
            />
            <Route
              path="/direct-sale"
              element={
                <ProtectedRoute>
                  <DirectSale />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stock-history"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <StockHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dispatches"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <Dispatches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deliver-to-store"
              element={
                <ProtectedRoute>
                  <DeliverToStore />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settle-consignment"
              element={
                <ProtectedRoute>
                  <SettleConsignment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/products"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/stores"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <Stores />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute roles={['ADMIN']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
