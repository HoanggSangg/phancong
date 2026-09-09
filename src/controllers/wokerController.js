const moment = require('moment');
const Worker = require('../models/Worker');
const Car = require('../models/Car');
const RepairOrderItem = require('../models/RepairOrderItem');
const cloudinary = require('../cloudinary');
const { isKtvLike } = require('../utils/permissions');
const { getOutsideWorkerScopeMessage, wantsTeamScope, resolveGiamSatTeamQuery, getLinkedWorkerId } = require('../utils/teamScope');
const {
  resolveDateRange,
  toDateBounds,
  isDateInRange,
  getItemWorkerAssignments,
  getRevenueForWorkerFromItem,
  getItemRevenueDate,
} = require('../utils/revenue');
const {
  REPAIR_ITEMS_WITH_WORKERS_QUERY,
  buildCountRevenueMap,
} = require('../utils/revenueHelpers');
const {
  applyDeductionsToGross,
  getRevenueDeductions,
  getCachedRevenueBase,
} = require('../utils/revenueDeductions');
const { evaluateWorkerAvailability, evaluateWorkersAvailabilityBatch, syncWorkerStatus } = require('../utils/workerStatus');

const uploadImage = async (image) => {
  const result = await cloudinary.uploader.upload(image, {
    folder: 'workers',
    resource_type: 'image',
    quality: 'auto',
    fetch_format: 'auto'
  });

  return result.secure_url;
};

// Lấy tất cả thợ
const getAllWorkers = async (req, res) => {
  try {
    const includeCars = req.query.includeCars === '1';

    if (isKtvLike(req.user)) {
      if (!req.user.worker) {
        return res.status(200).json([]);
      }

      const worker = await Worker.findById(req.user.worker).populate('team', 'name');
      if (!worker) {
        return res.status(200).json([]);
      }

      const availability = await evaluateWorkerAvailability(worker._id);

      return res.status(200).json([{
        ...worker.toObject(),
        isBusy: worker.status === 'busy',
        busyCarsCount: availability.busyCarsCount,
        pendingCarsCount: availability.pendingCarsCount,
        hasManualJob: availability.hasManualJob,
        ...(includeCars ? { assignedCars: availability.assignedCars || [] } : {}),
      }]);
    }

    const teamQuery = await resolveGiamSatTeamQuery(req.user, wantsTeamScope(req));
    if (teamQuery.empty) {
      return res.status(200).json([]);
    }

    const workers = await Worker.find(teamQuery.filter)
      .select('-revenues')
      .populate('team', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const availabilityMap = await evaluateWorkersAvailabilityBatch(workers);

    const result = workers.map((worker) => {
      const availability = availabilityMap.get(String(worker._id)) || {
        busyCarsCount: 0,
        pendingCarsCount: 0,
        hasManualJob: false,
        assignedCars: [],
      };

      return {
        ...worker,
        isBusy: worker.status === 'busy',
        busyCarsCount: availability.busyCarsCount,
        pendingCarsCount: availability.pendingCarsCount,
        hasManualJob: availability.hasManualJob,
        ...(includeCars ? { assignedCars: availability.assignedCars || [] } : {}),
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Lấy thợ theo ID
const getWorkerById = async (req, res) => {
  const { id } = req.params;

  const ownId = getLinkedWorkerId(req.user);
  if (isKtvLike(req.user) && ownId !== String(id)) {
    return res.status(403).json({ message: 'Bạn chỉ xem được hồ sơ thợ của mình' });
  }

  try {
    const worker = await Worker.findById(id);
    if (!worker) {
      return res.status(404).json({ message: 'Thợ không tìm thấy' });
    }
    return res.status(200).json(worker);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Thợ không tìm thấy' });
    }
    return res.status(500).json({ message: error.message });
  }
};

// Tạo thợ mới
const createWorker = async (req, res) => {
  try {
    const { name, soBaoDanh, status, avatar, team, manualJobs } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên thợ không được để trống'
      });
    }

    if (!soBaoDanh || !soBaoDanh.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Số báo danh không được để trống'
      });
    }

    const existed = await Worker.findOne({ soBaoDanh: soBaoDanh.trim() });
    if (existed) {
      return res.status(400).json({
        success: false,
        message: 'Số báo danh đã tồn tại'
      });
    }

    let avatarUrl = '';
    if (avatar) {
      try {
        avatarUrl = await uploadImage(avatar);
      } catch (error) {
        console.error('Upload avatar error:', error);
        return res.status(500).json({
          success: false,
          message: 'Lỗi upload ảnh.'
        });
      }
    }

    const worker = new Worker({
      name: name.trim(),
      soBaoDanh: soBaoDanh.trim(),
      avatar: avatarUrl,
      team: team || null,
      manualJobs: manualJobs || [],
      status: status || 'available',
      countRevenue: true,
    });

    await worker.save();

    return res.status(201).json({
      success: true,
      message: 'Tạo thợ thành công',
      worker
    });
  } catch (error) {
    console.error('Create worker error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi tạo thợ.'
    });
  }
};

