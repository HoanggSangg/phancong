require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const wokerRoutes = require('./routes/wokerRoutes');
const supervisorRoutes = require('./routes/supervisorRoutes');
const carRoutes = require('./routes/carRoutes');
const locationRoutes = require('./routes/locationRoutes');
const teamRoutes = require('./routes/teamRoutes');
const externalRoutes = require('./routes/externalRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const ktvMessageRoutes = require('./routes/ktvMessageRoutes');
const { initRevenueDeductions } = require('./utils/revenueDeductions');
const { trimAllCollections, getTrimSummary } = require('./utils/trimCollections');
const {
  cleanupExpiredManualJobs,
  scheduleDailyManualJobCleanup,
  getCleanupHour,
} = require('./utils/manualJobCleanup');

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
};

const logTrimResults = (results, summary) => {
  console.log('\n🧹 Kiểm tra dữ liệu DB');
  console.log(`   Chính sách: Car delivered >${summary.deliveredCarMonths} tháng + max ${summary.carMax}`);
  console.log(`   RepairOrderItem max ${summary.repairItemMax}`);
  console.log(
    `   OperationLog >${summary.operationLogDays} ngày | KtvMessage >${summary.ktvMessageDays} ngày + max ${summary.ktvMessageMax}`,
  );
  console.log(`   Bỏ qua: ${summary.skip.join(', ')}`);

  let totalDeleted = 0;

  results.forEach((row) => {
    const policy = row.policy ? ` [${row.policy}]` : '';

    if (row.skipped) {
      console.log(`   [${row.collection}] ${row.total} bản ghi — OK${policy}`);
      return;
    }

    totalDeleted += row.deleted;
    const cutoff = row.cutoffAt ? ` (từ ${formatDate(row.cutoffAt)})` : '';
    console.log(
      `   [${row.collection}] ${row.total} → giữ ${row.kept}, xóa ${row.deleted}${cutoff}${policy}`,
    );

    if (row.details) {
      if (row.collection === 'Car') {
        const d = row.details;
        console.log(
          `      ↳ delivered cũ: ${d.deletedByAge}, delivered vượt max: ${d.deletedByCount}, `
          + `repair items: ${d.repairItemsDeleted}, xe đang xử lý: ${d.activeCount}`,
        );
      }
      if (row.collection === 'RepairOrderItem') {
        const d = row.details;
        console.log(`      ↳ orphan: ${d.orphanDeleted}, vượt max: ${d.countDeleted}`);
      }
      if (row.collection === 'KtvMessage') {
        const d = row.details;
        console.log(`      ↳ theo tuổi: ${d.deletedByAge}, vượt max: ${d.deletedByCount}`);
      }
    }
  });

  if (totalDeleted === 0) {
    console.log('   ✅ Tất cả collection đều trong giới hạn.\n');
  } else {
    console.log(`   ✅ Đã dọn ${totalDeleted} bản ghi cũ.\n`);
  }
};

const startManualJobCleanup = () => {
  const enabled = process.env.AUTO_CLEANUP_MANUAL_JOBS !== 'false';
  if (!enabled) return;

  const runCleanup = async () => {
    try {
      const result = await cleanupExpiredManualJobs();
      if (result.deletedCount > 0) {
        console.log(
          `🧹 Dọn việc ghi tay (12:00 VN): xóa ${result.deletedCount} việc, `
          + `cập nhật ${result.workersUpdated} thợ`,
        );
      }
    } catch (err) {
      console.error('❌ Lỗi dọn việc ghi tay:', err.message);
    }
  };

  const nextRun = scheduleDailyManualJobCleanup(runCleanup);
  const hour = getCleanupHour();
  console.log(`🔄 Dọn việc ghi tay: lập lịch ${hour}:00 hàng ngày (VN), lần chạy tiếp: ${nextRun}`);
};

const startCollectionTrim = async () => {
  const summary = getTrimSummary();
  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.TRIM_COLLECTIONS_INTERVAL_MS || String(24 * 60 * 60 * 1000), 10),
  );
  const periodicEnabled = process.env.AUTO_TRIM_COLLECTIONS !== 'false';

  const runTrim = async () => {
    const results = await trimAllCollections({ dryRun: false });
    logTrimResults(results, summary);
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
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowedOrigins = new Set([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.1.250:5173',
      'http://100.127.133.38:5173',
      'https://fe-phancong.vercel.app',
    ]);

    if (
      allowedOrigins.has(origin)
      || /^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin)
      || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
      || /^http:\/\/localhost:\d+$/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(null, false);
  },
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
app.use('/api/teams', teamRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ktv-messages', ktvMessageRoutes);

app.get('/', (req, res) => {
  res.status(200).send('🚀 Bá Thành backend is running.');
});

app.use((req, res) => {
  res.status(404).json({ message: 'Không tìm thấy API' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Lỗi hệ thống',
  });
});

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong')
  .then(async () => {
    console.log('✅ Kết nối MongoDB thành công');

    await initRevenueDeductions();
    await startCollectionTrim();
    startManualJobCleanup();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Kết nối MongoDB thất bại', err);
  });
