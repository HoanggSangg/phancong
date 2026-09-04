const mongoose = require('mongoose');

const { Schema } = mongoose;

const qrLabelSchema = new Schema({
  code: { type: String, required: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true },
  lastSoLuong: { type: Number, default: 1, min: 1 },
  printCount: { type: Number, default: 0, min: 0 },
  lastMethod: { type: String, trim: true, enum: ['print', 'pdf'], default: 'print' },
  lastPrintedAt: { type: Date, default: Date.now },
  lastPrintedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastPrintedByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

qrLabelSchema.index({ lastPrintedAt: -1 });
qrLabelSchema.index({ name: 1 });

module.exports = mongoose.model('QrLabel', qrLabelSchema);
