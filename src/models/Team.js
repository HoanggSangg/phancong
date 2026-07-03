const mongoose = require('mongoose');
const { Schema } = mongoose;

const teamSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Tên tổ bắt buộc điền'],
    trim: true
  },

  workers: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Worker'
    }
  ],

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);