// Cập nhật thợ
const updateWorker = async (req, res) => {
  const { id } = req.params;

  try {
    const { name, soBaoDanh, status, avatar, team, manualJobs } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Tên thợ không được để trống'
      });
    }

    if (!soBaoDanh || !soBaoDanh.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Số báo danh không được để trống'
      });
    }

    const existed = await Worker.findOne({
      soBaoDanh: soBaoDanh.trim(),
      _id: { $ne: id }
    });

    if (existed) {
      return res.status(400).json({
        success: false,
        message: 'Số báo danh đã tồn tại'
      });
    }

    const updateData = {
      name: name.trim(),
      soBaoDanh: soBaoDanh.trim(),
      team: team || null
    };

    if (status) updateData.status = status;
    if (manualJobs) updateData.manualJobs = manualJobs;
    if (avatar) updateData.avatar = await uploadImage(avatar);

    const worker = await Worker.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Thợ không tìm thấy'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cập nhật thợ thành công',
      worker
    });
  } catch (error) {
    console.error('Update worker error:', error);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Xóa thợ
const deleteWorker = async (req, res) => {
  const { id } = req.params;
  try {
    const worker = await Worker.findByIdAndDelete(id);
    if (!worker) {
      return res.status(404).json({ message: 'Thợ không tìm thấy' });
    }

    req.auditDeleted = { name: worker.name };

    return res.status(200).json({ message: `Thợ ${worker.name} đã được xóa thành công!` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Thợ đang rảnh — đọc trạng thái từ DB (được sync khi đổi trạng thái xe)
const getAvailableWorkers = async (req, res) => {
  try {
    const teamQuery = await resolveGiamSatTeamQuery(req.user, wantsTeamScope(req));
    if (teamQuery.empty) {
      return res.status(200).json([]);
    }

    const workers = await Worker.find({ status: 'available', ...teamQuery.filter })
      .select('-revenues')
      .populate('team', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const availabilityMap = await evaluateWorkersAvailabilityBatch(workers);

    const availableWorkers = workers.map((worker) => {
      const availability = availabilityMap.get(String(worker._id)) || {
        busyCarsCount: 0,
        pendingCarsCount: 0,
        hasManualJob: false,
      };

      return {
        ...worker,
        isBusy: false,
        busyCarsCount: availability.busyCarsCount,
        pendingCarsCount: availability.pendingCarsCount,
        hasManualJob: availability.hasManualJob,
      };
    });

    return res.status(200).json(availableWorkers);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Thợ đang bận và xe đang làm
const getWorkerPerformance = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { from, to } = req.query;

    const fromDate = new Date(from);
    const toDate = new Date(to);

    const cars = await Car.find({
      'workerLogs.worker': workerId,
      'workerLogs.timestamp': { $gte: fromDate, $lte: toDate }
    }).select('plateNumber workerLogs');

    let totalActions = 0;
    const logs = [];
    const summary = { added: 0, removed: 0, reassigned: 0 };

    cars.forEach(car => {
      car.workerLogs.forEach(log => {
        const logDate = new Date(log.timestamp);
        const isMatch =
          log.worker.toString() === workerId &&
          logDate >= fromDate &&
          logDate <= toDate;

        if (isMatch) {
          totalActions++;
          summary[log.action] = (summary[log.action] || 0) + 1;

          logs.push({
            plateNumber: car.plateNumber,
            action: log.action,
            timestamp: log.timestamp,
            note: log.note || ''
          });
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Lấy hiệu suất nhân viên thành công',
      data: {
        workerId,
        from,
        to,
        totalActions,
        summary,
        logs
      }
    });
  } catch (err) {
    console.error('Lỗi khi tính hiệu suất nhân viên:', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tính hiệu suất nhân viên',
      error: err.message
    });
  }
};

const getWorkerDailyPerformancePercentage = async (req, res) => {
  try {
    const { workerId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu ngày (date) để tính hiệu suất'
      });
    }

    const start = new Date(date);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);

    const cars = await Car.find({ currentDate: date }).select('plateNumber workers workerLogs');

    const totalCarsInDate = cars.length;
    let totalWork = 0;
    const details = [];

    const roleDescriptions = {
      main: 'thợ chính',
      sub: 'thợ phụ',
      washer: 'rửa xe',
      mechanic: 'sửa xe',
      inspector: 'kiểm tra',
      painter: 'sơn xe'
    };

    for (const car of cars) {
      let addedWork = false;

      const assignedWorker = car.workers.find(w => w.worker.toString() === workerId);
      if (assignedWorker) {
        const roleText = roleDescriptions[assignedWorker.role] || 'làm việc';
        details.push({
          plateNumber: car.plateNumber,
          type: 'assigned',
          note: `Thợ được phân công ${roleText}`
        });
        addedWork = true;
      }

      const logs = car.workerLogs.filter(log =>
        log.worker.toString() === workerId &&
        new Date(log.timestamp) >= start &&
        new Date(log.timestamp) <= end
      );

      for (const log of logs) {
        details.push({
          plateNumber: car.plateNumber,
          type: 'log',
          action: log.action,
          timestamp: log.timestamp,
          note: log.note || ''
        });
        addedWork = true;
      }

      if (addedWork) totalWork++;
    }

    const performancePercentage = totalCarsInDate > 0
      ? ((totalWork / totalCarsInDate) * 100).toFixed(2) + '%'
      : '0%';

    return res.status(200).json({
      success: true,
      message: 'Tính hiệu suất theo ngày thành công',
      data: {
        workerId,
        date,
        totalCarsInDate,
        totalWork,
        performancePercentage,
        details
      }
    });
  } catch (error) {
    console.error('Lỗi khi tính hiệu suất phần trăm:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tính hiệu suất phần trăm',
      error: error.message
    });
  }
};

const getRevenueDateRange = (from, to) => toDateBounds(from, to);

const buildWorkerRevenueFromRepairItems = async (fromDate, toDate) => {
  await getRevenueDeductions();

  const workers = await Worker.find({ countRevenue: { $ne: false } })
    .select('name soBaoDanh avatar team status countRevenue')
    .lean();

  const fromStr = moment(fromDate).format('YYYY-MM-DD');
  const toStr = moment(toDate).format('YYYY-MM-DD');

  // Item có phân công → ngày DT = updatedAt (getItemRevenueDate). Lọc DB theo updatedAt
  // rồi vẫn áp isDateInRange để giữ đúng timezone / biên ngày.
  const items = await RepairOrderItem.find({
    ...REPAIR_ITEMS_WITH_WORKERS_QUERY,
    updatedAt: { $gte: fromDate, $lte: toDate },
  })
    .select('-raw -workerLogs')
    .populate({
      path: 'car',
      select: 'currentDate workers',
    })
    .lean();

  const allWorkerIds = new Set();
  const processedItems = [];

  for (const item of items) {
    const car = item.car;
    if (!car) continue;

    const revenueDate = getItemRevenueDate(item, car);
    if (!isDateInRange(revenueDate, fromStr, toStr)) continue;

    const assignments = getItemWorkerAssignments(item);
    if (!assignments.length) continue;

    assignments.forEach((row) => allWorkerIds.add(String(row.workerId)));
    processedItems.push({ item, car, assignments });
  }

  const countRevenueMap = await buildCountRevenueMap([...allWorkerIds]);
  const revenueMap = new Map();

  for (const { item, car, assignments } of processedItems) {
    for (const assignment of assignments) {
      const workerKey = String(assignment.workerId);
      const rev = getRevenueForWorkerFromItem(item, workerKey, countRevenueMap, car);
      if (!rev) continue;

      const current = revenueMap.get(workerKey) || {
        totalGross: 0,
        totalRevenue: 0,
        totalItems: 0,
      };

      revenueMap.set(workerKey, {
        totalGross: current.totalGross + rev.grossRevenue,
        totalRevenue: current.totalRevenue + rev.netRevenue,
        totalItems: current.totalItems + 1,
      });
    }
  }

  return workers.map((worker) => {
    const revenue = revenueMap.get(String(worker._id)) || {
      totalGross: 0,
      totalRevenue: 0,
      totalItems: 0,
    };

    return {
      workerId: worker._id,
      name: worker.name,
      soBaoDanh: worker.soBaoDanh,
      avatar: worker.avatar,
      revenueBeforeCommission: revenue.totalGross,
      totalRevenue: revenue.totalRevenue,
      weeklyRevenue: revenue.totalRevenue,
      totalItems: revenue.totalItems,
    };
  });
};

// Doanh thu biểu đồ: lấy từ RepairOrderItem được phân công thợ, không lấy Excel nữa
const getWorkerRevenueChart = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: 'Vui lòng truyền from và to' });
    }

    const { fromDate, toDate } = getRevenueDateRange(from, to);
    await getRevenueDeductions();
    const data = await buildWorkerRevenueFromRepairItems(fromDate, toDate);

    return res.status(200).json({
      message: 'Lấy doanh thu biểu đồ thành công',
      from,
      to,
      revenueBase: getCachedRevenueBase(),
      data
    });
  } catch (error) {
    console.error('Lỗi lấy doanh thu biểu đồ:', error);
    return res.status(500).json({ message: error.message });
  }
};

