const mongoose = require('mongoose');
const { Schema } = mongoose;

const workerSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Tên thợ bắt buộc điền']
    },
    role: {
        type: String,
        enum: ['thợ chính', 'thợ phụ'],
        required: [true, 'Vai trò thợ bắt buộc chọn']
    },
    status: {
        type: String,
        enum: ['busy', 'available'],
        default: 'available'
    }
}, { timestamps: true });

module.exports = mongoose.model('Worker', workerSchema);
