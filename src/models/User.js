const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'Tên đăng nhập bắt buộc'],
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: [true, 'Mật khẩu bắt buộc'],
    minlength: 6,
    select: false,
  },
  fullName: {
    type: String,
    required: [true, 'Họ tên bắt buộc'],
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'giam_sat', 'ktv'],
    default: 'ktv',
  },
  worker: {
    type: Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
