const moment = require('moment-timezone');
const Worker = require('../models/Worker');
const MonthlyPayroll = require('../models/MonthlyPayroll');
const { buildWorkerRevenueFromRepairItems } = require('./wokerController');
const {
  calculatePayrollRow,
  getDefaultProductivityRates,
  roundVnd,
} = require('../utils/salaryCalc');
const {
  getSalarySettings,
  saveSalarySettings,
} = require('../utils/salarySettings');

const TZ = 'Asia/Ho_Chi_Minh';

const parseYearMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { error: 'Năm không hợp lệ' };
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { error: 'Tháng không hợp lệ' };
  }
  return { year: y, month: m };
};

const getMonthDateRange = (year, month) => {
  const fromDate = moment.tz({ year, month: month - 1, day: 1 }, TZ).startOf('day').toDate();
  const toDate = moment.tz({ year, month: month - 1, day: 1 }, TZ).endOf('month').endOf('day').toDate();
  const from = moment(fromDate).tz(TZ).format('YYYY-MM-DD');
  const to = moment(toDate).tz(TZ).format('YYYY-MM-DD');
  return { fromDate, toDate, from, to };
};

const normalizeProfile = (profile = {}, settings = {}) => {
  const chucVu = String(profile.chucVu || '').trim();
  const defaults = getDefaultProductivityRates(chucVu, settings);
  return {
    boPhan: String(profile.boPhan || '').trim(),
    chucVu,
    luongCoBan: roundVnd(profile.luongCoBan),
    doanhThuDinhMuc: roundVnd(profile.doanhThuDinhMuc),
    tyLeDatDinhMuc:
      profile.tyLeDatDinhMuc != null && profile.tyLeDatDinhMuc !== ''
        ? Number(profile.tyLeDatDinhMuc)
        : defaults.tyLeDatDinhMuc,
    tyLeVuotDinhMuc:
      profile.tyLeVuotDinhMuc != null && profile.tyLeVuotDinhMuc !== ''
        ? Number(profile.tyLeVuotDinhMuc)
        : defaults.tyLeVuotDinhMuc,
    thamGiaBaoHiem: profile.thamGiaBaoHiem === true,
    mucLuongDongBaoHiem: roundVnd(profile.mucLuongDongBaoHiem),
  };
};

/** Bộ phận = tên tổ; chức vụ = TT|KTV từ teamRole → %NS mặc định theo chức vụ */
const resolveProfileFromTeam = (worker, settings) => {
  const base = normalizeProfile(worker.salaryProfile || {}, settings);
  const teamName = worker.team?.name ? String(worker.team.name).trim() : '';
  if (!teamName && !worker.team) {
    return base;
  }

  const teamRole = worker.teamRole === 'TT' ? 'TT' : 'KTV';
  const defaults = getDefaultProductivityRates(teamRole, settings);

  return {
    ...base,
    boPhan: teamName || base.boPhan,
    chucVu: teamRole,
    tyLeDatDinhMuc: defaults.tyLeDatDinhMuc,
    tyLeVuotDinhMuc: defaults.tyLeVuotDinhMuc,
  };
};

