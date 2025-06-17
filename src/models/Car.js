const mongoose = require('mongoose');
const { Schema } = mongoose;

const carSchema = new Schema({
    plateNumber: {
        type: String,
        required: [true, 'Biển số xe là bắt buộc'],
        unique: true
    },
    carType: {
        type: String,
        required: [true, 'Loại xe là bắt buộc']
    },
    mainWorker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    },
    subWorker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker'
    },
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
            return now.toISOString().slice(0, 10); // "2025-06-18"
        }
    },
    deliveryTime: {
        type: String,
        required: [true, 'Thời gian hẹn giao xe là bắt buộc']
    },
    status: {
        type: String,
        enum: ['working', 'done'], // thêm trạng thái
        default: 'working'
    }
}, { timestamps: true });

module.exports = mongoose.model('Car', carSchema);
