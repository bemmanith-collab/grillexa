import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  Banknote,
  Package,
  Tag,
  ScrollText,
  TrendingUp,
  Store,
  Users,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales',
};

function NavItem({ to, end, icon: Icon, onNavigate, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={children}
      onClick={onNavigate}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      <Icon className="sidebar-link-icon" size={18} strokeWidth={1.8} />
      <span className="sidebar-link-label">{children}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer any time the route changes (link click, back button, etc).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const closeMenu = () => setMobileOpen(false);

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="hamburger-btn"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="sidebar-brand">
          <span className="sidebar-logo">G</span>
          <span className="sidebar-brand-name">Grillexa</span>
        </div>
      </div>

      {mobileOpen && <div className="sidebar-backdrop" onClick={closeMenu} />}

      <aside className={`sidebar${mobileOpen ? ' sidebar-mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-logo">G</span>
          <span className="sidebar-brand-name">Grillexa</span>
        </div>

        <nav className="sidebar-nav">
          <NavItem to="/" end icon={BarChart3} onNavigate={closeMenu}>Today's Stock</NavItem>
          <NavItem to="/sales" icon={Banknote} onNavigate={closeMenu}>Sales</NavItem>
          {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
            <NavItem to="/dispatches" icon={Package} onNavigate={closeMenu}>Dispatches</NavItem>
          )}
          {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
            <NavItem to="/products" icon={Tag} onNavigate={closeMenu}>Products</NavItem>
          )}
          <NavItem to="/stock-history" icon={ScrollText} onNavigate={closeMenu}>Stock History</NavItem>
          {(user.role === 'ADMIN' || user.role === 'MANAGER') && (
            <NavItem to="/reports" icon={TrendingUp} onNavigate={closeMenu}>Reports</NavItem>
          )}
          {user.role === 'ADMIN' && <NavItem to="/stores" icon={Store} onNavigate={closeMenu}>Stores</NavItem>}
          {user.role === 'ADMIN' && <NavItem to="/users" icon={Users} onNavigate={closeMenu}>Users</NavItem>}
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
            <LogOut size={18} strokeWidth={1.8} />
          </button>
        </div>
      </aside>
    </>
  );
}
