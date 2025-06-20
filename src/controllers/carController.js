const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Supervisor = require('../models/Supervisor');
const CateCar = require('../models/CateCar');
const Location = require('../models/Location');
const moment = require('moment-timezone');

// Lấy tất cả xe
const getAllCars = async (req, res) => {
  try {
    const cars = await Car.find()
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')
      .populate('carType', 'name')
      .populate('location', 'name');

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
      .populate('carType', 'name')
      .populate('location', 'name');

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    res.json(car);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Tạo xe mới
// const createCar = async (req, res) => {
//     try {
//         const data = { ...req.body };

//         if (!Array.isArray(data.workers)) data.workers = [];
//         if (data.supervisor === '') data.supervisor = undefined;

//         // Gán thời gian tạo theo giờ Việt Nam
//         const now = moment().tz('Asia/Ho_Chi_Minh');
//         data.currentTime = now.format('HH:mm:ss');
//         data.currentDate = now.format('YYYY-MM-DD');

//         // Kiểm tra carType hợp lệ
//         const cateCarExists = await CateCar.exists({ _id: data.carType });
//         if (!cateCarExists) {
//             return res.status(400).json({ message: 'Loại xe không hợp lệ' });
//         }

//         // ❗ Kiểm tra biển số đã tồn tại trong ngày hôm nay chưa
//         const isPlateExistToday = await Car.findOne({
//             plateNumber: data.plateNumber,
//             currentDate: data.currentDate,
//         });

//         if (isPlateExistToday) {
//             return res.status(400).json({
//                 message: `Xe với biển số ${data.plateNumber} đã được tạo trong ngày hôm nay`,
//             });
//         }

//         // Kiểm tra thợ có đang bận hay không
//         const busyErrors = [];

//         for (const w of data.workers) {
//             const workerId = w.worker;

//             const existingCar = await Car.findOne({
//                 status: 'working',
//                 'workers.worker': workerId,
//             }).populate('workers.worker');

//             if (existingCar) {
//                 const worker = existingCar.workers.find(x => x.worker._id.equals(workerId));
//                 busyErrors.push(`Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
//             }
//         }

//         if (busyErrors.length > 0) {
//             return res.status(400).json({
//                 message: 'Không thể tạo xe vì có thợ đang bận:',
//                 errors: busyErrors,
//             });
//         }

//         // Tạo xe mới
//         const car = new Car(data);
//         await car.save();

//         // Nếu xe này là working thì cập nhật trạng thái thợ thành busy
//         if (car.status === 'working') {
//             for (const w of data.workers) {
//                 await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
//             }
//         }

//         return res.status(201).json(car);
//     } catch (error) {
//         console.error('Lỗi tạo xe:', error);
//         return res.status(400).json({ message: error.message });
//     }
// };
// const createCar = async (req, res) => {
//   try {
//     const data = { ...req.body };

//     if (!Array.isArray(data.workers)) data.workers = [];
//     if (data.supervisor === '') data.supervisor = undefined;

//     const now = moment().tz('Asia/Ho_Chi_Minh');
//     data.currentTime = now.format('HH:mm:ss');
//     data.currentDate = now.format('YYYY-MM-DD');

//     // Kiểm tra loại xe
//     const cateCarExists = await CateCar.exists({ _id: data.carType });
//     if (!cateCarExists) {
//       return res.status(400).json({ message: 'Loại xe không hợp lệ' });
//     }

//     // Kiểm tra biển số trong ngày
//     const isPlateExistToday = await Car.findOne({
//       plateNumber: data.plateNumber,
//       currentDate: data.currentDate,
//     });

//     if (isPlateExistToday) {
//       return res.status(400).json({
//         message: `Xe với biển số ${data.plateNumber} đã được tạo trong ngày hôm nay`,
//       });
//     }

//     // ✅ Kiểm tra location
//     if (!data.location) {
//       return res.status(400).json({ message: 'Địa điểm là bắt buộc' });
//     }
//     const locationExists = await Location.exists({ _id: data.location });
//     if (!locationExists) {
//       return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
//     }

//     // ✅ Kiểm tra và chuẩn hóa deliveryTime
//     if (data.deliveryTime) {
//       const original = data.deliveryTime.trim();
//       const normalized = original.replace(/\[?h\]?/, '').trim();

//       const isValid = moment(normalized, 'DD-MM-YYYY HH', true).isValid();
//       if (!isValid) {
//         return res.status(400).json({
//           message: 'Thời gian giao không hợp lệ (định dạng: DD-MM-YYYY HH[h])',
//         });
//       }

//       // Lưu chuẩn format có [h]
//       data.deliveryTime = moment(normalized, 'DD-MM-YYYY HH').format('DD-MM-YYYY HH') + '[h]';
//     }

//     // ✅ Kiểm tra thợ có đang bận không
//     const busyErrors = [];

//     for (const w of data.workers) {
//       const workerId = w.worker;

//       const existingCar = await Car.findOne({
//         status: 'working',
//         'workers.worker': workerId,
//       }).populate('workers.worker');

//       if (existingCar) {
//         const worker = existingCar.workers.find(x => x.worker._id.equals(workerId));
//         busyErrors.push(`Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
//       }
//     }

//     if (busyErrors.length > 0) {
//       return res.status(400).json({
//         message: 'Không thể tạo xe vì có thợ đang bận:',
//         errors: busyErrors,
//       });
//     }

//     // ✅ Lưu xe
//     const car = new Car(data);
//     await car.save();

//     // ✅ Cập nhật trạng thái thợ nếu xe đang "working"
//     if (car.status === 'working') {
//       for (const w of data.workers) {
//         await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
//       }
//     }

//     return res.status(201).json(car);
//   } catch (error) {
//     console.error('Lỗi tạo xe:', error);
//     return res.status(400).json({ message: error.message });
//   }
// };
const createCar = async (req, res) => {
  try {
    const data = { ...req.body };

    if (!Array.isArray(data.workers)) data.workers = [];
    if (data.supervisor === '') data.supervisor = undefined;

    const now = moment().tz('Asia/Ho_Chi_Minh');
    data.currentTime = now.format('HH:mm:ss');
    data.currentDate = now.format('YYYY-MM-DD');

    // Kiểm tra loại xe
    const cateCarExists = await CateCar.exists({ _id: data.carType });
    if (!cateCarExists) {
      return res.status(400).json({ message: 'Loại xe không hợp lệ' });
    }

    // Kiểm tra biển số trong ngày
    const isPlateExistToday = await Car.findOne({
      plateNumber: data.plateNumber,
      currentDate: data.currentDate,
    });

    if (isPlateExistToday) {
      return res.status(400).json({
        message: `Xe với biển số ${data.plateNumber} đã được tạo trong ngày hôm nay`,
      });
    }

    // ✅ Kiểm tra location
    if (!data.location) {
      return res.status(400).json({ message: 'Địa điểm là bắt buộc' });
    }
    const locationExists = await Location.exists({ _id: data.location });
    if (!locationExists) {
      return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
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
    const busyErrors = [];
    for (const w of data.workers) {
      const workerId = w.worker;

      const existingCar = await Car.findOne({
        status: 'working',
        'workers.worker': workerId,
      }).populate('workers.worker');

      if (existingCar) {
        const worker = existingCar.workers.find(x => x.worker._id.equals(workerId));
        busyErrors.push(`Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
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

    // ✅ Cập nhật trạng thái thợ nếu xe đang "working"
    if (car.status === 'working') {
      for (const w of data.workers) {
        await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
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

    if (req.body.location) {
      const locationExists = await Location.exists({ _id: req.body.location });
      if (!locationExists) {
        return res.status(400).json({ message: 'Địa điểm không hợp lệ' });
      }
    }

    if (req.body.deliveryTime && !moment(req.body.deliveryTime, 'DD-MM-YYYY HH[h]', true).isValid()) {
      return res.status(400).json({ message: 'Thời gian giao không hợp lệ (định dạng: DD-MM-YYYY HH[h])' });
    }

    const updatedCar = await Car.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updatedCar) {
      return res.status(404).json({ message: 'Không tìm thấy xe' });
    }

    res.json(updatedCar);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



// const updateCarStatus = async (req, res) => {
//     const { id } = req.params;
//     const { status, newWorkerId } = req.body; // Thêm newWorkerId để chọn thợ mới

//     try {
//         const car = await Car.findById(id).populate('workers.worker');
//         if (!car) return res.status(404).json({ message: 'Xe không tìm thấy' });

//         const currentStatus = car.status;
//         const carWorkerIds = car.workers.map(w => w.worker._id.toString());

//         // **LOGIC MỚI: KIỂM TRA CHUYỂN TRẠNG THÁI HỢP LỆ**
        
//         // 1. Từ done chỉ có thể chuyển sang waiting_wash hoặc waiting_handover
//         if (currentStatus === 'done' && !['waiting_wash', 'waiting_handover'].includes(status)) {
//             return res.status(400).json({
//                 message: 'Từ trạng thái "sửa xong" chỉ có thể chuyển sang "chờ rửa xe" hoặc "chờ giao xe"'
//             });
//         }

//         // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_WASH**
//         if (currentStatus === 'done' && status === 'waiting_wash') {
//             // Nếu có newWorkerId => chọn thợ mới rửa xe
//             if (newWorkerId) {
//                 const newWorker = await Worker.findById(newWorkerId);
//                 if (!newWorker) {
//                     return res.status(404).json({ message: 'Thợ mới không tồn tại' });
//                 }

//                 if (newWorker.status === 'busy') {
//                     return res.status(400).json({
//                         message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`
//                     });
//                 }

//                 // Cập nhật thợ mới cho xe
//                 car.workers = [{
//                     worker: newWorkerId,
//                     role: 'main'
//                 }];

//                 // Thợ mới bận
//                 await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

//                 // Thợ cũ rảnh (vì đã được thay thế)
//                 for (const oldWorkerId of carWorkerIds) {
//                     const allCarsOfOldWorker = await Car.find({ 
//                         'workers.worker': oldWorkerId,
//                         _id: { $ne: car._id } // bỏ qua xe hiện tại vì đã thay thợ
//                     });
//                     const hasWorking = allCarsOfOldWorker.some(c => c.status === 'working');
//                     const hasPending = allCarsOfOldWorker.some(c => c.status === 'pending');

//                     if (hasWorking) {
//                         await Worker.findByIdAndUpdate(oldWorkerId, { status: 'busy' });
//                     } else if (hasPending) {
//                         await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
//                     } else {
//                         await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
//                     }
//                 }

//                 car.status = status;
//                 await car.save();

//                 return res.status(200).json({ 
//                     message: 'Chuyển sang chờ rửa xe với thợ mới thành công', 
//                     car: await Car.findById(id).populate('workers.worker')
//                 });
//             } else {
//                 // **FIX: Nếu không có newWorkerId => giữ thợ cũ rửa xe, thợ cũ vẫn BUSY**
//                 // Không thay đổi workers, chỉ đổi status
//                 car.status = status;
//                 await car.save();

//                 // Thợ cũ vẫn bận vì phải rửa xe
//                 for (const workerId of carWorkerIds) {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
//                 }

//                 return res.status(200).json({ 
//                     message: 'Chuyển sang chờ rửa xe với thợ hiện tại thành công', 
//                     car: await Car.findById(id).populate('workers.worker')
//                 });
//             }
//         }

//         // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_HANDOVER**
//         if (currentStatus === 'done' && status === 'waiting_handover') {
//             // Thợ cũ rảnh vì không cần làm gì thêm
//             for (const workerId of carWorkerIds) {
//                 const allCarsOfWorker = await Car.find({ 
//                     'workers.worker': workerId,
//                     _id: { $ne: car._id } // bỏ qua xe hiện tại
//                 });
//                 const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
//                 const hasPending = allCarsOfWorker.some(c => c.status === 'pending');

//                 if (hasWorking) {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
//                 } else if (hasPending) {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//                 } else {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//                 }
//             }

//             car.status = status;
//             await car.save();

//             return res.status(200).json({ 
//                 message: 'Chuyển sang chờ giao xe thành công', 
//                 car: await Car.findById(id).populate('workers.worker')
//             });
//         }

//         // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_WASH HOẶC WAITING_HANDOVER SANG ADDITIONAL_REPAIR**
//         if (['waiting_wash', 'waiting_handover'].includes(currentStatus) && status === 'additional_repair') {
//             if (!newWorkerId) {
//                 return res.status(400).json({
//                     message: 'Cần chọn thợ mới cho sửa bổ sung'
//                 });
//             }

//             // Kiểm tra thợ mới có rảnh không
//             const newWorker = await Worker.findById(newWorkerId);
//             if (!newWorker) {
//                 return res.status(404).json({ message: 'Thợ mới không tồn tại' });
//             }

//             if (newWorker.status === 'busy') {
//                 return res.status(400).json({
//                     message: `Không thể chọn thợ ${newWorker.name}. Thợ này đang bận.`
//                 });
//             }

//             // Lưu lại thợ cũ để cập nhật trạng thái
//             const oldWorkerIds = [...carWorkerIds];

//             // Cập nhật thợ mới cho xe
//             car.workers = [{
//                 worker: newWorkerId,
//                 role: 'main'
//             }];

//             // Thợ mới bận
//             await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

//             // Thợ cũ rảnh (vì đã được thay thế)
//             for (const oldWorkerId of oldWorkerIds) {
//                 const allCarsOfOldWorker = await Car.find({ 
//                     'workers.worker': oldWorkerId,
//                     _id: { $ne: car._id } // bỏ qua xe hiện tại vì đã thay thợ
//                 });
//                 const hasWorking = allCarsOfOldWorker.some(c => c.status === 'working');
//                 const hasPending = allCarsOfOldWorker.some(c => c.status === 'pending');

//                 if (hasWorking) {
//                     await Worker.findByIdAndUpdate(oldWorkerId, { status: 'busy' });
//                 } else if (hasPending) {
//                     await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
//                 } else {
//                     await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
//                 }
//             }

//             car.status = status;
//             await car.save();

//             return res.status(200).json({ 
//                 message: 'Chuyển sang sửa bổ sung với thợ mới thành công', 
//                 car: await Car.findById(id).populate('workers.worker')
//             });
//         }

//         // **LOGIC MỚI: XỬ LÝ CHUYỂN SANG DELIVERED**
//         if (status === 'delivered') {
//             // Tất cả thợ liên quan đều rảnh
//             for (const workerId of carWorkerIds) {
//                 const allCarsOfWorker = await Car.find({ 
//                     'workers.worker': workerId,
//                     _id: { $ne: car._id } // bỏ qua xe hiện tại
//                 });
//                 const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
//                 const hasPending = allCarsOfWorker.some(c => c.status === 'pending');

//                 if (hasWorking) {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
//                 } else if (hasPending) {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//                 } else {
//                     await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//                 }
//             }

//             car.status = status;
//             await car.save();

//             return res.status(200).json({ 
//                 message: 'Xe đã được giao thành công', 
//                 car: await Car.findById(id).populate('workers.worker')
//             });
//         }

//         // **LOGIC CŨ: Nếu muốn đổi sang "working", kiểm tra thợ có đang bận không**
//         if (status === 'working') {
//             for (const workerId of carWorkerIds) {
//                 const otherWorkingCars = await Car.findOne({
//                     _id: { $ne: car._id }, // bỏ qua xe hiện tại
//                     'workers.worker': workerId,
//                     status: 'working',
//                 });

//                 if (otherWorkingCars) {
//                     // Lấy tên thợ để hiển thị thông báo
//                     const worker = await Worker.findById(workerId);
//                     return res.status(400).json({
//                         message: `Không thể chuyển sang 'working'. Thợ ${worker?.name || 'không rõ'} đang sửa xe khác.`,
//                     });
//                 }
//             }
//         }

//         // **LOGIC CŨ: Nếu vượt qua được kiểm tra thì cập nhật trạng thái**
//         car.status = status;
//         await car.save();

//         // **LOGIC CŨ: Cập nhật trạng thái thợ**
//         for (const workerId of carWorkerIds) {
//             const allCarsOfWorker = await Car.find({ 'workers.worker': workerId });

//             const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
//             const hasPending = allCarsOfWorker.some(c => c.status === 'pending');
//             const hasWaitingWash = allCarsOfWorker.some(c => c.status === 'waiting_wash');
//             const hasAdditionalRepair = allCarsOfWorker.some(c => c.status === 'additional_repair');

//             if (hasWorking || hasWaitingWash || hasAdditionalRepair) {
//                 await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
//             } else if (hasPending) {
//                 await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//             } else {
//                 await Worker.findByIdAndUpdate(workerId, { status: 'available' });
//             }
//         }

//         const updatedCar = await Car.findById(id).populate('workers.worker');
//         return res.status(200).json({ 
//             message: `Cập nhật trạng thái xe thành công: ${status}`, 
//             car: updatedCar 
//         });
//     } catch (error) {
//         return res.status(500).json({ message: error.message });
//     }
// };

const updateCarStatus = async (req, res) => {
    const { id } = req.params;
    const { status, newWorkerId } = req.body; // Thêm newWorkerId để chọn thợ mới

    try {
        const car = await Car.findById(id).populate('workers.worker');
        if (!car) return res.status(404).json({ message: 'Xe không tìm thấy' });

        const currentStatus = car.status;
        const carWorkerIds = car.workers.map(w => w.worker._id.toString());

        // **LOGIC MỚI: KIỂM TRA CHUYỂN TRẠNG THÁI HỢP LỆ**
        
        // 1. Từ done chỉ có thể chuyển sang waiting_wash hoặc waiting_handover
        if (currentStatus === 'done' && !['waiting_wash', 'waiting_handover'].includes(status)) {
            return res.status(400).json({
                message: 'Từ trạng thái "sửa xong" chỉ có thể chuyển sang "chờ rửa xe" hoặc "chờ giao xe"'
            });
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_WASH**
        if (currentStatus === 'done' && status === 'waiting_wash') {
            // Nếu có newWorkerId => chọn thợ mới rửa xe
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

                // Cập nhật thợ mới cho xe
                car.workers = [{
                    worker: newWorkerId,
                    role: 'main'
                }];

                // Thợ mới bận
                await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

                // Thợ cũ rảnh (vì đã được thay thế)
                for (const oldWorkerId of carWorkerIds) {
                    const allCarsOfOldWorker = await Car.find({ 
                        'workers.worker': oldWorkerId,
                        _id: { $ne: car._id } // bỏ qua xe hiện tại vì đã thay thợ
                    });
                    const hasWorking = allCarsOfOldWorker.some(c => c.status === 'working');
                    const hasPending = allCarsOfOldWorker.some(c => c.status === 'pending');

                    if (hasWorking) {
                        await Worker.findByIdAndUpdate(oldWorkerId, { status: 'busy' });
                    } else if (hasPending) {
                        await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                    } else {
                        await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                    }
                }

                car.status = status;
                await car.save();

                return res.status(200).json({ 
                    message: 'Chuyển sang chờ rửa xe với thợ mới thành công', 
                    car: await Car.findById(id).populate('workers.worker')
                });
            } else {
                // **FIX: Nếu không có newWorkerId => giữ thợ cũ rửa xe, thợ cũ vẫn BUSY**
                // Không thay đổi workers, chỉ đổi status
                car.status = status;
                await car.save();

                // Thợ cũ vẫn bận vì phải rửa xe
                for (const workerId of carWorkerIds) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
                }

                return res.status(200).json({ 
                    message: 'Chuyển sang chờ rửa xe với thợ hiện tại thành công', 
                    car: await Car.findById(id).populate('workers.worker')
                });
            }
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ DONE SANG WAITING_HANDOVER**
        if (currentStatus === 'done' && status === 'waiting_handover') {
            // Thợ cũ rảnh vì không cần làm gì thêm
            for (const workerId of carWorkerIds) {
                const allCarsOfWorker = await Car.find({ 
                    'workers.worker': workerId,
                    _id: { $ne: car._id } // bỏ qua xe hiện tại
                });
                const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
                const hasPending = allCarsOfWorker.some(c => c.status === 'pending');

                if (hasWorking) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
                } else if (hasPending) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                } else {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                }
            }

            car.status = status;
            await car.save();

            return res.status(200).json({ 
                message: 'Chuyển sang chờ giao xe thành công', 
                car: await Car.findById(id).populate('workers.worker')
            });
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_WASH SANG WAITING_HANDOVER**
        if (currentStatus === 'waiting_wash' && status === 'waiting_handover') {
            // Rửa xe xong, thợ rảnh
            for (const workerId of carWorkerIds) {
                const allCarsOfWorker = await Car.find({ 
                    'workers.worker': workerId,
                    _id: { $ne: car._id } // bỏ qua xe hiện tại
                });
                const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
                const hasPending = allCarsOfWorker.some(c => c.status === 'pending');

                if (hasWorking) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
                } else if (hasPending) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                } else {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                }
            }

            car.status = status;
            await car.save();

            return res.status(200).json({ 
                message: 'Rửa xe xong, chuyển sang chờ giao xe thành công', 
                car: await Car.findById(id).populate('workers.worker')
            });
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_WASH SANG ADDITIONAL_REPAIR**
        if (currentStatus === 'waiting_wash' && status === 'additional_repair') {
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

            // Lưu lại thợ cũ để cập nhật trạng thái
            const oldWorkerIds = [...carWorkerIds];

            // Cập nhật thợ mới cho xe
            car.workers = [{
                worker: newWorkerId,
                role: 'main'
            }];

            // Thợ mới bận
            await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

            // Thợ cũ rảnh (vì đã được thay thế)
            for (const oldWorkerId of oldWorkerIds) {
                const allCarsOfOldWorker = await Car.find({ 
                    'workers.worker': oldWorkerId,
                    _id: { $ne: car._id } // bỏ qua xe hiện tại vì đã thay thợ
                });
                const hasWorking = allCarsOfOldWorker.some(c => c.status === 'working');
                const hasPending = allCarsOfOldWorker.some(c => c.status === 'pending');

                if (hasWorking) {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'busy' });
                } else if (hasPending) {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                } else {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                }
            }

            car.status = status;
            await car.save();

            return res.status(200).json({ 
                message: 'Chuyển sang sửa bổ sung với thợ mới thành công', 
                car: await Car.findById(id).populate('workers.worker')
            });
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN TỪ WAITING_HANDOVER SANG ADDITIONAL_REPAIR**
        if (currentStatus === 'waiting_handover' && status === 'additional_repair') {
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

            // Lưu lại thợ cũ để cập nhật trạng thái
            const oldWorkerIds = [...carWorkerIds];

            // Cập nhật thợ mới cho xe
            car.workers = [{
                worker: newWorkerId,
                role: 'main'
            }];

            // Thợ mới bận
            await Worker.findByIdAndUpdate(newWorkerId, { status: 'busy' });

            // Thợ cũ rảnh (vì đã được thay thế)
            for (const oldWorkerId of oldWorkerIds) {
                const allCarsOfOldWorker = await Car.find({ 
                    'workers.worker': oldWorkerId,
                    _id: { $ne: car._id } // bỏ qua xe hiện tại vì đã thay thợ
                });
                const hasWorking = allCarsOfOldWorker.some(c => c.status === 'working');
                const hasPending = allCarsOfOldWorker.some(c => c.status === 'pending');

                if (hasWorking) {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'busy' });
                } else if (hasPending) {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                } else {
                    await Worker.findByIdAndUpdate(oldWorkerId, { status: 'available' });
                }
            }

            car.status = status;
            await car.save();

            return res.status(200).json({ 
                message: 'Chuyển sang sửa bổ sung với thợ mới thành công', 
                car: await Car.findById(id).populate('workers.worker')
            });
        }

        // **LOGIC MỚI: XỬ LÝ CHUYỂN SANG DELIVERED**
        if (status === 'delivered') {
            // Tất cả thợ liên quan đều rảnh
            for (const workerId of carWorkerIds) {
                const allCarsOfWorker = await Car.find({ 
                    'workers.worker': workerId,
                    _id: { $ne: car._id } // bỏ qua xe hiện tại
                });
                const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
                const hasPending = allCarsOfWorker.some(c => c.status === 'pending');

                if (hasWorking) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
                } else if (hasPending) {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                } else {
                    await Worker.findByIdAndUpdate(workerId, { status: 'available' });
                }
            }

            car.status = status;
            await car.save();

            return res.status(200).json({ 
                message: 'Xe đã được giao thành công', 
                car: await Car.findById(id).populate('workers.worker')
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
            const allCarsOfWorker = await Car.find({ 'workers.worker': workerId });

            const hasWorking = allCarsOfWorker.some(c => c.status === 'working');
            const hasPending = allCarsOfWorker.some(c => c.status === 'pending');
            const hasWaitingWash = allCarsOfWorker.some(c => c.status === 'waiting_wash');
            const hasAdditionalRepair = allCarsOfWorker.some(c => c.status === 'additional_repair');

            if (hasWorking || hasWaitingWash || hasAdditionalRepair) {
                await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
            } else if (hasPending) {
                await Worker.findByIdAndUpdate(workerId, { status: 'available' });
            } else {
                await Worker.findByIdAndUpdate(workerId, { status: 'available' });
            }
        }

        const updatedCar = await Car.findById(id).populate('workers.worker');
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
        const cars = await Car.find({ location: locationId })
            .populate('workers.worker', 'name')
            .populate('supervisor', 'name')
            .populate('carType', 'name')
            .populate('location', 'name'); // Giả sử bạn có tên địa điểm

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

        for (const w of car.workers) {
            const stillHasJob = await Car.exists({ 'workers.worker': w.worker });
            if (!stillHasJob) {
                await Worker.findByIdAndUpdate(w.worker, { status: 'available' });
            }
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
      .populate('carType', 'name')
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

    // Lấy tất cả các location
    const locations = await Location.find();

    // Đếm tổng số xe theo từng trạng thái (tất cả địa điểm)
    const totalCounts = await Promise.all(
      statuses.map((status) => Car.countDocuments({ status }))
    );
    const allLocation = statuses.reduce((acc, status, index) => {
      acc[status] = totalCounts[index];
      return acc;
    }, {});

    // Đếm theo từng địa điểm
    const byLocation = {};

    for (const loc of locations) {
      const counts = await Promise.all(
        statuses.map((status) =>
          Car.countDocuments({ status, location: loc._id })
        )
      );

      byLocation[loc._id] = {
        name: loc.name,
        ...statuses.reduce((acc, status, index) => {
          acc[status] = counts[index];
          return acc;
        }, {})
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
      'additional_repair'
    ];

    const result = {};

    await Promise.all(
      statuses.map(async (status) => {
        const cars = await Car.find({ status })
          .populate('workers.worker', 'name')
          .populate('supervisor', 'name')
          .populate('carType', 'name')
          .populate('location', 'name');
        result[status] = cars;
      })
    );

    res.json(result); // trả về đối tượng với từng trạng thái là key
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


const getOverdueCars = async (req, res) => {
  try {
    const allCars = await Car.find({
      deliveryTime: { $exists: true },
      status: { $ne: 'delivered' },
    })
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')           // optional nếu bạn cần hiển thị giám sát
      .populate('carType', 'name')              // thêm dòng này
      .populate('location', 'name');            // thêm dòng này

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
    getOverdueCars
};
