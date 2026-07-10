import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Inventory from './pages/Inventory';
import Dispatches from './pages/Dispatches';
import Products from './pages/Products';
import Sales from './pages/Sales';
import StockHistory from './pages/StockHistory';
import Users from './pages/Users';
import Stores from './pages/Stores';
import Reports from './pages/Reports';
import Spinner from './components/Spinner';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  return (
    <div className={user ? 'app-shell' : ''}>
      {user && <Sidebar />}
      <main className={user ? 'app-main' : ''}>
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
              <ProtectedRoute>
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
      </main>
    </div>
  );
}
