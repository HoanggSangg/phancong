const mongoose = require('mongoose');

const ktvMessageSettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'default',
    unique: true,
  },
  receiverUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
}, { timestamps: true });

module.exports = mongoose.model('KtvMessageSettings', ktvMessageSettingsSchema);
