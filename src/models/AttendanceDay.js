const mongoose = require('mongoose');
const { Schema } = mongoose;

const ATTENDANCE_STATUS_ENUM = [
  'present',
  'unpaid_full',
  'paid_full',
  'morning_off',
  'afternoon_off',
  'hourly_leave',
  'late',
  'early',
  'late_early',
  'annual_leave',
  'sick_paid',
  'sick_unpaid',
  'holiday',
  'business_trip',
  'compensatory',
  'sunday',
  'other',
];

const attendanceDaySchema = new Schema({
  worker: {
    type: Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true,
  },
  date: {
    type: String,
    required: true, // YYYY-MM-DD
  },
  year: { type: Number, required: true, index: true },
  month: { type: Number, required: true, index: true },

  status: {
    type: String,
    enum: ATTENDANCE_STATUS_ENUM,
    default: 'present',
  },

  standardMinutes: { type: Number, default: 480, min: 0 },
  workedMinutes: { type: Number, default: 480, min: 0 },
  missingMinutes: { type: Number, default: 0, min: 0 },

  lateMinutes: { type: Number, default: 0, min: 0 },
  earlyLeaveMinutes: { type: Number, default: 0, min: 0 },
  leaveMinutes: { type: Number, default: 0, min: 0 },

  standardCheckIn: { type: String, default: '' },
  standardCheckOut: { type: String, default: '' },
  actualCheckIn: { type: String, default: '' },
  actualCheckOut: { type: String, default: '' },

  isPaidLeave: { type: Boolean, default: false },
  isSunday: { type: Boolean, default: false },
  isHoliday: { type: Boolean, default: false },
  deductSalary: { type: Boolean, default: false },

  deductionAmount: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '', trim: true },
}, { timestamps: true });

attendanceDaySchema.index({ worker: 1, date: 1 }, { unique: true });
attendanceDaySchema.index({ worker: 1, year: 1, month: 1 });
attendanceDaySchema.index({ year: 1, month: 1 });

module.exports = mongoose.model('AttendanceDay', attendanceDaySchema);
module.exports.ATTENDANCE_STATUS_ENUM = ATTENDANCE_STATUS_ENUM;
