const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong');
  const admin = await mongoose.connection.collection('users').findOne({ role: 'admin' });
  const token = jwt.sign(
    { userId: String(admin._id) },
    process.env.JWT_SECRET || 'phancong-dev-secret-change-me',
    { expiresIn: '1h' },
  );
  const w = await mongoose.connection.collection('workers').findOne({});
  const c = await mongoose.connection.collection('cars').findOne({ status: { $ne: 'delivered' } });
  const client = axios.create({
    baseURL: process.env.AUDIT_BASE || 'http://localhost:3000',
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const checks = [
    ['GET kpi', `/api/worker/kpi?period=month&workerId=${w._id}`],
    ['GET revenue chart', `/api/worker/revenue/chart?from=${y}-${String(m).padStart(2, '0')}-01&to=${y}-${String(m).padStart(2, '0')}-28`],
    ['GET car by id', `/api/cars/${c._id}`],
    ['GET repair items', `/api/cars/${c._id}/repair-items`],
    ['GET payroll settings', '/api/payroll/settings'],
    ['GET users', '/api/auth/users'],
    ['GET dead /busy (expect 404)', '/api/worker/busy'],
    ['GET dead /stats (expect 404)', '/api/cars/stats'],
  ];
  for (const [label, path] of checks) {
    const t = Date.now();
    const res = await client.get(path);
    const kb = (Buffer.byteLength(JSON.stringify(res.data || null)) / 1024).toFixed(1);
    console.log(`${res.status}\t${Date.now() - t}ms\t${kb}KB\t${label}\t${path}`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
