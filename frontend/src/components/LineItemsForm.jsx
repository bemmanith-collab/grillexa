import React from 'react';

function emptyLine(products) {
  return { productId: products[0]?.id || '', quantity: '', unitPrice: '' };
}

export default function LineItemsForm({ products, lines, setLines }) {
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

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <div className="line-items">
      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
            return (
              <tr key={i}>
                <td>
                  <select value={line.productId} onChange={(e) => handleProductChange(i, e.target.value)}>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
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
                <td>₹{amount.toFixed(2)}</td>
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
        <div className="line-items-total">Total: ₹{total.toFixed(2)}</div>
      </div>
    </div>
  );
}

export { emptyLine };
