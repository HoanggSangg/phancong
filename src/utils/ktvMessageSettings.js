const KtvMessageSettings = require('../models/KtvMessageSettings');
const KtvMessage = require('../models/KtvMessage');

const CAR_STATUS_LABELS = {
  pending: 'Chờ sửa',
  working: 'Đang sửa',
  done: 'Sửa xong',
  waiting_wash: 'Chờ rửa',
  waiting_handover: 'Chờ giao',
  additional_repair: 'Sửa bổ sung',
  delivered: 'Đã giao',
};

let cachedSettings = null;

const getKtvMessageSettings = async () => {
  if (cachedSettings) return cachedSettings;

  let settings = await KtvMessageSettings.findOne({ singletonKey: 'default' });
  if (!settings) {
    settings = await KtvMessageSettings.create({ singletonKey: 'default', receiverUserIds: [] });
  }

  cachedSettings = settings;
  return settings;
};

const updateKtvMessageSettings = async (receiverUserIds = []) => {
  const settings = await getKtvMessageSettings();
  settings.receiverUserIds = receiverUserIds;
  await settings.save();
  cachedSettings = settings;
  return settings;
};

const invalidateKtvMessageSettingsCache = () => {
  cachedSettings = null;
};

const normalizeROKey = (roNumber = '', roCode = '') => {
  const number = String(roNumber || '').trim().toUpperCase().replace(/\s/g, '');
  const code = String(roCode || '').trim().toUpperCase().replace(/\s/g, '');
  return number || code || '';
};

const createKtvMessage = async ({
  sender,
  car,
  note = '',
  operationLogId = null,
}) => {
  const settings = await getKtvMessageSettings();
  const statusLabel = CAR_STATUS_LABELS[car.status] || car.status;
  const roCode = car.roCode || '';
  const roNumber = car.roNumber || '';

  return KtvMessage.create({
    sender: sender._id,
    senderName: sender.fullName || sender.username || '',
    car: car._id,
    plateNumber: car.plateNumber,
    roCode,
    roNumber,
    roKey: normalizeROKey(roNumber, roCode),
    carStatus: car.status,
    carStatusLabel: statusLabel,
    message: note,
    locationName: car.location?.name || '',
    supervisorName: car.supervisor?.name || '',
    receiverUserIds: settings.receiverUserIds || [],
    operationLogId,
  });
};

const canUserViewMessage = (user, message) => {
  if (!user || !message) return false;
  if (user.role === 'admin') return true;

  const userId = String(user._id);
  const receivers = (message.receiverUserIds || []).map((id) => String(id));

  if (receivers.length === 0) {
    const { isGiamSatLike } = require('./permissions');
    return user.role === 'admin' || isGiamSatLike(user);
  }

  return receivers.includes(userId);
};

const buildMessageFilterForUser = async (user) => {
  if (!user) return { _id: null };

  if (user.role === 'admin') {
    return {};
  }

  const settings = await getKtvMessageSettings();
  const receiverIds = (settings.receiverUserIds || []).map((id) => String(id));
  const userId = String(user._id);

  if (receiverIds.length === 0) {
    const { isGiamSatLike } = require('./permissions');
    return isGiamSatLike(user) ? {} : { _id: null };
  }

  if (receiverIds.includes(userId)) {
    return { receiverUserIds: user._id };
  }

  return { _id: null };
};

module.exports = {
  CAR_STATUS_LABELS,
  getKtvMessageSettings,
  updateKtvMessageSettings,
  invalidateKtvMessageSettingsCache,
  createKtvMessage,
  canUserViewMessage,
  buildMessageFilterForUser,
};
