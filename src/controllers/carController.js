const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Supervisor = require('../models/Supervisor');
const RepairOrderItem = require('../models/RepairOrderItem');
const Location = require('../models/Location');
const { fetchRepairDetailsForCar, fetchVehicleInfo } = require('./externalController');
const moment = require('moment-timezone');
const {
  isDateInRange,
  buildWorkerRevenuesForItem,
  getItemWorkerAssignments,
  getRevenueForWorkerFromItem,
  getItemRevenueDate,
} = require('../utils/revenue');
const {
  repairItemsForWorkerQuery,
  buildCountRevenueMap,
  resolveRepairHistoryWorkerFilter,
} = require('../utils/revenueHelpers');
const {
  getRevenueDeductions,
  getCachedRevenueBase,
} = require('../utils/revenueDeductions');
const {
  isWorkerBusy,
  syncWorkerStatus,
  syncWorkersStatus,
  syncWorkersForCar,
  extractWorkerIds,
  populateCarWorkers,
} = require('../utils/workerStatus');
const { getKtvWorkerId, assertKtvOwnsCar } = require('../utils/ktvScope');
const OperationLog = require('../models/OperationLog');
const { createKtvMessage } = require('../utils/ktvMessageSettings');
const {
  normalizeROFields,
  buildDuplicateROFilter,
  getROLookupTokens,
} = require('../utils/roKey');
const { resolveExternalItemCost, enrichRepairItemCost } = require('../utils/repairItemCost');
const { extractExternalCarFields } = require('../utils/externalCarData');

const CAR_STATUS_LABELS = {
  pending: 'Chờ sửa',
  working: 'Đang sửa',
  done: 'Sửa xong',
  waiting_wash: 'Chờ rửa',
  waiting_handover: 'Chờ giao',
  additional_repair: 'Sửa bổ sung',
  delivered: 'Đã giao',
};

const CAR_LIST_SELECT = '-workerLogs -statusHistory';
const CAR_LIST_POPULATE = [
  { path: 'workers.worker', select: 'name' },
  { path: 'supervisor', select: 'name' },
  { path: 'location', select: 'name' },
];

const findCarsForList = (filter = {}) =>
  Car.find(filter)
    .select(CAR_LIST_SELECT)
    .populate(CAR_LIST_POPULATE)
    .lean();

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePlateSearch = (plate = '') =>
  String(plate || '').trim().toUpperCase().replace(/\s/g, '');

const buildManageCarsFilter = (query = {}, ktvWorkerId = null) => {
  const filter = {};
  const plateSearch = normalizePlateSearch(query.plateNumber);

  if (ktvWorkerId && query.mine === '1') {
    filter['workers.worker'] = ktvWorkerId;
  }

  if (query.location && query.location !== 'all') {
    filter.location = query.location;
  }

  if (query.supervisor) {
    filter.supervisor = query.supervisor;
  }

  if (plateSearch) {
    filter.plateNumber = { $regex: escapeRegex(plateSearch), $options: 'i' };
    return filter;
  }

  const statusFilter = query.statusFilter || 'not_delivered';

  if (statusFilter === 'delivered') {
    filter.status = 'delivered';
    const month = query.month || moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM');
    filter.currentDate = { $regex: `^${escapeRegex(month)}` };
  } else if (statusFilter === 'not_delivered') {
    filter.status = { $ne: 'delivered' };
  }

  if (query.date) {
    filter.currentDate = String(query.date);
  }

  return filter;
};

