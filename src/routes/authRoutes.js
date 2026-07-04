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
const { authenticate, access } = require('../middleware/auth');
const { setupAuditLog } = require('../utils/auditLog');

const withAudit = (req, res, next) => {
  setupAuditLog(req, res);
  return next();
};

router.post('/register', withAudit, register);
router.post('/login', withAudit, login);
router.get('/me', authenticate, getMe);

router.get('/users', authenticate, access(['admin'], 'system.users'), getUsers);
router.post('/users', authenticate, access(['admin'], 'system.users'), createUser);
router.put('/users/:id', authenticate, access(['admin'], 'system.users'), updateUser);
router.delete('/users/:id', authenticate, access(['admin'], 'system.users'), deleteUser);

module.exports = router;
