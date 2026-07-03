const mongoose = require('mongoose');

const { Schema } = mongoose;

const operationLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  username: { type: String, trim: true },
  fullName: { type: String, trim: true },
  role: { type: String, trim: true },
  action: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  targetId: { type: String, trim: true },
  targetLabel: { type: String, trim: true },
  description: { type: String, required: true, trim: true },
  metadata: { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });

operationLogSchema.index({ createdAt: -1 });
operationLogSchema.index({ module: 1, createdAt: -1 });
operationLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('OperationLog', operationLogSchema);
