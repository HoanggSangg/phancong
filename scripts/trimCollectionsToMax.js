/**
 * Dọn dữ liệu DB theo chính sách phân tầng (xem src/utils/trimCollections.js).
 *
 * Usage:
 *   node scripts/trimCollectionsToMax.js
 *   node scripts/trimCollectionsToMax.js --apply
 */

require('dotenv').config();

const mongoose = require('mongoose');
const {
  trimAllCollections,
  getTrimSummary,
} = require('../src/utils/trimCollections');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';
const APPLY = process.argv.includes('--apply');

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
};

async function main() {
  const summary = getTrimSummary();

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);
  console.log(APPLY ? 'Mode: APPLY (xóa dữ liệu cũ)' : 'Mode: DRY-RUN (chỉ xem, không ghi)');
  console.log('Chính sách trim:');
  console.log(`  Car: delivered >${summary.deliveredCarMonths} tháng, max ${summary.carMax}`);
  console.log(`  RepairOrderItem: max ${summary.repairItemMax}`);
  console.log(`  OperationLog: >${summary.operationLogDays} ngày`);
  console.log(`  KtvMessage: >${summary.ktvMessageDays} ngày, max ${summary.ktvMessageMax}`);
  console.log(`  Bỏ qua: ${summary.skip.join(', ')}\n`);

  const results = await trimAllCollections({ dryRun: !APPLY });

  console.log('=== KẾT QUẢ ===');
  let totalDeleted = 0;

  results.forEach((row) => {
    if (row.skipped) {
      console.log(`[${row.collection}] ${row.total} bản ghi — OK (${row.policy || '—'})`);
      return;
    }

    totalDeleted += row.deleted;
    console.log(
      `[${row.collection}] Tổng ${row.total} → giữ ${row.kept}, `
      + `${APPLY ? 'đã xóa' : 'sẽ xóa'} ${row.deleted} `
      + `(${row.policy || '—'}, từ ${formatDate(row.cutoffAt)})`,
    );
  });

  console.log(`\nTổng ${APPLY ? 'đã xóa' : 'sẽ xóa'}: ${totalDeleted} bản ghi`);

  if (!APPLY && totalDeleted > 0) {
    console.log('\nChạy lại với --apply để xóa thật trên DB.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Lỗi:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});
