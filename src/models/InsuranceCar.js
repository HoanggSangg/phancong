const mongoose = require('mongoose');

const insuranceCarSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    soChungTu: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      index: true,
    },
    roNumber: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    roCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    externalCarTypeName: {
      type: String,
      default: '',
      trim: true,
    },
    advisorName: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    deliveryDate: {
      type: Date,
      default: null,
    },
    insuranceExpiryDate: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

insuranceCarSchema.pre('validate', function normalizePlate(next) {
  if (this.plateNumber) {
    this.plateNumber = String(this.plateNumber).toUpperCase().replace(/\s/g, '');
  }
  if (this.soChungTu) {
    this.soChungTu = String(this.soChungTu)
      .toUpperCase()
      .trim()
      .replace(/^HPT\//, '');
  }
  next();
});

module.exports = mongoose.model('InsuranceCar', insuranceCarSchema);
