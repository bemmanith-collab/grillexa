// The order products appear in, everywhere they are listed: the pickers on
// Deliver to Store and Direct Sale, Today's Stock, and the Products page.
//
// It lives here rather than in one of the routes because it has to be the same
// in all of them. Alphabetical was the default and it filed "Mixed fruit bowl"
// between the two sprouts; if only the picker were fixed, the picker and the
// sheet it feeds would disagree about which row is third, which is worse than
// the original complaint.
//
// Lower first, ties by name. Product.sortOrder defaults to 100, so a product
// added without one lands after the numbered ones instead of at the top.
const PRODUCT_ORDER = [{ sortOrder: 'asc' }, { name: 'asc' }];

module.exports = { PRODUCT_ORDER };
