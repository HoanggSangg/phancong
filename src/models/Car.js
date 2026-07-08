const mongoose = require('mongoose');
const moment = require('moment-timezone');
const { Schema } = mongoose;
const { normalizeROFields } = require('../utils/roKey');

const carSchema = new Schema({
  plateNumber: {
    type: String,
    required: [true, 'Biển số xe là bắt buộc'],
  },

  roCode: { type: String, default: '' },
  roNumber: { type: String, default: '' },

  // ✅ Dùng để check trùng RO nhanh bằng index
  roKey: {
    type: String,
    default: '',
    index: true,
  },

  externalCarTypeName: { type: String, default: '' },
  advisorName: { type: String, default: '' },

  workers: [
    {
      worker: {
        type: Schema.Types.ObjectId,
        ref: 'Worker',
        required: true,
      },
      role: {
        type: String,
        enum: ['main', 'sub'],
        default: 'main',
      },
    },
  ],

  workerLogs: [
    {
      worker: { type: Schema.Types.ObjectId, ref: 'Worker' },
      action: { type: String, enum: ['added', 'removed', 'reassigned'] },
      note: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now },
    },
  ],

  supervisor: {
    type: Schema.Types.ObjectId,
    ref: 'Supervisor',
  },

  location: {
    type: Schema.Types.ObjectId,
    ref: 'Location',
  },

  status: {
    type: String,
    enum: [
      'pending',
      'working',
      'done',
      'waiting_wash',
      'waiting_handover',
      'delivered',
      'additional_repair',
    ],
    default: 'pending',
  },

  statusHistory: [
    {
      status: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],

  condition: {
    type: String,
    enum: ['vip', 'good', 'normal', 'warranty', 'rescue', null],
    default: null,
  },

  deliveryTime: { type: String },

  isLate: { type: Boolean, default: false },

  currentDate: { type: String },
  currentTime: { type: String },
}, { timestamps: true });

carSchema.virtual('repairItems', {
  ref: 'RepairOrderItem',
  localField: '_id',
  foreignField: 'car',
});

carSchema.set('toObject', { virtuals: true });
carSchema.set('toJSON', { virtuals: true });

carSchema.pre('save', function (next) {
  const normalized = normalizeROFields({
    roNumber: this.roNumber,
    roCode: this.roCode,
  });

  this.roNumber = normalized.roNumber;
  this.roCode = normalized.roCode;
  this.roKey = normalized.roKey;

  if (this.isModified('status')) {
    this.statusHistory.push({ status: this.status, timestamp: new Date() });
  }

  if (
    this.deliveryTime &&
    this.status !== 'delivered' &&
    moment().isAfter(moment(this.deliveryTime, 'DD-MM-YYYY HH[h]'))
  ) {
    this.isLate = true;
  } else {
    this.isLate = false;
  }

  next();
});

carSchema.statics.getStatusLabel = function (status) {
  const statusLabels = {
    pending: 'Chờ hàng',
    working: 'Đang sửa',
    done: 'Sửa xong',
    waiting_wash: 'Chờ rửa xe',
    waiting_handover: 'Chờ bàn giao',
    delivered: 'Đã giao',
    additional_repair: 'Sửa phát sinh',
  };
  return statusLabels[status] || status;
};

carSchema.methods.getCurrentStatusLabel = function () {
  return this.constructor.getStatusLabel(this.status);
};

carSchema.index({ roKey: 1 }, { unique: true, sparse: true });
carSchema.index({ currentDate: 1, status: 1 });
carSchema.index({ status: 1 });
carSchema.index({ plateNumber: 1, currentDate: 1 });
carSchema.index({ location: 1, status: 1 });
carSchema.index({ 'workers.worker': 1, status: 1 });

module.exports = mongoose.model('Car', carSchema);