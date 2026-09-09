const axios = require('axios');
const { createManualOperationLog } = require('../utils/createManualOperationLog');
const RoPartExport = require('../models/RoPartExport');

const EXTERNAL_BASE = 'http://local.otobathanh.vn/api';
const XUAT_KHO_URL = `${EXTERNAL_BASE}/xe/xuat-kho`;

const KHOA_KHO_TONG = String(process.env.OTO_KHOA_KHO || 'TT00000001').trim();
const resolveKhoaKho = (value) => String(value || '').trim() || KHOA_KHO_TONG;

const getHeaders = () =>
  (process.env.OTO_API_KEY ? { 'X-Api-Key': process.env.OTO_API_KEY } : {});

const requireApiKey = (res) => {
  if (process.env.OTO_API_KEY) return true;
  res.status(503).json({ message: 'Chưa cấu hình API key xuất kho (OTO_API_KEY).' });
  return false;
};

const extractProblem = (error) => {
  const data = error?.response?.data;
  const status = error?.response?.status || 502;
  if (typeof data === 'string' && data.trim()) {
    return { status, message: data.trim(), data };
  }
  const message =
    data?.detail
    || data?.title
    || data?.message
    || error?.message
    || 'Lỗi API hàng hóa / xuất kho';
  return { status, message, data };
};

const sendExternalError = (res, error) => {
  const { status, message } = extractProblem(error);
  const code = status >= 400 && status < 600 ? status : 502;
  return res.status(code).json({ message });
};

const normHanghoaCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const isExactHanghoaMatch = (item, q) => {
  const nq = normHanghoaCode(q);
  if (!nq) return false;
  return [item?.khoa, item?.ma, item?.maVach].some((value) => normHanghoaCode(value) === nq);
};

const fetchHanghoaDetail = async (id, khoaKho) => {
  const params = {};
  const kho = String(khoaKho || '').trim();
  if (kho) params.khoaKho = kho;
  const url = `${EXTERNAL_BASE}/hanghoa/${encodeURIComponent(id)}`;
  const { data } = await axios.get(url, {
    headers: getHeaders(),
    params: Object.keys(params).length ? params : undefined,
    timeout: 12_000,
  });
  return data;
};

const mapHanghoaDetail = (data) => {
  const ton = Number(data?.tonHienTai);
  const tonHienTai = Number.isFinite(ton) ? ton : 0;
  return {
    khoa: data?.khoa || '',
    ma: data?.ma || '',
    maVach: data?.maVach || '',
    ten: data?.tenViet || data?.tenAnh || data?.ten || '',
    donViTinh: data?.donViTinh || '',
    nhomHangHoa: data?.nhomHangHoa || '',
    quayKe: data?.quayKe || '',
    tonHienTai,
    hetTon: tonHienTai <= 0,
  };
};

const lookupHanghoa = async (req, res) => {
  if (!requireApiKey(res)) return;
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ message: 'Thiếu mã hàng hóa' });
  }
  const khoaKho = String(req.query.khoaKho || '').trim();

  try {
    const url = `${EXTERNAL_BASE}/hanghoa`;
    const params = { q, page: 1, pageSize: 50 };
    const { data: list } = await axios.get(url, {
      headers: getHeaders(),
      params,
      timeout: 15_000,
    });
    const items = Array.isArray(list) ? list : [];
    const exact = items.find((item) => isExactHanghoaMatch(item, q));
    if (!exact?.khoa && !exact?.ma) {
      return res.status(404).json({ message: `Không đúng mã hàng hóa '${q}'.` });
    }

    const id = exact.khoa || exact.ma;
    try {
      const data = await fetchHanghoaDetail(id, khoaKho);
      return res.json(mapHanghoaDetail(data));
    } catch {
      return res.json(mapHanghoaDetail(exact));
    }
  } catch (error) {
    if (error?.response?.status === 404) {
      return res.status(404).json({ message: `Không đúng mã hàng hóa '${q}'.` });
    }
    return sendExternalError(res, error);
  }
};

