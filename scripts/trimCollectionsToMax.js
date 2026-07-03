/**
 * Giữ tối đa N bản ghi mới nhất cho mỗi collection (mặc định 5000).
 * Xóa các bản ghi cũ hơn theo createdAt (và _id nếu trùng thời gian).
 *
 * Collections: Car, Worker, User, Location, Supervisor, Team,
 *              Wokers, RepairOrderItem, OperationLog
 *
 * Usage:
 *   node scripts/trimCollectionsToMax.js
 *   node scripts/trimCollectionsToMax.js --apply
 *   node scripts/trimCollectionsToMax.js --apply --max=5000
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { trimAllCollections, DEFAULT_MAX_KEEP } = require('../src/utils/trimCollections');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';
const APPLY = process.argv.includes('--apply');

const maxArg = process.argv.find((arg) => arg.startsWith('--max='));
const MAX_KEEP = maxArg
  ? Math.max(1, parseInt(maxArg.split('=')[1], 10) || DEFAULT_MAX_KEEP)
  : Math.max(1, parseInt(process.env.COLLECTION_MAX_RECORDS || String(DEFAULT_MAX_KEEP), 10));

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN');
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);
  console.log(APPLY ? 'Mode: APPLY (xóa dữ liệu cũ)' : 'Mode: DRY-RUN (chỉ xem, không ghi)');
  console.log(`Giới hạn mỗi collection: ${MAX_KEEP} bản ghi mới nhất\n`);

  const results = await trimAllCollections({
    maxKeep: MAX_KEEP,
    dryRun: !APPLY,
  });

  console.log('=== KẾT QUẢ ===');
  let totalDeleted = 0;

  results.forEach((row) => {
    if (row.skipped) {
      console.log(`[${row.collection}] ${row.total} bản ghi — OK, chưa vượt ${MAX_KEEP}`);
      return;
    }

    totalDeleted += row.deleted;
    console.log(
      `[${row.collection}] Tổng ${row.total} → giữ ${row.kept}, `
      + `${APPLY ? 'đã xóa' : 'sẽ xóa'} ${row.deleted} `
      + `(cắt từ ${formatDate(row.cutoffAt)})`
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