// Tổng kết tuần: dùng cùng logic với biểu đồ, lấy từ RepairOrderItem
const getWorkerWeeklyRevenueSummary = async (req, res) => {
  try {
    const { date } = req.query;

    const selectedDate = date ? moment(date, 'YYYY-MM-DD') : moment();
    const startOfWeek = selectedDate.clone().startOf('isoWeek').startOf('day');
    const endOfWeek = selectedDate.clone().endOf('isoWeek').endOf('day');

    const data = await buildWorkerRevenueFromRepairItems(
      startOfWeek.toDate(),
      endOfWeek.toDate()
    );

    const sorted = [...data].sort((a, b) => b.weeklyRevenue - a.weeklyRevenue);
    const bestWorker = sorted[0] || null;
    const worstWorker = [...data].sort((a, b) => a.weeklyRevenue - b.weeklyRevenue)[0] || null;

    return res.status(200).json({
      success: true,
      message: 'Tổng kết doanh thu tuần thành công',
      week: {
        from: startOfWeek.format('YYYY-MM-DD'),
        to: endOfWeek.format('YYYY-MM-DD')
      },
      bestWorker,
      worstWorker,
      data: sorted
    });
  } catch (error) {
    console.error('Lỗi tổng kết doanh thu tuần:', error);
    return res.status(500).json({ message: error.message });
  }
};

