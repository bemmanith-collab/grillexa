// The tally card on Deliver to Store. Run: npm test (from frontend/).
import assert from 'node:assert/strict';
import { tallyOf } from '../src/lib/tally.js';

const t = tallyOf([
  { createdBy: 'Praveen', totalDeliveredValue: 75.1, items: [{ product: 'Wings', deliveredQty: 3, totalValue: 75.1 }] },
  { createdBy: 'Praveen', totalDeliveredValue: 0.2, items: [{ product: 'Wings', deliveredQty: 1, totalValue: 0.2 }] },
  { createdBy: 'Ravi', totalDeliveredValue: 100, items: [{ product: 'Legs', deliveredQty: 2, totalValue: 60 }, { product: 'Wings', deliveredQty: 1, totalValue: 40 }] },
]);
assert.equal(t.units, 7);
assert.equal(t.value, 175.3);
assert.deepEqual(t.byProduct, [{ name: 'Wings', units: 5, value: 115.3 }, { name: 'Legs', units: 2, value: 60 }]);
assert.deepEqual(t.byPerson, [{ name: 'Ravi', units: 1, value: 100 }, { name: 'Praveen', units: 2, value: 75.3 }]);
assert.deepEqual(tallyOf([]), { units: 0, value: 0, byProduct: [], byPerson: [] });
console.log('ok   tally');
