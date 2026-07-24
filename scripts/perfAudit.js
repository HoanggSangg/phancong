/**
 * GD6/GD7 smoke + performance probe (temporary audit script).
 * Usage: node scripts/perfAudit.js
 * Does not modify data (GET-only except login via JWT mint).
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const BASE = process.env.AUDIT_BASE || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'phancong-dev-secret-change-me';
const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';

const pages = [
  {
    name: 'Home /cars (dashboard)',
    calls: [
      { method: 'GET', path: '/api/cars/working-pending' },
      { method: 'GET', path: '/api/cars/overdue' },
      { method: 'GET', path: '/api/locations' },
    ],
  },
  {
    name: 'ManageCars',
    calls: [
      { method: 'GET', path: '/api/cars/manage-list?page=1&limit=50&statusFilter=not_delivered' },
      { method: 'GET', path: '/api/locations' },
      { method: 'GET', path: '/api/supervisors' },
      { method: 'GET', path: '/api/worker/available' },
    ],
  },
  {
    name: 'WokerAssignment',
    calls: [
      { method: 'GET', path: '/api/cars?statusFilter=not_delivered' },
      { method: 'GET', path: '/api/worker' },
    ],
  },
  {
    name: 'AvailableWorkers',
    calls: [{ method: 'GET', path: '/api/worker/available' }],
  },
  {
    name: 'MainWorkers',
    calls: [{ method: 'GET', path: '/api/worker' }],
  },
  {
    name: 'Attendance calendar',
    calls: [
      { method: 'GET', path: '/api/attendance/workers' },
      { method: 'GET', path: '/api/teams' },
    ],
  },
  {
    name: 'Day-work payroll',
    calls: [
      { method: 'GET', path: `/api/attendance/payroll/${new Date().getFullYear()}/${new Date().getMonth() + 1}` },
    ],
  },
  {
    name: 'DT Payroll month',
    calls: [
      { method: 'GET', path: `/api/payroll/${new Date().getFullYear()}/${new Date().getMonth() + 1}` },
    ],
  },
  {
    name: 'Admin dashboard',
    calls: [
      { method: 'GET', path: '/api/dashboard/overview?period=month' },
    ],
  },
  {
    name: 'KTV messages',
    calls: [
      { method: 'GET', path: '/api/ktv-messages?status=unread&limit=50' },
    ],
  },
  {
    name: 'Operation logs',
    calls: [
      { method: 'GET', path: '/api/audit-logs?page=1&limit=50' },
    ],
  },
];

const sizeOf = (data) => Buffer.byteLength(typeof data === 'string' ? data : JSON.stringify(data || null), 'utf8');

const countRecords = (data) => {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data.cars)) return data.cars.length;
  if (Array.isArray(data.workers)) return data.workers.length;
  if (Array.isArray(data.items)) return data.items.length;
  if (Array.isArray(data.data)) return data.data.length;
  if (Array.isArray(data.rows)) return data.rows.length;
  if (data.data && Array.isArray(data.data.rows)) return data.data.rows.length;
  if (typeof data === 'object') {
    const nestedArrays = Object.values(data).filter(Array.isArray);
    if (nestedArrays.length) return nestedArrays.reduce((n, a) => n + a.length, 0);
  }
  return null;
};

async function mintAdminToken() {
  await mongoose.connect(MONGO);
  const User = mongoose.connection.collection('users');
  const admin = await User.findOne({ role: 'admin', isActive: { $ne: false } });
  if (!admin) throw new Error('No admin user found in DB');
  const token = jwt.sign({ userId: String(admin._id) }, JWT_SECRET, { expiresIn: '1h' });
  return { token, username: admin.username, role: admin.role };
}

async function probe(token) {
  const client = axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
    timeout: 60000,
  });

  const results = [];

  for (const page of pages) {
    const pageResult = { page: page.name, calls: [], totalMs: 0, totalBytes: 0, errors: 0 };
    for (const call of page.calls) {
      const started = Date.now();
      let status = 0;
      let bytes = 0;
      let records = null;
      let err = '';
      try {
        const res = await client.request({ method: call.method, url: call.path });
        status = res.status;
        bytes = sizeOf(res.data);
        records = countRecords(res.data);
        if (status >= 400) {
          err = res.data?.message || `HTTP ${status}`;
          pageResult.errors += 1;
        }
      } catch (e) {
        err = e.message;
        pageResult.errors += 1;
      }
      const ms = Date.now() - started;
      pageResult.totalMs += ms;
      pageResult.totalBytes += bytes;
      pageResult.calls.push({
        path: call.path,
        status,
        ms,
        kb: Number((bytes / 1024).toFixed(1)),
        records,
        err: err || undefined,
      });
    }
    results.push(pageResult);
  }

  // Auth/me + health style checks for GD7
  const me = await client.get('/api/auth/me');
  const workers = await client.get('/api/worker');
  const cars = await client.get('/api/cars?statusFilter=not_delivered');
  const carsAll = await client.get('/api/cars');

  return {
    results,
    gd7: {
      me: me.status,
      meUser: me.data?.username || me.data?.user?.username || me.data?.fullName,
      workers: workers.status,
      workersCount: countRecords(workers.data),
      carsNotDelivered: cars.status,
      carsNotDeliveredCount: countRecords(cars.data),
      carsAllCount: countRecords(carsAll.data),
      carsAllKb: Number((sizeOf(carsAll.data) / 1024).toFixed(1)),
      carsFilteredKb: Number((sizeOf(cars.data) / 1024).toFixed(1)),
    },
  };
}

(async () => {
  try {
    const { token, username, role } = await mintAdminToken();
    console.log(`Auth: minted JWT for ${username} (${role})`);
    const { results, gd7 } = await probe(token);

    console.log('\n=== GD6 PAGE API PROBE ===');
    for (const page of results) {
      console.log(`\n[${page.page}] ${page.calls.length} calls | ${page.totalMs}ms | ${(page.totalBytes / 1024).toFixed(1)} KB | errors=${page.errors}`);
      for (const c of page.calls) {
        const rec = c.records == null ? '-' : c.records;
        console.log(`  ${c.status} ${c.ms}ms ${c.kb}KB rec=${rec} ${c.path}${c.err ? ` ERR:${c.err}` : ''}`);
      }
    }

    console.log('\n=== GD7 API SMOKE ===');
    console.log(JSON.stringify(gd7, null, 2));

    const failed = results.reduce((n, p) => n + p.errors, 0) + (gd7.me >= 400 ? 1 : 0);
    console.log(`\nDONE failedCalls=${failed}`);
    process.exit(failed > 0 ? 2 : 0);
  } catch (err) {
    console.error('AUDIT FAILED:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