const buildRowFromWorker = (worker, revenueMap, settings) => {
  const profile = resolveProfileFromTeam(worker, settings);
  const rev = revenueMap.get(String(worker._id)) || { revenueBeforeCommission: 0 };
  const input = {
    ...profile,
    name: worker.name,
    soBaoDanh: worker.soBaoDanh,
    doanhThuThang: roundVnd(rev.revenueBeforeCommission),
    soCongHoTro: 0,
  };
  const computed = calculatePayrollRow(input, settings);
  return {
    worker: worker._id,
    name: worker.name,
    soBaoDanh: worker.soBaoDanh || '',
    boPhan: profile.boPhan,
    chucVu: profile.chucVu,
    luongCoBan: profile.luongCoBan,
    doanhThuDinhMuc: profile.doanhThuDinhMuc,
    doanhThuThang: input.doanhThuThang,
    soCongHoTro: 0,
    tienCongHoTroOverride: null,
    tyLeDatDinhMuc: profile.tyLeDatDinhMuc,
    tyLeVuotDinhMuc: profile.tyLeVuotDinhMuc,
    phuCapTrachNhiem: 0,
    thuongSoLuongXe: 0,
    phuCapDienThoai: 0,
    phuCapXangXe: 0,
    phuCapChuyenCan: 0,
    phuCapBaoCaoNgay: 0,
    phuCapBaoVeTaiSan: 0,
    phuCapVeSinh: 0,
    phuCapTayNghe: 0,
    tienComTrua: 0,
    tienTangCa: 0,
    congTacXa: 0,
    hoTroBaoGiaThau: 0,
    hoTroSuaChuaLai: 0,
    hoTroCongViecDacBiet: 0,
    tienCuuPan: 0,
    tienHoTroKhac: 0,
    tienThuongKhac: 0,
    truThieuTrachNhiem: 0,
    truChatLuong: 0,
    truHuHong: 0,
    truViPhamNoiQuy: 0,
    truNghiVuotPhep: 0,
    truThueTNCN: 0,
    truTamUng: 0,
    truCongNo: 0,
    truKhac: 0,
    ghiChuTru: '',
    thamGiaBaoHiem: profile.thamGiaBaoHiem,
    mucLuongDongBaoHiem: profile.mucLuongDongBaoHiem,
    computed,
  };
};

const applyComputedToRow = (row, settings) => {
  const plain = typeof row.toObject === 'function' ? row.toObject() : { ...row };
  const computed = calculatePayrollRow(plain, settings);
  return {
    ...plain,
    computed,
  };
};

const serializePayroll = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: plain._id,
    year: plain.year,
    month: plain.month,
    status: plain.status,
    rows: plain.rows || [],
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    totals: summarizeRows(plain.rows || []),
  };
};

const summarizeRows = (rows = []) => {
  const keys = [
    'doanhThuThang',
    'tienCongHoTro',
    'tongDoanhThu',
    'luongNangSuat',
    'tongCongThem',
    'tongPhat',
    'tongBaoHiem',
    'tongThuNhap',
    'tongKhauTru',
    'luongThucNhan',
    'luongCoBan',
  ];
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  rows.forEach((row) => {
    const c = row.computed || {};
    totals.doanhThuThang += roundVnd(row.doanhThuThang ?? c.doanhThuThang);
    totals.tienCongHoTro += roundVnd(c.tienCongHoTro);
    totals.tongDoanhThu += roundVnd(c.tongDoanhThu);
    totals.luongNangSuat += roundVnd(c.luongNangSuat);
    totals.tongCongThem += roundVnd(c.tongCongThem);
    totals.tongPhat += roundVnd(c.tongPhat);
    totals.tongBaoHiem += roundVnd(c.tongBaoHiem);
    totals.tongThuNhap += roundVnd(c.tongThuNhap);
    totals.tongKhauTru += roundVnd(c.tongKhauTru);
    totals.luongThucNhan += roundVnd(c.luongThucNhan);
    totals.luongCoBan += roundVnd(row.luongCoBan ?? c.luongCoBan);
  });
  return totals;
};

const loadRevenueMap = async (year, month) => {
  const { fromDate, toDate, from, to } = getMonthDateRange(year, month);
  const data = await buildWorkerRevenueFromRepairItems(fromDate, toDate);
  const map = new Map();
  data.forEach((item) => {
    map.set(String(item.workerId), item);
  });
  return { map, from, to };
};

const getOrCreatePayroll = async (year, month) => {
  let doc = await MonthlyPayroll.findOne({ year, month });
  if (doc) return doc;

  const settings = await getSalarySettings();
  const { map } = await loadRevenueMap(year, month);
  const workers = await Worker.find()
    .select('name soBaoDanh salaryProfile team teamRole')
    .populate('team', 'name')
    .sort({ name: 1 });
  const rows = workers.map((w) => buildRowFromWorker(w, map, settings));

  doc = await MonthlyPayroll.create({
    year,
    month,
    status: 'draft',
    rows,
  });
  return doc;
};

