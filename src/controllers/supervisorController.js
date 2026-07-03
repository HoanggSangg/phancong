const Supervisor = require('../models/Supervisor');

// Lấy tất cả giám sát
const getAllSupervisors = async (req, res) => {
    try {
        const supervisors = await Supervisor.find();
        return res.status(200).json(supervisors);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy giám sát theo ID
const getSupervisorById = async (req, res) => {
    const { id } = req.params;
    try {
        const supervisor = await Supervisor.findById(id);
        if (!supervisor) {
            return res.status(404).json({ message: 'Người giám sát không tìm thấy' });
        }
        return res.status(200).json(supervisor);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Tạo mới người giám sát
const createSupervisor = async (req, res) => {
    try {
        const supervisor = new Supervisor(req.body);
        await supervisor.save();
        return res.status(201).json(supervisor);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật người giám sát
const updateSupervisor = async (req, res) => {
    const { id } = req.params;
    try {
        const supervisor = await Supervisor.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });
        if (!supervisor) {
            return res.status(404).json({ message: 'Người giám sát không tìm thấy' });
        }
        return res.status(200).json(supervisor);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Xóa người giám sát
const deleteSupervisor = async (req, res) => {
    const { id } = req.params;
    try {
        const supervisor = await Supervisor.findByIdAndDelete(id);
        if (!supervisor) {
            return res.status(404).json({ message: 'Người giám sát không tìm thấy' });
        }

        req.auditDeleted = { name: supervisor.name };

        return res.status(200).json({ message: `Đã xóa người giám sát: ${supervisor.name}` });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllSupervisors,
    getSupervisorById,
    createSupervisor,
    updateSupervisor,
    deleteSupervisor
};
