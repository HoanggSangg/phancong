const Worker = require('../models/Worker');
const Car = require('../models/Car');
const Team = require('../models/Team');
const RepairOrderItem = require('../models/RepairOrderItem');
const {
  resolveDateRange,
  isDateInRange,
  getItemRevenueDate,
  getItemWorkerAssignments,
  getRevenueForWorkerFromItem,
  toDateBounds,
} = require('../utils/revenue');
const {
  applyDeductionsToGross,
  getRevenueDeductions,
  saveRevenueSettings,
  getCachedDeductions,
  getCachedRevenueBase,
} = require('../utils/revenueDeductions');
const { buildCountRevenueMap } = require('../utils/revenueHelpers');

const ACTIVE_CAR_STATUSES = ['pending', 'working', 'done', 'waiting_wash', 'waiting_handover', 'additional_repair'];

const aggregateRevenueInRange = async (from, to) => {
  const deductions = await getRevenueDeductions();
  const { fromDate, toDate } = toDateBounds(from, to);

  const workers = await Worker.find()
    .select('name soBaoDanh team countRevenue')
    .populate('team', 'name')
    .lean();
  const countRevenueMap = await buildCountRevenueMap(workers.map((worker) => worker._id));

  const repairItems = await RepairOrderItem.find({
    $or: [
      { worker: { $exists: true, $ne: null } },
      { 'workerAssignments.worker': { $exists: true } },
      { 'workerRevenues.worker': { $exists: true } },
    ],
    updatedAt: { $gte: fromDate, $lte: toDate },
  })
    .select('-raw')
    .populate({
      path: 'car',
      select: 'plateNumber status isLate currentDate',
    })
    .lean();

  const filteredItems = repairItems.filter((item) => {
    const revenueDate = getItemRevenueDate(item, item.car);
    return isDateInRange(revenueDate, from, to);
  });

  let totalGross = 0;
  const workerGrossMap = new Map();
  const teamGrossMap = new Map();
  const workerMeta = new Map(
    workers.map((worker) => [String(worker._id), {
      name: worker.name,
      soBaoDanh: worker.soBaoDanh,
      teamId: worker.team?._id ? String(worker.team._id) : '',
      teamName: worker.team?.name || 'Chưa có tổ',
    }]),
  );

  filteredItems.forEach((item) => {
    const assignments = getItemWorkerAssignments(item, item.car);
    assignments.forEach((assignment) => {
      const workerKey = String(assignment.workerId);
      const rev = getRevenueForWorkerFromItem(item, workerKey, countRevenueMap, item.car);
      if (!rev?.grossRevenue) return;

      totalGross += rev.grossRevenue;
      workerGrossMap.set(workerKey, (workerGrossMap.get(workerKey) || 0) + rev.grossRevenue);

      const meta = workerMeta.get(workerKey);
      const teamName = meta?.teamName || 'Chưa có tổ';
      teamGrossMap.set(teamName, (teamGrossMap.get(teamName) || 0) + rev.grossRevenue);
    });
  });

  const overview = applyDeductionsToGross(totalGross, deductions);

  const byTeam = [...teamGrossMap.entries()]
    .map(([teamName, grossRevenue]) => {
      const teamBreakdown = applyDeductionsToGross(grossRevenue, deductions);
      return {
        teamName,
        grossRevenue,
        netRevenue: teamBreakdown.netRevenue,
        workerCount: workers.filter((worker) => (worker.team?.name || 'Chưa có tổ') === teamName).length,
      };
    })
    .sort((a, b) => b.netRevenue - a.netRevenue);

  const topWorkers = [...workerGrossMap.entries()]
    .map(([workerId, grossRevenue]) => {
      const meta = workerMeta.get(workerId) || {};
      const workerBreakdown = applyDeductionsToGross(grossRevenue, deductions);
      return {
        workerId,
        name: meta.name || 'Không rõ',
        soBaoDanh: meta.soBaoDanh || '',
        teamName: meta.teamName || 'Chưa có tổ',
        grossRevenue,
        netRevenue: workerBreakdown.netRevenue,
      };
    })
    .sort((a, b) => b.netRevenue - a.netRevenue)
    .slice(0, 10);

  return {
    deductions,
    revenueBase: getCachedRevenueBase(),
    overview,
    byTeam,
    topWorkers,
    totalRepairItems: filteredItems.length,
  };
};

const getDashboardOverview = async (req, res) => {
  try {
    const { period, from, to } = req.query;
    const range = resolveDateRange(period, from, to);
    const revenue = await aggregateRevenueInRange(range.from, range.to);

    const [
      totalWorkers,
      availableWorkers,
      activeCars,
      carsInRange,
      totalTeams,
    ] = await Promise.all([
      Worker.countDocuments(),
      Worker.countDocuments({ status: 'available' }),
      Car.countDocuments({ status: { $in: ACTIVE_CAR_STATUSES } }),
      Car.countDocuments({ currentDate: { $gte: range.from, $lte: range.to } }),
      Team.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      period: period || 'custom',
      range,
      deductions: revenue.deductions,
      revenueBase: revenue.revenueBase,
      summary: {
        totalWorkers,
        availableWorkers,
        activeCars,
        carsInRange,
        totalTeams,
        totalRepairItems: revenue.totalRepairItems,
        grossRevenue: revenue.overview.grossRevenue,
        netRevenue: revenue.overview.netRevenue,
        totalDeducted: revenue.overview.grossRevenue - revenue.overview.netRevenue,
        deductionBreakdown: revenue.overview.deductions,
        totalDeductionRate: revenue.overview.totalDeductionRate,
      },
      byTeam: revenue.byTeam,
      topWorkers: revenue.topWorkers,
    });
  } catch (error) {
    console.error('Lỗi dashboard:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi tải dashboard',
    });
  }
};

const getRevenueSettings = async (req, res) => {
  try {
    await getRevenueDeductions();
    return res.status(200).json({
      success: true,
      deductions: getCachedDeductions(),
      revenueBase: getCachedRevenueBase(),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateRevenueSettings = async (req, res) => {
  try {
    const result = await saveRevenueSettings({
      deductions: req.body?.deductions,
      revenueBase: req.body?.revenueBase,
    });
    return res.status(200).json({
      success: true,
      message: 'Đã cập nhật cấu hình doanh thu',
      deductions: result.deductions,
      revenueBase: result.revenueBase,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardOverview,
  getRevenueSettings,
  updateRevenueSettings,
  aggregateRevenueInRange,
};