const listHanghoa = async (req, res) => {
  if (!requireApiKey(res)) return;
  try {
    const q = String(req.query.q || '').trim();
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const url = `${EXTERNAL_BASE}/hanghoa`;
    const { data } = await axios.get(url, {
      headers: getHeaders(),
      params: { q, page, pageSize },
      timeout: 15_000,
    });
    return res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    return sendExternalError(res, error);
  }
};

const getHanghoa = async (req, res) => {
  if (!requireApiKey(res)) return;
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Thiếu khóa hoặc mã hàng hóa' });
    }
    const khoaKho = String(req.query.khoaKho || '').trim();
    const data = await fetchHanghoaDetail(id, khoaKho);
    return res.json(mapHanghoaDetail(data));
  } catch (error) {
    if (error?.response?.status === 404) {
      return res.status(404).json({ message: `Không đúng mã hàng hóa '${id}'.` });
    }
    return sendExternalError(res, error);
  }
};

const normalizeLines = (lines) => {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => ({
      khoaHangHoa: String(line?.khoaHangHoa || '').trim(),
      soLuong: Number(line?.soLuong),
      ma: String(line?.ma || '').trim(),
      ten: String(line?.ten || '').trim(),
      donViTinh: String(line?.donViTinh || '').trim(),
      tonHienTai: Number.isFinite(Number(line?.tonHienTai)) ? Number(line.tonHienTai) : null,
    }))
    .filter((line) => line.khoaHangHoa && Number.isFinite(line.soLuong) && line.soLuong > 0);
};

const buildHistorySummary = (docs) => {
  const byKhoa = new Map();
  docs.forEach((doc) => {
    (doc.lines || []).forEach((line) => {
      const key = line.khoaHangHoa || line.ma;
      if (!key) return;
      const prev = byKhoa.get(key) || {
        khoaHangHoa: line.khoaHangHoa,
        ma: line.ma,
        ten: line.ten,
        donViTinh: line.donViTinh,
        soLuong: 0,
        lastExportedAt: null,
      };
      prev.soLuong += Number(line.soLuong) || 0;
      prev.ten = prev.ten || line.ten;
      prev.ma = prev.ma || line.ma;
      if (!prev.lastExportedAt && doc.createdAt) {
        prev.lastExportedAt = doc.createdAt;
      }
      byKhoa.set(key, prev);
    });
  });
  return [...byKhoa.values()];
};

const listXuatKhoLichSu = async (req, res) => {
  const khoaBaoGia = String(req.query.khoaBaoGia || '').trim().toUpperCase();
  const soBaoGia = String(req.query.soBaoGia || '').trim().toUpperCase();
  if (!khoaBaoGia && !soBaoGia) {
    return res.status(400).json({ message: 'Thiếu khoaBaoGia hoặc soBaoGia' });
  }

  const filter = khoaBaoGia
    ? { khoaBaoGia, ghiSo: true }
    : { soBaoGia, ghiSo: true };
  const items = await RoPartExport.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({
    khoaBaoGia: khoaBaoGia || items[0]?.khoaBaoGia || '',
    soBaoGia: soBaoGia || items[0]?.soBaoGia || '',
    items,
    summary: buildHistorySummary(items),
  });
};

