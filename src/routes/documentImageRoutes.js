const http = require('http');
const https = require('https');
const { URL } = require('url');
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { authenticate, access, JWT_SECRET } = require('../middleware/auth');
const OperationLog = require('../models/OperationLog');
const Car = require('../models/Car');
const User = require('../models/User');

const router = express.Router();

const IMAGE_API_BASE = (process.env.DOCUMENT_IMAGE_API_BASE || 'http://api2026.otobathanh.vn/').replace(
  /\/?$/,
  '/',
);
const IMAGE_DELETE_API =
  process.env.DOCUMENT_IMAGE_DELETE_API || 'http://images.otobathanh.vn/api/image/delete';
const EXTERNAL_BASE = 'http://local.otobathanh.vn/api';
const EXTERNAL_HEADERS = process.env.OTO_API_KEY
  ? { 'X-Api-Key': process.env.OTO_API_KEY }
  : {};

/** TT... hoặc hpt/TT... */
const isSafeDocKey = (value) => /^(hpt\/)?TT[A-Z0-9]+$/i.test(String(value || '').trim());

const isSafeFileName = (value) => {
  const name = String(value || '').trim();
  return Boolean(name) && !name.includes('..') && !name.includes('/') && !name.includes('\\');
};

const normalizePlate = (plate = '') =>
  String(plate || '').toUpperCase().replace(/\s/g, '');

const getBaseTt = (soChungTu = '') =>
  String(soChungTu || '')
    .trim()
    .toUpperCase()
    .replace(/^HPT\//, '');

const getImageKind = (soChungTu = '') =>
  /^hpt\//i.test(String(soChungTu || '').trim()) ? 'parts' : 'car';

const buildUploadsPath = (soChungTu, fileName) => {
  const docPath = String(soChungTu)
    .trim()
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `Uploads/${docPath}/${encodeURIComponent(fileName)}`;
};

const buildPublicFileUrl = (soChungTu, fileName) => {
  const base = IMAGE_API_BASE.replace(/\/?$/, '/');
  return `${base}${buildUploadsPath(soChungTu, fileName)}`;
};

const findCarBySoChungTu = async (soChungTu) => {
  const baseTt = getBaseTt(soChungTu);
  if (!baseTt) return null;

  return Car.findOne({
    $or: [
      { roNumber: baseTt },
      { roCode: baseTt },
      { roKey: baseTt },
    ],
  })
    .select('_id plateNumber roNumber roCode externalCarTypeName status currentDate')
    .sort({ currentDate: -1, createdAt: -1 })
    .lean();
};

const resolveDocumentContext = async (soChungTu) => {
  const baseTt = getBaseTt(soChungTu);
  const kind = getImageKind(soChungTu);
  const car = await findCarBySoChungTu(baseTt);

  let plateNumber = normalizePlate(car?.plateNumber || '');
  let roNumber = String(car?.roNumber || baseTt).toUpperCase();
  let roCode = String(car?.roCode || '').toUpperCase();
  let externalCarTypeName = car?.externalCarTypeName || '';
  let source = car ? 'car' : 'none';

  if (!plateNumber || !roCode) {
    try {
      const quoteRes = await axios.get(`${EXTERNAL_BASE}/baogia/${baseTt}`, {
        headers: EXTERNAL_HEADERS,
        timeout: 12_000,
      });
      const header = quoteRes.data?.header || {};
      plateNumber = plateNumber || normalizePlate(header.soXe || '');
      roNumber = String(header.soChungtu || roNumber || baseTt).toUpperCase();
      roCode = String(header.khoa || roCode || '').toUpperCase();
      externalCarTypeName =
        externalCarTypeName
        || header.loaiXe?.tenViet
        || header.loaiXe?.tenAnh
        || header.loaiXe?.ma
        || '';
      if (!car) source = 'external';
    } catch {
      // giữ dữ liệu đã có trong DB / none
    }
  }

  return {
    soChungTu: String(soChungTu || '').trim(),
    baseTt,
    kind,
    plateNumber,
    roNumber,
    roCode,
    externalCarTypeName,
    carId: car?._id ? String(car._id) : null,
    carStatus: car?.status || '',
    source,
  };
};

const writeDocumentImageLog = async ({ req, action, soChungTu, fileName = '' }) => {
  const user = req.user;
  if (!user) return null;

  const context = await resolveDocumentContext(soChungTu);
  const kindLabel = context.kind === 'parts' ? 'ảnh phụ tùng' : 'ảnh xe';
  const actionLabel = action === 'delete' ? 'Xóa' : 'Tải lên';
  const safeFileName = String(fileName || '').trim();
  const targetLabel =
    [context.plateNumber, context.roNumber || context.baseTt].filter(Boolean).join(' · ')
    || context.baseTt;

  const details = [
    `Thao tác: ${actionLabel} ${kindLabel}`,
    safeFileName ? `Tên file: ${safeFileName}` : null,
    context.soChungTu ? `Chứng từ: ${context.soChungTu}` : null,
    context.plateNumber ? `Biển số: ${context.plateNumber}` : null,
    context.roNumber || context.roCode
      ? `RO: ${context.roNumber || context.roCode}`
      : null,
  ].filter(Boolean);

  const description = safeFileName
    ? `${user.fullName || user.username || 'User'}: ${actionLabel} ${kindLabel} «${safeFileName}» — ${targetLabel}`
    : `${user.fullName || user.username || 'User'}: ${actionLabel} ${kindLabel} — ${targetLabel}`;

  return OperationLog.create({
    user: user._id,
    username: user.username || '',
    fullName: user.fullName || '',
    role: user.role || '',
    action,
    module: 'document_image',
    targetId: context.carId || context.baseTt,
    targetLabel: safeFileName ? `${targetLabel} · ${safeFileName}` : targetLabel,
    description,
    metadata: {
      soChungTu: context.soChungTu,
      baseTt: context.baseTt,
      kind: context.kind,
      kindLabel,
      actionLabel,
      fileName: safeFileName,
      plateNumber: context.plateNumber,
      roNumber: context.roNumber,
      roCode: context.roCode,
      carId: context.carId,
      externalCarTypeName: context.externalCarTypeName,
      source: context.source,
      details,
    },
  });
};

/** Gắn req.user nếu có token hợp lệ — không chặn khi thiếu / sai token (API công khai). */
const optionalAuthenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token && req.query?.access_token) {
      token = String(req.query.access_token).trim();
    }
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (user?.isActive) {
      req.user = user;
    }
  } catch {
    // bỏ qua — vẫn cho dùng API công khai
  }
  return next();
};

