const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { isAllowedOrigin } = require('../config/cors');
const {
  upsertClient,
  updateClientPresence,
  removeClient,
} = require('./onlineClients');

let io = null;

const sanitizePath = (value) => {
  const text = String(value || '').trim().slice(0, 200);
  if (!text.startsWith('/')) return '/';
  return text;
};

const initializeSocket = (httpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('CORS blocked'), false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake?.auth?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('UNAUTHORIZED'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select('_id fullName role isActive username')
        .lean();

      if (!user || !user.isActive) {
        return next(new Error('UNAUTHORIZED'));
      }

      socket.user = {
        id: String(user._id),
        fullName: user.fullName || '',
        role: user.role || '',
        username: user.username || '',
      };
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const now = new Date();
    const ip = socket.handshake.headers['x-forwarded-for']
      || socket.handshake.address
      || '';

    upsertClient(socket.id, {
      socketId: socket.id,
      userId: user.id,
      fullName: user.fullName,
      role: user.role,
      ip: String(ip).split(',')[0].trim().slice(0, 100),
      userAgent: String(socket.handshake.headers['user-agent'] || '').slice(0, 300),
      connectedAt: now,
      currentPath: '/',
      lastSeenAt: now,
    });

    socket.on('client:presence', (payload = {}) => {
      updateClientPresence(socket.id, {
        currentPath: sanitizePath(payload.currentPath),
      });
    });

    socket.on('disconnect', () => {
      removeClient(socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO chưa được khởi tạo. Gọi initializeSocket(server) trước.');
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO,
};
