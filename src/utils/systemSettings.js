const SystemSettings = require('../models/SystemSettings');

const DEFAULT_MESSAGE = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
const DEFAULT_NOTICE_MESSAGE = 'Hệ thống sắp bảo trì trong vòng 3 phút. Vui lòng hoàn tất công việc đang làm.';

const DEFAULT_SETTINGS = {
  maintenanceMode: false,
  maintenanceMessage: DEFAULT_MESSAGE,
  maintenanceNoticeActive: false,
  maintenanceNoticeMessage: DEFAULT_NOTICE_MESSAGE,
  maintenanceNoticeAt: null,
  updatedBy: null,
  updatedAt: null,
};

let cached = { ...DEFAULT_SETTINGS };

const normalizeSettings = (raw = {}) => ({
  maintenanceMode: Boolean(raw.maintenanceMode),
  maintenanceMessage: String(raw.maintenanceMessage || DEFAULT_MESSAGE).trim().slice(0, 500)
    || DEFAULT_MESSAGE,
  maintenanceNoticeActive: Boolean(raw.maintenanceNoticeActive),
  maintenanceNoticeMessage: String(raw.maintenanceNoticeMessage || DEFAULT_NOTICE_MESSAGE)
    .trim()
    .slice(0, 500) || DEFAULT_NOTICE_MESSAGE,
  maintenanceNoticeAt: raw.maintenanceNoticeAt || null,
  updatedBy: raw.updatedBy || null,
  updatedAt: raw.updatedAt || null,
});

const getCachedSystemSettings = () => ({ ...cached });

const getSystemSettings = async () => {
  const doc = await SystemSettings.findOne({ singletonKey: 'default' }).lean();
  if (!doc) {
    cached = { ...DEFAULT_SETTINGS };
    return { ...cached };
  }
  cached = normalizeSettings(doc);
  return { ...cached };
};

const saveSystemSettings = async (payload = {}, updatedBy = null) => {
  const merged = { ...cached, ...payload };

  // Bật bảo trì → tắt thông báo trước (web đã dừng)
  if (payload.maintenanceMode === true) {
    merged.maintenanceNoticeActive = false;
  }

  // Mở lại web → cũng tắt thông báo trước
  if (payload.maintenanceMode === false) {
    merged.maintenanceNoticeActive = false;
  }

  // Gửi / làm mới thông báo trước → stamp thời điểm
  if (payload.maintenanceNoticeActive === true) {
    merged.maintenanceNoticeAt = new Date();
  }

  // Tắt thông báo trước
  if (payload.maintenanceNoticeActive === false && payload.maintenanceMode !== true) {
    // giữ maintenanceNoticeAt để client biết đã dismiss phiên cũ
  }

  const next = normalizeSettings({ ...merged, updatedBy });
  const doc = await SystemSettings.findOneAndUpdate(
    { singletonKey: 'default' },
    {
      singletonKey: 'default',
      maintenanceMode: next.maintenanceMode,
      maintenanceMessage: next.maintenanceMessage,
      maintenanceNoticeActive: next.maintenanceNoticeActive,
      maintenanceNoticeMessage: next.maintenanceNoticeMessage,
      maintenanceNoticeAt: next.maintenanceNoticeAt,
      updatedBy: updatedBy || null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  cached = normalizeSettings(doc);
  return { ...cached };
};

const initSystemSettings = async () => {
  try {
    await getSystemSettings();
  } catch (err) {
    console.error('initSystemSettings error:', err.message);
    cached = { ...DEFAULT_SETTINGS };
  }
};

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_MESSAGE,
  DEFAULT_NOTICE_MESSAGE,
  getCachedSystemSettings,
  getSystemSettings,
  saveSystemSettings,
  initSystemSettings,
};
