const mongoose = require('mongoose');
const { Schema } = mongoose;

const carSchema = new Schema({
  plateNumber: {
    type: String,
    required: [true, 'Biển số xe là bắt buộc'],
    unique: true
  },
  carType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CateCar',
    required: [true, 'Loại xe là bắt buộc']
  },
  workers: [{
    worker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      required: true
    },
    role: {
      type: String,
      enum: ['main', 'sub'],
      required: true
    }
  }],
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supervisor'
  },
  currentTime: {
    type: String,
    default: () => {
      const now = new Date();
      return now.toLocaleTimeString('vi-VN', { hour12: false });
    }
  },
  currentDate: {
    type: String,
    default: () => {
      const now = new Date();
      return now.toISOString().slice(0, 10);
    }
  },
  deliveryTime: {
    type: String,
    required: [true, 'Thời gian hẹn giao xe là bắt buộc']
  },
  status: {
    type: String,
    enum: ['working', 'done'],
    default: 'working'
  }
}, { timestamps: true });

module.exports = mongoose.model('Car', carSchema);
