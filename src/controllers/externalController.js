const axios = require('axios');

const EXTERNAL_BASE = 'http://local.otobathanh.vn/api';
const API_KEY = process.env.OTO_API_KEY;

const headers = {
  'X-Api-Key': API_KEY,
};

const normalizePlate = (plate = '') =>
  String(plate).toUpperCase().replace(/\s/g, '');

const fetchVehicleInfo = async (plate) => {
  const normalized = normalizePlate(plate);
  if (!normalized) return null;

  const xeRes = await axios.get(`${EXTERNAL_BASE}/xe/${normalized}`, { headers });
  return xeRes.data;
};

const fetchLatestQuote = async (plate) => {
  const normalized = normalizePlate(plate);
  if (!normalized) return null;

  try {
    const bgRes = await axios.get(
      `${EXTERNAL_BASE}/xe/${normalized}/baogia-gan-nhat`,
      { headers }
    );
    return bgRes.data;
  } catch {
    return null;
  }
};

const buildRawPayload = async ({ plate, baogiaGanNhat }) => {
  let vehicle = null;

  try {
    vehicle = await fetchVehicleInfo(plate);
  } catch {
    vehicle = null;
  }

  return {
    ...(vehicle || {}),
    baogiaGanNhat,
  };
};

const resolvePlateNumber = (plate, vehicle, quote) =>
  normalizePlate(
    plate
    || vehicle?.soXeTimKiem
    || vehicle?.soXe
    || quote?.header?.soXe
    || ''
  );

const lookupCarOrRO = async (req, res) => {
  try {
    const keyword = String(req.params.keyword || '').trim().toUpperCase();
    const plateQuery = normalizePlate(req.query.plate || '');

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu từ khóa tìm kiếm',
      });
    }

    if (keyword.startsWith('RO')) {
      if (!plateQuery) {
        return res.status(400).json({
          success: false,
          message: 'Tìm theo RO cần nhập kèm biển số xe',
        });
      }

      const roRes = await axios.get(
        `${EXTERNAL_BASE}/xe/${plateQuery}/${keyword}`,
        { headers }
      );

      const raw = await buildRawPayload({
        plate: plateQuery,
        baogiaGanNhat: roRes.data,
      });

      return res.json({
        success: true,
        type: 'ro',
        plateNumber: resolvePlateNumber(plateQuery, raw, roRes.data),
        selectedRO: keyword,
        raw,
      });
    }

    if (keyword.startsWith('TT')) {
      const quoteRes = await axios.get(`${EXTERNAL_BASE}/baogia/${keyword}`, {
        headers,
      });

      const plate = resolvePlateNumber('', null, quoteRes.data);
      const raw = await buildRawPayload({
        plate,
        baogiaGanNhat: quoteRes.data,
      });

      return res.json({
        success: true,
        type: 'tt',
        plateNumber: resolvePlateNumber(plate, raw, quoteRes.data),
        selectedRO: quoteRes.data?.header?.khoa || keyword,
        raw,
      });
    }

    const plate = normalizePlate(keyword);
    const vehicle = await fetchVehicleInfo(plate);
    const baogiaGanNhat = await fetchLatestQuote(plate);

    return res.json({
      success: true,
      type: 'plate',
      plateNumber: resolvePlateNumber(plate, vehicle, baogiaGanNhat),
      selectedRO:
        baogiaGanNhat?.header?.soChungtu
        || baogiaGanNhat?.header?.khoa
        || vehicle?.khoaBaoGiaGanNhat
        || '',
      raw: {
        ...(vehicle || {}),
        baogiaGanNhat,
      },
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy biển số hoặc RO',
      error: error.response?.data || error.message,
    });
  }
};

const fetchRepairDetailsForCar = async (plateNumber, roCode = '') => {
  const plate = normalizePlate(plateNumber);
  const ro = String(roCode || '').trim().toUpperCase();

  let baogiaGanNhat = null;

  if (ro.startsWith('RO')) {
    const roRes = await axios.get(`${EXTERNAL_BASE}/xe/${plate}/${ro}`, { headers });
    baogiaGanNhat = roRes.data;
  } else {
    baogiaGanNhat = await fetchLatestQuote(plate);
  }

  const chiTiet = (baogiaGanNhat?.chiTiet || []).filter((x) => x.huy !== 1);

  return { chiTiet, baogiaGanNhat };
};

module.exports = {
  lookupCarOrRO,
  fetchRepairDetailsForCar,
};
