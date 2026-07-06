const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Supervisor = require('../models/Supervisor');
const RepairOrderItem = require('../models/RepairOrderItem');
const Location = require('../models/Location');
const { fetchRepairDetailsForCar } = require('./externalController');
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
  releaseWorkers,
  updateWorkerStatusDefault,
  populateCarWorkers,
} = require('../utils/workerStatus');
const { getKtvWorkerId, assertKtvOwnsCar } = require('../utils/ktvScope');
const OperationLog = require('../models/OperationLog');
const { createKtvMessage } = require('../utils/ktvMessageSettings');

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

const normalizeROKey = (roNumber = '', roCode = '') => {
  const number = String(roNumber || '').trim().toUpperCase().replace(/\s/g, '');
  const code = String(roCode || '').trim().toUpperCase().replace(/\s/g, '');
  return number || code || '';
};

const mapExternalItemToRepairOrder = (item, car) => ({
  car: car._id,
  plateNumber: car.plateNumber,
  roCode: car.roCode || '',
  roNumber: car.roNumber || '',
  groupName: item.khoanMucSuaChua || 'Khác',
  content: item.noiDung || '',
  quantity: item.soLuong || 1,
  unit: item.donViTinh || '',
  unitPrice: item.donGia || 0,
  amount: item.thanhTien || 0,
  taxRate: item.tyLeThue || 0,
  taxAmount: item.tienThue || 0,
  discountRate: item.tyLeChietKhau || 0,
  discountAmount: item.tienChietKhau || 0,
  serviceType: item.loaiDichVu || '',
  itemType: item.loai || 0,
  externalItemId: item.khoa || '',
  raw: item,
});