const addManualJobToWorker = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, date } = req.body;

    if (isKtvLike(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ xem được công việc của mình',
      });
    }

    const scopeError = await getOutsideWorkerScopeMessage(req.user, id);
    if (scopeError) {
      return res.status(403).json({ success: false, message: scopeError });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập chi tiết công việc'
      });
    }

    const worker = await Worker.findByIdAndUpdate(
      id,
      {
        $push: {
          manualJobs: {
            content: content.trim(),
            date: date ? new Date(date) : new Date(),
            status: 'co_viec'
          }
        },
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ'
      });
    }

    await syncWorkerStatus(id);

    const syncedWorker = await Worker.findById(id);

    return res.status(200).json({
      success: true,
      message: 'Thêm công việc ghi tay thành công',
      worker: syncedWorker,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi thêm công việc ghi tay',
      error: error.message
    });
  }
};

const removeManualJobFromWorker = async (req, res) => {
  try {
    const { id, jobId } = req.params;

    if (isKtvLike(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ xem được công việc của mình',
      });
    }

    const scopeError = await getOutsideWorkerScopeMessage(req.user, id);
    if (scopeError) {
      return res.status(403).json({ success: false, message: scopeError });
    }

    const workerBefore = await Worker.findById(id).select('name manualJobs');
    if (!workerBefore) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ'
      });
    }

    const removedJob = workerBefore.manualJobs?.find(
      (job) => String(job._id) === String(jobId)
    );

    req.auditDeleted = {
      name: workerBefore.name,
      jobContent: removedJob?.content || '',
    };

    const worker = await Worker.findByIdAndUpdate(
      id,
      {
        $pull: {
          manualJobs: { _id: jobId }
        }
      },
      { new: true }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ'
      });
    }

    await syncWorkerStatus(id);

    const syncedWorker = await Worker.findById(id);

    return res.status(200).json({
      success: true,
      message: 'Xóa công việc ghi tay thành công',
      worker: syncedWorker,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa công việc ghi tay',
      error: error.message
    });
  }
};