const getManageCarsList = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const ktvWorkerId = getKtvWorkerId(req.user);
    const filter = buildManageCarsFilter(req.query, ktvWorkerId);

    const skip = (page - 1) * limit;

    const [cars, total] = await Promise.all([
      Car.find(filter)
        .select(CAR_LIST_SELECT)
        .populate(CAR_LIST_POPULATE)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Car.countDocuments(filter),
    ]);

    res.json({
      cars,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const mapExternalItemToRepairOrder = (item, car) => {
  const { unitCostPrice, costAmount } = resolveExternalItemCost(item);

  return {
    car: car._id,
    plateNumber: car.plateNumber,
    roCode: car.roCode || '',
    roNumber: car.roNumber || '',
    groupName: item.khoanMucSuaChua || 'Khác',
    content: item.noiDung || '',
    quantity: item.soLuong || 1,
    unit: item.donViTinh || '',
    unitPrice: item.donGia || 0,
    unitCostPrice,
    costAmount,
    amount: item.thanhTien || 0,
    taxRate: item.tyLeThue || 0,
    taxAmount: item.tienThue || 0,
    discountRate: item.tyLeChietKhau || 0,
    discountAmount: item.tienChietKhau || 0,
    serviceType: item.loaiDichVu || '',
    itemType: item.loai || 0,
    externalItemId: item.khoa || '',
    raw: item,
  };
};

// Lấy tất cả xe
const getAllCars = async (req, res) => {
  try {
    const filter = {};
    if (req.query.location) {
      filter.location = req.query.location;
    }

    if (req.query.statusFilter === 'not_delivered') {
      filter.status = { $ne: 'delivered' };
    } else if (req.query.statusFilter === 'delivered') {
      filter.status = 'delivered';
    } else if (req.query.status) {
      filter.status = req.query.status;
    }

    const ktvWorkerId = getKtvWorkerId(req.user);
    if (ktvWorkerId && req.query.mine === '1') {
      filter['workers.worker'] = ktvWorkerId;
    }

    const cars = await findCarsForList(filter);

    res.json(cars);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy xe theo ID
const getCarById = async (req, res) => {
  try {
    const car = await Car.findById(req.params.id)
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')
      .populate('location', 'name');

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    if (getKtvWorkerId(req.user) && req.query.mine === '1') {
      const ownsCar = await assertKtvOwnsCar(req.user, req.params.id);
      if (!ownsCar) {
        return res.status(403).json({ message: 'Bạn chỉ xem được xe được gán cho mình' });
      }
    }

    res.json(car);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }
    res.status(500).json({ message: error.message });
  }
};

const createCar = async (req, res) => {
  try {
    const data = { ...req.body };

    const repairItems = Array.isArray(data.repairItems) ? data.repairItems : [];
    delete data.repairItems;

    if (!Array.isArray(data.workers)) data.workers = [];
    if (data.supervisor === '') data.supervisor = undefined;

    const now = moment().tz('Asia/Ho_Chi_Minh');
    data.currentTime = now.format('HH:mm:ss');
    data.currentDate = now.format('YYYY-MM-DD');

    const externalCarTypeName = String(data.externalCarTypeName || '').trim();

    if (!externalCarTypeName) {
      return res.status(400).json({ message: 'Thiếu loại xe từ dữ liệu API' });
    }

    data.externalCarTypeName = externalCarTypeName;
    delete data.carType;

    const normalizedRO = normalizeROFields({
      roNumber: data.roNumber,
      roCode: data.roCode,
    });

    if (!normalizedRO.roKey) {
      return res.status(400).json({
        message: 'Thiếu số RO. Vui lòng tra cứu RO trước khi thêm xe.',
      });
    }

    data.roNumber = normalizedRO.roNumber;
    data.roCode = normalizedRO.roCode;
    data.roKey = normalizedRO.roKey;

    const duplicateFilter = buildDuplicateROFilter(data.roNumber, data.roCode);
    const duplicateRO = duplicateFilter
      ? await Car.findOne(duplicateFilter)
        .select('_id plateNumber roNumber roCode currentDate')
        .lean()
      : null;

    if (duplicateRO) {
      const roLabel = getROLookupTokens(data.roNumber, data.roCode).join(' / ')
        || normalizedRO.roKey;

      return res.status(400).json({
        message: `RO ${roLabel} đã tồn tại ở xe ${duplicateRO.plateNumber}. Không thể thêm trùng RO.`,
      });
    }

    if (data.location) {
      const locationExists = await Location.exists({ _id: data.location });
      if (!locationExists) {
        return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
      }
    }

    if (data.deliveryTime) {
      const original = data.deliveryTime.trim();
      const normalized = original.replace(/\[?h\]?/, '').trim();

      const isValid = moment(normalized, 'DD-MM-YYYY HH', true).isValid();
      if (!isValid) {
        return res.status(400).json({
          message: 'Thời gian giao không hợp lệ (định dạng: DD-MM-YYYY HH[h])',
        });
      }

      data.deliveryTime =
        moment(normalized, 'DD-MM-YYYY HH').format('DD-MM-YYYY HH') + '[h]';
    }

    const allowedConditions = ['vip', 'good', 'normal', 'warranty', 'rescue'];
    if (data.condition && !allowedConditions.includes(data.condition)) {
      return res.status(400).json({
        message: 'Tình trạng xe không hợp lệ',
      });
    }

    if (!data.condition || data.condition === '') {
      data.condition = null;
    }

    const workerIds = data.workers.map((w) => w.worker).filter(Boolean);
    const busyErrors = [];

    if (workerIds.length > 0) {
      const busyCars = await Car.find({
        status: 'working',
        'workers.worker': { $in: workerIds },
      }).populate('workers.worker');

      for (const w of data.workers) {
        const existingCar = busyCars.find((car) =>
          car.workers.some((entry) => entry.worker?._id?.equals(w.worker))
        );

        if (existingCar) {
          const worker = existingCar.workers.find((x) =>
            x.worker._id.equals(w.worker)
          );

          busyErrors.push(
            `Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`
          );
        }
      }
    }

    if (busyErrors.length > 0) {
      return res.status(400).json({
        message: 'Không thể tạo xe vì có thợ đang bận:',
        errors: busyErrors,
      });
    }

    const car = new Car(data);
    await car.save();

    if (data.workers.length > 0) {
      await syncWorkersStatus(data.workers.map((w) => w.worker));
    }

    if (repairItems.length > 0) {
      await RepairOrderItem.insertMany(
        repairItems.map((item) => ({
          car: car._id,
          plateNumber: car.plateNumber,
          roCode: data.roCode || '',
          roNumber: data.roNumber || '',
          groupName: item.groupName || '',
          content: item.content || '',
          quantity: Number(item.quantity || 1),
          unit: item.unit || '',
          unitPrice: Number(item.unitPrice || 0),
          unitCostPrice: Number(item.unitCostPrice ?? item.raw?.giaVon ?? 0) || 0,
          costAmount: Number(
            item.costAmount
            ?? resolveExternalItemCost({
              giaVon: item.unitCostPrice ?? item.raw?.giaVon,
              soLuong: item.quantity ?? item.raw?.soLuong,
            }).costAmount
            ?? 0
          ),
          amount: Number(item.amount || 0),
          taxRate: Number(item.taxRate || 0),
          taxAmount: Number(item.taxAmount || 0),
          discountRate: Number(item.discountRate || 0),
          discountAmount: Number(item.discountAmount || 0),
          serviceType: item.serviceType || '',
          itemType: Number(item.itemType || 0),
          externalItemId: item.externalItemId || '',
          raw: item.raw || null,
        }))
      );
    }

    return res.status(201).json(car);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.roKey) {
      return res.status(400).json({
        message: 'RO này đã tồn tại. Không thể thêm xe trùng RO.',
      });
    }

    console.error('Lỗi tạo xe:', error);
    return res.status(400).json({ message: error.message });
  }
};

// Cập nhật thông tin xe+++
const updateCar = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra location
    if (req.body.location) {
      const locationExists = await Location.exists({ _id: req.body.location });
      if (!locationExists) {
        return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
      }
    }

    // Kiểm tra deliveryTime
    if (req.body.deliveryTime && !moment(req.body.deliveryTime, 'DD-MM-YYYY HH[h]', true).isValid()) {
      return res.status(400).json({ message: 'Thời gian giao không hợp lệ (định dạng: DD-MM-YYYY HH[h])' });
    }

    // Lấy thông tin xe trước khi cập nhật
    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    const oldStatus = car.status;
    const oldWorkerIdsBeforeUpdate = car.workers.map((w) => String(w.worker));

    // Nếu có cập nhật workers
    let workersToSync = [];

    if (req.body.workers) {
      const newWorkerIds = req.body.workers.map(w => w.worker.toString());
      const oldWorkerIds = car.workers.map(w => w.worker.toString());

      const removed = oldWorkerIds.filter(id => !newWorkerIds.includes(id));
      const added = newWorkerIds.filter(id => !oldWorkerIds.includes(id));
      workersToSync = [...oldWorkerIds, ...newWorkerIds];

      for (const wid of removed) {
        car.workerLogs.push({
          worker: wid,
          action: 'removed',
          note: 'Thợ bị gỡ khi cập nhật thông tin xe',
          timestamp: new Date()
        });
      }

      for (const wid of added) {
        car.workerLogs.push({
          worker: wid,
          action: 'added',
          note: 'Thợ được thêm khi cập nhật thông tin xe',
          timestamp: new Date()
        });
      }

      car.workers = req.body.workers;
      delete req.body.workers;
    }

    // Không cho cập nhật loại xe qua CateCar nữa
    delete req.body.carType;

    if (req.body.roNumber !== undefined || req.body.roCode !== undefined) {
      const normalizedRO = normalizeROFields({
        roNumber: req.body.roNumber ?? car.roNumber,
        roCode: req.body.roCode ?? car.roCode,
      });

      if (!normalizedRO.roKey) {
        return res.status(400).json({ message: 'RO không hợp lệ' });
      }

      const duplicateFilter = buildDuplicateROFilter(
        normalizedRO.roNumber,
        normalizedRO.roCode,
        car._id,
      );

      if (duplicateFilter) {
        const duplicateRO = await Car.findOne(duplicateFilter)
          .select('_id plateNumber roNumber roCode')
          .lean();

        if (duplicateRO) {
          return res.status(400).json({
            message: `RO đã tồn tại ở xe ${duplicateRO.plateNumber}. Không thể dùng trùng RO.`,
          });
        }
      }

      req.body.roNumber = normalizedRO.roNumber;
      req.body.roCode = normalizedRO.roCode;
      req.body.roKey = normalizedRO.roKey;
    }

    // Cập nhật các trường khác
    Object.assign(car, req.body);

    // Lưu lại
    const updatedCar = await car.save();

    const statusChanged =
      req.body.status !== undefined && String(req.body.status) !== String(oldStatus);
    const syncIds =
      workersToSync.length > 0
        ? workersToSync
        : statusChanged
          ? [...new Set([...oldWorkerIdsBeforeUpdate, ...car.workers.map((w) => String(w.worker))])]
          : [];

    if (syncIds.length > 0) {
      await syncWorkersStatus(syncIds);
    }

    if (workersToSync.length > 0) {
      const populated = await populateCarWorkers(car._id);
      return res.json(populated);
    }

    res.json(updatedCar);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.roKey) {
      return res.status(400).json({
        message: 'RO này đã tồn tại. Không thể cập nhật trùng RO.',
      });
    }

    console.error('Lỗi khi cập nhật xe:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

const updateCarStatus = async (req, res) => {
  const { id } = req.params;
  const { status, newWorkerId } = req.body;

  const uniqueWorkerIds = (...groups) =>
    [...new Set(groups.flat().filter(Boolean).map(String))];

  try {
    const car = await Car.findById(id).populate('workers.worker');
    if (!car) return res.status(404).json({ message: 'Xe không tìm thấy' });

    const currentStatus = car.status;
    const carWorkerIds = extractWorkerIds(car.workers);

    if (currentStatus === 'working' && status === 'pending') {
      car.status = status;
      await car.save();
      await syncWorkersForCar(id, carWorkerIds);

      return res.status(200).json({
        message: 'Chuyển về chờ sửa — thợ được giải phóng',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'working' && status === 'done') {
      car.status = status;
      await car.save();
      await syncWorkersForCar(id, carWorkerIds);

      return res.status(200).json({
        message: 'Sửa xong — giữ phân công thợ trên xe',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'waiting_wash' && status === 'waiting_handover') {
      const oldWorkerIds = [...carWorkerIds];

      if (newWorkerId) {
        const handoverWorker = await Worker.findById(newWorkerId);

        if (!handoverWorker) {
          return res.status(404).json({
            message: 'Thợ hoặc tài xế giao xe không tồn tại',
          });
        }

        const isOldWorker = oldWorkerIds.includes(newWorkerId.toString());

        if (!isOldWorker && await isWorkerBusy(newWorkerId, { excludeCarId: car._id })) {
          return res.status(400).json({
            message: `Không thể chọn ${handoverWorker.name}. Người này đang bận.`,
          });
        }

        for (const oldWorkerId of oldWorkerIds) {
          if (oldWorkerId !== newWorkerId.toString()) {
            car.workerLogs.push({
              worker: oldWorkerId,
              action: 'removed',
              note: 'Rửa xe xong, chuyển sang chờ giao xe',
              timestamp: new Date(),
            });
          }
        }

        car.workerLogs.push({
          worker: newWorkerId,
          action: 'added',
          note: 'Người giao xe được gán sau khi rửa xe xong',
          timestamp: new Date(),
        });

        car.workers = [{ worker: newWorkerId, role: 'main' }];
        car.status = status;
        await car.save();

        await syncWorkersForCar(id, uniqueWorkerIds(oldWorkerIds, newWorkerId));

        return res.status(200).json({
          message: 'Rửa xe xong, chuyển sang chờ giao xe và gán người giao xe thành công',
          car: await populateCarWorkers(id),
        });
      }

      car.status = status;
      await car.save();
      await syncWorkersForCar(id, oldWorkerIds);

      return res.status(200).json({
        message: 'Rửa xe xong, chuyển sang chờ giao xe - khách tự lấy xe',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'done' && status === 'waiting_wash') {
      const prevPhaseLabel = 'sửa xe';
      const phaseLabel = 'rửa xe';

      if (newWorkerId) {
        const newWorker = await Worker.findById(newWorkerId);
        if (!newWorker) {
          return res.status(404).json({ message: 'Thợ mới không tồn tại' });
        }

        if (await isWorkerBusy(newWorkerId, { excludeCarId: car._id })) {
          return res.status(400).json({
            message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`,
          });
        }

        for (const oldWorker of car.workers) {
          const roleLabel = oldWorker.role === 'sub' ? 'phụ' : 'chính';
          car.workerLogs.push({
            worker: oldWorker.worker,
            action: 'removed',
            note: `Thợ ${roleLabel} lúc ${prevPhaseLabel} bị thay thế`,
            timestamp: new Date(),
          });
        }

        car.workerLogs.push({
          worker: newWorkerId,
          action: 'added',
          note: `Thợ chính lúc ${phaseLabel} được gán`,
          timestamp: new Date(),
        });

        car.workers = [{ worker: newWorkerId, role: 'main' }];
        car.status = status;
        await car.save();
        await syncWorkersForCar(id, uniqueWorkerIds(carWorkerIds, newWorkerId));

        return res.status(200).json({
          message: 'Chuyển sang chờ rửa xe với thợ mới thành công',
          car: await populateCarWorkers(id),
        });
      }

      car.status = status;
      await car.save();
      await syncWorkersForCar(id, carWorkerIds);

      return res.status(200).json({
        message: 'Chuyển sang chờ rửa xe với thợ hiện tại thành công',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'done' && status === 'waiting_handover') {
      car.status = status;
      await car.save();
      await syncWorkersForCar(id, carWorkerIds);

      return res.status(200).json({
        message: 'Chuyển sang chờ giao xe thành công',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'waiting_wash' && status === 'additional_repair') {
      const phaseLabel = 'sửa bổ sung';

      if (!newWorkerId) {
        return res.status(400).json({
          message: 'Cần chọn thợ mới cho sửa bổ sung',
        });
      }

      const newWorker = await Worker.findById(newWorkerId);
      if (!newWorker) {
        return res.status(404).json({ message: 'Thợ mới không tồn tại' });
      }

      if (await isWorkerBusy(newWorkerId, { excludeCarId: car._id })) {
        return res.status(400).json({
          message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`,
        });
      }

      const oldWorkerIds = [...carWorkerIds];

      for (const oldWorkerId of oldWorkerIds) {
        const oldWorkerObj = car.workers.find((w) => w.worker.toString() === oldWorkerId);
        car.workerLogs.push({
          worker: oldWorkerId,
          action: 'removed',
          note: `Thợ ${oldWorkerObj?.role || 'chính'} lúc ${phaseLabel} bị thay thế`,
          timestamp: new Date(),
        });
      }

      car.workerLogs.push({
        worker: newWorkerId,
        action: 'added',
        note: `Thợ chính lúc ${phaseLabel} được gán`,
        timestamp: new Date(),
      });

      car.workers = [{ worker: newWorkerId, role: 'main' }];
      car.status = status;
      await car.save();
      await syncWorkersForCar(id, uniqueWorkerIds(oldWorkerIds, newWorkerId));

      return res.status(200).json({
        message: 'Chuyển sang sửa bổ sung với thợ mới thành công',
        car: await populateCarWorkers(id),
      });
    }

    if (currentStatus === 'waiting_handover' && status === 'additional_repair') {
      if (!newWorkerId) {
        return res.status(400).json({
          message: 'Cần chọn thợ mới cho sửa bổ sung',
        });
      }

      const newWorker = await Worker.findById(newWorkerId);
      if (!newWorker) {
        return res.status(404).json({ message: 'Thợ mới không tồn tại' });
      }

      if (await isWorkerBusy(newWorkerId, { excludeCarId: car._id })) {
        return res.status(400).json({
          message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`,
        });
      }

      const oldWorkerIds = [...carWorkerIds];

      car.workers = [{ worker: newWorkerId, role: 'main' }];

      for (const oldWorkerId of oldWorkerIds) {
        car.workerLogs.push({
          worker: oldWorkerId,
          action: 'removed',
          note: `Thợ bị thay khi chuyển trạng thái từ ${currentStatus} → ${status}`,
          timestamp: new Date(),
        });
      }

      car.workerLogs.push({
        worker: newWorkerId,
        action: 'added',
        note: `Thợ mới được chỉ định khi chuyển sang ${status}`,
        timestamp: new Date(),
      });

      car.status = status;
      await car.save();
      await syncWorkersForCar(id, uniqueWorkerIds(oldWorkerIds, newWorkerId));

      return res.status(200).json({
        message: 'Chuyển sang sửa bổ sung với thợ mới thành công',
        car: await populateCarWorkers(id),
      });
    }

    if (status === 'delivered') {
      car.status = status;
      await car.save();
      await syncWorkersForCar(id, carWorkerIds);

      return res.status(200).json({
        message: 'Xe đã được giao thành công',
        car: await populateCarWorkers(id),
      });
    }

    if (status === 'working') {
      for (const workerId of carWorkerIds) {
        const otherWorkingCars = await Car.findOne({
          _id: { $ne: car._id },
          'workers.worker': workerId,
          status: 'working',
        });

        if (otherWorkingCars) {
          const worker = await Worker.findById(workerId);
          return res.status(400).json({
            message: `Không thể chuyển sang 'working'. Thợ ${worker?.name || 'không rõ'} đang sửa xe khác.`,
          });
        }
      }
    }

    car.status = status;
    await car.save();
    await syncWorkersForCar(id, carWorkerIds);

    return res.status(200).json({
      message: `Cập nhật trạng thái xe thành công: ${status}`,
      car: await populateCarWorkers(id),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
// Xóa xe
const deleteCar = async (req, res) => {
  const { id } = req.params;
  try {
    const car = await Car.findByIdAndDelete(id);
    if (!car) {
      return res.status(404).json({ message: 'Xe không tìm thấy' });
    }

    req.auditDeleted = { label: car.plateNumber };

    await RepairOrderItem.deleteMany({ car: car._id });

    for (const w of car.workers) {
      await syncWorkerStatus(w.worker);
    }

    if (car.supervisor) {
      const stillHasJob = await Car.exists({ supervisor: car.supervisor });
      if (!stillHasJob) {
        await Supervisor.findByIdAndUpdate(car.supervisor, { status: 'available' });
      }
    }

    return res.status(200).json({ message: `Xe ${car.plateNumber} đã được xóa.` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getCarByPlateNumber = async (req, res) => {
  try {
    const { plateNumber } = req.params;

    const car = await Car.findOne({ plateNumber })
      .populate('location', 'name');

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    res.json(car);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWorkingAndPendingCars = async (req, res) => {
  try {
    const statuses = [
      'pending',
      'working',
      'done',
      'waiting_wash',
      'waiting_handover',
      'delivered',
      'additional_repair',
    ];

    const filter = { status: { $in: statuses } };
    if (req.query.date) {
      filter.currentDate = String(req.query.date);
    }

    const cars = await findCarsForList(filter);

    const result = statuses.reduce((acc, status) => {
      acc[status] = [];
      return acc;
    }, {});

    cars.forEach((car) => {
      if (result[car.status]) {
        result[car.status].push(car);
      }
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const parseDeliveryDate = (deliveryTime) => {
  if (!deliveryTime || typeof deliveryTime !== 'string') return null;

  const normalized = deliveryTime.trim();
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2})/);
  if (!match) return null;

  const [, day, month, year, hour] = match;
  const deliveryDate = new Date(
    `${year}-${month}-${day}T${hour.padStart(2, '0')}:00:00`
  );

  return Number.isNaN(deliveryDate.getTime()) ? null : deliveryDate;
};

const getOverdueCars = async (req, res) => {
  try {
    const allCars = await Car.find({
      deliveryTime: { $exists: true, $ne: '' },
      status: { $ne: 'delivered' },
    })
      .select(CAR_LIST_SELECT)
      .populate(CAR_LIST_POPULATE)
      .lean();

    const now = new Date();
    const overdueCars = allCars.filter((car) => {
      const deliveryDate = parseDeliveryDate(car.deliveryTime);
      return deliveryDate && deliveryDate < now;
    });

    return res.status(200).json({ cars: overdueCars });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Không tải được danh sách xe trễ hẹn' });
  }
};

// API để lấy lịch sử thợ của xe (nếu có lưu lịch sử thay đổi thợ)
const getCarWorkersHistory = async (req, res) => {
  try {
    const { id } = req.params;

    const car = await Car.findById(id)
      .populate('workers.worker', 'name specialty team')
      .populate({
        path: 'workers.worker',
        populate: {
          path: 'team',
          select: 'name'
        }
      })
      .populate('workerLogs.worker', 'name specialty team')
      .populate({
        path: 'workerLogs.worker',
        populate: {
          path: 'team',
          select: 'name'
        }
      })
      .select('plateNumber status workers workerLogs');

    if (!car) {
      return res.status(404).json({
        success: false,
        message: 'Xe không tìm thấy'
      });
    }

    const getPhaseFromNote = (note = '') => {
      const text = note.toLowerCase();

      if (
        text.includes('rửa xe') ||
        text.includes('rua xe')
      ) {
        return 'wash';
      }

      if (
        text.includes('giao xe') ||
        text.includes('chờ giao') ||
        text.includes('cho giao') ||
        text.includes('khách tự lấy') ||
        text.includes('khach tu lay')
      ) {
        return 'handover';
      }

      if (
        text.includes('sửa bổ sung') ||
        text.includes('sua bo sung') ||
        text.includes('additional_repair')
      ) {
        return 'additional_repair';
      }

      if (
        text.includes('sửa xe') ||
        text.includes('sua xe') ||
        text.includes('working')
      ) {
        return 'repair';
      }

      return 'other';
    };

    const getPhaseLabel = (phase) => {
      switch (phase) {
        case 'repair':
          return 'Sửa xe';
        case 'wash':
          return 'Rửa xe';
        case 'handover':
          return 'Giao xe';
        case 'additional_repair':
          return 'Sửa bổ sung';
        default:
          return 'Khác';
      }
    };

    const getWorkerType = (worker) => {
      const teamName = worker?.team?.name?.toLowerCase() || '';

      if (
        teamName.includes('lái xe') ||
        teamName.includes('lai xe') ||
        teamName.includes('tài xế') ||
        teamName.includes('tai xe')
      ) {
        return 'Tài xế';
      }

      return 'KTV';
    };

    const formatWorker = (worker, role = '') => ({
      id: worker?._id || null,
      name: worker?.name || 'Không xác định',
      specialty: worker?.specialty || 'Không rõ',
      team: worker?.team?.name || 'Chưa có tổ',
      type: getWorkerType(worker),
      role
    });

    const currentWorkers = car.workers.map(w => {
      const worker = w.worker;

      return {
        ...formatWorker(worker, w.role),
        roleLabel:
          w.role === 'main'
            ? 'Chính'
            : w.role === 'sub'
              ? 'Phụ'
              : w.role || 'Không rõ'
      };
    });

    const historyLogs = car.workerLogs
      .map(log => {
        const phase = getPhaseFromNote(log.note || '');

        return {
          id: log._id,
          worker: formatWorker(log.worker),
          name: log.worker?.name || 'Không xác định',
          specialty: log.worker?.specialty || 'Không rõ',
          team: log.worker?.team?.name || 'Chưa có tổ',
          type: getWorkerType(log.worker),
          action: log.action,
          actionLabel:
            log.action === 'added'
              ? 'Được gán'
              : log.action === 'removed'
                ? 'Được gỡ'
                : log.action === 'reassigned'
                  ? 'Được thay đổi'
                  : log.action,
          phase,
          phaseLabel: getPhaseLabel(phase),
          note: log.note || '',
          timestamp: log.timestamp
        };
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const repairLogs = historyLogs.filter(log => log.phase === 'repair');
    const washLogs = historyLogs.filter(log => log.phase === 'wash');
    const handoverLogs = historyLogs.filter(log => log.phase === 'handover');
    const additionalRepairLogs = historyLogs.filter(log => log.phase === 'additional_repair');
    const otherLogs = historyLogs.filter(log => log.phase === 'other');

    return res.status(200).json({
      success: true,
      message: 'Lấy lịch sử sửa, rửa và giao xe thành công',
      data: {
        plateNumber: car.plateNumber,
        status: car.status,

        currentWorkers,

        historyLogs,

        groupedHistory: {
          repair: repairLogs,
          wash: washLogs,
          handover: handoverLogs,
          additionalRepair: additionalRepairLogs,
          other: otherLogs
        }
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy lịch sử thợ:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy lịch sử thợ',
      error: error.message
    });
  }
};

const getRepairHistory = async (req, res) => {
  try {
    await getRevenueDeductions();

    const { date, from, to, workerId: queryWorkerId } = req.query;

    const workerScope = resolveRepairHistoryWorkerFilter(req, queryWorkerId);
    if (workerScope.blocked) {
      return res.json({ totalRevenue: 0, revenueBeforeCommission: 0, items: [] });
    }

    const workerFilter = workerScope.workerId;
    const itemQuery = workerFilter ? repairItemsForWorkerQuery(workerFilter) : {};

    let items = await RepairOrderItem.find(itemQuery)
      .populate({
        path: 'car',
        select: 'plateNumber roNumber externalCarTypeName currentDate status isLate workers workerLogs',
        populate: { path: 'workers.worker', select: 'name soBaoDanh' },
      })
      .populate('workerAssignments.worker', 'name soBaoDanh')
      .populate('worker', 'name soBaoDanh')
      .sort({ createdAt: -1 });

    const rangeFrom = from || date;
    const rangeTo = to || date;

    if (rangeFrom && rangeTo) {
      items = items.filter((item) =>
        isDateInRange(getItemRevenueDate(item, item.car), rangeFrom, rangeTo)
      );
    } else if (date) {
      items = items.filter(
        (item) => getItemRevenueDate(item, item.car) === date
      );
    }

    const workerIdSet = new Set();
    items.forEach((item) => {
      getItemWorkerAssignments(item, item.car).forEach((assignment) => {
        if (assignment.workerId) {
          workerIdSet.add(String(assignment.workerId));
        }
      });
    });

    const countRevenueMap = await buildCountRevenueMap([...workerIdSet]);

    const result = items.map((item) => {
      const assignments = getItemWorkerAssignments(item, item.car);

      const mappedAssignments = assignments.map((assignment) => {
        const workerKey = String(assignment.workerId);
        const rev = getRevenueForWorkerFromItem(item, workerKey, countRevenueMap, item.car);

        return {
          workerId: assignment.workerId,
          workerName: assignment.workerName,
          percentage: assignment.percentage,
          grossRevenue: rev?.grossRevenue || 0,
          revenue: rev?.netRevenue || 0,
        };
      });

      const visibleAssignments = workerFilter
        ? mappedAssignments.filter(
          (assignment) => String(assignment.workerId) === workerFilter
        )
        : mappedAssignments;

      return {
        _id: item._id,
        plateNumber: item.plateNumber || item.car?.plateNumber || '',
        roNumber: item.roNumber || item.car?.roNumber || '',
        carType: item.car?.externalCarTypeName || '',
        carDate: item.car?.currentDate || '',
        carStatus: item.car?.status || '',
        carIsLate: item.car?.isLate || false,
        groupName: item.groupName || '',
        content: item.content || '',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        unitCostPrice: item.unitCostPrice || 0,
        costAmount: Number(item.costAmount || 0),
        amount: Number(item.amount || 0),
        assignments: visibleAssignments,
        allAssignments: req.user.role === 'ktv' ? undefined : mappedAssignments,
        createdAt: item.createdAt,
      };
    }).filter((item) => item.assignments.length > 0 || !workerFilter);

    const sumRevenue = (targetItems, field = 'revenue') =>
      targetItems.reduce(
        (sum, item) =>
          sum + item.assignments.reduce((s, a) => s + Number(a[field] || 0), 0),
        0
      );

    const summary = {
      totalRevenue: sumRevenue(result),
      revenueBeforeCommission: sumRevenue(result, 'grossRevenue'),
      revenueAfterCommission: sumRevenue(result),
      totalItems: result.length,
      totalCars: new Set(result.map((item) => `${item.plateNumber}__${item.carDate}`)).size,
    };

    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    const usePagination = Number.isFinite(page) && page > 0 && Number.isFinite(limit) && limit > 0;

    let responseItems = result;
    if (usePagination) {
      const start = (page - 1) * limit;
      responseItems = result.slice(start, start + limit);
    }

    const baseResponse = {
      ...summary,
      revenueBase: getCachedRevenueBase(),
      items: responseItems,
    };

    if (usePagination) {
      baseResponse.pagination = {
        page,
        limit,
        total: result.length,
        totalPages: Math.ceil(result.length / limit),
      };
    }

    if (req.user.role === 'ktv') {
      return res.json({
        ...baseResponse,
        items: responseItems.map(({ allAssignments, ...rest }) => rest),
      });
    }

    return res.json(baseResponse);
  } catch (error) {
    console.error('Lỗi lấy lịch sử sửa chữa:', error);
    return res.status(500).json({
      message: error.message || 'Lỗi lấy lịch sử sửa chữa',
    });
  }
};

const getCarRepairItems = async (req, res) => {
  try {
    const { id } = req.params;

    if (getKtvWorkerId(req.user)) {
      const ownsCar = await assertKtvOwnsCar(req.user, id);
      if (!ownsCar) {
        return res.status(403).json({ message: 'Bạn chỉ xem được xe được gán cho mình' });
      }
    }

    const car = await Car.findById(id);

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    let items = await RepairOrderItem.find({ car: id })
      .populate('workerAssignments.worker', 'name')
      .populate('worker', 'name')
      .sort({ isManual: 1, groupName: 1, createdAt: 1 });

    const hasApiItems = items.some((item) => !item.isManual);

    if (!hasApiItems) {
      const roKeyword = car.roCode || car.roNumber || '';
      const { chiTiet } = await fetchRepairDetailsForCar(car.plateNumber, roKeyword);

      if (chiTiet.length > 0) {
        await RepairOrderItem.insertMany(
          chiTiet.map((item) => mapExternalItemToRepairOrder(item, car))
        );

        items = await RepairOrderItem.find({ car: id })
          .populate('workerAssignments.worker', 'name')
          .populate('worker', 'name')
          .sort({ isManual: 1, groupName: 1, createdAt: 1 });
      }
    }

    return res.json(items.map(enrichRepairItemCost));
  } catch (error) {
    console.error('Lỗi lấy chi tiết sửa chữa:', error);
    return res.status(500).json({
      message: error.response?.data?.message || error.message || 'Lỗi lấy chi tiết sửa chữa',
    });
  }
};

const normalizeAssignmentWorkers = (assignment) => {
  if (Array.isArray(assignment.workers) && assignment.workers.length > 0) {
    return assignment.workers
      .filter((entry) => entry?.workerId)
      .map((entry) => ({
        workerId: entry.workerId,
        percentage: Number(entry.percentage) || 0,
      }));
  }

  if (assignment.workerId) {
    return [{ workerId: assignment.workerId, percentage: 100 }];
  }

  return [];
};

const extractWorkersFromRepairItem = (item) => {
  if (!item) return [];

  if (Array.isArray(item.workerAssignments) && item.workerAssignments.length > 0) {
    return item.workerAssignments
      .map((entry) => ({
        workerId: String(entry.worker?._id || entry.worker || ''),
        percentage: Number(entry.percentage) || 0,
      }))
      .filter((entry) => entry.workerId);
  }

  if (item.worker) {
    return [{ workerId: String(item.worker._id || item.worker), percentage: 100 }];
  }

  return [];
};

const sortWorkerEntries = (entries) =>
  [...entries].sort((a, b) => String(a.workerId).localeCompare(String(b.workerId)));

const areWorkerAssignmentsEqual = (left, right) => {
  const normalizedLeft = sortWorkerEntries(left);
  const normalizedRight = sortWorkerEntries(right);

  if (normalizedLeft.length !== normalizedRight.length) return false;

  return normalizedLeft.every((entry, index) =>
    String(entry.workerId) === String(normalizedRight[index].workerId)
    && Number(entry.percentage) === Number(normalizedRight[index].percentage)
  );
};

const isManualRepairItemChanged = (existingItem, payload, workerEntries) => {
  if (!existingItem) return true;

  const oldWorkers = extractWorkersFromRepairItem(existingItem);

  return existingItem.content !== payload.content
    || existingItem.groupName !== payload.groupName
    || Number(existingItem.quantity) !== Number(payload.quantity)
    || Number(existingItem.unitPrice) !== Number(payload.unitPrice)
    || Number(existingItem.amount) !== Number(payload.amount)
    || Number(existingItem.unitCostPrice || 0) !== Number(payload.unitCostPrice || 0)
    || Number(existingItem.costAmount || 0) !== Number(payload.costAmount || 0)
    || String(existingItem.unit || '') !== String(payload.unit || '')
    || !areWorkerAssignmentsEqual(oldWorkers, workerEntries);
};

const buildWorkerAssignmentUpdate = async (workerEntries, countRevenueMap, item) => {
  const workerAssignments = [];

  for (const entry of workerEntries) {
    const worker = await Worker.findById(entry.workerId);
    if (!worker) {
      throw new Error(`Thợ không tồn tại: ${entry.workerId}`);
    }

    workerAssignments.push({
      worker: worker._id,
      workerName: worker.name,
      percentage: entry.percentage,
    });
  }

  const workerName = workerAssignments
    .map((item) => `${item.workerName} (${item.percentage}%)`)
    .join(', ');

  const workerRevenues = workerAssignments.length > 0
    ? buildWorkerRevenuesForItem(
      { ...item, workerAssignments },
      countRevenueMap
    )
    : [];

  return {
    workerAssignments,
    worker: workerAssignments[0]?.worker || null,
    workerName,
    workerRevenues,
  };
};

const fetchRepairItemsForCar = async (carId) => {
  const items = await RepairOrderItem.find({ car: carId })
    .populate('workerAssignments.worker', 'name')
    .populate('worker', 'name')
    .sort({ isManual: 1, groupName: 1, createdAt: 1 });

  return items.map(enrichRepairItemCost);
};

const assignRepairItemWorkers = async (req, res) => {
  try {
    await getRevenueDeductions();

    const { id } = req.params;
    const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    const allWorkerIds = new Set();
    for (const assignment of assignments) {
      normalizeAssignmentWorkers(assignment).forEach((entry) => {
        allWorkerIds.add(String(entry.workerId));
      });
    }

    const revenueWorkers = await Worker.find({
      _id: { $in: [...allWorkerIds] },
    }).select('countRevenue name');

    const countRevenueMap = new Map(
      revenueWorkers.map((worker) => [
        worker._id.toString(),
        worker.countRevenue !== false,
      ])
    );

    const changedAssignments = [];

    for (const assignment of assignments) {
      if (!assignment.itemId) continue;

      const existingItem = await RepairOrderItem.findOne({
        _id: assignment.itemId,
        car: id,
        isManual: { $ne: true },
      });

      if (!existingItem) {
        return res.status(404).json({
          message: `Không tìm thấy hạng mục: ${assignment.itemId}`,
        });
      }

      const workerEntries = normalizeAssignmentWorkers(assignment);
      const oldWorkers = extractWorkersFromRepairItem(existingItem);

      if (!areWorkerAssignmentsEqual(oldWorkers, workerEntries)) {
        changedAssignments.push({
          itemId: assignment.itemId,
          workers: assignment.workers || [],
          groupName: existingItem.groupName,
          content: existingItem.content,
        });
      }

      if (workerEntries.length > 0) {
        const totalPercentage = workerEntries.reduce(
          (sum, entry) => sum + entry.percentage,
          0
        );

        if (totalPercentage > 100.01) {
          return res.status(400).json({
            message: `Hạng mục ${assignment.itemId}: tổng % thợ không được vượt quá 100 (hiện tại: ${totalPercentage}%)`,
          });
        }
      }

      const workerUpdate = await buildWorkerAssignmentUpdate(
        workerEntries,
        countRevenueMap,
        existingItem
      );

      await RepairOrderItem.findOneAndUpdate(
        { _id: assignment.itemId, car: id },
        workerUpdate,
        { new: true }
      );
    }

    req.auditChanges = {
      ...(req.auditChanges || {}),
      assignments: changedAssignments,
    };

    const items = await fetchRepairItemsForCar(id);

    return res.json(items);
  } catch (error) {
    console.error('Lỗi phân công thợ cho hạng mục:', error);
    return res.status(500).json({ message: error.message });
  }
};

const saveManualRepairItems = async (req, res) => {
  try {
    await getRevenueDeductions();

    const { id } = req.params;
    const manualItems = Array.isArray(req.body.items) ? req.body.items : [];

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    const allWorkerIds = new Set();
    manualItems.forEach((item) => {
      normalizeAssignmentWorkers({ workers: item.workers }).forEach((entry) => {
        allWorkerIds.add(String(entry.workerId));
      });
    });

    const revenueWorkers = await Worker.find({
      _id: { $in: [...allWorkerIds] },
    }).select('countRevenue name');

    const countRevenueMap = new Map(
      revenueWorkers.map((worker) => [
        worker._id.toString(),
        worker.countRevenue !== false,
      ])
    );

    const keptIds = [];
    const changedManualItems = [];

    for (const item of manualItems) {
      const content = String(item.content || '').trim();
      if (!content) {
        return res.status(400).json({
          message: 'Nội dung công việc ngoài báo giá không được để trống',
        });
      }

      const quantity = Math.max(Number(item.quantity) || 1, 0);
      const unitPrice = Math.max(Number(item.unitPrice) || 0, 0);
      const amount = item.amount != null
        ? Math.max(Number(item.amount) || 0, 0)
        : Math.round(quantity * unitPrice);
      const unitCostPrice = Math.max(Number(item.unitCostPrice) || 0, 0);
      const costAmount = item.costAmount != null
        ? Math.max(Number(item.costAmount) || 0, 0)
        : Math.round(quantity * unitCostPrice);

      const workerEntries = normalizeAssignmentWorkers({ workers: item.workers });

      if (workerEntries.length > 0) {
        const totalPercentage = workerEntries.reduce(
          (sum, entry) => sum + entry.percentage,
          0
        );

        if (totalPercentage > 100.01) {
          return res.status(400).json({
            message: `Công việc "${content}": tổng % thợ không được vượt quá 100 (hiện tại: ${totalPercentage}%)`,
          });
        }
      }

      const workerUpdate = await buildWorkerAssignmentUpdate(
        workerEntries,
        countRevenueMap,
        {
          amount,
          costAmount,
          unitCostPrice,
          quantity,
          raw: null,
        }
      );

      const payload = {
        groupName: String(item.groupName || 'Phát sinh').trim(),
        content,
        quantity,
        unitPrice,
        amount,
        unitCostPrice,
        costAmount,
        unit: String(item.unit || '').trim(),
        isManual: true,
        ...workerUpdate,
      };

      const itemId = item._id ? String(item._id) : '';
      const isNewItem = !itemId || itemId.startsWith('temp-');

      if (!isNewItem) {
        const existingItem = await RepairOrderItem.findOne({
          _id: itemId,
          car: id,
          isManual: true,
        });

        if (!existingItem) {
          return res.status(404).json({
            message: `Không tìm thấy công việc ngoài báo giá: ${itemId}`,
          });
        }

        if (isManualRepairItemChanged(existingItem, payload, workerEntries)) {
          changedManualItems.push({
            ...item,
            groupName: payload.groupName,
            content,
            amount,
            workers: item.workers || [],
            isNew: false,
          });
        }

        await RepairOrderItem.findByIdAndUpdate(itemId, payload);
        keptIds.push(itemId);
      } else {
        changedManualItems.push({
          ...item,
          groupName: payload.groupName,
          content,
          amount,
          workers: item.workers || [],
          isNew: true,
        });

        const created = await RepairOrderItem.create({
          car: id,
          plateNumber: car.plateNumber,
          roCode: car.roCode || '',
          roNumber: car.roNumber || '',
          externalItemId: '',
          ...payload,
        });
        keptIds.push(String(created._id));
      }
    }

    const deletedManualItems = await RepairOrderItem.find({
      car: id,
      isManual: true,
      _id: { $nin: keptIds },
    }).select('content groupName').lean();

    await RepairOrderItem.deleteMany({
      car: id,
      isManual: true,
      _id: { $nin: keptIds },
    });

    req.auditChanges = {
      ...(req.auditChanges || {}),
      manualItems: changedManualItems,
      deletedManualItems,
    };

    const items = await fetchRepairItemsForCar(id);
    return res.json(items);
  } catch (error) {
    console.error('Lỗi lưu công việc ngoài báo giá:', error);
    return res.status(500).json({ message: error.message });
  }
};

const notifyAdminAboutCar = async (req, res) => {
  const { id } = req.params;
  const note = String(req.body?.message || '').trim();

  if (req.user?.role !== 'ktv') {
    return res.status(403).json({ message: 'Chỉ KTV mới được gửi thông báo cho admin' });
  }

  const ownsCar = await assertKtvOwnsCar(req.user, id);
  if (!ownsCar) {
    return res.status(403).json({ message: 'Bạn không được gán cho xe này' });
  }

  const car = await Car.findById(id)
    .populate('location', 'name')
    .populate('supervisor', 'name')
    .lean();

  if (!car) {
    return res.status(404).json({ message: 'Xe không tìm thấy' });
  }

  const statusLabel = CAR_STATUS_LABELS[car.status] || car.status;
  const description = note
    ? `KTV báo admin về xe ${car.plateNumber} (${statusLabel}): ${note}`
    : `KTV báo admin về xe ${car.plateNumber} — trạng thái hiện tại: ${statusLabel}`;

  const log = await OperationLog.create({
    user: req.user._id,
    username: req.user.username || '',
    fullName: req.user.fullName || '',
    role: req.user.role || '',
    action: 'ktv_notify',
    module: 'car',
    targetId: String(car._id),
    targetLabel: car.plateNumber,
    description,
    metadata: {
      carStatus: car.status,
      carStatusLabel: statusLabel,
      message: note,
      location: car.location?.name || '',
      supervisor: car.supervisor?.name || '',
    },
  });

  const ktvMessage = await createKtvMessage({
    sender: req.user,
    car,
    note,
    operationLogId: log._id,
  });

  return res.status(201).json({
    message: 'Đã gửi thông báo cho admin',
    log,
    ktvMessage,
  });
};

const syncRepairItemsFromChiTiet = async (car, chiTiet = []) => {
  const existingApiItems = await RepairOrderItem.find({
    car: car._id,
    isManual: false,
  });

  const existingByKey = new Map(
    existingApiItems.map((item) => [item.externalItemId || String(item._id), item]),
  );

  const incomingKeys = new Set();
  let created = 0;
  let updated = 0;

  for (const rawItem of chiTiet) {
    const mapped = mapExternalItemToRepairOrder(rawItem, car);
    const key = mapped.externalItemId || '';
    if (!key) continue;

    incomingKeys.add(key);
    const existing = existingByKey.get(key);

    if (existing) {
      await RepairOrderItem.findByIdAndUpdate(existing._id, {
        plateNumber: mapped.plateNumber,
        roCode: mapped.roCode,
        roNumber: mapped.roNumber,
        groupName: mapped.groupName,
        content: mapped.content,
        quantity: mapped.quantity,
        unit: mapped.unit,
        unitPrice: mapped.unitPrice,
        unitCostPrice: mapped.unitCostPrice,
        costAmount: mapped.costAmount,
        amount: mapped.amount,
        taxRate: mapped.taxRate,
        taxAmount: mapped.taxAmount,
        discountRate: mapped.discountRate,
        discountAmount: mapped.discountAmount,
        serviceType: mapped.serviceType,
        itemType: mapped.itemType,
        raw: mapped.raw,
      });
      updated += 1;
    } else {
      await RepairOrderItem.create(mapped);
      created += 1;
    }
  }

  let removed = 0;
  for (const [key, item] of existingByKey) {
    if (!item.externalItemId) continue;
    if (!incomingKeys.has(key)) {
      await RepairOrderItem.findByIdAndDelete(item._id);
      removed += 1;
    }
  }

  return { created, updated, removed, total: chiTiet.length };
};

const syncCarFromExternal = async (req, res) => {
  try {
    const { id } = req.params;
    const car = await Car.findById(id);

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    const roKeyword = car.roCode || car.roNumber || '';
    if (!roKeyword) {
      return res.status(400).json({ message: 'Xe chưa có RO để tra cứu API' });
    }

    const { chiTiet, baogiaGanNhat } = await fetchRepairDetailsForCar(
      car.plateNumber,
      roKeyword,
    );

    if (!baogiaGanNhat && chiTiet.length === 0) {
      return res.status(404).json({
        message: 'Không lấy được dữ liệu từ API cho biển số và RO này',
      });
    }

    let vehicle = null;
    try {
      vehicle = await fetchVehicleInfo(car.plateNumber);
    } catch {
      vehicle = null;
    }

    const externalFields = extractExternalCarFields({ baogiaGanNhat, vehicle });

    if (externalFields.externalCarTypeName) {
      car.externalCarTypeName = externalFields.externalCarTypeName;
    }
    if (externalFields.advisorName) {
      car.advisorName = externalFields.advisorName;
    }
    if (externalFields.deliveryTime) {
      car.deliveryTime = externalFields.deliveryTime;
    }

    await car.save();

    const repairSync = chiTiet.length > 0
      ? await syncRepairItemsFromChiTiet(car, chiTiet)
      : { created: 0, updated: 0, removed: 0, total: 0 };

    const populatedCar = await Car.findById(id)
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')
      .populate('location', 'name');

    return res.json({
      message: 'Đã tải lại dữ liệu từ API',
      car: populatedCar,
      repairSync,
    });
  } catch (error) {
    console.error('Lỗi đồng bộ xe từ API:', error);
    return res.status(500).json({
      message: error.response?.data?.message || error.message || 'Không tải được dữ liệu API',
    });
  }
};

module.exports = {
  getAllCars,
  getManageCarsList,
  getCarById,
  createCar,
  updateCar,
  deleteCar,
  updateCarStatus,
  getCarByPlateNumber,
  getWorkingAndPendingCars,
  getOverdueCars,
  getCarWorkersHistory,
  getCarRepairItems,
  assignRepairItemWorkers,
  saveManualRepairItems,
  getRepairHistory,
  notifyAdminAboutCar,
  syncCarFromExternal,
};