const writeXuatKhoLog = async ({ req, payload, result, error } = {}) => {
  const user = req.user;
  const failed = Boolean(error);
  const errorMessage = String(error?.message || error?.detail || '').trim();
  const statusCode = Number(error?.status) || (failed ? 502 : 200);
  const lines = Array.isArray(result?.lines) && result.lines.length
    ? result.lines
    : (Array.isArray(payload?.lines) ? payload.lines : []);
  const khoaBaoGia = result?.khoaBaoGia || payload.khoaBaoGia || '';
  const soXe = result?.soXe || payload.soXe || '';
  const soBaoGia = result?.soBaoGia || payload.soBaoGia || '';
  const soChungTu = result?.soChungTu || '';
  const targetLabel =
    [soXe, soBaoGia || khoaBaoGia].filter(Boolean).join(' · ') || khoaBaoGia || 'xuất kho';
  const actor = user?.fullName || user?.username || 'Khách';
  const details = [
    failed ? 'Kết quả: Không thực hiện được' : 'Kết quả: Thành công',
    `Thao tác: Xuất kho phụ tùng`,
    failed && errorMessage ? `Lý do: ${errorMessage}` : null,
    khoaBaoGia ? `Báo giá: ${khoaBaoGia}` : null,
    soBaoGia ? `RO: ${soBaoGia}` : null,
    soXe ? `Biển số: ${soXe}` : null,
    result?.khoaKho || payload?.khoaKho ? `Kho: ${result?.khoaKho || payload.khoaKho}` : null,
    `Số dòng: ${lines.length}`,
    ...lines.slice(0, 12).map((line) => {
      const ten = line.ten || line.ma || line.khoaHangHoa;
      return `• ${ten} × ${line.soLuong}`;
    }),
  ].filter(Boolean);

  return createManualOperationLog({
    user: user?._id || null,
    username: user?.username || '',
    fullName: user?.fullName || 'Khách (tải ảnh)',
    role: user?.role || '',
    action: 'xuat_kho',
    module: 'xuat_kho',
    targetId: khoaBaoGia || soXe,
    targetLabel,
    description: failed
      ? `${actor}: Xuất kho không thực hiện được — ${targetLabel}${errorMessage ? `. ${errorMessage}` : ''}`
      : `${actor}: Xuất ${lines.length} phụ tùng — ${targetLabel}`,
    metadata: {
      success: !failed,
      ghiSo: !failed && Boolean(result?.ghiSo),
      khoaBaoGia,
      soXe,
      soBaoGia,
      soChungTu,
      khoa: result?.khoa || '',
      khoaKho: result?.khoaKho || payload?.khoaKho || '',
      ngayChungTu: result?.ngayChungTu || payload?.ngayChungTu || '',
      tongTienVon: result?.tongTienVon || 0,
      lineCount: lines.length,
      lines: lines.map((line) => ({
        khoaHangHoa: line.khoaHangHoa,
        ma: line.ma,
        ten: line.ten,
        soLuong: line.soLuong,
        thieuTon: Boolean(line.thieuTon),
      })),
      details,
      errorMessage,
      statusCode,
      requestBody: payload,
      source: 'upload-image',
    },
  });
};

const todayVn = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const buildXuatKhoSpecBody = (body = {}) => {
  const khoaBaoGia = String(body.khoaBaoGia || '').trim();
  const soXe = String(body.soXe || body.plateNumber || '').trim().replace(/\s/g, '');
  const payload = {
    khoaKho: resolveKhoaKho(body.khoaKho),
    ngayChungTu: String(body.ngayChungTu || '').trim() || todayVn(),
    lines: (Array.isArray(body.lines) ? body.lines : [])
      .map((line) => ({
        khoaHangHoa: String(line?.khoaHangHoa || '').trim(),
        soLuong: Number(line?.soLuong),
      }))
      .filter((line) => line.khoaHangHoa && Number.isFinite(line.soLuong) && line.soLuong > 0),
    dryRun: body.dryRun === true,
  };
  if (khoaBaoGia) payload.khoaBaoGia = khoaBaoGia;
  else if (soXe) payload.soXe = soXe;
  return payload;
};

