const mongoose = require('mongoose');
const { Schema } = mongoose;

const money = { type: Number, default: 0, min: 0 };

const dayWorkRowSchema = new Schema({
  worker: { type: Schema.Types.ObjectId, ref: 'Worker', required: true },
  name: { type: String, default: '' },
  soBaoDanh: { type: String, default: '' },
  boPhan: { type: String, default: '' },
  chucVu: { type: String, default: '' },

  luongCoBan: money,
  ngayCongChuan: { type: Number, default: 0 },
  ngayCongThucTe: { type: Number, default: 0 },
  ngayNghiKhongLuong: { type: Number, default: 0 },
  ngayNghiCoLuong: { type: Number, default: 0 },
  soBuoiNghi: { type: Number, default: 0 },
  tongPhutDiTre: { type: Number, default: 0 },
  tongPhutVeSom: { type: Number, default: 0 },
  tongPhutNghi: { type: Number, default: 0 },
  tongPhutThieu: { type: Number, default: 0 },
  tongGioThieu: { type: Number, default: 0 },

  luongNgay: money,
  luongGio: money,
  tienTruNgayCong: money,
  luongTheoNgayCong: money,

  // Phụ cấp / thưởng / hỗ trợ (theo tháng)
  phuCap: money,
  thuong: money,
  tangCa: money,
  hoTro: money,

  // Khấu trừ
  baoHiem: money,
  phat: money,
  thue: money,
  tamUng: money,
  khauTruKhac: money,

  thamGiaBaoHiem: { type: Boolean, default: false },
  mucLuongDongBaoHiem: money,
  ghiChu: { type: String, default: '' },

  computed: { type: Schema.Types.Mixed, default: {} },
}, { _id: true });

const dayWorkPayrollSchema = new Schema({
  year: { type: Number, required: true, min: 2000, max: 2100 },
  month: { type: Number, required: true, min: 1, max: 12 },
  status: { type: String, enum: ['draft', 'saved'], default: 'draft' },
  ngayCongChuan: { type: Number, default: 0 },
  hoursPerDay: { type: Number, default: 8 },
  rows: { type: [dayWorkRowSchema], default: [] },
}, { timestamps: true });

dayWorkPayrollSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('DayWorkPayroll', dayWorkPayrollSchema);
