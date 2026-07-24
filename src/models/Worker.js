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

  /** Chức vụ trong tổ: chỉ 1 TT / tổ */
  teamRole: {
    type: String,
    enum: ['KTV', 'TT'],
    default: 'KTV',
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
  },

  salaryProfile: {
    boPhan: { type: String, default: '', trim: true },
    chucVu: { type: String, default: '', trim: true },
    luongCoBan: { type: Number, default: 0, min: 0 },
    doanhThuDinhMuc: { type: Number, default: 0, min: 0 },
    tyLeDatDinhMuc: { type: Number, default: null },
    tyLeVuotDinhMuc: { type: Number, default: null },
    thamGiaBaoHiem: { type: Boolean, default: false },
    mucLuongDongBaoHiem: { type: Number, default: 0, min: 0 },
  },
}, { timestamps: true });

workerSchema.index({ status: 1 });
workerSchema.index({ team: 1 });
workerSchema.index({ team: 1, teamRole: 1 });

module.exports = mongoose.model('Worker', workerSchema);
