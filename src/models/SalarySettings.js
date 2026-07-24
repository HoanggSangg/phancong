const mongoose = require('mongoose');

const salarySettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'default',
    unique: true,
  },
  donGiaCongHoTro: {
    type: Number,
    default: 250000,
    min: 0,
  },
  bhxhRate: {
    type: Number,
    default: 8,
    min: 0,
    max: 100,
  },
  bhytRate: {
    type: Number,
    default: 1.5,
    min: 0,
    max: 100,
  },
  bhtnRate: {
    type: Number,
    default: 1,
    min: 0,
    max: 100,
  },
  defaultTyLeKtv: {
    type: Number,
    default: 20,
    min: 0,
    max: 100,
  },
  defaultTyLeToTruong: {
    type: Number,
    default: 5,
    min: 0,
    max: 100,
  },
}, { timestamps: true });

module.exports = mongoose.model('SalarySettings', salarySettingsSchema);
