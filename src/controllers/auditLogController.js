const OperationLog = require('../models/OperationLog');

const getOperationLogs = async (req, res) => {
  try {
    const {
      from,
      to,
      module,
      action,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    if (module) filter.module = module;
    if (action) filter.action = action;

    if (search) {
      const keyword = search.trim();
      if (keyword) {
        filter.$or = [
          { description: { $regex: keyword, $options: 'i' } },
          { fullName: { $regex: keyword, $options: 'i' } },
          { username: { $regex: keyword, $options: 'i' } },
          { targetLabel: { $regex: keyword, $options: 'i' } },
          { 'metadata.plateNumber': { $regex: keyword, $options: 'i' } },
          { 'metadata.soChungTu': { $regex: keyword, $options: 'i' } },
          { 'metadata.baseTt': { $regex: keyword, $options: 'i' } },
          { 'metadata.roCode': { $regex: keyword, $options: 'i' } },
          { 'metadata.fileName': { $regex: keyword, $options: 'i' } },
        ];
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      OperationLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      OperationLog.countDocuments(filter),
    ]);

    return res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Không tải được lịch sử thao tác', error: error.message });
  }
};

module.exports = {
  getOperationLogs,
};
