const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  name: { type: String, default: '' },
}, { _id: false });

const attendanceSettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'default',
    unique: true,
  },
  /** Số giờ làm việc chuẩn / ngày */
  hoursPerDay: {
    type: Number,
    default: 8,
    min: 1,
    max: 24,
  },
  /** Ngày nghỉ lễ hưởng lương (không trừ lương) */
  paidHolidays: {
    type: [holidaySchema],
    default: [],
  },
  /** Giờ vào / ra chuẩn (HH:mm) */
  standardCheckIn: { type: String, default: '08:00' },
  standardCheckOut: { type: String, default: '17:00' },
}, { timestamps: true });

module.exports = mongoose.model('AttendanceSettings', attendanceSettingsSchema);
