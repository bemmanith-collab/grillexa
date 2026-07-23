import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Spinner from './components/Spinner';

const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Dispatches = lazy(() => import('./pages/Dispatches'));
const DeliverToStore = lazy(() => import('./pages/DeliverToStore'));
const SettleConsignment = lazy(() => import('./pages/SettleConsignment'));
const Products = lazy(() => import('./pages/Products'));
const Sales = lazy(() => import('./pages/Sales'));
const StockHistory = lazy(() => import('./pages/StockHistory'));
const Users = lazy(() => import('./pages/Users'));
const Stores = lazy(() => import('./pages/Stores'));
const Reports = lazy(() => import('./pages/Reports'));

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  return (
    <div className={user ? 'app-shell' : ''}>
      {user && <Sidebar />}
      <main className={user ? 'app-main' : ''}>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup />} />
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
