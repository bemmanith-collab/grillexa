import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BarChart3,
  Banknote,
  Wallet,
  Package,
  PackageCheck,
  Handshake,
  Tag,
  ScrollText,
  TrendingUp,
  Store,
  Users,
  LogOut,
  KeyRound,
  MoreHorizontal,
  Menu,
  X,
} from 'lucide-react';
import logoIcon from '../assets/grillexa-icon.png';
import ChangePasswordModal from './ChangePasswordModal';
import InstallAppButton from './InstallAppButton';

const ROLE_LABELS = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales',
};

const ALL = 'ADMIN MANAGER SALES';
const STAFF = 'ADMIN MANAGER';

// One definition drives both layouts: the desktop sidebar lists all of these,
// the phone tab bar shows the first four and files the rest under More.
// `short` is the tab-bar label, where there's room for one word.
const NAV = [
  { to: '/', end: true, icon: BarChart3, label: "Today's Stock", short: 'Stock', roles: ALL },
  { to: '/deliver-to-store', icon: PackageCheck, label: 'Deliver to Store', short: 'Deliver', roles: ALL },
  { to: '/settle-consignment', icon: Handshake, label: 'Settle Consignment', short: 'Settle', roles: ALL },
  { to: '/direct-sale', icon: Wallet, label: 'Direct Sale', short: 'Sale', roles: ALL },
  { to: '/sales', icon: Banknote, label: 'Sales', roles: ALL },
  { to: '/dispatches', icon: Package, label: 'Dispatches', roles: STAFF },
  { to: '/products', icon: Tag, label: 'Products', roles: STAFF },
  { to: '/stock-history', icon: ScrollText, label: 'Stock History', roles: STAFF },
  { to: '/reports', icon: TrendingUp, label: 'Reports', roles: STAFF },
  { to: '/stores', icon: Store, label: 'Stores', roles: 'ADMIN' },
  { to: '/users', icon: Users, label: 'Users', roles: 'ADMIN' },
];

const PRIMARY_COUNT = 4;

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  // Browser tabs get the website's sidebar as a drawer; the installed app gets
  // the bottom tab bar instead. CSS picks between them on display-mode, so
  // both are always rendered.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // Close the More sheet on any route change, including the back button.
  useEffect(() => {
    setMoreOpen(false);
    setDrawerOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const items = NAV.filter((item) => item.roles.includes(user.role));
  const primary = items.slice(0, PRIMARY_COUNT);
  const rest = items.slice(PRIMARY_COUNT);
  const onMoreRoute = rest.some((item) => location.pathname === item.to);

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="hamburger-btn"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="sidebar-brand">
          <img src={logoIcon} alt="" className="sidebar-logo" />
          <span className="sidebar-brand-name">Grillexa</span>
        </div>
      </div>

      {drawerOpen && <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />}

      {/* Desktop rail, and — in a phone browser tab — the slide-in drawer. */}
      <aside className={`sidebar${drawerOpen ? ' sidebar-mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <img src={logoIcon} alt="" className="sidebar-logo" />
          <span className="sidebar-brand-name">Grillexa</span>
        </div>

        <nav className="sidebar-nav">
          {items.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon className="sidebar-link-icon" size={18} strokeWidth={1.8} />
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Desktop's equivalent of the More sheet's install button — Chrome
            offers this from an icon in the address bar that is easy to miss. */}
        <InstallAppButton className="btn-secondary sidebar-install" />

        <div className="sidebar-user">
          <div className="avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">
              <span className={`role-pill role-${user.role.toLowerCase()}`}>{ROLE_LABELS[user.role]}</span>
            </div>
          </div>
          <button className="logout-btn" title="Change password" aria-label="Change password" onClick={() => setChangePasswordOpen(true)}>
            <KeyRound size={18} strokeWidth={1.8} />
          </button>
          <button className="logout-btn" title="Log out" aria-label="Log out" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={1.8} />
          </button>
        </div>
      </aside>

      {/* Phone only. Four sections a shift actually uses, plus More for the
          rest — which is also what stops an admin's eleven links overflowing
          a screen the way the old drawer did. */}
      <nav className="tabbar" aria-label="Sections">
        {primary.map(({ to, end, icon: Icon, label, short }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) => `tabbar-item${isActive ? ' active' : ''}`}
          >
            <Icon size={21} strokeWidth={1.8} />
            <span>{short}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`tabbar-item${moreOpen || onMoreRoute ? ' active' : ''}`}
          aria-expanded={moreOpen}
          aria-label="More sections"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <MoreHorizontal size={21} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="More sections">
            <div className="more-head">
              <div className="sidebar-user">
                <div className="avatar">{initials}</div>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name">{user.name}</div>
                  <div className="sidebar-user-role">
                    <span className={`role-pill role-${user.role.toLowerCase()}`}>{ROLE_LABELS[user.role]}</span>
                  </div>
                </div>
              </div>
              <button className="logout-btn" aria-label="Close" onClick={() => setMoreOpen(false)}>
                <X size={20} strokeWidth={1.8} />
              </button>
            </div>

            <div className="more-grid">
              {rest.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `more-item${isActive ? ' active' : ''}`}>
                  <Icon size={19} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>

            <InstallAppButton className="btn-primary more-install" />

            <div className="more-actions">
              <button type="button" className="btn-secondary" onClick={() => { setMoreOpen(false); setChangePasswordOpen(true); }}>
                <KeyRound size={16} strokeWidth={1.8} /> Change password
              </button>
              <button type="button" className="btn-secondary" onClick={handleLogout}>
                <LogOut size={16} strokeWidth={1.8} /> Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}
    </>
  );
}
