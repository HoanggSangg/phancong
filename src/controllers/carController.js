const Car = require('../models/Car');

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
        const car = new Car(req.body);
        await car.save();
        return res.status(201).json(car);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật thông tin xe
const updateCar = async (req, res) => {
    const { id } = req.params;
    try {
        const car = await Car.findByIdAndUpdate(id, req.body, {
            new: true,
            runValidators: true
        });
        if (!car) {
            return res.status(404).json({ message: 'Xe không tìm thấy' });
        }
        return res.status(200).json(car);
    } catch (error) {
        return res.status(400).json({ message: error.message });
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
        return res.status(200).json({ message: `Xe ${car.plateNumber} đã được xóa thành công!` });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllCars,
    getCarById,
    createCar,
    updateCar,
    deleteCar
};
