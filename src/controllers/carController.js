const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Supervisor = require('../models/Supervisor');

// Lấy tất cả xe
const getAllCars = async (req, res) => {
    try {
        const cars = await Car.find()
            .populate('mainWorker', 'name')
            .populate('subWorker', 'name')
            .populate('supervisor', 'name');
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
            .populate('mainWorker', 'name')
            .populate('subWorker', 'name')
            .populate('supervisor', 'name');
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

        // Loại bỏ các trường rỗng
        ['mainWorker', 'subWorker', 'supervisor'].forEach(field => {
            if (data[field] === '') {
                data[field] = undefined;
            }
        });

        // Danh sách lỗi nếu có thợ đã bận
        const busyErrors = [];

        const checkWorkerBusy = async (workerId, roleName) => {
            if (!workerId) return;

            const existingCar = await Car.findOne({
                status: { $ne: 'done' },
                $or: [
                    { mainWorker: workerId },
                    { subWorker: workerId }
                ]
            }).populate('mainWorker subWorker');

            if (existingCar) {
                const workerField = existingCar.mainWorker?._id.equals(workerId)
                    ? 'mainWorker'
                    : 'subWorker';
                const name = existingCar[workerField]?.name || 'Không rõ';
                busyErrors.push(`${roleName} "${name}" đang bận làm xe biển số ${existingCar.plateNumber}`);
            }
        };

        await checkWorkerBusy(data.mainWorker, 'Thợ chính');
        await checkWorkerBusy(data.subWorker, 'Thợ phụ');

        if (busyErrors.length > 0) {
            return res.status(400).json({
                message: 'Không thể tạo xe vì có thợ đang bận:',
                errors: busyErrors
            });
        }

        // Tạo xe
        const car = new Car(data);
        await car.save();

        // Cập nhật trạng thái thợ thành "busy"
        const updateStatusToBusy = async (id, model) => {
            if (id) {
                await model.findByIdAndUpdate(id, { status: 'busy' });
            }
        };

        await updateStatusToBusy(data.mainWorker, Worker);
        await updateStatusToBusy(data.subWorker, Worker);
        // Không cần cập nhật supervisor nữa

        return res.status(201).json(car);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};


// Cập nhật thông tin xe
const updateCar = async (req, res) => {
    const { id } = req.params;

    // Loại bỏ các trường ObjectId có giá trị rỗng
    ['mainWorker', 'subWorker', 'supervisor'].forEach(field => {
        if (req.body[field] === '') {
            req.body[field] = null;
        }
    });

    try {
        const carBefore = await Car.findById(id);
        if (!carBefore) {
            return res.status(404).json({ message: 'Xe không tìm thấy' });
        }

        const oldMainWorker = carBefore.mainWorker;
        const oldSubWorker = carBefore.subWorker;

        // Cập nhật xe
        const updatedCar = await Car.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });

        // Nếu gỡ thợ chính
        if (oldMainWorker && (!req.body.mainWorker || req.body.mainWorker.toString() !== oldMainWorker.toString())) {
            const stillHasJob = await Car.exists({
                status: { $ne: 'done' },
                $or: [{ mainWorker: oldMainWorker }, { subWorker: oldMainWorker }]
            });
            if (!stillHasJob) {
                await Worker.findByIdAndUpdate(oldMainWorker, { status: 'available' });
            }
        }

        // Nếu gỡ thợ phụ
        if (oldSubWorker && (!req.body.subWorker || req.body.subWorker.toString() !== oldSubWorker.toString())) {
            const stillHasJob = await Car.exists({
                status: { $ne: 'done' },
                $or: [{ mainWorker: oldSubWorker }, { subWorker: oldSubWorker }]
            });
            if (!stillHasJob) {
                await Worker.findByIdAndUpdate(oldSubWorker, { status: 'available' });
            }
        }

        // ✅ Nếu gán lại thợ → chuyển họ sang busy nếu đang available
        const updateWorkerToBusyIfNeeded = async (workerId) => {
            if (!workerId) return;
            const worker = await Worker.findById(workerId);
            if (worker && worker.status !== 'busy') {
                await Worker.findByIdAndUpdate(workerId, { status: 'busy' });
            }
        };

        // Chỉ cập nhật busy nếu xe chưa hoàn thành
        if (updatedCar.status !== 'done') {
            await updateWorkerToBusyIfNeeded(updatedCar.mainWorker);
            await updateWorkerToBusyIfNeeded(updatedCar.subWorker);
        }

        return res.status(200).json(updatedCar);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};




// Cập nhật trạng thái xe (ví dụ: done, working, etc.)
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

        // Nếu từ "done" -> trạng thái khác: cập nhật thợ về busy
        if (oldStatus === 'done' && status !== 'done') {
            const updateStatusToBusy = async (personId, model) => {
                if (personId) {
                    await model.findByIdAndUpdate(personId, { status: 'busy' });
                }
            };
            await updateStatusToBusy(car.mainWorker, Worker);
            await updateStatusToBusy(car.subWorker, Worker);
        }

        // Nếu chuyển sang done → cập nhật thợ về available nếu không còn xe nào chưa xong
        if (status === 'done') {
            const updateStatusToAvailable = async (personId, model) => {
                if (!personId) return;
                const stillHasJob = await Car.exists({
                    status: { $ne: 'done' },
                    $or: [
                        { mainWorker: personId },
                        { subWorker: personId }
                    ]
                });
                if (!stillHasJob) {
                    await model.findByIdAndUpdate(personId, { status: 'available' });
                }
            };
            await updateStatusToAvailable(car.mainWorker, Worker);
            await updateStatusToAvailable(car.subWorker, Worker);
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

        const updateStatusToAvailable = async (personId, model) => {
            if (!personId) return;
            const isStillBusy = await Car.exists({
                $or: [
                    { mainWorker: personId },
                    { subWorker: personId },
                    { supervisor: personId }
                ]
            });
            if (!isStillBusy) {
                await model.findByIdAndUpdate(personId, { status: 'available' });
            }
        };

        await updateStatusToAvailable(car.mainWorker, Worker);
        await updateStatusToAvailable(car.subWorker, Worker);
        await updateStatusToAvailable(car.supervisor, Supervisor);

        return res.status(200).json({ message: `Xe ${car.plateNumber} đã được xóa.` });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Export các hàm
module.exports = {
    getAllCars,
    getCarById,
    createCar,
    updateCar,
    deleteCar,
    updateCarStatus
};
