const SystemSettings = require('../models/SystemSettings');

const DEFAULT_MESSAGE = 'Hệ thống đang bảo trì. Vui lòng quay lại sau.';
const DEFAULT_NOTICE_MESSAGE = 'Hệ thống sắp bảo trì trong vòng 3 phút. Vui lòng hoàn tất công việc đang làm.';
const DEFAULT_APP_VERSION = '1.0.0';

const DEFAULT_SETTINGS = {
  maintenanceMode: false,
  maintenanceMessage: DEFAULT_MESSAGE,
  maintenanceNoticeActive: false,
  maintenanceNoticeMessage: DEFAULT_NOTICE_MESSAGE,
  maintenanceNoticeAt: null,
  appVersion: DEFAULT_APP_VERSION,
  appVersionMessage: '',
  appVersionForceReload: false,
  appVersionUpdatedAt: null,
  appVersionUpdatedBy: null,
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
  appVersion: String(raw.appVersion || DEFAULT_APP_VERSION).trim().slice(0, 64) || DEFAULT_APP_VERSION,
  appVersionMessage: String(raw.appVersionMessage || '').trim().slice(0, 500),
  appVersionForceReload: Boolean(raw.appVersionForceReload),
  appVersionUpdatedAt: raw.appVersionUpdatedAt || null,
  appVersionUpdatedBy: raw.appVersionUpdatedBy || null,
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

  if (payload.maintenanceMode === true) {
    merged.maintenanceNoticeActive = false;
  }

  if (payload.maintenanceMode === false) {
    merged.maintenanceNoticeActive = false;
  }

  if (payload.maintenanceNoticeActive === true) {
    merged.maintenanceNoticeAt = new Date();
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
      appVersion: next.appVersion,
      appVersionMessage: next.appVersionMessage,
      appVersionForceReload: next.appVersionForceReload,
      appVersionUpdatedAt: next.appVersionUpdatedAt,
      appVersionUpdatedBy: next.appVersionUpdatedBy,
      updatedBy: updatedBy || null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  cached = normalizeSettings(doc);
  return { ...cached };
};

const publishAppVersion = async ({
  version,
  message = '',
  forceReload = false,
  updatedBy = null,
}) => {
  const nextVersion = String(version || '').trim().slice(0, 64);
  if (!nextVersion) {
    throw new Error('version là bắt buộc');
  }

  const payload = {
    appVersion: nextVersion,
    appVersionMessage: String(message || '').trim().slice(0, 500),
    appVersionForceReload: Boolean(forceReload),
    appVersionUpdatedAt: new Date(),
    appVersionUpdatedBy: updatedBy || null,
  };

  return saveSystemSettings(payload, updatedBy);
};

const getAppVersionPayload = (settings = cached) => ({
  version: settings.appVersion || DEFAULT_APP_VERSION,
  message: settings.appVersionMessage || '',
  forceReload: Boolean(settings.appVersionForceReload),
  updatedAt: settings.appVersionUpdatedAt || null,
  updatedBy: settings.appVersionUpdatedBy || null,
});

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
  DEFAULT_APP_VERSION,
  getCachedSystemSettings,
  getSystemSettings,
  saveSystemSettings,
  publishAppVersion,
  getAppVersionPayload,
  initSystemSettings,
};
