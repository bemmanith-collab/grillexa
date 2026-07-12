// Fills in the branded invoice (BillDetailModal). Every field is optional —
// the invoice simply omits a line if its value is empty, rather than ever
// showing a placeholder. GSTIN/FSSAI are real regulatory registration
// numbers, so leave them blank until you have the actual ones; a fake-looking
// number on a real customer invoice is a compliance problem, not a cosmetic one.
export const BUSINESS_INFO = {
  name: 'GRILLEXA',
  tagline: 'MODERN · INNOVATIVE · HEALTHY',
  addressLines: ['16-11-511/D/371, Moosarambagh, Saleem Nagar', 'Sripuram Colony, Amberpet, Hyderabad, Telangana - 500036'],
  gstin: '',
  fssai: '23626028000512',
  phone: '',
  email: '',
  website: '',
  instagram: '',
  reviewLink: '',
  whatsappChannelLink: '',
};
