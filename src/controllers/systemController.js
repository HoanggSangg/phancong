const mongoose = require('mongoose');
const {
  getSystemSettings,
  saveSystemSettings,
  getCachedSystemSettings,
} = require('../utils/systemSettings');
const { getTrimSummary } = require('../utils/trimCollections');
const { getCleanupHour } = require('../utils/manualJobCleanup');

const toPublicStatus = (settings) => ({
  maintenanceMode: Boolean(settings.maintenanceMode),
  maintenanceMessage: settings.maintenanceMessage,
  maintenanceNoticeActive: Boolean(settings.maintenanceNoticeActive),
  maintenanceNoticeMessage: settings.maintenanceNoticeMessage,
  maintenanceNoticeAt: settings.maintenanceNoticeAt || null,
});

const toSettingsPayload = (settings, runtime) => ({
  ...toPublicStatus(settings),
  updatedAt: settings.updatedAt,
  updatedBy: settings.updatedBy,
  runtime,
});

const getPublicStatus = async (_req, res) => {
  try {
    const settings = getCachedSystemSettings();
    return res.json({
      message: 'OK',
      ...toPublicStatus(settings),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi hệ thống' });
  }
};

const buildRuntimeConfig = () => {
  const trim = getTrimSummary();
  const mongoState = mongoose.connection.readyState;
  const mongoStateLabel = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  }[mongoState] || 'unknown';

  return {
    server: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: Number(process.env.PORT) || 3000,
      uptimeSeconds: Math.floor(process.uptime()),
      mongoStatus: mongoStateLabel,
      mongoConnected: mongoState === 1,
    },
    features: {
      autoCleanupManualJobs: process.env.AUTO_CLEANUP_MANUAL_JOBS !== 'false',
      manualJobCleanupHour: getCleanupHour(),
      autoTrimCollections: process.env.AUTO_TRIM_COLLECTIONS !== 'false',
      trim: {
        deliveredCarMonths: trim.deliveredCarMonths,
        carMax: trim.carMax,
        repairItemMax: trim.repairItemMax,
        operationLogDays: trim.operationLogDays,
        ktvMessageDays: trim.ktvMessageDays,
        ktvMessageMax: trim.ktvMessageMax,
      },
    },
  };
};

const getSettings = async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    return res.json({
      message: 'OK',
      data: toSettingsPayload(settings, buildRuntimeConfig()),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi tải cấu hình hệ thống' });
  }
};

const updateSettings = async (req, res) => {
  try {
    const payload = {};
    if (typeof req.body?.maintenanceMode === 'boolean') {
      payload.maintenanceMode = req.body.maintenanceMode;
    }
    if (typeof req.body?.maintenanceMessage === 'string') {
      payload.maintenanceMessage = req.body.maintenanceMessage;
    }
    if (typeof req.body?.maintenanceNoticeActive === 'boolean') {
      payload.maintenanceNoticeActive = req.body.maintenanceNoticeActive;
    }
    if (typeof req.body?.maintenanceNoticeMessage === 'string') {
      payload.maintenanceNoticeMessage = req.body.maintenanceNoticeMessage;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: 'Không có thay đổi cấu hình hợp lệ' });
    }

    const data = await saveSystemSettings(payload, req.user?._id || null);

    let message = 'Đã cập nhật cấu hình hệ thống';
    if (typeof payload.maintenanceMode === 'boolean') {
      message = payload.maintenanceMode
        ? 'Hệ thống đã bật chế độ bảo trì'
        : 'Hệ thống đã tắt chế độ bảo trì';
    } else if (typeof payload.maintenanceNoticeActive === 'boolean') {
      message = payload.maintenanceNoticeActive
        ? 'Đã gửi thông báo sắp bảo trì tới giám sát và KTV'
        : 'Đã hủy thông báo sắp bảo trì';
    } else if (payload.maintenanceNoticeMessage || payload.maintenanceMessage) {
      message = 'Đã lưu thông báo';
    }

    return res.json({
      message,
      data: toSettingsPayload(data, buildRuntimeConfig()),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi cập nhật cấu hình hệ thống' });
  }
};

module.exports = {
  getPublicStatus,
  getSettings,
  updateSettings,
};
