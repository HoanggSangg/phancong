const mongoose = require('mongoose');
const { Schema } = mongoose;

const WokersSchema = new Schema({
    worker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worker',
        required: true
    },

    car: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Car',
        required: false
    },

    vieclamChiTiet: {
        type: String,
        required: false
    },

    status: {
    type: String,
    enum: ['co_viec', 'chua_co_viec'],
    required: true
}
}, {
    timestamps: true
});

module.exports = mongoose.model('Wokers', WokersSchema);