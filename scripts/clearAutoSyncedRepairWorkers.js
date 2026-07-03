/**
 * Xóa phân công thợ tự động (sync từ thợ chính/thợ phụ) trên RepairOrderItem.
 *
 * Usage:
 *   node scripts/clearAutoSyncedRepairWorkers.js           # dry-run (mặc định)
 *   node scripts/clearAutoSyncedRepairWorkers.js --apply   # ghi DB
 */

require('dotenv').config();

const mongoose = require('mongoose');
const Car = require('../src/models/Car');
const Worker = require('../src/models/Worker');
const RepairOrderItem = require('../src/models/RepairOrderItem');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phancong';
const APPLY = process.argv.includes('--apply');

const buildAutoAssignments = (carWorkers = []) => {
  if (!carWorkers.length) return [];

  const basePercentage = Math.floor(100 / carWorkers.length);
  let remaining = 100;

  return carWorkers
    .map((entry, index) => {
      const percentage = index === carWorkers.length - 1 ? remaining : basePercentage;
      remaining -= percentage;

      const worker = entry.worker;
      return {
        workerId: String(worker?._id || worker),
        percentage,
      };
    })
    .filter((assignment) => assignment.workerId);
};

const assignmentKey = (assignments) =>
  assignments
    .map((entry) => `${entry.workerId}:${entry.percentage}`)
    .sort()
    .join('|');

const toItemAssignments = (item) =>
  (item.workerAssignments || [])
    .map((entry) => ({
      workerId: String(entry.worker?._id || entry.worker),
      percentage: Number(entry.percentage) || 0,
    }))
    .filter((entry) => entry.workerId);

const isEvenSplit = (assignments) => {
  if (!assignments.length) return false;

  const basePercentage = Math.floor(100 / assignments.length);
  let remaining = 100;
  const expected = [];

  for (let index = 0; index < assignments.length; index += 1) {
    const percentage = index === assignments.length - 1 ? remaining : basePercentage;
    remaining -= percentage;
    expected.push(percentage);
  }

  const actual = assignments.map((entry) => entry.percentage).sort((a, b) => a - b);
  expected.sort((a, b) => a - b);

  return actual.every((value, index) => value === expected[index]);
};

const isAutoSyncedItem = (item, carWorkers, signatureCounts) => {
  const assignments = toItemAssignments(item);
  if (!assignments.length) return false;

  const autoFromCar = buildAutoAssignments(carWorkers);
  if (autoFromCar.length > 0 && assignmentKey(assignments) === assignmentKey(autoFromCar)) {
    return true;
  }

  const signature = assignmentKey(assignments);
  const duplicateCount = signatureCounts.get(signature) || 0;

  return duplicateCount >= 2 && isEvenSplit(assignments);
};

const clearFields = {
  workerAssignments: [],
  worker: null,
  workerName: '',
  workerRevenues: [],
};

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);
  console.log(APPLY ? 'Mode: APPLY (ghi DB)' : 'Mode: DRY-RUN (chỉ xem, không ghi)');

  const items = await RepairOrderItem.find({
    $or: [
      { 'workerAssignments.0': { $exists: true } },
      { worker: { $ne: null } },
    ],
  }).select('car plateNumber content worker workerAssignments workerName workerRevenues');

  const carIds = [...new Set(items.map((item) => String(item.car)))];
  const cars = await Car.find({ _id: { $in: carIds } })
    .populate('workers.worker', 'name')
    .select('plateNumber workers');

  const carMap = new Map(cars.map((car) => [car._id.toString(), car]));

  const itemsByCar = new Map();
  for (const item of items) {
    const carId = String(item.car);
    if (!itemsByCar.has(carId)) itemsByCar.set(carId, []);
    itemsByCar.get(carId).push(item);
  }

  const signatureCountsByCar = new Map();
  for (const [carId, carItems] of itemsByCar.entries()) {
    const counts = new Map();
    for (const item of carItems) {
      const assignments = toItemAssignments(item);
      if (!assignments.length) continue;
      const signature = assignmentKey(assignments);
      counts.set(signature, (counts.get(signature) || 0) + 1);
    }
    signatureCountsByCar.set(carId, counts);
  }

  const toClear = [];

  for (const item of items) {
    const carId = String(item.car);
    const car = carMap.get(carId);
    const signatureCounts = signatureCountsByCar.get(carId) || new Map();

    if (isAutoSyncedItem(item, car?.workers || [], signatureCounts)) {
      toClear.push({
        id: item._id,
        plateNumber: item.plateNumber || car?.plateNumber || '',
        content: item.content || '',
        workers: toItemAssignments(item)
          .map((entry) => `${entry.workerId} (${entry.percentage}%)`)
          .join(', '),
      });
    }
  }

  console.log(`\nTổng hạng mục có phân công thợ: ${items.length}`);
  console.log(`Hạng mục nghi auto-sync (sẽ xóa phân công): ${toClear.length}`);

  if (toClear.length === 0) {
    console.log('Không có dữ liệu cần làm sạch.');
    await mongoose.disconnect();
    return;
  }

  toClear.slice(0, 20).forEach((row, index) => {
    console.log(
      `${index + 1}. [${row.plateNumber}] ${row.content} -> ${row.workers}`
    );
  });

  if (toClear.length > 20) {
    console.log(`... và ${toClear.length - 20} hạng mục khác`);
  }

  if (!APPLY) {
    console.log('\nChạy lại với --apply để xóa phân công trên DB.');
    await mongoose.disconnect();
    return;
  }

  const ids = toClear.map((row) => row.id);
  const result = await RepairOrderItem.updateMany(
    { _id: { $in: ids } },
    { $set: clearFields }
  );

  console.log(`\nĐã xóa phân công trên ${result.modifiedCount} hạng mục.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Lỗi:', error);
  await mongoose.disconnect();
  process.exit(1);
});
