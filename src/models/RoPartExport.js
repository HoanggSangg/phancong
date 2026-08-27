const mongoose = require('mongoose');

const { Schema } = mongoose;

const exportLineSchema = new Schema({
  khoaHangHoa: { type: String, required: true, trim: true },
  ma: { type: String, default: '', trim: true },
  ten: { type: String, default: '', trim: true },
  donViTinh: { type: String, default: '', trim: true },
  soLuong: { type: Number, required: true, min: 0 },
  tonHienTai: { type: Number, default: null },
}, { _id: false });

const roPartExportSchema = new Schema({
  khoaBaoGia: { type: String, required: true, trim: true, uppercase: true, index: true },
  soBaoGia: { type: String, default: '', trim: true, uppercase: true, index: true },
  soXe: { type: String, default: '', trim: true, uppercase: true, index: true },
  khoaKho: { type: String, default: '', trim: true },
  soChungTu: { type: String, default: '', trim: true },
  khoaChungTu: { type: String, default: '', trim: true },
  ghiSo: { type: Boolean, default: false, index: true },
  warehouseMessage: { type: String, default: '', trim: true },
  lines: { type: [exportLineSchema], default: [] },
  createdByName: { type: String, default: '', trim: true },
  source: { type: String, default: 'upload-image', trim: true },
}, { timestamps: true });

roPartExportSchema.index({ khoaBaoGia: 1, createdAt: -1 });
roPartExportSchema.index({ soBaoGia: 1, createdAt: -1 });

module.exports = mongoose.model('RoPartExport', roPartExportSchema);
