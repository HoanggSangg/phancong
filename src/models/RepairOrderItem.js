const mongoose = require('mongoose');

const { Schema } = mongoose;

const workerAssignmentSchema = new Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
  },
  workerName: {
    type: String,
    default: '',
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
}, { _id: true });

const repairOrderItemSchema = new Schema({
  car: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Car',
    required: true,
    index: true,
  },

  plateNumber: {
    type: String,
    default: '',
    index: true,
  },

  roCode: {
    type: String,
    default: '',
    index: true,
  },

  roNumber: {
    type: String,
    default: '',
  },

  groupName: {
    type: String,
    default: '',
  },

  content: {
    type: String,
    required: true,
  },

  quantity: {
    type: Number,
    default: 1,
  },

  unit: {
    type: String,
    default: '',
  },

  unitPrice: {
    type: Number,
    default: 0,
  },

  unitCostPrice: {
    type: Number,
    default: 0,
  },

  costAmount: {
    type: Number,
    default: 0,
  },

  amount: {
    type: Number,
    default: 0,
  },

  taxRate: {
    type: Number,
    default: 0,
  },

  taxAmount: {
    type: Number,
    default: 0,
  },

  discountRate: {
    type: Number,
    default: 0,
  },

  discountAmount: {
    type: Number,
    default: 0,
  },

  serviceType: {
    type: String,
    default: '',
  },

  itemType: {
    type: Number,
    default: 0,
  },

  externalItemId: {
    type: String,
    default: '',
  },

  isManual: {
    type: Boolean,
    default: false,
    index: true,
  },

  workerAssignments: {
    type: [workerAssignmentSchema],
    default: [],
  },

  // Giữ để tương thích dữ liệu cũ (thợ đầu tiên hoặc 100%)
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true,
  },

  workerName: {
    type: String,
    default: '',
  },

  // Doanh thu đã tính sẵn theo thợ khi phân công (gross = trước hoa hồng, net = sau trừ 25%)
  workerRevenues: [{
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true,
    },
    workerName: { type: String, default: '' },
    percentage: { type: Number, default: 100 },
    grossRevenue: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
  }],

  raw: {
    type: Schema.Types.Mixed,
    default: null,
  },
}, { timestamps: true });

repairOrderItemSchema.index({ createdAt: -1 });
repairOrderItemSchema.index({ updatedAt: -1 });
repairOrderItemSchema.index({ 'workerAssignments.worker': 1, createdAt: -1 });
repairOrderItemSchema.index({ 'workerRevenues.worker': 1 });

module.exports = mongoose.model('RepairOrderItem', repairOrderItemSchema);
