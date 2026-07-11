import React from 'react';
import logoIcon from '../assets/grillexa-icon.png';

export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap">
      <span className="brand-spinner" aria-hidden="true">
        <img src={logoIcon} alt="" className="brand-spinner-icon" />
      </span>
      <span>{label}</span>
    </div>
  );
}
