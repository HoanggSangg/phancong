/**
 * Chuyển HTTP → HTTPS khi đứng sau reverse proxy (X-Forwarded-Proto).
 * Bật bằng FORCE_HTTPS=true hoặc NODE_ENV=production + TRUST_PROXY=true.
 */
const shouldForceHttps = () => {
  if (process.env.FORCE_HTTPS === 'true') return true;
  if (process.env.FORCE_HTTPS === 'false') return false;
  return process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === 'true';
};

const forceHttps = (req, res, next) => {
  if (!shouldForceHttps()) return next();

  const forwarded = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (forwarded && forwarded !== 'https') {
    const host = req.headers.host || 'localhost';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }

  // HSTS chỉ khi request đã là HTTPS (tránh gắn nhầm trên HTTP thuần)
  if (forwarded === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return next();
};

module.exports = { forceHttps, shouldForceHttps };
