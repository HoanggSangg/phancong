const express = require('express');
const router = express.Router();

const {
  register,
  login,
  getMe,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { setupAuditLog } = require('../utils/auditLog');

const withAudit = (req, res, next) => {
  setupAuditLog(req, res);
  return next();
};

router.post('/register', withAudit, register);
router.post('/login', withAudit, login);
router.get('/me', authenticate, getMe);

router.get('/users', authenticate, authorize('admin'), getUsers);
router.post('/users', authenticate, authorize('admin'), createUser);
router.put('/users/:id', authenticate, authorize('admin'), updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);

module.exports = router;
