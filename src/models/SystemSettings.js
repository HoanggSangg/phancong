const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'default',
    unique: true,
  },
  /** Web đang ở chế độ bảo trì — chặn người dùng không phải admin */
  maintenanceMode: {
    type: Boolean,
    default: false,
  },
  maintenanceMessage: {
    type: String,
    default: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
    maxlength: 500,
  },
  /** Thông báo trước khi bảo trì — hiển thị cho giám sát & KTV */
  maintenanceNoticeActive: {
    type: Boolean,
    default: false,
  },
  maintenanceNoticeMessage: {
    type: String,
    default: 'Hệ thống sắp bảo trì trong vòng 3 phút. Vui lòng hoàn tất công việc đang làm.',
    maxlength: 500,
  },
  maintenanceNoticeAt: {
    type: Date,
    default: null,
  },
  /** Phiên bản cập nhật hệ thống (sau bảo trì) */
  appVersion: {
    type: String,
    default: '1.0.0',
    maxlength: 64,
  },
  appVersionMessage: {
    type: String,
    default: '',
    maxlength: 500,
  },
  appVersionForceReload: {
    type: Boolean,
    default: false,
  },
  appVersionUpdatedAt: {
    type: Date,
    default: null,
  },
  appVersionUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
