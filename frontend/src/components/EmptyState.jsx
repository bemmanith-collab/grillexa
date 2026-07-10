import React from 'react';
import { InboxIcon } from './icons';

export default function EmptyState({ icon: Icon = InboxIcon, message = 'Nothing here yet.' }) {
  return (
    <div className="empty-state">
      <Icon className="empty-state-icon" />
      <p>{message}</p>
    </div>
  );
}
