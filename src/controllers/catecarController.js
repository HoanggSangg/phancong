const CateCar = require('../models/CateCar');

// Thêm danh mục xe mới
exports.createCateCar = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Tên danh mục xe là bắt buộc' });
        }

        const newCateCar = new CateCar({ name });
        const savedCateCar = await newCateCar.save();

        res.status(201).json(savedCateCar);
    } catch (error) {
        console.error('❌ Lỗi createCateCar:', error); // 👉 THÊM DÒNG NÀY
        res.status(500).json({ message: 'Lỗi khi thêm danh mục xe', error: error.message || error });
    }
};

// Lấy danh sách danh mục xe
exports.getAllCateCars = async (req, res) => {
    try {
        const cateCars = await CateCar.find().sort({ createdAt: -1 });
        res.json(cateCars);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách danh mục xe', error });
    }
};

// Cập nhật danh mục xe
exports.updateCateCar = async (req, res) => {
    try {
        const { name } = req.body;
        const updated = await CateCar.findByIdAndUpdate(
            req.params.id,
            { name },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục xe' });
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật danh mục xe', error });
    }
};

// Xóa danh mục xe
exports.deleteCateCar = async (req, res) => {
    try {
        const deleted = await CateCar.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ message: 'Không tìm thấy danh mục xe' });
        }

        res.json({ message: 'Xóa danh mục xe thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa danh mục xe', error });
    }
};
