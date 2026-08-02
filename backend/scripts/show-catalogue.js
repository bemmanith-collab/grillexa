// Prints the product catalogue in the exact order every list in the app shows
// it, with each name wrapped in brackets so trailing spaces and odd whitespace
// are visible. Read-only.
//
//   node scripts/show-catalogue.js
//
// Written because a migration seeded sortOrder by matching on name and matched
// nothing, which is silent: every product keeps the default and the list falls
// back to alphabetical, looking exactly like the change was never deployed.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PRODUCT_ORDER } = require('../src/lib/catalogue');

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ orderBy: PRODUCT_ORDER });
  console.log(`${products.length} products, in the order the app lists them:\n`);
  console.log('  #  id   sortOrder  name');
  products.forEach((p, i) => {
    console.log(`  ${String(i + 1).padStart(2)}  ${String(p.id).padStart(3)}  ${String(p.sortOrder).padStart(9)}  [${p.name}]`);
  });
  const unset = products.filter((p) => p.sortOrder === 100);
  if (unset.length) {
    console.log(`\n${unset.length} product(s) still at the default 100 — they sort last, by name.`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
