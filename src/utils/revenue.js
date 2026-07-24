const moment = require('moment-timezone');
const {
  applyDeductionsToGross,
  getCachedDeductions,
  getCachedRevenueBase,
} = require('./revenueDeductions');

const TIMEZONE = 'Asia/Ho_Chi_Minh';

const resolveDateRange = (period, from, to) => {
  const today = moment().tz(TIMEZONE);

  switch (period) {
    case 'today':
      return {
        from: today.format('YYYY-MM-DD'),
        to: today.format('YYYY-MM-DD'),
      };
    case 'week':
      return {
        from: today.clone().startOf('isoWeek').format('YYYY-MM-DD'),
        to: today.clone().endOf('isoWeek').format('YYYY-MM-DD'),
      };
    case 'month':
      return {
        from: today.clone().startOf('month').format('YYYY-MM-DD'),
        to: today.clone().endOf('month').format('YYYY-MM-DD'),
      };
    case 'custom':
      if (!from || !to) {
        throw new Error('Vui lòng truyền from và to khi period=custom');
      }
      return { from, to };
    default:
      if (from && to) return { from, to };
      return {
        from: today.format('YYYY-MM-DD'),
        to: today.format('YYYY-MM-DD'),
      };
  }
};

const toDateBounds = (from, to) => ({
  fromDate: moment(from, 'YYYY-MM-DD').tz(TIMEZONE).startOf('day').toDate(),
  toDate: moment(to, 'YYYY-MM-DD').tz(TIMEZONE).endOf('day').toDate(),
});

const isDateInRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
};

const hasItemWorkerAssignment = (item) =>
  (item.workerAssignments?.length > 0) || Boolean(item.worker);

const getItemRevenueDate = (item, car = null) => {
  if (hasItemWorkerAssignment(item)) {
    return moment(item.updatedAt).tz(TIMEZONE).format('YYYY-MM-DD');
  }

  return car?.currentDate
    || (item.createdAt
      ? moment(item.createdAt).tz(TIMEZONE).format('YYYY-MM-DD')
      : '');
};

const getItemRevenueBaseAmount = (item = {}) => {
  if (getCachedRevenueBase() === 'cost') {
    const costAmount = Number(item.costAmount ?? 0);
    if (costAmount > 0) return costAmount;

    const unitCostPrice = Number(item.unitCostPrice ?? item.raw?.giaVon ?? 0);
    const quantity = Number(item.quantity ?? item.raw?.soLuong ?? 1) || 1;
    return Math.round(unitCostPrice * quantity);
  }

  return Number(item.amount || 0);
};

const calculateRevenueShare = (amount, percentage, countRevenue = true) => {
  const gross = Math.round(Number(amount || 0) * (Number(percentage || 0) / 100));
  if (!countRevenue) {
    return { grossRevenue: 0, netRevenue: 0 };
  }
  const { netRevenue } = applyDeductionsToGross(gross, getCachedDeductions());
  return {
    grossRevenue: gross,
    netRevenue,
  };
};

const getItemWorkerAssignments = (item) => {
  if (item.workerAssignments?.length > 0) {
    return item.workerAssignments.map((assignment) => ({
      workerId: assignment.worker?._id || assignment.worker,
      workerName: assignment.workerName || assignment.worker?.name || '',
      percentage: assignment.percentage ?? 100,
    }));
  }

  if (item.worker) {
    return [{
      workerId: item.worker?._id || item.worker,
      workerName: item.workerName || item.worker?.name || '',
      percentage: 100,
    }];
  }

  return [];
};

const buildWorkerRevenuesForItem = (item, countRevenueMap = new Map(), car = null) => {
  const assignments = getItemWorkerAssignments(item, car);
  const amount = getItemRevenueBaseAmount(item);

  return assignments.map((assignment) => {
    const workerKey = String(assignment.workerId);
    const shouldCount = countRevenueMap.get(workerKey) !== false;
    const { grossRevenue, netRevenue } = calculateRevenueShare(
      amount,
      assignment.percentage,
      shouldCount
    );

    return {
      worker: assignment.workerId,
      workerName: assignment.workerName,
      percentage: assignment.percentage,
      grossRevenue,
      netRevenue,
    };
  });
};

const getRevenueForWorkerFromItem = (item, workerId, countRevenueMap = new Map(), car = null) => {
  const assignment = getItemWorkerAssignments(item, car).find(
    (row) => String(row.workerId) === String(workerId),
  );
  if (!assignment) return null;

  const shouldCount = countRevenueMap.get(String(workerId)) !== false;
  const baseAmount = getItemRevenueBaseAmount(item);
  const { grossRevenue, netRevenue } = calculateRevenueShare(
    baseAmount,
    assignment.percentage,
    shouldCount,
  );

  return {
    grossRevenue,
    netRevenue,
    percentage: assignment.percentage,
    workerName: assignment.workerName,
  };
};

module.exports = {
  TIMEZONE,
  resolveDateRange,
  toDateBounds,
  isDateInRange,
  hasItemWorkerAssignment,
  getItemRevenueDate,
  getItemRevenueBaseAmount,
  calculateRevenueShare,
  getItemWorkerAssignments,
  buildWorkerRevenuesForItem,
  getRevenueForWorkerFromItem,
};
