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
    /** Mã hãng BH (khoaHangBaoHiem) */
    insuranceCompanyKey: {
      type: String,
      default: '',
      trim: true,
    },
    /** Số bảo hiểm (soBaoHiem) */
    insurancePolicyNumber: {
      type: String,
      default: '',
      trim: true,
    },
    /** Giám định / liên hệ BH (lienHeBaoHiem) */
    insuranceAssessor: {
      type: String,
      default: '',
      trim: true,
    },
    /** SĐT giám định / liên hệ BH (dienThoaiLienHe) */
    insuranceAssessorPhone: {
      type: String,
      default: '',
      trim: true,
    },
    /** Ngày bắt đầu BH (ngayBatDauBaoHiem) */
    insuranceStartDate: {
      type: Date,
      default: null,
    },
    /** Bảo hiểm chấp thuận / duyệt giá BH (isDuyetGiaBH) */
    insuranceApproved: {
      type: Boolean,
      default: false,
    },
    /** Ngày duyệt giá BH (ngayDuyetGiaBH) */
    insuranceApprovedDate: {
      type: Date,
      default: null,
    },
    /** Hoàn tất hồ sơ bảo hiểm (hoanTatBaoHiem) */
    insuranceFileCompleted: {
      type: Boolean,
      default: false,
    },
    /** Mức miễn thường (mucMienThuong) */
    deductibleAmount: {
      type: Number,
      default: 0,
      min: 0,
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
