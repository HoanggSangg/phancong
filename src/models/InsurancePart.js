const mongoose = require('mongoose');

const insurancePartSchema = new mongoose.Schema(
  {
    /** Tên phụ tùng */
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    /** Giá vốn */
    costPrice: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    /** Loại xe */
    carTypeName: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    /** Hãng xe */
    carBrand: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

insurancePartSchema.index({ name: 'text', carTypeName: 'text', carBrand: 'text' });

module.exports = mongoose.model('InsurancePart', insurancePartSchema);
