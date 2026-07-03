require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const wokerRoutes = require('./routes/wokerRoutes');
const supervisorRoutes = require('./routes/supervisorRoutes');
const carRoutes = require('./routes/carRoutes');
const locationRoutes = require('./routes/locationRoutes');
const wokersRoutes = require('./routes/wokersRoutes');
const teamRoutes = require('./routes/teamRoutes');
const externalRoutes = require('./routes/externalRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const { trimAllCollections, DEFAULT_MAX_KEEP } = require('./utils/trimCollections');

const logTrimResults = (results, maxKeep) => {
  console.log(`\n🧹 Kiểm tra dữ liệu (giữ tối đa ${maxKeep} bản ghi mới nhất/collection)`);

  let totalDeleted = 0;

  results.forEach((row) => {
    if (row.skipped) {
      console.log(`   [${row.collection}] ${row.total} bản ghi — OK`);
      return;
    }

    totalDeleted += row.deleted;
    console.log(
      `   [${row.collection}] ${row.total} → giữ ${row.kept}, xóa ${row.deleted}`
    );
  });

  if (totalDeleted === 0) {
    console.log('   ✅ Tất cả collection đều trong giới hạn.\n');
  } else {
    console.log(`   ✅ Đã dọn ${totalDeleted} bản ghi cũ.\n`);
  }
};

const startCollectionTrim = async () => {
  const maxKeep = Math.max(
    1,
    parseInt(process.env.COLLECTION_MAX_RECORDS || String(DEFAULT_MAX_KEEP), 10)
  );
  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.TRIM_COLLECTIONS_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10)
  );
  const periodicEnabled = process.env.AUTO_TRIM_COLLECTIONS !== 'false';

  const runTrim = async () => {
    const results = await trimAllCollections({ maxKeep, dryRun: false });
    logTrimResults(results, maxKeep);
    return results;
  };

  try {
    await runTrim();
  } catch (err) {
    console.error('❌ Lỗi trim collections:', err.message);
  }

  if (periodicEnabled) {
    setInterval(() => {
      runTrim().catch((err) => console.error('❌ Lỗi trim collections:', err.message));
    }, intervalMs);
    console.log(`🔄 Auto-trim định kỳ: mỗi ${Math.round(intervalMs / 3600000)} giờ`);
  }
};

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://192.168.1.20:5173',
    'http://100.127.133.38:5173',
    'https://fe-phancong.vercel.app',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'Content-Type', 'Accept', 'Authorization', 'X-Api-Key'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/worker', wokerRoutes);
app.use('/api/supervisors', supervisorRoutes);
app.use('/api/cars', carRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/wokers', wokersRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/audit-logs', auditLogRoutes);

app.get('/', (req, res) => {
  res.status(200).send('🚀 Bá Thành backend is running.');
});

mongoose
  .connect('mongodb://localhost:27017/phancong')
  .then(async () => {
    console.log('✅ Kết nối MongoDB thành công');

    await startCollectionTrim();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Kết nối MongoDB thất bại', err);
  });
