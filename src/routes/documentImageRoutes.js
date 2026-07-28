const http = require('http');
const https = require('https');
const { URL } = require('url');
const express = require('express');
const axios = require('axios');
const { authenticate, access } = require('../middleware/auth');

const router = express.Router();

const IMAGE_API_BASE = (process.env.DOCUMENT_IMAGE_API_BASE || 'http://api2026.otobathanh.vn/').replace(
  /\/?$/,
  '/',
);

router.use(authenticate);
router.use(access(['admin', 'giam_sat', 'ktv'], 'cars.upload-image'));

router.get('/files', async (req, res) => {
  try {
    const soChungTu = String(req.query.soChungTu || '').trim();
    if (!soChungTu) {
      return res.status(400).json({ message: 'Thiếu số chứng từ' });
    }

    const response = await axios.get(`${IMAGE_API_BASE}api/ImageAPI/GetFiles`, {
      params: { soChungTu },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
      validateStatus: () => true,
    });

    // API cũ trả 404/500 khi chưa có thư mục ảnh → coi như danh sách rỗng
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
    console.error('document-images/files error:', error.message);
    return res.status(502).json({
      message: 'Không kết nối được máy chủ ảnh',
      detail: error.message,
    });
  }
});

router.post('/upload', (req, res) => {
  const soChungTu = String(req.query.soChungTu || '').trim();
  if (!soChungTu) {
    return res.status(400).json({ message: 'Thiếu số chứng từ' });
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
      const outHeaders = { ...proxyRes.headers };
      // Tránh lệch encoding khi FE đọc JSON/text
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    console.error('document-images/upload proxy error:', error.message);
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
});

module.exports = router;
