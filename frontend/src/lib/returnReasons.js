export const RETURN_REASONS = [
  { value: 'CUSTOMER_RETURN', label: 'Customer Return' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'EXCHANGE', label: 'Exchange' },
  { value: 'OTHER', label: 'Other' },
];

// Not offered as a choice in the manual return form above — written
// automatically when a Consignment is settled with unsold stock. Listed
// here only so Return.reason still renders a friendly label wherever
// returns are displayed (e.g. Reports).
export const CONSIGNMENT_UNSOLD_REASON = { value: 'CONSIGNMENT_UNSOLD', label: 'Consignment Unsold' };

export const ALL_RETURN_REASON_LABELS = [...RETURN_REASONS, CONSIGNMENT_UNSOLD_REASON];