const getSettings = async (req, res) => {
  try {
    const settings = await getSalarySettings();
    return res.json({ message: 'OK', data: settings });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const data = await saveSalarySettings(req.body || {});
    return res.json({ message: 'Đã lưu cấu hình lương', data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getWorkerProfiles = async (req, res) => {
  try {
    const settings = await getSalarySettings();
    const workers = await Worker.find()
      .select('name soBaoDanh avatar team teamRole salaryProfile countRevenue')
      .populate('team', 'name')
      .sort({ name: 1 })
      .lean();

    const data = workers.map((w) => ({
      ...w,
      salaryProfile: resolveProfileFromTeam(w, settings),
    }));

    return res.json({ message: 'OK', data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const updateWorkerProfile = async (req, res) => {
  try {
    const settings = await getSalarySettings();
    const profile = normalizeProfile(req.body || {}, settings);
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      { salaryProfile: profile },
      { new: true }
    ).select('name soBaoDanh salaryProfile');

    if (!worker) {
      return res.status(404).json({ message: 'Không tìm thấy thợ' });
    }

    return res.json({
      message: 'Đã lưu hồ sơ lương thợ',
      data: {
        _id: worker._id,
        name: worker.name,
        soBaoDanh: worker.soBaoDanh,
        salaryProfile: normalizeProfile(worker.salaryProfile || {}, settings),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getMonthlyPayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const doc = await getOrCreatePayroll(parsed.year, parsed.month);
    const { from, to } = getMonthDateRange(parsed.year, parsed.month);
    const settings = await getSalarySettings();

    return res.json({
      message: 'OK',
      from,
      to,
      settings,
      data: serializePayroll(doc),
    });
  } catch (err) {
    console.error('getMonthlyPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

const ROW_INPUT_FIELDS = [
  'boPhan', 'chucVu', 'luongCoBan', 'doanhThuDinhMuc', 'doanhThuThang',
  'soCongHoTro', 'tienCongHoTroOverride',
  'tyLeDatDinhMuc', 'tyLeVuotDinhMuc',
  'phuCapTrachNhiem', 'thuongSoLuongXe', 'phuCapDienThoai', 'phuCapXangXe',
  'phuCapChuyenCan', 'phuCapBaoCaoNgay', 'phuCapBaoVeTaiSan', 'phuCapVeSinh',
  'phuCapTayNghe', 'tienComTrua', 'tienTangCa', 'congTacXa', 'hoTroBaoGiaThau',
  'hoTroSuaChuaLai', 'hoTroCongViecDacBiet', 'tienCuuPan', 'tienHoTroKhac',
  'tienThuongKhac',
  'truThieuTrachNhiem', 'truChatLuong', 'truHuHong', 'truViPhamNoiQuy',
  'truNghiVuotPhep', 'truThueTNCN', 'truTamUng', 'truCongNo', 'truKhac',
  'ghiChuTru', 'thamGiaBaoHiem', 'mucLuongDongBaoHiem',
];

const mergeRowInput = (existing, incoming = {}) => {
  const next = typeof existing.toObject === 'function' ? existing.toObject() : { ...existing };
  ROW_INPUT_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      next[key] = incoming[key];
    }
  });
  if (incoming.name != null) next.name = incoming.name;
  return next;
};

const saveMonthlyPayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const settings = await getSalarySettings();
    let doc = await MonthlyPayroll.findOne({ year: parsed.year, month: parsed.month });
    if (!doc) {
      doc = await getOrCreatePayroll(parsed.year, parsed.month);
    }

    const body = req.body || {};
    if (Array.isArray(body.rows)) {
      const byWorker = new Map(
        body.rows.map((r) => [String(r.worker || r.workerId), r])
      );

      doc.rows = doc.rows.map((row) => {
        const incoming = byWorker.get(String(row.worker));
        const merged = incoming ? mergeRowInput(row, incoming) : (
          typeof row.toObject === 'function' ? row.toObject() : { ...row }
        );
        return applyComputedToRow(merged, settings);
      });

      // Thêm thợ mới nếu client gửi worker chưa có trong bảng
      for (const [workerId, incoming] of byWorker.entries()) {
        const exists = doc.rows.some((r) => String(r.worker) === workerId);
        if (!exists && workerId && workerId !== 'undefined') {
          const merged = mergeRowInput({
            worker: workerId,
            name: incoming.name || '',
            soBaoDanh: incoming.soBaoDanh || '',
          }, incoming);
          doc.rows.push(applyComputedToRow(merged, settings));
        }
      }
    }

    if (body.status === 'saved' || body.status === 'draft') {
      doc.status = body.status;
    } else {
      doc.status = 'saved';
    }

    // Đồng bộ profile bền theo thợ từ các field cấu hình trong bảng
    const profileOps = doc.rows.map((row) =>
      Worker.updateOne(
        { _id: row.worker },
        {
          $set: {
            'salaryProfile.boPhan': row.boPhan || '',
            'salaryProfile.chucVu': row.chucVu || '',
            'salaryProfile.luongCoBan': roundVnd(row.luongCoBan),
            'salaryProfile.doanhThuDinhMuc': roundVnd(row.doanhThuDinhMuc),
            'salaryProfile.tyLeDatDinhMuc': row.tyLeDatDinhMuc,
            'salaryProfile.tyLeVuotDinhMuc': row.tyLeVuotDinhMuc,
            'salaryProfile.thamGiaBaoHiem': row.thamGiaBaoHiem === true,
            'salaryProfile.mucLuongDongBaoHiem': roundVnd(row.mucLuongDongBaoHiem),
          },
        }
      )
    );
    await Promise.all(profileOps);

    await doc.save();

    return res.json({
      message: 'Đã lưu bảng lương',
      data: serializePayroll(doc),
      settings,
    });
  } catch (err) {
    console.error('saveMonthlyPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

const refreshRevenue = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const settings = await getSalarySettings();
    let doc = await MonthlyPayroll.findOne({ year: parsed.year, month: parsed.month });
    if (!doc) {
      doc = await getOrCreatePayroll(parsed.year, parsed.month);
    }

    const { map, from, to } = await loadRevenueMap(parsed.year, parsed.month);
    const existingByWorker = new Map(doc.rows.map((r) => [String(r.worker), r]));

    const workers = await Worker.find()
      .select('name soBaoDanh salaryProfile team teamRole')
      .populate('team', 'name')
      .sort({ name: 1 });
    const nextRows = workers.map((worker) => {
      const existing = existingByWorker.get(String(worker._id));
      const rev = map.get(String(worker._id));
      const doanhThuThang = roundVnd(rev?.revenueBeforeCommission || 0);
      const fromTeam = resolveProfileFromTeam(worker, settings);

      if (existing) {
        const plain = typeof existing.toObject === 'function' ? existing.toObject() : { ...existing };
        plain.doanhThuThang = doanhThuThang;
        plain.name = worker.name;
        plain.soBaoDanh = worker.soBaoDanh || plain.soBaoDanh;
        // Đồng bộ bộ phận / chức vụ / %NS từ tổ
        plain.boPhan = fromTeam.boPhan;
        plain.chucVu = fromTeam.chucVu;
        plain.tyLeDatDinhMuc = fromTeam.tyLeDatDinhMuc;
        plain.tyLeVuotDinhMuc = fromTeam.tyLeVuotDinhMuc;
        return applyComputedToRow(plain, settings);
      }

      return buildRowFromWorker(worker, map, settings);
    });

    doc.rows = nextRows;
    await doc.save();

    return res.json({
      message: 'Đã cập nhật doanh thu tháng',
      from,
      to,
      data: serializePayroll(doc),
      settings,
    });
  } catch (err) {
    console.error('refreshRevenue:', err);
    return res.status(500).json({ message: err.message });
  }
};

const recalculatePayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const settings = await getSalarySettings();
    let doc = await MonthlyPayroll.findOne({ year: parsed.year, month: parsed.month });
    if (!doc) {
      doc = await getOrCreatePayroll(parsed.year, parsed.month);
    }

    const workers = await Worker.find()
      .select('name soBaoDanh salaryProfile team teamRole')
      .populate('team', 'name');
    const byId = new Map(workers.map((w) => [String(w._id), w]));

    doc.rows = doc.rows.map((row) => {
      const plain = typeof row.toObject === 'function' ? row.toObject() : { ...row };
      const worker = byId.get(String(plain.worker));
      if (worker) {
        const fromTeam = resolveProfileFromTeam(worker, settings);
        plain.boPhan = fromTeam.boPhan;
        plain.chucVu = fromTeam.chucVu;
        plain.tyLeDatDinhMuc = fromTeam.tyLeDatDinhMuc;
        plain.tyLeVuotDinhMuc = fromTeam.tyLeVuotDinhMuc;
      }
      return applyComputedToRow(plain, settings);
    });
    await doc.save();

    return res.json({
      message: 'Đã tính lại bảng lương (đã đồng bộ chức vụ từ tổ)',
      data: serializePayroll(doc),
      settings,
    });
  } catch (err) {
    console.error('recalculatePayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Tổng lương năm: lương thực nhận từng tháng của mọi thợ.
 * Chỉ đọc các bảng tháng đã có — không tạo payroll mới (tránh lag).
 */
const getAnnualPayroll = async (req, res) => {
  try {
    const year = Number(req.params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: 'Năm không hợp lệ' });
    }

    const [workers, docs] = await Promise.all([
      Worker.find()
        .select('name soBaoDanh team teamRole salaryProfile')
        .populate('team', 'name')
        .sort({ name: 1 })
        .lean(),
      MonthlyPayroll.find({ year })
        .select('month status rows.worker rows.name rows.soBaoDanh rows.boPhan rows.chucVu rows.computed')
        .lean(),
    ]);

    const byWorker = new Map();

    const ensureRow = (workerId, seed = {}) => {
      const id = String(workerId);
      if (!byWorker.has(id)) {
        byWorker.set(id, {
          workerId: id,
          name: seed.name || '',
          soBaoDanh: seed.soBaoDanh || '',
          boPhan: seed.boPhan || '',
          chucVu: seed.chucVu || '',
          months: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), 0])),
          total: 0,
        });
      }
      return byWorker.get(id);
    };

    workers.forEach((w) => {
      const teamRole = w.teamRole === 'TT' ? 'TT' : (w.salaryProfile?.chucVu || 'KTV');
      ensureRow(w._id, {
        name: w.name || '',
        soBaoDanh: w.soBaoDanh || '',
        boPhan: w.team?.name || w.salaryProfile?.boPhan || '',
        chucVu: teamRole,
      });
    });

    const monthsAvailable = [];
    const monthTotals = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [String(i + 1), 0])
    );

    docs.forEach((doc) => {
      const m = Number(doc.month);
      if (!Number.isInteger(m) || m < 1 || m > 12) return;
      monthsAvailable.push(m);
      const key = String(m);

      (doc.rows || []).forEach((row) => {
        if (!row?.worker) return;
        const entry = ensureRow(row.worker, {
          name: row.name,
          soBaoDanh: row.soBaoDanh,
          boPhan: row.boPhan,
          chucVu: row.chucVu,
        });

        // Ưu tiên snapshot mới nhất từ bảng tháng
        if (row.name) entry.name = row.name;
        if (row.soBaoDanh) entry.soBaoDanh = row.soBaoDanh;
        if (row.boPhan) entry.boPhan = row.boPhan;
        if (row.chucVu) entry.chucVu = row.chucVu;

        const amount = roundVnd(row.computed?.luongThucNhan);
        entry.months[key] = amount;
        monthTotals[key] += amount;
      });
    });

    const rows = Array.from(byWorker.values())
      .map((row) => {
        const total = Object.values(row.months).reduce((sum, v) => sum + roundVnd(v), 0);
        return { ...row, total: roundVnd(total) };
      })
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));

    const yearTotal = rows.reduce((sum, row) => sum + row.total, 0);

    return res.json({
      message: 'OK',
      year,
      monthsAvailable: [...new Set(monthsAvailable)].sort((a, b) => a - b),
      data: {
        rows,
        totals: {
          months: monthTotals,
          luongThucNhan: roundVnd(yearTotal),
        },
      },
    });
  } catch (err) {
    console.error('getAnnualPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getWorkerProfiles,
  updateWorkerProfile,
  getMonthlyPayroll,
  saveMonthlyPayroll,
  refreshRevenue,
  recalculatePayroll,
  getAnnualPayroll,
};
