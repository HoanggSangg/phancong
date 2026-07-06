const mongoose = require('mongoose');

const { Schema } = mongoose;

const ktvMessageSchema = new Schema({
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderName: { type: String, trim: true, default: '' },
  car: {
    type: Schema.Types.ObjectId,
    ref: 'Car',
    required: true,
  },
  plateNumber: { type: String, trim: true, required: true },
  carStatus: { type: String, trim: true, default: '' },
  carStatusLabel: { type: String, trim: true, default: '' },
  message: { type: String, trim: true, default: '' },
  locationName: { type: String, trim: true, default: '' },
  supervisorName: { type: String, trim: true, default: '' },
  receiverUserIds: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  readAt: { type: Date, default: null },
  readBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  readByName: { type: String, trim: true, default: '' },
  ktvAcknowledgedAt: { type: Date, default: null },
  operationLogId: {
    type: Schema.Types.ObjectId,
    ref: 'OperationLog',
    default: null,
  },
}, { timestamps: true });

ktvMessageSchema.index({ createdAt: -1 });
ktvMessageSchema.index({ sender: 1, createdAt: -1 });
ktvMessageSchema.index({ receiverUserIds: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('KtvMessage', ktvMessageSchema);
