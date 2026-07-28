require('dotenv').config();

const http = require('http');
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
const payrollRoutes = require('./routes/payrollRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const systemRoutes = require('./routes/systemRoutes');
const documentImageRoutes = require('./routes/documentImageRoutes');
const { corsOptions } = require('./config/cors');
const { initializeSocket } = require('./socket/socketServer');
const { initRevenueDeductions } = require('./utils/revenueDeductions');
const { initSalarySettings } = require('./utils/salarySettings');
const { initAttendanceSettings } = require('./utils/attendanceSettings');
const { initSystemSettings } = require('./utils/systemSettings');
const { blockIfMaintenance } = require('./middleware/maintenance');
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
const server = http.createServer(app);

app.use(cors(corsOptions));
app.use(blockIfMaintenance);

// Proxy upload multipart TRƯỚC body-parser — tránh đọc/nuốt stream FormData
app.use('/api/document-images', documentImageRoutes);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/system', systemRoutes);
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
app.use('/api/payroll', payrollRoutes);
app.use('/api/attendance', attendanceRoutes);

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

initializeSocket(server);

mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong')
  .then(async () => {
    console.log('✅ Kết nối MongoDB thành công');

    await initRevenueDeductions();
    await initSalarySettings();
    await initAttendanceSettings();
    await initSystemSettings();
    await startCollectionTrim();
    startManualJobCleanup();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Kết nối MongoDB thất bại', err);
  });
