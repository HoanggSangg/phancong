const User = require('../models/User');
const Worker = require('../models/Worker');
const { signToken, sanitizeUser } = require('../middleware/auth');
const { sanitizePermissions } = require('../utils/permissions');
const { validateGiamSatWorkerLink } = require('../utils/teamScope');

const register = async (req, res) => {
  try {
    const { username, password, fullName, workerId } = req.body;

    if (!username?.trim() || !password || !fullName?.trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập đủ thông tin đăng ký' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Mật khẩu tối thiểu 6 ký tự' });
    }

    const exists = await User.findOne({ username: username.trim().toLowerCase() });
    if (exists) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    const userCount = await User.countDocuments();
    let role = 'ktv';
    let worker = null;

    if (userCount === 0) {
      role = 'admin';
    } else if (workerId) {
      const linkedWorker = await Worker.findById(workerId);
      if (!linkedWorker) {
        return res.status(400).json({ message: 'Thợ liên kết không tồn tại' });
      }
      worker = linkedWorker._id;
    }

    const user = await User.create({
      username: username.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      role,
      worker,
    });

    const token = signToken(user._id);

    return res.status(201).json({
      message: userCount === 0 ? 'Tạo tài khoản admin đầu tiên thành công' : 'Đăng ký thành công',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username?.trim() || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa' });
    }

    const token = signToken(user._id);
    user.password = undefined;

    return res.json({
      message: 'Đăng nhập thành công',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMe = async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate({
        path: 'worker',
        select: 'name soBaoDanh team teamRole',
        populate: { path: 'team', select: 'name' },
      })
      .sort({ createdAt: -1 });
    return res.json(users.map(sanitizeUser));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, password, fullName, role, workerId, isActive, permissions } = req.body;

    if (!username?.trim() || !password || !fullName?.trim()) {
      return res.status(400).json({ message: 'Thiếu thông tin tạo tài khoản' });
    }

    const exists = await User.findOne({ username: username.trim().toLowerCase() });
    if (exists) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
    }

    let linkedWorker = null;
    if (workerId) {
      linkedWorker = await Worker.findById(workerId);
      if (!linkedWorker) {
        return res.status(400).json({ message: 'Thợ liên kết không tồn tại' });
      }
    }

    const linkError = validateGiamSatWorkerLink(role || 'ktv', linkedWorker);
    if (linkError) {
      return res.status(400).json({ message: linkError });
    }

    const user = await User.create({
      username: username.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      role: role || 'ktv',
      worker: linkedWorker?._id || null,
      isActive: isActive !== false,
      permissions: sanitizePermissions(permissions || []),
    });

    return res.status(201).json({
      message: 'Tạo tài khoản thành công',
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, role, workerId, isActive, password, permissions } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }

    if (fullName?.trim()) user.fullName = fullName.trim();
    if (role) user.role = role;
    if (typeof isActive === 'boolean') user.isActive = isActive;

    let linkedWorker = user.worker ? await Worker.findById(user.worker) : null;
    if (workerId === null || workerId === '') {
      linkedWorker = null;
      user.worker = null;
    } else if (workerId) {
      linkedWorker = await Worker.findById(workerId);
      if (!linkedWorker) {
        return res.status(400).json({ message: 'Thợ liên kết không tồn tại' });
      }
      user.worker = linkedWorker._id;
    }

    const linkError = validateGiamSatWorkerLink(user.role, linkedWorker);
    if (linkError) {
      return res.status(400).json({ message: linkError });
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'Mật khẩu tối thiểu 6 ký tự' });
      }
      user.password = password;
    }

    if (permissions !== undefined) {
      user.permissions = sanitizePermissions(permissions);
    }

    await user.save();

    return res.json({
      message: 'Cập nhật tài khoản thành công',
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user._id.toString() === id) {
      return res.status(400).json({ message: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản' });
    }

    req.auditDeleted = {
      label: user.fullName ? `${user.fullName} (@${user.username})` : user.username,
    };

    return res.json({
      message: 'Xóa tài khoản thành công',
      user: sanitizeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
};
