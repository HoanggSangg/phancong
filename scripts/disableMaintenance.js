/**
 * Tắt chế độ bảo trì trong MongoDB.
 * Chạy trên máy backend (máy Vũ): node scripts/disableMaintenance.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const SystemSettings = require('../src/models/SystemSettings');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const doc = await SystemSettings.findOneAndUpdate(
    { singletonKey: 'default' },
    {
      $set: {
        maintenanceMode: false,
        maintenanceNoticeActive: false,
      },
    },
    { upsert: true, new: true },
  ).lean();

  console.log('OK: Đã tắt bảo trì.');
  console.log('  maintenanceMode:', doc.maintenanceMode);
  console.log('  maintenanceNoticeActive:', doc.maintenanceNoticeActive);
  console.log('Restart backend (Ctrl+C rồi npm run dev) nếu trang vẫn hiện bảo trì.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Lỗi:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
