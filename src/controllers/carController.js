const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Supervisor = require('../models/Supervisor');
const CateCar = require('../models/CateCar');
const moment = require('moment-timezone');

// Lấy tất cả xe
const getAllCars = async (req, res) => {
    try {
        const cars = await Car.find()
            .populate('workers.worker', 'name')
            .populate('supervisor', 'name')
            .populate('carType', 'name');
        return res.status(200).json(cars);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy xe theo ID
const getCarById = async (req, res) => {
    const { id } = req.params;
    try {
        const car = await Car.findById(id)
            .populate('workers.worker', 'name')
            .populate('supervisor', 'name')
            .populate('carType', 'name');
        if (!car) {
            return res.status(404).json({ message: 'Xe không tìm thấy' });
        }
        return res.status(200).json(car);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Tạo xe mới
const createCar = async (req, res) => {
    try {
        const data = { ...req.body };

        if (!Array.isArray(data.workers)) data.workers = [];
        if (data.supervisor === '') data.supervisor = undefined;

        // Gán thời gian tạo theo giờ Việt Nam
        data.currentTime = moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
        data.currentDate = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');

        // Kiểm tra carType hợp lệ
        const cateCarExists = await CateCar.exists({ _id: data.carType });
        if (!cateCarExists) {
            return res.status(400).json({ message: 'Loại xe không hợp lệ' });
        }

        const busyErrors = [];

        for (const w of data.workers) {
            const workerId = w.worker;
            const existingCar = await Car.findOne({
                status: { $ne: 'done' },
                'workers.worker': workerId
            }).populate('workers.worker');

            if (existingCar) {
                const worker = existingCar.workers.find(x => x.worker._id.equals(workerId));
                busyErrors.push(`Thợ "${worker?.worker?.name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
            }
        }

        if (busyErrors.length > 0) {
            return res.status(400).json({
                message: 'Không thể tạo xe vì có thợ đang bận:',
                errors: busyErrors
            });
        }

        const car = new Car(data);
        await car.save();

        for (const w of data.workers) {
            await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
        }

        return res.status(201).json(car);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật thông tin xe
const updateCar = async (req, res) => {
    const { id } = req.params;
    if (!Array.isArray(req.body.workers)) req.body.workers = [];
    if (req.body.supervisor === '') req.body.supervisor = null;

    try {
        const carBefore = await Car.findById(id);
        if (!carBefore) {
            return res.status(404).json({ message: 'Xe không tìm thấy' });
        }

        if (req.body.carType) {
            const cateCarExists = await CateCar.exists({ _id: req.body.carType });
            if (!cateCarExists) {
                return res.status(400).json({ message: 'Loại xe không hợp lệ' });
            }
        }

        const oldWorkers = carBefore.workers.map(w => w.worker.toString());
        const newWorkers = req.body.workers.map(w => w.worker.toString());

        const removedWorkers = oldWorkers.filter(w => !newWorkers.includes(w));
        const addedWorkers = newWorkers.filter(w => !oldWorkers.includes(w));

        const updatedCar = await Car.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });

        for (const workerId of removedWorkers) {
            const stillHasJob = await Car.exists({
                status: { $ne: 'done' },
                'workers.worker': workerId
            });
            if (!stillHasJob) {
                await Worker.findByIdAndUpdate(workerId, { status: 'available' });
            }
        }

        if (updatedCar.status !== 'done') {
            for (const workerId of addedWorkers) {
                const worker = await Worker.findById(workerId);
                if (worker && worker.status !== 'busy') {
                    await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
                }
            }
        }

        return res.status(200).json(updatedCar);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật trạng thái xe
const updateCarStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const car = await Car.findById(id);
        if (!car) {
            return res.status(404).json({ message: 'Xe không tìm thấy' });
        }

        const oldStatus = car.status;
        car.status = status;
        await car.save();

        if (oldStatus === 'done' && status !== 'done') {
            for (const w of car.workers) {
                await Worker.findByIdAndUpdate(w.worker, { status: 'busy' });
            }
        }

        if (status === 'done') {
            for (const w of car.workers) {
                const stillHasJob = await Car.exists({
                    status: { $ne: 'done' },
                    'workers.worker': w.worker
                });
                if (!stillHasJob) {
                    await Worker.findByIdAndUpdate(w.worker, { status: 'available' });
                }
            }
        }

        return res.status(200).json({ message: `Trạng thái xe cập nhật thành ${status}.`, car });
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

module.exports = {
    getAllCars,
    getCarById,
    createCar,
    updateCar,
    deleteCar,
    updateCarStatus
};
