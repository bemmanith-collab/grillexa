import React from 'react';
import SearchSelect from './SearchSelect';
import { RETURN_REASONS } from '../lib/returnReasons';
import { formatCurrency } from '../lib/format';

function emptyLine(products) {
  return {
    productId: products[0]?.id || '',
    quantity: '',
    unitPrice: products[0]?.price != null ? products[0].price : '',
    type: 'SALE',
    reason: '',
  };
}

// allowReturns: pass false to hide the Sale/Return toggle for callers (like
// Dispatches) that only ever deal in one-directional stock lines.
export default function LineItemsForm({ products, lines, setLines, allowReturns = true }) {
  function updateLine(index, patch) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(products)]);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleProductChange(index, productId) {
    const product = products.find((p) => p.id === Number(productId));
    updateLine(index, {
      productId: Number(productId),
      unitPrice: product?.price != null ? product.price : lines[index].unitPrice,
    });
  }

  function handleTypeChange(index, type) {
    updateLine(index, { type, reason: type === 'RETURN' ? RETURN_REASONS[0].value : '' });
  }

  const total = lines.reduce((sum, l) => {
    const amount = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    return sum + (l.type === 'RETURN' ? -amount : amount);
  }, 0);

  return (
    <div className="line-items">
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {allowReturns && <th className="col-type">Type</th>}
            <th className="col-product">Product</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            {allowReturns && <th className="col-reason">Reason</th>}
            <th>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const isReturn = allowReturns && line.type === 'RETURN';
            const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
            return (
              <tr key={i} className={isReturn ? 'line-return' : undefined}>
                {allowReturns && (
                  <td className="col-type">
                    <select value={line.type || 'SALE'} onChange={(e) => handleTypeChange(i, e.target.value)}>
                      <option value="SALE">Sale</option>
                      <option value="RETURN">Return</option>
                    </select>
                  </td>
                )}
                <td className="col-product">
                  {/* No recentKey: the catalogue order is a deliberate one
                      (see Product order in the README), and this device's
                      habits have no business reshuffling it. */}
                  <SearchSelect
                    options={products}
                    value={line.productId}
                    onChange={(id) => handleProductChange(i, id)}
                    placeholder="Search products…"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    className="line-input"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="line-input"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  />
                </td>
                {allowReturns && (
                  <td className="col-reason">
                    {isReturn ? (
                      <select value={line.reason || RETURN_REASONS[0].value} onChange={(e) => updateLine(i, { reason: e.target.value })}>
                        {RETURN_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                )}
                <td className={isReturn ? 'text-danger' : undefined}>{formatCurrency(isReturn ? -amount : amount)}</td>
                <td>
                  <button type="button" className="btn-danger btn-sm" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="line-items-footer">
        <button type="button" className="btn-secondary btn-sm" onClick={addLine}>
          + Add line
        </button>
        <div className="line-items-total">Total: {formatCurrency(total)}</div>
      </div>
    </div>
  );
}

export { emptyLine };
