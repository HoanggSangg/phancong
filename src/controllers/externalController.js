const axios = require('axios');

const EXTERNAL_BASE = 'http://local.otobathanh.vn/api';
const API_KEY = process.env.OTO_API_KEY;

const headers = {
  'X-Api-Key': API_KEY,
};

const normalizePlate = (plate = '') =>
  String(plate).toUpperCase().replace(/\s/g, '');

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

    // =========================
    // 1. Tìm theo số RO: RO26010011
    // cần kèm biển số: ?plate=51G18419
    // gọi ngoài: /xe/51G18419/RO26010011
    // =========================
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

      return res.json({
        success: true,
        type: 'ro',
        plateNumber: plateQuery,
        selectedRO: keyword,
        raw: {
          baogiaGanNhat: roRes.data,
        },
      });
    }

    // =========================
    // 2. Tìm theo mã báo giá TT...
    // gọi ngoài: /baogia/TT0000000000198
    // =========================
    if (keyword.startsWith('TT')) {
      const roRes = await axios.get(`${EXTERNAL_BASE}/baogia/${keyword}`, {
        headers,
      });

      return res.json({
        success: true,
        type: 'tt',
        plateNumber: roRes.data?.header?.soXe?.replace(/\s/g, '') || '',
        selectedRO: roRes.data?.header?.khoa || keyword,
        raw: {
          baogiaGanNhat: roRes.data,
        },
      });
    }

    // =========================
    // 3. Tìm theo biển số
    // gọi ngoài:
    // /xe/{bienso}
    // /xe/{bienso}/baogia-gan-nhat
    // =========================
    const plate = normalizePlate(keyword);

    const xeRes = await axios.get(`${EXTERNAL_BASE}/xe/${plate}`, {
      headers,
    });

    let baogiaGanNhat = null;

    try {
      const bgRes = await axios.get(
        `${EXTERNAL_BASE}/xe/${plate}/baogia-gan-nhat`,
        { headers }
      );

      baogiaGanNhat = bgRes.data;
    } catch (err) {
      baogiaGanNhat = null;
    }

    return res.json({
      success: true,
      type: 'plate',
      plateNumber:
        xeRes.data?.soXeTimKiem ||
        xeRes.data?.soXe?.replace(/\s/g, '') ||
        plate,
      selectedRO:
        baogiaGanNhat?.header?.soChungtu ||
        baogiaGanNhat?.header?.khoa ||
        xeRes.data?.khoaBaoGiaGanNhat ||
        '',
      raw: {
        ...xeRes.data,
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
    try {
      const bgRes = await axios.get(
        `${EXTERNAL_BASE}/xe/${plate}/baogia-gan-nhat`,
        { headers }
      );
      baogiaGanNhat = bgRes.data;
    } catch {
      baogiaGanNhat = null;
    }
  }

  const chiTiet = (baogiaGanNhat?.chiTiet || []).filter((x) => x.huy !== 1);

  return { chiTiet, baogiaGanNhat };
};

module.exports = {
  lookupCarOrRO,
  fetchRepairDetailsForCar,
};