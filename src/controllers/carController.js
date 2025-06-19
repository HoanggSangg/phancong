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


// Cập nhật thông tin xe
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


// Cập nhật trạng thái xe
const updateCarStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const car = await Car.findById(id);
        if (!car) return res.status(404).json({ message: 'Xe không tìm thấy' });

        const carWorkerIds = car.workers.map(w => w.worker.toString());

        // Nếu muốn đổi sang "working", kiểm tra thợ có đang bận không
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

        // Nếu vượt qua được kiểm tra thì cập nhật trạng thái
        car.status = status;
        await car.save();

        // Cập nhật trạng thái thợ
        for (const workerId of carWorkerIds) {
            const allCarsOfWorker = await Car.find({ 'workers.worker': workerId });

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

        return res.status(200).json({ message: `Cập nhật trạng thái xe thành công: ${status}`, car });
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
        const [doneCount, workingCount, pendingCount] = await Promise.all([
            Car.countDocuments({ status: 'done' }),
            Car.countDocuments({ status: 'working' }),
            Car.countDocuments({ status: 'pending' })
        ]);

        return res.status(200).json({
            done: doneCount,
            working: workingCount,
            pending: pendingCount
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
const getWorkingAndPendingCars = async (req, res) => {
  try {
    const working = await Car.find({ status: 'working' })
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')
      .populate('carType', 'name')
      .populate('location', 'name');

    const pending = await Car.find({ status: 'pending' })
      .populate('workers.worker', 'name')
      .populate('supervisor', 'name')
      .populate('carType', 'name')
      .populate('location', 'name');

    res.json({ working, pending });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    getCarsByLocation
};
