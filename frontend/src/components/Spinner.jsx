import React from 'react';

export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
