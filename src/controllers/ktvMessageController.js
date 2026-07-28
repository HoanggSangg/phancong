const mongoose = require('mongoose');
const User = require('../models/User');
const Car = require('../models/Car');
const KtvMessage = require('../models/KtvMessage');
const { isKtvLike } = require('../utils/permissions');
const {
  getKtvMessageSettings,
  updateKtvMessageSettings,
  canUserViewMessage,
  buildMessageFilterForUser,
} = require('../utils/ktvMessageSettings');

const normalizeROKey = (roNumber = '', roCode = '') => {
  const number = String(roNumber || '').trim().toUpperCase().replace(/\s/g, '');
  const code = String(roCode || '').trim().toUpperCase().replace(/\s/g, '');
  return number || code || '';
};

const getEligibleReceiverUsers = async () => User.find({
  role: { $in: ['admin', 'giam_sat', 'cvdv'] },
  isActive: true,
})
  .select('fullName username role')
  .sort({ fullName: 1 })
  .lean();

const createMessage = async (req, res) => {
  try {
    if (!isKtvLike(req.user)) {
      return res.status(403).json({ message: 'Chỉ KTV / Lái xe / Kho mới được gửi tin nhắn' });
    }

    const {
      carId,
      message = '',
      plateNumber = '',
      roCode = '',
      roNumber = '',
      carStatus = '',
      carStatusLabel = '',
      locationName = '',
      supervisorName = '',
    } = req.body || {};

    if (!carId || !mongoose.Types.ObjectId.isValid(carId)) {
      return res.status(400).json({ message: 'Thiếu hoặc sai carId' });
    }

    const car = await Car.findById(carId).lean();

    if (!car) {
      return res.status(404).json({ message: 'Không tìm thấy xe để gửi tin nhắn' });
    }

    const settings = await getKtvMessageSettings();

    const receiverUserIds = (settings.receiverUserIds || [])
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    const finalRoCode = car.roCode || roCode || '';
    const finalRoNumber = car.roNumber || roNumber || '';

    const item = await KtvMessage.create({
      sender: req.user._id,
      senderName: req.user.fullName || req.user.username || '',

      car: car._id,
      plateNumber: car.plateNumber || plateNumber || '',

      roCode: finalRoCode,
      roNumber: finalRoNumber,
      roKey: normalizeROKey(finalRoNumber, finalRoCode),

      carStatus: car.status || carStatus || '',
      carStatusLabel: carStatusLabel || '',

      message: String(message || '').trim(),

      locationName: car.locationName || locationName || '',
      supervisorName: car.supervisorName || supervisorName || '',

      receiverUserIds,
    });

    return res.status(201).json({
      message: 'Đã gửi tin nhắn cho admin',
      item,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getSettings = async (req, res) => {
  try {
    const settings = await getKtvMessageSettings();
    const eligibleUsers = await getEligibleReceiverUsers();

    return res.json({
      receiverUserIds: (settings.receiverUserIds || []).map((id) => String(id)),
      eligibleUsers,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const rawIds = Array.isArray(req.body?.receiverUserIds) ? req.body.receiverUserIds : [];
    const uniqueIds = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];

    const eligibleUsers = await getEligibleReceiverUsers();
    const eligibleIdSet = new Set(eligibleUsers.map((user) => String(user._id)));

    const receiverUserIds = uniqueIds
      .filter((id) => eligibleIdSet.has(id) && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const settings = await updateKtvMessageSettings(receiverUserIds);

    return res.json({
      message: 'Đã cập nhật tài khoản nhận tin nhắn KTV',
      receiverUserIds: settings.receiverUserIds.map((id) => String(id)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const listMessages = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const baseFilter = await buildMessageFilterForUser(req.user);
    const filter = { ...baseFilter };

    if (status === 'unread') {
      filter.readAt = null;
    } else if (status === 'read') {
      filter.readAt = { $ne: null };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [items, total, unreadCount] = await Promise.all([
      KtvMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      KtvMessage.countDocuments(filter),
      KtvMessage.countDocuments({ ...baseFilter, readAt: null }),
    ]);

    return res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum)),
      },
      unreadCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const markMessageRead = async (req, res) => {
  try {
    const message = await KtvMessage.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
    }

    if (!canUserViewMessage(req.user, message)) {
      return res.status(403).json({ message: 'Bạn không có quyền xem tin nhắn này' });
    }

    if (message.readAt) {
      return res.json({
        message: 'Tin nhắn đã được xem trước đó',
        item: message,
      });
    }

    message.readAt = new Date();
    message.readBy = req.user._id;
    message.readByName = req.user.fullName || req.user.username || '';
    await message.save();

    return res.json({
      message: 'Đã đánh dấu đã xem — KTV sẽ được thông báo',
      item: message,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getSentMessages = async (req, res) => {
  try {
    if (!isKtvLike(req.user)) {
      return res.status(403).json({ message: 'Chỉ KTV / Lái xe / Kho mới xem được tin đã gửi' });
    }

    const filter = { sender: req.user._id };

    if (req.query.pendingAck === '1') {
      filter.readAt = { $ne: null };
      filter.ktvAcknowledgedAt = null;
    }

    const items = await KtvMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const acknowledgeReadNotice = async (req, res) => {
  try {
    if (!isKtvLike(req.user)) {
      return res.status(403).json({ message: 'Chỉ KTV / Lái xe / Kho mới xác nhận thông báo' });
    }

    const message = await KtvMessage.findOne({
      _id: req.params.id,
      sender: req.user._id,
    });

    if (!message) {
      return res.status(404).json({ message: 'Không tìm thấy tin nhắn' });
    }

    if (!message.readAt) {
      return res.status(400).json({ message: 'Tin nhắn chưa được admin xem' });
    }

    if (!message.ktvAcknowledgedAt) {
      message.ktvAcknowledgedAt = new Date();
      await message.save();
    }

    return res.json({
      message: 'Đã xác nhận thông báo',
      item: message,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createMessage,
  getSettings,
  updateSettings,
  listMessages,
  markMessageRead,
  getSentMessages,
  acknowledgeReadNotice,
};