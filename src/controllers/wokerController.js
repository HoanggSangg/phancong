const Worker = require('../models/Worker');
const Car = require('../models/Car');

// Lấy tất cả thợ
const getAllWorkers = async (req, res) => {
    try {
        const workers = await Worker.find();
        return res.status(200).json(workers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy thợ theo ID
const getWorkerById = async (req, res) => {
    const { id } = req.params;
    try {
        const worker = await Worker.findById(id);
        if (!worker) {
            return res.status(404).json({ message: 'Thợ không tìm thấy' });
        }
        return res.status(200).json(worker);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Tạo thợ mới
const createWorker = async (req, res) => {
    try {
        const worker = new Worker(req.body);
        await worker.save();
        return res.status(201).json(worker);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật thợ
const updateWorker = async (req, res) => {
    const { id } = req.params;
    try {
        const worker = await Worker.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });
        if (!worker) {
            return res.status(404).json({ message: 'Thợ không tìm thấy' });
        }
        return res.status(200).json(worker);
    } catch (error) {
        return res.status(400).json({ message: error.message });
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
        return res.status(200).json({ message: `Thợ ${worker.name} đã được xóa thành công!` });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy thợ chính
const getMainWorkers = async (req, res) => {
    try {
        const mainWorkers = await Worker.find({ role: 'thợ chính' });
        return res.status(200).json(mainWorkers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy thợ phụ
const getAssistantWorkers = async (req, res) => {
    try {
        const assistantWorkers = await Worker.find({ role: 'thợ phụ' });
        return res.status(200).json(assistantWorkers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// ✅ Thợ đang rảnh
const getAvailableWorkers = async (req, res) => {
    try {
        const workers = await Worker.find({ status: 'available' });
        return res.status(200).json(workers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// ✅ Thợ đang bận và xe đang làm
const getBusyWorkersWithCars = async (req, res) => {
    try {
        const busyWorkers = await Worker.find({ status: 'busy' });

        const workersWithCars = await Promise.all(busyWorkers.map(async (worker) => {
            const cars = await Car.find({
                status: { $ne: 'done' },
                $or: [
                    { mainWorker: worker._id },
                    { subWorker: worker._id }
                ]
            }).select('plateNumber carType status');

            return {
                worker,
                cars
            };
        }));

        return res.status(200).json(workersWithCars);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllWorkers,
    getWorkerById,
    createWorker,
    updateWorker,
    deleteWorker,
    getMainWorkers,
    getAssistantWorkers,
    getAvailableWorkers,
    getBusyWorkersWithCars
};
