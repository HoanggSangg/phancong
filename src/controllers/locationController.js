const Location = require('../models/Location');

// Thêm địa điểm mới
exports.createLocation = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Tên địa điểm là bắt buộc' });
        }

        const newLocation = new Location({ name });
        const savedLocation = await newLocation.save();

        res.status(201).json(savedLocation);
    } catch (error) {
        console.error('❌ Lỗi createLocation:', error);
        res.status(500).json({ message: 'Lỗi khi thêm địa điểm', error: error.message || error });
    }
};

// Lấy danh sách tất cả địa điểm
exports.getAllLocations = async (req, res) => {
    try {
        const locations = await Location.find().sort({ createdAt: -1 });
        res.json(locations);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách địa điểm', error });
    }
};

// Cập nhật địa điểm
exports.updateLocation = async (req, res) => {
    try {
        const { name } = req.body;
        const updated = await Location.findByIdAndUpdate(
            req.params.id,
            { name },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy địa điểm' });
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật địa điểm', error });
    }
};

// Xóa địa điểm
exports.deleteLocation = async (req, res) => {
    try {
        const deleted = await Location.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ message: 'Không tìm thấy địa điểm' });
        }

        req.auditDeleted = { name: deleted.name };

        res.json({ message: 'Xóa địa điểm thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa địa điểm', error });
    }
};
