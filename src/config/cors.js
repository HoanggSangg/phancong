const STATIC_ORIGINS = new Set([
  'http://localhost:5173',
  'https://localhost:5173',
  'http://127.0.0.1:5173',
  'https://127.0.0.1:5173',
  // Cổng Vite HTTPS cũ (publicPort+2) — phòng cache bookmark
  'https://localhost:5175',
  'https://127.0.0.1:5175',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // Cùng mạng LAN
  'http://192.168.1.250:5173',
  'https://192.168.1.250:5173',
  // Khác mạng + Tailscale (máy cũ)
  'http://100.127.133.38:5173',
  'https://100.127.133.38:5173',
  'https://fe-phancong.vercel.app',
]);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (STATIC_ORIGINS.has(origin)) return true;
  // Dev FE — cổng 5173 (hoặc 5175 cấu hình cũ)
  if (/^https?:\/\/192\.168\.\d+\.\d+:517[35]$/.test(origin)) return true;
  if (/^https?:\/\/100\.\d+\.\d+\.\d+:517[35]$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;
  if (/^https?:\/\/localhost:\d+$/.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'Content-Type', 'Accept', 'Authorization', 'X-Api-Key'],
  credentials: true,
};

module.exports = {
  STATIC_ORIGINS,
  isAllowedOrigin,
  corsOptions,
};
