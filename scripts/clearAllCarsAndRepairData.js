/**
 * Xóa TOÀN BỘ xe, chi tiết sửa chữa (RepairOrderItem) và doanh thu liên quan.
 * Sau khi xóa: chuyển tất cả thợ về trạng thái rảnh (available).
 *
 * KHÔNG xóa: Worker, User, Supervisor, Location, Team, Wokers (chỉ reset trạng thái).
 *
 * Usage:
 *   node scripts/clearAllCarsAndRepairData.js              # dry-run (mặc định)
 *   node scripts/clearAllCarsAndRepairData.js --apply      # ghi DB
 */

require('dotenv').config();

const mongoose = require('mongoose');
const Car = require('../src/models/Car');
const Worker = require('../src/models/Worker');
const RepairOrderItem = require('../src/models/RepairOrderItem');
const Wokers = require('../src/models/Wokers');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';
const APPLY = process.argv.includes('--apply');

const formatMoney = (value) =>
  Number(value || 0).toLocaleString('vi-VN');

async function collectStats() {
  const [carCount, itemCount, itemsWithRevenue] = await Promise.all([
    Car.countDocuments(),
    RepairOrderItem.countDocuments(),
    RepairOrderItem.countDocuments({
      $or: [
        { 'workerRevenues.0': { $exists: true } },
        { 'workerAssignments.0': { $exists: true } },
        { worker: { $ne: null } },
      ],
    }),
  ]);

  const revenueAgg = await RepairOrderItem.aggregate([
    {
      $project: {
        gross: {
          $sum: {
            $map: {
              input: { $ifNull: ['$workerRevenues', []] },
              as: 'row',
              in: { $ifNull: ['$$row.grossRevenue', 0] },
            },
          },
        },
        net: {
          $sum: {
            $map: {
              input: { $ifNull: ['$workerRevenues', []] },
              as: 'row',
              in: { $ifNull: ['$$row.netRevenue', 0] },
            },
          },
        },
        amount: { $ifNull: ['$amount', 0] },
      },
    },
    {
      $group: {
        _id: null,
        totalGross: { $sum: '$gross' },
        totalNet: { $sum: '$net' },
        totalAmount: { $sum: '$amount' },
      },
    },
  ]);

  const revenue = revenueAgg[0] || {
    totalGross: 0,
    totalNet: 0,
    totalAmount: 0,
  };

  const wokersWithCar = await Wokers.countDocuments({ car: { $ne: null } });
  const busyWorkers = await Worker.countDocuments({ status: 'busy' });
  const wokersBusy = await Wokers.countDocuments({ status: 'co_viec' });
  const workersWithActiveManualJobs = await Worker.countDocuments({
    'manualJobs.status': 'co_viec',
  });

  const sampleCars = await Car.find()
    .select('plateNumber status currentDate')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const sampleItems = await RepairOrderItem.find()
    .select('plateNumber content amount')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return {
    carCount,
    itemCount,
    itemsWithRevenue,
    revenue,
    wokersWithCar,
    busyWorkers,
    wokersBusy,
    workersWithActiveManualJobs,
    sampleCars,
    sampleItems,
  };
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);
  console.log(APPLY ? 'Mode: APPLY (xóa dữ liệu trên DB)' : 'Mode: DRY-RUN (chỉ xem, không ghi)');

  const stats = await collectStats();

  console.log('\n=== TỔNG QUAN ===');
  console.log(`Xe (Car):                    ${stats.carCount}`);
  console.log(`Hạng mục sửa chữa:           ${stats.itemCount}`);
  console.log(`Hạng mục có phân công/DT:    ${stats.itemsWithRevenue}`);
  console.log(`Tổng thành tiền hạng mục:    ${formatMoney(stats.revenue.totalAmount)} đ`);
  console.log(`Tổng DT trước hoa hồng:      ${formatMoney(stats.revenue.totalGross)} đ`);
  console.log(`Tổng DT sau trừ 25%:         ${formatMoney(stats.revenue.totalNet)} đ`);
  console.log(`Wokers còn gắn car:          ${stats.wokersWithCar} (sẽ gỡ ref)`);
  console.log(`Thợ đang bận (Worker.busy):   ${stats.busyWorkers} → available`);
  console.log(`Wokers đang có việc:        ${stats.wokersBusy} → chua_co_viec`);
  console.log(`Thợ có việc ghi tay:        ${stats.workersWithActiveManualJobs} → chua_co_viec`);

  if (stats.carCount === 0 && stats.itemCount === 0) {
    console.log('\nKhông có dữ liệu xe / sửa chữa để xóa.');
    if (!APPLY) {
      await mongoose.disconnect();
      return;
    }
  }

  if (stats.sampleCars.length) {
    console.log('\nMẫu xe (tối đa 10):');
    stats.sampleCars.forEach((car, index) => {
      console.log(
        `  ${index + 1}. ${car.plateNumber || '—'} | ${car.status || '—'} | ${car.currentDate || '—'}`
      );
    });
  }

  if (stats.sampleItems.length) {
    console.log('\nMẫu hạng mục (tối đa 10):');
    stats.sampleItems.forEach((item, index) => {
      console.log(
        `  ${index + 1}. [${item.plateNumber || '—'}] ${item.content || '—'} — ${formatMoney(item.amount)} đ`
      );
    });
  }

  if (!APPLY) {
    console.log('\nChạy lại với --apply để xóa Car + RepairOrderItem và chuyển tất cả thợ về rảnh.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nĐang xóa...');

  const repairResult = await RepairOrderItem.deleteMany({});
  const carResult = await Car.deleteMany({});
  const wokersResult = await Wokers.updateMany(
    {},
    { $set: { status: 'chua_co_viec' }, $unset: { car: '' } }
  );
  const workerStatusResult = await Worker.updateMany({}, { $set: { status: 'available' } });

  const workersWithManualJobs = await Worker.find({ 'manualJobs.status': 'co_viec' });
  let manualJobCount = 0;
  for (const worker of workersWithManualJobs) {
    worker.manualJobs.forEach((job) => {
      if (job.status === 'co_viec') {
        job.status = 'chua_co_viec';
        manualJobCount += 1;
      }
    });
    worker.status = 'available';
    await worker.save();
  }

  console.log('\n=== KẾT QUẢ ===');
  console.log(`Đã xóa RepairOrderItem:     ${repairResult.deletedCount}`);
  console.log(`Đã xóa Car:                 ${carResult.deletedCount}`);
  console.log(`Đã reset Wokers:            ${wokersResult.modifiedCount}`);
  console.log(`Thợ → available:            ${workerStatusResult.modifiedCount}`);
  console.log(`Việc ghi tay → chua_co_viec: ${manualJobCount}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Lỗi:', error);
  await mongoose.disconnect();
  process.exit(1);
});
