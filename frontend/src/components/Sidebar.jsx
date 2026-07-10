import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BoxIcon, ReceiptIcon, TruckIcon, HistoryIcon, ChartIcon, StoreIcon, UsersIcon, LogoutIcon, InboxIcon } from './icons';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales',
};

function NavItem({ to, end, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={children}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      <Icon className="sidebar-link-icon" />
      <span className="sidebar-link-label">{children}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-logo">G</span>
        <span className="sidebar-brand-name">Grillexa</span>
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/" end icon={BoxIcon}>Today's Stock</NavItem>
        <NavItem to="/sales" icon={ReceiptIcon}>Sales</NavItem>
        {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
          <NavItem to="/dispatches" icon={TruckIcon}>Dispatches</NavItem>
        )}
        {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
          <NavItem to="/products" icon={InboxIcon}>Products</NavItem>
        )}
        <NavItem to="/stock-history" icon={HistoryIcon}>Stock History</NavItem>
        {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
          <NavItem to="/reports" icon={ChartIcon}>Reports</NavItem>
        )}
        {user.role === 'ADMIN' && <NavItem to="/stores" icon={StoreIcon}>Stores</NavItem>}
        {user.role === 'ADMIN' && <NavItem to="/users" icon={UsersIcon}>Users</NavItem>}
      </nav>

      <div className="sidebar-user">
        <div className="avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">
            <span className={`role-pill role-${user.role.toLowerCase()}`}>{ROLE_LABELS[user.role]}</span>
          </div>
        </div>
        <button
          className="logout-btn"
          title="Log out"
          aria-label="Log out"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}
