const Worker = require('../models/Worker');

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
        const worker = await Worker.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
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
const getMainWorkers = async (req, res) => {
    try {
        const mainWorkers = await Worker.find({ role: 'thợ chính' });
        return res.status(200).json(mainWorkers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
const getAssistantWorkers = async (req, res) => {
    try {
        const assistantWorkers = await Worker.find({ role: 'thợ phụ' });
        return res.status(200).json(assistantWorkers);
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
    getAssistantWorkers
};