const toggleWorkerCountRevenue = async (req, res) => {
  try {
    const { id } = req.params;
    const { countRevenue } = req.body;

    if (typeof countRevenue !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'countRevenue phải là true hoặc false',
      });
    }

    const worker = await Worker.findByIdAndUpdate(
      id,
      { countRevenue },
      { new: true, runValidators: true }
    );

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Thợ không tìm thấy',
      });
    }

    return res.status(200).json({
      success: true,
      message: countRevenue ? 'Đã bật tính doanh thu cho thợ' : 'Đã tắt tính doanh thu cho thợ',
      worker,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi cập nhật trạng thái tính doanh thu',
    });
  }
};

const bulkImportWorkers = async (req, res) => {
  try {
    const list = Array.isArray(req.body.workers) ? req.body.workers : [];

    if (list.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách thợ import trống',
      });
    }

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const item of list) {
      const name = String(item.name || '').trim();
      const soBaoDanh = String(item.soBaoDanh || '').trim();

      if (!name || !soBaoDanh) {
        skipped += 1;
        continue;
      }

      try {
        const existed = await Worker.findOne({ soBaoDanh });
        if (existed) {
          skipped += 1;
          continue;
        }

        await Worker.create({
          name,
          soBaoDanh,
          avatar: '',
          status: 'available',
          countRevenue: true,
        });
        created += 1;
      } catch (error) {
        errors.push({ soBaoDanh, name, message: error.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Import xong: thêm ${created} thợ, bỏ qua ${skipped}`,
      created,
      skipped,
      errors,
      total: list.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi import danh sách thợ',
    });
  }
};

const COMPLETED_STATUSES = ['done', 'waiting_wash', 'waiting_handover', 'delivered'];

const resolveWorkerScope = (req, queryWorkerId) => {
  if (isKtvLike(req.user)) {
    if (!req.user.worker) return { error: 'Tài khoản KTV chưa liên kết thợ' };
    return { workerId: req.user.worker.toString() };
  }

  if (queryWorkerId) {
    return { workerId: String(queryWorkerId) };
  }

  return { workerId: null };
};

const buildWorkerKpi = async (workerId, from, to) => {
  const deductions = await getRevenueDeductions();
  const { fromDate, toDate } = toDateBounds(from, to);

  const worker = await Worker.findById(workerId)
    .select('name soBaoDanh avatar countRevenue team')
    .populate('team', 'name')
    .lean();
  if (!worker) return null;

  const workerKey = workerId.toString();
  const countRevenueMap = new Map([[workerKey, worker.countRevenue !== false]]);

  const repairItems = await RepairOrderItem.find({
    $or: [
      { worker: workerId },
      { 'workerAssignments.worker': workerId },
      { 'workerRevenues.worker': workerId },
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
    if (!isDateInRange(revenueDate, from, to)) return false;
    return getItemWorkerAssignments(item)
      .some((assignment) => String(assignment.workerId) === workerKey);
  });

  const carMap = new Map();
  filteredItems.forEach((item) => {
    if (item.car?._id) {
      carMap.set(item.car._id.toString(), item.car);
    }
  });

  const allCars = Array.from(carMap.values());
  const completedCars = allCars.filter((car) => COMPLETED_STATUSES.includes(car.status));

  let revenueBeforeCommission = 0;

  filteredItems.forEach((item) => {
    const rev = getRevenueForWorkerFromItem(item, workerId, countRevenueMap, item.car);
    if (rev) {
      revenueBeforeCommission += rev.grossRevenue;
    }
  });

  const revenueBreakdown = applyDeductionsToGross(revenueBeforeCommission, deductions);

  const allCarsInRange = await Car.find({
    currentDate: { $gte: from, $lte: to },
  }).select('_id');

  const totalWork = carMap.size;
  const performancePercentage = allCarsInRange.length > 0
    ? Number(((totalWork / allCarsInRange.length) * 100).toFixed(2))
    : 0;

  return {
    workerId: worker._id,
    name: worker.name,
    soBaoDanh: worker.soBaoDanh,
    avatar: worker.avatar,
    teamId: worker.team?._id || null,
    teamName: worker.team?.name || 'Chưa có tổ',
    from,
    to,
    carsDone: allCars.length,
    carsCompleted: completedCars.length,
    revenueBeforeCommission,
    revenueAfterCommission: revenueBreakdown.netRevenue,
    deductionBreakdown: revenueBreakdown.deductions,
    totalDeductionRate: revenueBreakdown.totalDeductionRate,
    carsOnTime: completedCars.filter((car) => !car.isLate).length,
    carsLate: completedCars.filter((car) => car.isLate).length,
    performancePercentage,
    totalCarsInRange: allCarsInRange.length,
    totalWork,
    countRevenue: worker.countRevenue !== false,
    totalRepairItems: filteredItems.length,
  };
};

const getWorkerKpi = async (req, res) => {
  try {
    const { period, from, to, workerId: queryWorkerId } = req.query;
    const scope = resolveWorkerScope(req, queryWorkerId);

    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    if (!scope.workerId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng truyền workerId',
      });
    }

    const range = resolveDateRange(period, from, to);
    const kpi = await buildWorkerKpi(scope.workerId, range.from, range.to);

    if (!kpi) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thợ' });
    }

    const deductions = await getRevenueDeductions();

    return res.status(200).json({
      success: true,
      period: period || 'custom',
      range,
      deductions,
      data: kpi,
    });
  } catch (error) {
    console.error('Lỗi lấy KPI thợ:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi lấy KPI thợ',
    });
  }
};

module.exports = {
  getAllWorkers,
  getWorkerById,
  createWorker,
  updateWorker,
  deleteWorker,
  getAvailableWorkers,
  getWorkerPerformance,
  getWorkerDailyPerformancePercentage,
  getWorkerRevenueChart,
  getWorkerWeeklyRevenueSummary,
  addManualJobToWorker,
  removeManualJobFromWorker,
  bulkImportWorkers,
  toggleWorkerCountRevenue,
  getWorkerKpi,
  buildWorkerRevenueFromRepairItems,
};
