const mongoose = require('mongoose');

const deductionSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  rate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
}, { _id: false });

const revenueSettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'default',
    unique: true,
  },
  deductions: {
    type: [deductionSchema],
    default: () => ([
      { key: 'commission', label: 'Hoa hồng', rate: 25, enabled: true },
      { key: 'related_cost', label: 'Chi phí liên quan', rate: 0, enabled: false },
    ]),
  },
}, { timestamps: true });

module.exports = mongoose.model('RevenueSettings', revenueSettingsSchema);
