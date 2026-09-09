const mongoose = require('mongoose');
const { Schema } = mongoose;

const workerGroupMemberSchema = new Schema({
  worker: {
    type: Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0,
  },
}, { _id: false });

const workerGroupSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Tên nhóm bắt buộc điền'],
    trim: true,
  },
  members: {
    type: [workerGroupMemberSchema],
    default: [],
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
}, { timestamps: true });

workerGroupSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('WorkerGroup', workerGroupSchema);
