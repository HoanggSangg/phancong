const mongoose = require('mongoose');
const moment = require('moment-timezone');
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
      return moment().tz('Asia/Ho_Chi_Minh').format('HH:mm:ss');
    }
  },
  currentDate: {
    type: String,
    default: () => {
      return moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD');
    }
  },
  status: {
    type: String,
    enum: ['working', 'done'],
    default: 'working'
  }
}, { timestamps: true });

module.exports = mongoose.model('Car', carSchema);
