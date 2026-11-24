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

import { billSheet, toCsv } from '../src/lib/tally.js';
const s = billSheet([
  { consignmentNo: 'CN-1', store: 'Raja, Kirana', createdBy: 'Praveen', totalDeliveredValue: 100, items: [{ product: 'Legs', deliveredQty: 2, totalValue: 60 }, { product: 'Wings', deliveredQty: 1, totalValue: 40 }] },
  { consignmentNo: 'CN-2', store: 'Sai', createdBy: 'Ravi', totalDeliveredValue: 75.1, items: [{ product: 'Wings', deliveredQty: 3, totalValue: 75.1 }] },
], ['Wings', 'Legs']);
assert.deepEqual(s.rows[0], ['CN-1', 'Raja, Kirana', 'Praveen', 1, 2, 100]);
assert.deepEqual(s.total, ['TOTAL', '2 bills', '', 4, 2, 175.1]);
assert.equal(toCsv(s).split('\r\n')[1], 'CN-1,"Raja, Kirana",Praveen,1,2,100');
console.log('ok   billSheet');
assert.deepEqual(billSheet([], ['Wings'], false).head, ['Bill', 'Store', 'Wings', 'Value']);
console.log('ok   billSheet without person');

import { sheetsByPerson } from '../src/lib/tally.js';
const per = sheetsByPerson([
  { consignmentNo: 'CN-1', store: 'A', createdBy: 'Ravi', totalDeliveredValue: 50, items: [{ product: 'Legs', deliveredQty: 2, totalValue: 50 }] },
  { consignmentNo: 'CN-2', store: 'B', createdBy: 'Praveen', totalDeliveredValue: 40, items: [{ product: 'Wings', deliveredQty: 1, totalValue: 40 }] },
  { consignmentNo: 'CN-3', store: 'C', createdBy: 'Ravi', totalDeliveredValue: 30, items: [{ product: 'Legs', deliveredQty: 1, totalValue: 30 }] },
], ['Wings', 'Legs']);
assert.deepEqual(per.map((p) => p.person), ['Praveen', 'Ravi']);
assert.deepEqual(per[1].sheet.head, ['Bill', 'Store', 'Legs', 'Value']);
assert.deepEqual(per[1].sheet.total, ['TOTAL', '2 bills', 3, 80]);
console.log('ok   sheetsByPerson');
