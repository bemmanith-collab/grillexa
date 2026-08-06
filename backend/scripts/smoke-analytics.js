// Post-deploy smoke test for the charts and the Excel export, run inside the
// machine that is serving them:
//
//   flyctl ssh console -a grillexa -C "node /app/backend/scripts/smoke-analytics.js"
//
// Read-only. It mints a five-minute session for an existing ADMIN — the same
// JWT the login route issues, signed with the same secret, so it exercises the
// real auth path — and calls the endpoints over localhost. Unit tests cover the
// arithmetic without a database; this covers the half they cannot: that the
// Prisma queries are valid against the live schema and that the workbook
// actually builds from real rows.
const jwt = require('jsonwebtoken');
const http = require('http');
const prisma = require('../src/db');
const { todayStr } = require('../src/lib/stock');

const PORT = Number(process.env.PORT) || 4001;

function get(path, cookie) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path, headers: { Cookie: cookie } }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
        );
      })
      .on('error', reject);
  });
}

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${label}${detail ? ` — ${detail}` : ''}`);
}

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('no ADMIN account to sign in as');
  const cookie = `grillexa_session=${jwt.sign({ id: admin.id }, process.env.JWT_SECRET, { expiresIn: '5m' })}`;

  const to = todayStr();
  const from = new Date(`${to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  const range = `from=${from.toISOString().slice(0, 10)}&to=${to}`;

  const analytics = await get(`/api/reports/analytics?${range}`, cookie);
  check('GET /reports/analytics', analytics.status === 200, `status ${analytics.status}`);
  if (analytics.status === 200) {
    const data = JSON.parse(analytics.body);
    check('30 days on the trend, gaps filled', data.salesTrend.length === 30, `${data.salesTrend.length} points`);
    console.log(
      `        sales ₹${data.salesTrend.reduce((s, d) => s + d.amount, 0).toFixed(2)} · ` +
        `${data.productDistribution.length} product slices · ${data.storePerformance.length} store bars · ` +
        `${data.wastageByProduct.length} wastage bars · ${data.salespersonPerformance.length} sales people · ` +
        `filters: ${data.filters.stores.length} stores, ${data.filters.products.length} products`
    );
  } else {
    console.log(`        ${analytics.body.toString().slice(0, 300)}`);
  }

  // The person filter, against someone who actually sold: the figures must
  // come back smaller than the unfiltered ones, not equal to them (a filter
  // that silently does nothing looks exactly like a quiet salesperson).
  if (analytics.status === 200) {
    const all = JSON.parse(analytics.body);
    const top = all.salespersonPerformance[0];
    if (top) {
      const one = await get(`/api/reports/analytics?${range}&userId=${top.id}`, cookie);
      check('GET /reports/analytics?userId', one.status === 200, `status ${one.status}`);
      if (one.status === 200) {
        const data = JSON.parse(one.body);
        const total = data.salesTrend.reduce((s, d) => s + d.amount, 0);
        check(
          `the person filter narrows to ${top.label}`,
          Math.abs(total - top.amount) < 0.01 && data.salespersonPerformance.length === 1,
          `₹${total.toFixed(2)} of ₹${all.salesTrend.reduce((s, d) => s + d.amount, 0).toFixed(2)}`
        );
      }
    }
  }

  const excel = await get(`/api/reports/excel?${range}`, cookie);
  check('GET /reports/excel', excel.status === 200, `status ${excel.status}`);
  check(
    'sent as an .xlsx attachment',
    /spreadsheetml/.test(excel.headers['content-type'] || '') &&
      /attachment; filename=/.test(excel.headers['content-disposition'] || ''),
    excel.headers['content-disposition']
  );
  // An .xlsx is a zip; "PK" is the first thing in one. A JSON error page is not.
  check('the body is a real workbook', excel.body.slice(0, 2).toString() === 'PK', `${excel.body.length} bytes`);

  const dashboard = await get('/api/dashboard/salesperson', cookie);
  check('GET /dashboard/salesperson', dashboard.status === 200, `status ${dashboard.status}`);
  if (dashboard.status === 200) {
    const data = JSON.parse(dashboard.body);
    check('the dashboard trend is drawable', Array.isArray(data.trend) && data.trend.length === 30, `${data.trend?.length} points`);
  }

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} failing` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(async (err) => {
  console.error('FAILED', err.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
