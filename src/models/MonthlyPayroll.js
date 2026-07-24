const mongoose = require('mongoose');
const { Schema } = mongoose;

const money = { type: Number, default: 0, min: 0 };

const payrollRowSchema = new Schema({
  worker: {
    type: Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
  },
  name: { type: String, default: '' },
  soBaoDanh: { type: String, default: '' },
  boPhan: { type: String, default: '' },
  chucVu: { type: String, default: '' },

  luongCoBan: money,
  doanhThuDinhMuc: money,
  doanhThuThang: money,
  soCongHoTro: { type: Number, default: 0, min: 0 },
  tienCongHoTroOverride: { type: Number, default: null },

  tyLeDatDinhMuc: { type: Number, default: 20 },
  tyLeVuotDinhMuc: { type: Number, default: 20 },

  // Phụ cấp / thưởng / hỗ trợ (theo tháng)
  phuCapTrachNhiem: money,
  thuongSoLuongXe: money,
  phuCapDienThoai: money,
  phuCapXangXe: money,
  phuCapChuyenCan: money,
  phuCapBaoCaoNgay: money,
  phuCapBaoVeTaiSan: money,
  phuCapVeSinh: money,
  phuCapTayNghe: money,
  tienComTrua: money,
  tienTangCa: money,
  congTacXa: money,
  hoTroBaoGiaThau: money,
  hoTroSuaChuaLai: money,
  hoTroCongViecDacBiet: money,
  tienCuuPan: money,
  tienHoTroKhac: money,
  tienThuongKhac: money,

  // Phạt / khấu trừ (theo tháng)
  truThieuTrachNhiem: money,
  truChatLuong: money,
  truHuHong: money,
  truViPhamNoiQuy: money,
  truNghiVuotPhep: money,
  truThueTNCN: money,
  truTamUng: money,
  truCongNo: money,
  truKhac: money,
  ghiChuTru: { type: String, default: '' },

  thamGiaBaoHiem: { type: Boolean, default: false },
  mucLuongDongBaoHiem: money,

  // Kết quả tính (snapshot)
  computed: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, { _id: true });

const monthlyPayrollSchema = new Schema({
  year: {
    type: Number,
    required: true,
    min: 2000,
    max: 2100,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  status: {
    type: String,
    enum: ['draft', 'saved'],
    default: 'draft',
  },
  rows: {
    type: [payrollRowSchema],
    default: [],
  },
}, { timestamps: true });

monthlyPayrollSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyPayroll', monthlyPayrollSchema);