// Lấy tất cả xe
const getAllCars = async (req, res) => {
  try {
    const filter = {};
    if (req.query.location) {
      filter.location = req.query.location;
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

    // ✅ Loại xe luôn lấy từ dữ liệu API (externalCarTypeName)
    const externalCarTypeName = String(data.externalCarTypeName || '').trim();

    if (!externalCarTypeName) {
      return res.status(400).json({ message: 'Thiếu loại xe từ dữ liệu API' });
    }

    data.externalCarTypeName = externalCarTypeName;
    delete data.carType;

    // Cùng biển số trong ngày chỉ chặn khi trùng RO
    const carsToday = await Car.find({
      plateNumber: data.plateNumber,
      currentDate: data.currentDate,
    }).select('roNumber roCode plateNumber');

    const incomingRO = normalizeROKey(data.roNumber, data.roCode);

    if (incomingRO) {
      const duplicateRO = carsToday.find(
        (car) => normalizeROKey(car.roNumber, car.roCode) === incomingRO
      );

      if (duplicateRO) {
        return res.status(400).json({
          message: `Xe ${data.plateNumber} với RO ${incomingRO} đã được tạo trong ngày hôm nay`,
        });
      }
    } else if (carsToday.length > 0) {
      return res.status(400).json({
        message: `Xe ${data.plateNumber} đã có trong ngày hôm nay. Vui lòng tra cứu và nhập số RO để thêm lệnh mới.`,
      });
    }

    // ✅ Địa điểm không bắt buộc, chỉ kiểm tra nếu có gửi lên
    if (data.location) {
      const locationExists = await Location.exists({ _id: data.location });
      if (!locationExists) {
        return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
      }
    }

    // ✅ Kiểm tra và chuẩn hóa deliveryTime
    if (data.deliveryTime) {
      const original = data.deliveryTime.trim();
      const normalized = original.replace(/\[?h\]?/, '').trim();

      const isValid = moment(normalized, 'DD-MM-YYYY HH', true).isValid();
      if (!isValid) {
        return res.status(400).json({
          message: 'Thời gian giao không hợp lệ (định dạng: DD-MM-YYYY HH[h])',
        });
      }

      // Lưu chuẩn format có [h]
      data.deliveryTime = moment(normalized, 'DD-MM-YYYY HH').format('DD-MM-YYYY HH') + '[h]';
    }

    // ✅ Kiểm tra tình trạng xe (condition)
    const allowedConditions = ['vip', 'good', 'normal', 'warranty', 'rescue'];
    if (data.condition && !allowedConditions.includes(data.condition)) {
      return res.status(400).json({
        message: 'Tình trạng xe không hợp lệ (chỉ nhận: vip, good, normal, warranty, rescue)',
      });
    }

    // ✅ Nếu không có condition, để null (bình thường)
    if (!data.condition || data.condition === '') {
      data.condition = null;
    }

    // ✅ Kiểm tra thợ có đang bận không
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
          const worker = existingCar.workers.find((x) => x.worker._id.equals(w.worker));
          busyErrors.push(`Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
        }
      }
    }

    if (busyErrors.length > 0) {
      return res.status(400).json({
        message: 'Không thể tạo xe vì có thợ đang bận:',
        errors: busyErrors,
      });
    }

    // ✅ Lưu xe
    const car = new Car(data);
    await car.save();

    if (repairItems.length > 0) {
      await RepairOrderItem.deleteMany({
        car: car._id,
      });

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

    // ✅ Sau khi thêm xe có thợ: chỉ đánh bận khi xe không ở trạng thái chờ sửa
    if (data.workers.length > 0) {
      const shouldMarkWorkersBusy = car.status && car.status !== 'pending';

      if (shouldMarkWorkersBusy) {
        for (const w of data.workers) {
          await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
        }
      }
    }

    return res.status(201).json(car);
  } catch (error) {
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

    // Nếu có cập nhật workers
    if (req.body.workers) {
      const newWorkerIds = req.body.workers.map(w => w.worker.toString());
      const oldWorkerIds = car.workers.map(w => w.worker.toString());

      const removed = oldWorkerIds.filter(id => !newWorkerIds.includes(id));
      const added = newWorkerIds.filter(id => !oldWorkerIds.includes(id));

      for (const wid of removed) {
        car.workerLogs.push({
          worker: wid,
          action: 'removed',
          note: 'Thợ bị gỡ khi cập nhật thông tin xe',
          timestamp: new Date()
        });

        // ✅ Đặt trạng thái thợ thành 'available'
        await Worker.findByIdAndUpdate(wid, { status: 'available' });
      }

      for (const wid of added) {
        car.workerLogs.push({
          worker: wid,
          action: 'added',
          note: 'Thợ được thêm khi cập nhật thông tin xe',
          timestamp: new Date()
        });

        // ✅ Đặt trạng thái thợ thành 'busy'
        await Worker.findByIdAndUpdate(wid, { status: 'busy' });
      }

      // Gán lại để tránh bị mất
      car.workers = req.body.workers;
      delete req.body.workers;
    }

    // Không cho cập nhật loại xe qua CateCar nữa
    delete req.body.carType;

    // Cập nhật các trường khác
    Object.assign(car, req.body);

    // Lưu lại
    const updatedCar = await car.save();

    res.json(updatedCar);
  } catch (error) {
    console.error('Lỗi khi cập nhật xe:', error);
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};


const updateCarStatus = async (req, res) => {
  const { id } = req.params;
  const { status, newWorkerId } = req.body; // Thêm newWorkerId để chọn thợ mới

  try {
    const car = await Car.findById(id).populate('workers.worker');
    if (!car) return res.status(404).json({ message: 'Xe không tìm thấy' });

    const currentStatus = car.status;
    const carWorkerIds = car.workers.map(w => w.worker._id.toString());

    // **LOGIC MỚI: KIỂM TRA CHUYỂN TRẠNG THÁI HỢP LỆ**
    if (currentStatus === 'waiting_wash' && status === 'waiting_handover') {
      const oldWorkerIds = [...carWorkerIds];

      // Có chọn thợ/tài xế giao xe
      if (newWorkerId) {
        const handoverWorker = await Worker.findById(newWorkerId);

        if (!handoverWorker) {
          return res.status(404).json({
            message: 'Thợ hoặc tài xế giao xe không tồn tại'
          });
        }

        const isOldWorker = oldWorkerIds.includes(newWorkerId.toString());

        if (handoverWorker.status === 'busy' && !isOldWorker) {
          return res.status(400).json({
            message: `Không thể chọn ${handoverWorker.name}. Người này đang bận.`
          });
        }

        for (const oldWorkerId of oldWorkerIds) {
          if (oldWorkerId !== newWorkerId.toString()) {
            car.workerLogs.push({
              worker: oldWorkerId,
              action: 'removed',
              note: 'Rửa xe xong, chuyển sang chờ giao xe',
              timestamp: new Date()
            });
          }
        }

        car.workerLogs.push({
          worker: newWorkerId,
          action: 'added',
          note: 'Người giao xe được gán sau khi rửa xe xong',
          timestamp: new Date()
        });

        car.workers = [{
          worker: newWorkerId,
          role: 'main'
        }];

        car.status = status;
        await car.save();

        await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

        await releaseWorkers(
          oldWorkerIds.filter((id) => id !== newWorkerId.toString()),
          car._id,
          'extended'
        );

        return res.status(200).json({
          message: 'Rửa xe xong, chuyển sang chờ giao xe và gán người giao xe thành công',
          car: await populateCarWorkers(id)
        });
      }

      // Không chọn ai => khách tự lấy xe
      for (const oldWorkerId of oldWorkerIds) {
        car.workerLogs.push({
          worker: oldWorkerId,
          action: 'removed',
          note: 'Rửa xe xong, khách tự lấy xe',
          timestamp: new Date()
        });
      }

      car.workers = [];
      car.status = status;
      await car.save();

      await releaseWorkers(oldWorkerIds, car._id, 'extended');

      return res.status(200).json({
        message: 'Rửa xe xong, chuyển sang chờ giao xe - khách tự lấy xe',
        car: await populateCarWorkers(id)
      });
    }
    // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_WASH**
    if (currentStatus === 'done' && status === 'waiting_wash') {
      const prevPhaseLabel = 'sửa xe';
      const phaseLabel = 'rửa xe';

      if (newWorkerId) {
        const newWorker = await Worker.findById(newWorkerId);
        if (!newWorker) {
          return res.status(404).json({ message: 'Thợ mới không tồn tại' });
        }

        if (newWorker.status === 'busy') {
          return res.status(400).json({
            message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`
          });
        }

        // Lưu log: Thợ cũ bị thay
        for (const oldWorker of car.workers) {
          const roleLabel = oldWorker.role === 'sub' ? 'phụ' : 'chính';
          car.workerLogs.push({
            worker: oldWorker.worker,
            action: 'removed',
            note: `Thợ ${roleLabel} lúc ${prevPhaseLabel} bị thay thế`,
            timestamp: new Date()
          });
        }

        // Lưu log: Thợ mới được gán
        car.workerLogs.push({
          worker: newWorkerId,
          action: 'added',
          note: `Thợ chính lúc ${phaseLabel} được gán`,
          timestamp: new Date()
        });

        // Cập nhật thợ mới
        car.workers = [{
          worker: newWorkerId,
          role: 'main'
        }];

        await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

        await releaseWorkers(carWorkerIds, car._id, 'workingOnly');

        car.status = status;
        await car.save();

        return res.status(200).json({
          message: 'Chuyển sang chờ rửa xe với thợ mới thành công',
          car: await populateCarWorkers(id)
        });

      } else {
        // Không có thợ mới => giữ thợ cũ
        car.status = status;
        await car.save();

        for (const workerId of carWorkerIds) {
          await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
        }

        return res.status(200).json({
          message: 'Chuyển sang chờ rửa xe với thợ hiện tại thành công',
          car: await populateCarWorkers(id)
        });
      }
    }





    // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_HANDOVER**
    if (currentStatus === 'done' && status === 'waiting_handover') {
      await releaseWorkers(carWorkerIds, car._id, 'deliveredStyle');

      car.status = status;
      await car.save();

      return res.status(200).json({
        message: 'Chuyển sang chờ giao xe thành công',
        car: await populateCarWorkers(id)
      });
    }

    // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_WASH SANG ADDITIONAL_REPAIR**
    if (currentStatus === 'waiting_wash' && status === 'additional_repair') {
      const phaseLabel = 'sửa bổ sung';

      if (!newWorkerId) {
        return res.status(400).json({
          message: 'Cần chọn thợ mới cho sửa bổ sung'
        });
      }

      // Kiểm tra thợ mới có rảnh không
      const newWorker = await Worker.findById(newWorkerId);
      if (!newWorker) {
        return res.status(404).json({ message: 'Thợ mới không tồn tại' });
      }

      if (newWorker.status === 'busy') {
        return res.status(400).json({
          message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`
        });
      }

      // Lưu lại thợ cũ để cập nhật trạng thái và ghi log
      const oldWorkerIds = [...carWorkerIds];

      // 🔥 Ghi log: thợ cũ bị gỡ
      for (const oldWorkerId of oldWorkerIds) {
        const oldWorkerObj = car.workers.find(w => w.worker.toString() === oldWorkerId);
        car.workerLogs.push({
          worker: oldWorkerId,
          action: 'removed',
          note: `Thợ ${oldWorkerObj?.role || 'chính'} lúc ${phaseLabel} bị thay thế`,
          timestamp: new Date()
        });
      }

      // 🔥 Ghi log: thợ mới được gán
      car.workerLogs.push({
        worker: newWorkerId,
        action: 'added',
        note: `Thợ chính lúc ${phaseLabel} được gán`,
        timestamp: new Date()
      });

      // Cập nhật thợ mới cho xe
      car.workers = [{
        worker: newWorkerId,
        role: 'main'
      }];

      // Thợ mới → bận
      await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

      await releaseWorkers(oldWorkerIds, car._id, 'workingOnly');

      car.status = status;
      await car.save();

      return res.status(200).json({
        message: 'Chuyển sang sửa bổ sung với thợ mới thành công',
        car: await populateCarWorkers(id)
      });
    }


    // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_HANDOVER SANG ADDITIONAL_REPAIR**
    if (currentStatus === 'waiting_handover' && status === 'additional_repair') {
      if (!newWorkerId) {
        return res.status(400).json({
          message: 'Cần chọn thợ mới cho sửa bổ sung'
        });
      }

      const newWorker = await Worker.findById(newWorkerId);
      if (!newWorker) {
        return res.status(404).json({ message: 'Thợ mới không tồn tại' });
      }

      if (newWorker.status === 'busy') {
        return res.status(400).json({
          message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`
        });
      }

      const oldWorkerIds = [...carWorkerIds];

      // Cập nhật thợ mới cho xe
      car.workers = [{
        worker: newWorkerId,
        role: 'main'
      }];

      // Ghi lại lịch sử thay đổi thợ
      for (const oldWorkerId of oldWorkerIds) {
        car.workerLogs.push({
          worker: oldWorkerId,
          action: 'removed',
          note: `Thợ bị thay khi chuyển trạng thái từ ${currentStatus} → ${status}`,
          timestamp: new Date()
        });
      }

      car.workerLogs.push({
        worker: newWorkerId,
        action: 'added',
        note: `Thợ mới được chỉ định khi chuyển sang ${status}`,
        timestamp: new Date()
      });

      await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

      await releaseWorkers(oldWorkerIds, car._id, 'workingOnly');

      car.status = status;
      await car.save();

      return res.status(200).json({
        message: 'Chuyển sang sửa bổ sung với thợ mới thành công',
        car: await populateCarWorkers(id)
      });
    }


    // **LOGIC MỚI: XỬ LÝ CHUYỂN SANG DELIVERED**
    if (status === 'delivered') {
      await releaseWorkers(carWorkerIds, car._id, 'deliveredStyle');

      car.status = status;
      await car.save();

      return res.status(200).json({
        message: 'Xe đã được giao thành công',
        car: await populateCarWorkers(id)
      });
    }

    // **LOGIC CŨ: Nếu muốn đổi sang "working", kiểm tra thợ có đang bận không**
    if (status === 'working') {
      for (const workerId of carWorkerIds) {
        const otherWorkingCars = await Car.findOne({
          _id: { $ne: car._id }, // bỏ qua xe hiện tại
          'workers.worker': workerId,
          status: 'working',
        });

        if (otherWorkingCars) {
          // Lấy tên thợ để hiển thị thông báo
          const worker = await Worker.findById(workerId);
          return res.status(400).json({
            message: `Không thể chuyển sang 'working'. Thợ ${worker?.name || 'không rõ'} đang sửa xe khác.`,
          });
        }
      }
    }

    // **LOGIC CŨ: Nếu vượt qua được kiểm tra thì cập nhật trạng thái**
    car.status = status;
    await car.save();

    // **LOGIC CŨ: Cập nhật trạng thái thợ**
    for (const workerId of carWorkerIds) {
      await updateWorkerStatusDefault(workerId);
    }

    const updatedCar = await populateCarWorkers(id);
    return res.status(200).json({
      message: `Cập nhật trạng thái xe thành công: ${status}`,
      car: updatedCar
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
const getCarsByLocation = async (req, res) => {
  const { locationId } = req.params;

  try {
    const cars = await findCarsForList({ location: locationId });

    return res.status(200).json(cars);
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
      const workerId = w.worker;
      const allCarsOfWorker = await Car.find({ 'workers.worker': workerId });

      const hasActiveJob = allCarsOfWorker.some((c) =>
        ['working', 'waiting_wash', 'additional_repair'].includes(c.status)
      );

      await Worker.findByIdAndUpdate(workerId, {
        status: hasActiveJob ? 'busy' : 'available',
      });
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

const getCarStats = async (req, res) => {
  try {
    const statuses = [
      'pending',
      'working',
      'done',
      'waiting_wash',
      'waiting_handover',
      'delivered',
      'additional_repair'
    ];

    const locations = await Location.find();

    const [totalCounts, locationCounts] = await Promise.all([
      Car.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Car.aggregate([
        { $match: { location: { $ne: null } } },
        { $group: { _id: { location: '$location', status: '$status' }, count: { $sum: 1 } } },
      ]),
    ]);

    const totalCountMap = totalCounts.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const allLocation = statuses.reduce((acc, status) => {
      acc[status] = totalCountMap[status] || 0;
      return acc;
    }, {});

    const locationCountMap = locationCounts.reduce((acc, row) => {
      const locationId = row._id.location?.toString();
      if (!locationId) return acc;
      if (!acc[locationId]) acc[locationId] = {};
      acc[locationId][row._id.status] = row.count;
      return acc;
    }, {});

    const byLocation = {};
    for (const loc of locations) {
      const locId = loc._id.toString();
      byLocation[loc._id] = {
        name: loc.name,
        ...statuses.reduce((acc, status) => {
          acc[status] = locationCountMap[locId]?.[status] || 0;
          return acc;
        }, {}),
      };
    }

    return res.status(200).json({
      allLocation,
      byLocation
    });
  } catch (error) {
    console.error('Lỗi khi thống kê xe:', error);
    return res.status(500).json({ message: error.message });
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


const getOverdueCars = async (req, res) => {
  try {
    const allCars = await Car.find({
      deliveryTime: { $exists: true, $ne: '' },
      status: { $ne: 'delivered' },
    })
      .select(CAR_LIST_SELECT)
      .populate(CAR_LIST_POPULATE)
      .lean();

    const overdueCars = allCars.filter(car => {
      const [date, time] = car.deliveryTime.split(' ');
      const [day, month, year] = date.split('-');
      const hour = parseInt(time.replace('h', ''), 10);

      const deliveryDate = new Date(`${year}-${month}-${day}T${hour.toString().padStart(2, '0')}:00:00`);
      return deliveryDate < new Date();
    });

    return res.status(200).json({ cars: overdueCars });
  } catch (err) {
    return res.status(500).json({ message: err.message });
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
        select: 'plateNumber externalCarTypeName currentDate status isLate workers workerLogs',
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
        carType: item.car?.externalCarTypeName || '',
        carDate: item.car?.currentDate || '',
        carStatus: item.car?.status || '',
        carIsLate: item.car?.isLate || false,
        groupName: item.groupName || '',
        content: item.content || '',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
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
        items: responseItems.map(
          ({
            amount,
            unitPrice,
            quantity,
            assignments,
            allAssignments,
            ...rest
          }) => rest
        ),
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

    return res.json(items);
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
    || String(existingItem.unit || '') !== String(payload.unit || '')
    || !areWorkerAssignmentsEqual(oldWorkers, workerEntries);
};

const buildWorkerAssignmentUpdate = async (workerEntries, countRevenueMap, itemAmount) => {
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
      { amount: itemAmount, workerAssignments },
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

const fetchRepairItemsForCar = async (carId) =>
  RepairOrderItem.find({ car: carId })
    .populate('workerAssignments.worker', 'name')
    .populate('worker', 'name')
    .sort({ isManual: 1, groupName: 1, createdAt: 1 });

const assignRepairItemWorkers = async (req, res) => {
  try {
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
        existingItem.amount
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
        amount
      );

      const payload = {
        groupName: String(item.groupName || 'Phát sinh').trim(),
        content,
        quantity,
        unitPrice,
        amount,
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

module.exports = {
  getAllCars,
  getCarById,
  createCar,
  updateCar,
  deleteCar,
  updateCarStatus,
  getCarByPlateNumber,
  getCarStats,
  getWorkingAndPendingCars,
  getCarsByLocation,
  getOverdueCars,
  getCarWorkersHistory,
  getCarRepairItems,
  assignRepairItemWorkers,
  saveManualRepairItems,
  getRepairHistory,
  notifyAdminAboutCar,
};
