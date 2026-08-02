import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import GreetingOverlay from './components/GreetingOverlay';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Spinner from './components/Spinner';
import RouteErrorBoundary from './components/RouteErrorBoundary';

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
// table added later gets it for nothing, and none can be forgotten.
//
// An observer rather than a plain effect: every page is lazily loaded, so its
// table mounts well after App renders, and a one-shot pass finds an empty
// document. This catches tables whenever they appear — after a route change,
// after data loads, after a row is added.
//
// Only childList is observed, so writing the attributes below can't retrigger
// it.
function stampLabels(root) {
  for (const table of root.querySelectorAll?.('table.data-table') || []) {
    const headings = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!headings.length) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.children].forEach((cell, i) => {
        // Only write when it differs: this runs on every DOM mutation, and
        // rewriting ~1,700 attributes per keystroke invalidates a
        // ::before content rule for each one — visible lag on a phone.
        if (!headings[i]) cell.removeAttribute('data-label');
        else if (cell.getAttribute('data-label') !== headings[i]) {
          cell.setAttribute('data-label', headings[i]);
        }
      });
    }
  }
}

function useTableLabels() {
  useEffect(() => {
    stampLabels(document);
    const observer = new MutationObserver(() => stampLabels(document));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

export default function App() {
  const { user, loading } = useAuth();
  useTableLabels();

  if (loading) return <Spinner />;

  return (
    <div className={user ? 'app-shell' : ''}>
      <GreetingOverlay />
      {user && <Sidebar />}
      <main className={user ? 'app-main' : ''}>
        <RouteErrorBoundary>
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
        </RouteErrorBoundary>
      </main>
    </div>
  );
}
