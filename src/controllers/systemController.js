const mongoose = require('mongoose');
const {
  getSystemSettings,
  saveSystemSettings,
  getCachedSystemSettings,
  publishAppVersion,
  getAppVersionPayload,
} = require('../utils/systemSettings');
const { getTrimSummary } = require('../utils/trimCollections');
const { getCleanupHour } = require('../utils/manualJobCleanup');
const { getOnlineClientsSnapshot } = require('../socket/onlineClients');
const { getIO } = require('../socket/socketServer');
const OperationLog = require('../models/OperationLog');
const User = require('../models/User');

const publishRateByUser = new Map();
const PUBLISH_COOLDOWN_MS = 5000;

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
  appVersion: getAppVersionPayload(settings),
  runtime,
});

const getPublicStatus = async (_req, res) => {
  try {
    // Cache TTL trong getSystemSettings; saveSettings cập nhật ngay
    const settings = await getSystemSettings();
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
      },
    },
  };
};

const getSettings = async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    let publisher = null;
    if (settings.appVersionUpdatedBy) {
      publisher = await User.findById(settings.appVersionUpdatedBy)
        .select('_id fullName username')
        .lean();
    }

    return res.json({
      message: 'OK',
      data: {
        ...toSettingsPayload(settings, buildRuntimeConfig()),
        appVersion: {
          ...getAppVersionPayload(settings),
          updatedByUser: publisher
            ? {
              _id: publisher._id,
              fullName: publisher.fullName,
              username: publisher.username,
            }
            : null,
        },
        online: getOnlineClientsSnapshot(),
      },
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

const getVersion = async (_req, res) => {
  try {
    const settings = getCachedSystemSettings();
    return res.json({
      message: 'OK',
      ...getAppVersionPayload(settings),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi tải phiên bản hệ thống' });
  }
};

const getOnlineClients = async (_req, res) => {
  try {
    const snapshot = getOnlineClientsSnapshot();
    return res.json({
      success: true,
      ...snapshot,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Lỗi tải danh sách online' });
  }
};

const publishUpdate = async (req, res) => {
  const userId = String(req.user?._id || '');
  try {
    const lastAt = publishRateByUser.get(userId) || 0;
    if (Date.now() - lastAt < PUBLISH_COOLDOWN_MS) {
      return res.status(429).json({
        message: 'Vui lòng chờ vài giây trước khi phát hành lại',
      });
    }

    const version = String(req.body?.version || '').trim();
    const message = String(req.body?.message || '').trim();
    const forceReload = req.body?.forceReload;

    if (!version) {
      return res.status(400).json({ message: 'version là bắt buộc' });
    }
    if (version.length > 64) {
      return res.status(400).json({ message: 'version tối đa 64 ký tự' });
    }
    if (message.length > 500) {
      return res.status(400).json({ message: 'message tối đa 500 ký tự' });
    }
    if (typeof forceReload !== 'boolean') {
      return res.status(400).json({ message: 'forceReload phải là boolean' });
    }

    publishRateByUser.set(userId, Date.now());

    const data = await publishAppVersion({
      version,
      message: message || 'Hệ thống vừa được cập nhật.',
      forceReload,
      updatedBy: req.user?._id || null,
    });

    const payload = {
      version: data.appVersion,
      message: data.appVersionMessage,
      forceReload: Boolean(data.appVersionForceReload),
      updatedAt: data.appVersionUpdatedAt,
    };

    try {
      getIO().emit('system:update-available', payload);
    } catch (emitErr) {
      console.error('Publish update emit failed:', emitErr.message);
    }

    OperationLog.create({
      user: req.user?._id || null,
      username: req.user?.username || '',
      fullName: req.user?.fullName || '',
      role: req.user?.role || '',
      action: 'publish_update',
      module: 'system',
      targetId: data.appVersion,
      targetLabel: data.appVersion,
      description: `Phát hành cập nhật ${data.appVersion}`,
      metadata: {
        forceReload: data.appVersionForceReload,
        message: data.appVersionMessage,
      },
    }).catch((err) => console.error('Audit log error:', err.message));

    console.log(`System update published: ${data.appVersion} by ${req.user?.username || userId}`);

    return res.json({
      message: 'Đã phát hành cập nhật hệ thống',
      data: {
        ...getAppVersionPayload(data),
        online: getOnlineClientsSnapshot(),
      },
    });
  } catch (err) {
    console.error('Publish update failed:', err.message);
    return res.status(500).json({ message: err.message || 'Phát hành cập nhật thất bại' });
  }
};

module.exports = {
  getPublicStatus,
  getSettings,
  updateSettings,
  getVersion,
  getOnlineClients,
  publishUpdate,
};