const xuatKho = async (req, res) => {
  if (!requireApiKey(res)) return;
  try {
    const body = req.body || {};
    const soBaoGia = String(body.soBaoGia || body.roCode || '').trim().toUpperCase();
    const specBody = buildXuatKhoSpecBody(body);

    const { data } = await axios.post(XUAT_KHO_URL, specBody, {
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    const savedLines = Array.isArray(data?.lines) && data.lines.length ? data.lines : specBody.lines;
    const record = await RoPartExport.create({
      khoaBaoGia: data?.khoaBaoGia || specBody.khoaBaoGia || '',
      soBaoGia: data?.soBaoGia || soBaoGia,
      soXe: data?.soXe || specBody.soXe || '',
      khoaKho: data?.khoaKho || specBody.khoaKho,
      soChungTu: data?.soChungTu || '',
      khoaChungTu: data?.khoa || '',
      ghiSo: true,
      warehouseMessage: '',
      lines: savedLines,
      createdByName: req.user?.fullName || req.user?.username || 'Khách (tải ảnh)',
      source: 'upload-image',
    });

    const result = {
      ghiSo: true,
      khoaBaoGia: record.khoaBaoGia,
      soBaoGia: record.soBaoGia,
      soXe: record.soXe,
      soChungTu: record.soChungTu,
      khoaKho: record.khoaKho,
      lines: savedLines,
      localId: String(record._id),
      createdAt: record.createdAt,
      requestBody: specBody,
    };

    writeXuatKhoLog({ req, payload: specBody, result }).catch(() => {});

    return res.json(result);
  } catch (error) {
    const { status, message, data } = extractProblem(error);
    const code = status >= 400 && status < 600 ? status : 502;

    const body = req.body || {};
    const specBody = buildXuatKhoSpecBody(body);
    const soBaoGia = String(body.soBaoGia || body.roCode || '').trim().toUpperCase();
    writeXuatKhoLog({
      req,
      payload: specBody,
      result: {
        khoaBaoGia: specBody.khoaBaoGia || '',
        soXe: specBody.soXe || '',
        soBaoGia,
        khoaKho: specBody.khoaKho,
        lines: normalizeLines(body.lines),
      },
      error: { message, detail: data?.detail || message, status: code },
    }).catch(() => {});

    return res.status(code).json({
      message,
      title: data?.title || 'Không thể xuất kho',
      detail: data?.detail || message,
      status: code,
    });
  }
};

const luuXuatTheoRo = async (req, res) => {
  try {
    const body = req.body || {};
    const khoaBaoGia = String(body.khoaBaoGia || '').trim().toUpperCase();
    const soXe = String(body.soXe || body.plateNumber || '').trim().toUpperCase().replace(/\s/g, '');
    const soBaoGia = String(body.soBaoGia || body.roCode || '').trim().toUpperCase();
    if (!khoaBaoGia) {
      return res.status(400).json({ message: 'Thiếu khoaBaoGia' });
    }

    const lines = normalizeLines(body.lines);
    if (!lines.length) {
      return res.status(400).json({ message: 'Hãy quét mã hàng hóa cần xuất.' });
    }

    const record = await RoPartExport.create({
      khoaBaoGia,
      soBaoGia,
      soXe,
      khoaKho: '',
      soChungTu: '',
      khoaChungTu: '',
      ghiSo: false,
      warehouseMessage: '',
      lines,
      createdByName: req.user?.fullName || req.user?.username || 'Khách (tải ảnh)',
      source: 'upload-image',
    });

    const result = {
      khoaBaoGia: record.khoaBaoGia,
      soBaoGia: record.soBaoGia,
      soXe: record.soXe,
      lines: record.lines,
      localId: String(record._id),
      createdAt: record.createdAt,
    };

    writeXuatKhoLog({
      req,
      payload: { khoaBaoGia, soXe, soBaoGia, lines },
      result,
    }).catch(() => {});

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Không lưu được phiếu xuất.' });
  }
};

module.exports = {
  listHanghoa,
  getHanghoa,
  lookupHanghoa,
  listXuatKhoLichSu,
  luuXuatTheoRo,
  xuatKho,
};
