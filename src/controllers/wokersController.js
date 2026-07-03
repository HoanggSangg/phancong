const Wokers = require('../models/Wokers');

const getKtvWorkerFilter = (req) => {
  if (req.user.role !== 'ktv') return {};
  if (!req.user.worker) return { worker: null };
  return { worker: req.user.worker };
};

const mapWokerResult = (item) => ({
  _id: item._id,
  workerId: item.worker?._id,
  tenTho: item.worker?.name,
  viecChiTiet: item.vieclamChiTiet,
  trangThai: item.status,
  bienSoXe: item.car?.plateNumber,
  hieuXe: item.car?.externalCarTypeName || '',
});

// Lấy tất cả phân công
const getAllWokers = async (req, res) => {
    try {
        const filter = getKtvWorkerFilter(req);
        if (req.user.role === 'ktv' && !req.user.worker) {
            return res.status(200).json([]);
        }

        const wokers = await Wokers.find(filter)
            .populate({
                path: 'worker',
                select: 'name'
            })
            .populate({
                path: 'car',
                select: 'plateNumber externalCarTypeName',
            });

        const result = wokers.map(mapWokerResult);

        return res.status(200).json(result);

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Lấy phân công theo ID
const getWokerById = async (req, res) => {
    const { id } = req.params;

    try {
        const woker = await Wokers.findById(id)
            .populate('worker')
            .populate('car');

        if (!woker) {
            return res.status(404).json({
                message: 'Phân công không tìm thấy'
            });
        }

        if (
            req.user.role === 'ktv' &&
            woker.worker?.toString() !== req.user.worker?.toString()
        ) {
            return res.status(403).json({ message: 'Bạn không có quyền xem phân công này' });
        }

        return res.status(200).json(woker);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Tạo phân công mới
const createWoker = async (req, res) => {
    try {
        const { worker, car, vieclamChiTiet, status } = req.body;

        const woker = new Wokers({
            worker,
            car: car || null,
            vieclamChiTiet: vieclamChiTiet || "",
            status // lấy trực tiếp từ FE
        });

        await woker.save();

        return res.status(201).json(woker);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Cập nhật phân công
const updateWoker = async (req, res) => {
    const { id } = req.params;

    try {
        const woker = await Wokers.findByIdAndUpdate(
            id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        if (!woker) {
            return res.status(404).json({
                message: 'Phân công không tìm thấy'
            });
        }

        return res.status(200).json(woker);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

// Xóa phân công
const deleteWoker = async (req, res) => {
    const { id } = req.params;

    try {
        const woker = await Wokers.findById(id)
            .populate('worker', 'name')
            .populate('car', 'plateNumber');

        if (!woker) {
            return res.status(404).json({
                message: 'Phân công không tìm thấy'
            });
        }

        req.auditDeleted = {
            workerName: woker.worker?.name || '',
            plateNumber: woker.car?.plateNumber || '',
            vieclamChiTiet: woker.vieclamChiTiet || '',
        };

        await Wokers.findByIdAndDelete(id);

        return res.status(200).json({
            message: 'Đã xóa phân công thành công'
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
const getWokersByDate = async (req, res) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({
                message: 'Vui lòng truyền ngày (YYYY-MM-DD)'
            });
        }

        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const filter = {
            createdAt: {
                $gte: start,
                $lte: end
            },
            ...getKtvWorkerFilter(req),
        };

        if (req.user.role === 'ktv' && !req.user.worker) {
            return res.status(200).json([]);
        }

        const data = await Wokers.find(filter)
        .populate({
            path: 'worker',
            select: 'name'
        })
        .populate({
            path: 'car',
            select: 'plateNumber externalCarTypeName',
        });

        const result = data.map(mapWokerResult);

        return res.status(200).json(result);

    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
module.exports = {
    getAllWokers,
    getWokerById,
    createWoker,
    updateWoker,
    deleteWoker,
    getWokersByDate
};