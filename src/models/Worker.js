const mongoose = require('mongoose');
const { Schema } = mongoose;

const dailyRevenueSchema = new Schema({
  date: {
    type: Date,
    required: true
  },

  amount: {
    type: Number,
    default: 0,
    min: [0, 'Doanh thu không được âm']
  },

  source: {
    type: String,
    enum: ['manual', 'excel'],
    default: 'excel'
  }
}, { _id: false });

const manualJobSchema = new Schema({
  date: {
    type: Date,
    default: Date.now
  },

  content: {
    type: String,
    required: [true, 'Chi tiết công việc bắt buộc điền'],
    trim: true
  },

  status: {
    type: String,
    enum: ['co_viec', 'chua_co_viec'],
    default: 'co_viec'
  }
}, { _id: true });

const workerSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Tên thợ bắt buộc điền'],
    trim: true
  },

  soBaoDanh: {
    type: String,
    required: [true, 'Số báo danh bắt buộc điền'],
    unique: true,
    trim: true
  },

  avatar: {
    type: String,
    default: ''
  },

  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    default: null
  },

  manualJobs: {
    type: [manualJobSchema],
    default: []
  },

  revenues: {
    type: [dailyRevenueSchema],
    default: []
  },

  status: {
    type: String,
    enum: ['busy', 'available'],
    default: 'available'
  },

  countRevenue: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Worker', workerSchema);
