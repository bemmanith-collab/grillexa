import React from 'react';

// Minimal stroke-style icon set (no external dependency), 20x20, currentColor.
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function BoxIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function ReceiptIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function TruckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6h11v10H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="19" r="1.7" />
      <circle cx="17.5" cy="19" r="1.7" />
    </svg>
  );
}

export function HistoryIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3v5h5" />
      <path d="M3.5 9a8.5 8.5 0 1 1 1.6 6.4" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function ChartIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2 20h20" />
    </svg>
  );
}

export function StoreIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v11H3z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function UsersIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M15.7 13.9c2.9.4 5 2.8 5 6.1" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3H4v18h5" />
      <path d="M20 12H9" />
      <path d="m16 7 5 5-5 5" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2 1 21h22L12 2Z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function TrendUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function CoinIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2c0 1.3-1.1 1.7-2.5 2.1-1.4.4-2.5.9-2.5 2.2 0 1.2 1.1 2 2.5 2s2.5-.8 2.5-2" />
      <path d="M12 6v1.3M12 16.7V18" />
    </svg>
  );
}

export function EyeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c7 0 10.5 7 10.5 7a13.6 13.6 0 0 1-3.1 3.9M6.6 6.6C3.8 8.4 1.5 12 1.5 12s3.5 7 10.5 7a10.4 10.4 0 0 0 4.4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function InboxIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4h16l2 9v7H2v-7l2-9Z" />
      <path d="M2 13h6l1.5 3h5L16 13h6" />
    </svg>
  );
}