const handleContext = async (req, res) => {
  try {
    const soChungTu = String(req.query.soChungTu || '').trim();
    if (!soChungTu) {
      return res.status(400).json({ message: 'Thiếu số chứng từ' });
    }
    if (!isSafeDocKey(soChungTu) && !/^TT[A-Z0-9]+$/i.test(soChungTu)) {
      return res.status(400).json({ message: 'Số chứng từ không hợp lệ' });
    }

    const context = await resolveDocumentContext(getBaseTt(soChungTu));
    return res.json(context);
  } catch (error) {
    return res.status(500).json({
      message: 'Không lấy được thông tin xe',
      detail: error.message,
    });
  }
};

const handleFiles = async (req, res) => {
  try {
    const soChungTu = String(req.query.soChungTu || '').trim();
    if (!soChungTu) {
      return res.status(400).json({ message: 'Thiếu số chứng từ' });
    }
    if (!isSafeDocKey(soChungTu)) {
      return res.status(400).json({ message: 'Số chứng từ không hợp lệ' });
    }

    const response = await axios.get(`${IMAGE_API_BASE}api/ImageAPI/GetFiles`, {
      params: { soChungTu },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (response.status === 404 || response.status === 500) {
      return res.json([]);
    }

    if (response.status < 200 || response.status >= 300) {
      return res.status(502).json({
        message: `Không lấy được danh sách ảnh (HTTP ${response.status})`,
      });
    }

    const files = Array.isArray(response.data)
      ? response.data.filter((item) => typeof item === 'string' && item.trim())
      : [];

    return res.json(files);
  } catch (error) {
    return res.status(502).json({
      message: 'Không kết nối được máy chủ ảnh',
      detail: error.message,
    });
  }
};

const handleContent = (req, res) => {
  const soChungTu = String(req.query.soChungTu || '').trim();
  const fileName = String(req.query.fileName || '').trim();

  if (!isSafeDocKey(soChungTu) || !isSafeFileName(fileName)) {
    return res.status(400).json({ message: 'Tham số không hợp lệ' });
  }

  let target;
  try {
    target = new URL(buildUploadsPath(soChungTu, fileName), IMAGE_API_BASE);
  } catch {
    return res.status(500).json({ message: 'Cấu hình máy chủ ảnh không hợp lệ' });
  }

  const pump = (url, hops = 0) => {
    if (hops > 4) {
      if (!res.headersSent) {
        res.status(502).json({ message: 'Máy chủ ảnh chuyển hướng quá nhiều' });
      }
      return;
    }

    const lib = url.protocol === 'https:' ? https : http;
    const proxyReq = lib.get(
      url,
      {
        headers: { Accept: '*/*', 'User-Agent': 'phancong-document-images' },
        timeout: 120_000,
      },
      (proxyRes) => {
        const status = proxyRes.statusCode || 502;
        const location = proxyRes.headers.location;
        if (status >= 300 && status < 400 && location) {
          proxyRes.resume();
          try {
            pump(new URL(location, url), hops + 1);
          } catch {
            if (!res.headersSent) {
              res.status(502).json({ message: 'Máy chủ ảnh chuyển hướng không hợp lệ' });
            }
          }
          return;
        }

        if (status >= 400) {
          proxyRes.resume();
          if (!res.headersSent) {
            res.status(status === 404 ? 404 : 502).json({
              message: status === 404 ? 'Không tìm thấy file ảnh' : `Lỗi máy chủ ảnh (HTTP ${status})`,
            });
          }
          return;
        }

        const headers = {
          'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
          'Cache-Control': 'private, max-age=60',
        };
        if (req.query.download === '1') {
          const safe = fileName.replace(/"/g, '');
          headers['Content-Disposition'] =
            `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
        }
        res.writeHead(status, headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('Hết thời gian chờ máy chủ ảnh'));
    });

    proxyReq.on('error', (error) => {
      if (!res.headersSent) {
        res.status(502).json({
          message: 'Không kết nối được máy chủ ảnh',
          detail: error.message,
        });
      } else {
        res.destroy(error);
      }
    });

    req.on('aborted', () => {
      proxyReq.destroy();
    });
  };

  pump(target);
};

const handleUpload = (req, res) => {
  const soChungTu = String(req.query.soChungTu || '').trim();
  const fileName = String(req.query.fileName || '').trim();

  if (!soChungTu) {
    return res.status(400).json({ message: 'Thiếu số chứng từ' });
  }
  if (!isSafeDocKey(soChungTu)) {
    return res.status(400).json({ message: 'Số chứng từ không hợp lệ' });
  }

  let target;
  try {
    target = new URL(
      `api/ImageAPI/UploadFiles?soChungTu=${encodeURIComponent(soChungTu)}`,
      IMAGE_API_BASE,
    );
  } catch (error) {
    return res.status(500).json({ message: 'Cấu hình máy chủ ảnh không hợp lệ' });
  }

  const lib = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers.authorization;
  delete headers.host;
  headers.host = target.host;

  const proxyReq = lib.request(
    target,
    {
      method: 'POST',
      headers,
    },
    (proxyRes) => {
      const status = proxyRes.statusCode || 502;
      const outHeaders = { ...proxyRes.headers };
      res.writeHead(status, outHeaders);
      proxyRes.pipe(res);

      if (status >= 200 && status < 300) {
        writeDocumentImageLog({
          req,
          action: 'upload',
          soChungTu,
          fileName,
        }).catch(() => {});
      }
    },
  );

  proxyReq.on('error', (error) => {
    if (!res.headersSent) {
      res.status(502).json({
        message: 'Không kết nối được máy chủ ảnh',
        detail: error.message,
      });
    }
  });

  req.on('aborted', () => {
    proxyReq.destroy();
  });

  req.pipe(proxyReq);
};

// —— Công khai: xem danh sách, xem ảnh, tải lên (không cần đăng nhập) ——
router.get('/context', handleContext);
router.get('/files', handleFiles);
router.get('/content', handleContent);
router.post('/upload', optionalAuthenticate, handleUpload);

// —— Chỉ user đăng nhập mới được xóa ——
router.delete(
  '/file',
  authenticate,
  access(['admin', 'giam_sat', 'ktv', 'lai_xe', 'kho', 'cvdv'], 'cars.upload-image'),
  async (req, res) => {
    try {
      const soChungTu = String(req.query.soChungTu || req.body?.soChungTu || '').trim();
      const fileName = String(req.query.fileName || req.body?.fileName || '').trim();

      if (!isSafeDocKey(soChungTu) || !isSafeFileName(fileName)) {
        return res.status(400).json({ message: 'Tham số không hợp lệ' });
      }

      const publicUrl = buildPublicFileUrl(soChungTu, fileName);
      const response = await axios.post(
        IMAGE_DELETE_API,
        { Url: publicUrl },
        {
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 30_000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        return res.status(response.status >= 400 && response.status < 500 ? response.status : 502).json({
          message: response.data?.message || `Không xóa được ảnh (HTTP ${response.status})`,
          url: publicUrl,
        });
      }

      writeDocumentImageLog({
        req,
        action: 'delete',
        soChungTu,
        fileName,
      }).catch(() => {});

      return res.json({
        message: response.data?.message || 'Đã xóa ảnh',
        url: publicUrl,
      });
    } catch (error) {
      return res.status(502).json({
        message: 'Không kết nối được máy chủ xóa ảnh',
        detail: error.message,
      });
    }
  },
);

module.exports = router;
