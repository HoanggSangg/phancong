const mongoose = require('mongoose');
const { Schema } = mongoose;

const supervisorSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Tên người giám sát bắt buộc điền']
    }
}, { timestamps: true });

module.exports = mongoose.model('Supervisor', supervisorSchema);
