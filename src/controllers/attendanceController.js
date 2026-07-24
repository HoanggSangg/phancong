const moment = require('moment-timezone');
const Worker = require('../models/Worker');
const AttendanceDay = require('../models/AttendanceDay');
const DayWorkPayroll = require('../models/DayWorkPayroll');
const {
  getAttendanceSettings,
  saveAttendanceSettings,
} = require('../utils/attendanceSettings');
const { getSalarySettings } = require('../utils/salarySettings');
const {
  TZ,
  roundVnd,
  STATUS_LIST,
  STATUS_META,
  isSundayDate,
  isHolidayDate,
  calcStandardWorkDays,
  calcDayHourRates,
  resolveDayAttendance,
  summarizeMonthAttendance,
  calculateDayWorkPayrollRow,
} = require('../utils/attendanceCalc');

const parseYearMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return { error: 'Năm không hợp lệ' };
  if (!Number.isInteger(m) || m < 1 || m > 12) return { error: 'Tháng không hợp lệ' };
  return { year: y, month: m };
};

const resolveWorkerMeta = (worker) => {
  const teamRole = worker.teamRole === 'TT' ? 'TT' : 'KTV';
  return {
    name: worker.name || '',
    soBaoDanh: worker.soBaoDanh || '',
    boPhan: worker.team?.name || worker.salaryProfile?.boPhan || '',
    chucVu: worker.teamRole === 'TT' || worker.teamRole === 'KTV'
      ? teamRole
      : (worker.salaryProfile?.chucVu || teamRole),
    luongCoBan: roundVnd(worker.salaryProfile?.luongCoBan),
    thamGiaBaoHiem: worker.salaryProfile?.thamGiaBaoHiem === true,
    mucLuongDongBaoHiem: roundVnd(worker.salaryProfile?.mucLuongDongBaoHiem),
  };
};

const getStatuses = async (_req, res) => {
  res.json({ message: 'OK', data: STATUS_LIST });
};

const getSettings = async (_req, res) => {
  try {
    const data = await getAttendanceSettings();
    return res.json({ message: 'OK', data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const data = await saveAttendanceSettings(req.body || {});
    return res.json({ message: 'Đã lưu cấu hình chấm công', data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const getMonthMeta = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const settings = await getAttendanceSettings();
    const standard = calcStandardWorkDays(parsed.year, parsed.month);
    const holidays = (settings.paidHolidays || []).filter((h) => {
      const [y, m] = h.date.split('-').map(Number);
      return y === parsed.year && m === parsed.month;
    });

    return res.json({
      message: 'OK',
      year: parsed.year,
      month: parsed.month,
      ...standard,
      hoursPerDay: settings.hoursPerDay,
      holidays,
      settings,
      statuses: STATUS_LIST,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Lịch chấm công 1 thợ trong tháng
 */
const getWorkerMonth = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const worker = await Worker.findById(req.params.workerId)
      .select('name soBaoDanh team teamRole salaryProfile')
      .populate('team', 'name')
      .lean();
    if (!worker) return res.status(404).json({ message: 'Không tìm thấy thợ' });

    const settings = await getAttendanceSettings();
    const standard = calcStandardWorkDays(parsed.year, parsed.month);
    const meta = resolveWorkerMeta(worker);
    const rates = calcDayHourRates(meta.luongCoBan, standard.ngayCongChuan, settings.hoursPerDay);

    const days = await AttendanceDay.find({
      worker: worker._id,
      year: parsed.year,
      month: parsed.month,
    }).lean();

    const byDate = new Map(days.map((d) => [d.date, d]));
    const daysInMonth = standard.daysInMonth;
    const calendar = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = moment
        .tz({ year: parsed.year, month: parsed.month - 1, day }, TZ)
        .format('YYYY-MM-DD');
      const existing = byDate.get(date);
      const sunday = isSundayDate(date);
      const holiday = isHolidayDate(date, settings.paidHolidays);

      if (existing) {
        const refreshed = resolveDayAttendance(
          {
            ...existing,
            date,
            year: parsed.year,
            month: parsed.month,
            luongGio: rates.luongGio,
            luongNgay: rates.luongNgay,
          },
          settings
        );
        calendar.push({
          ...existing,
          ...refreshed,
          _id: existing._id,
          persisted: true,
          statusLabel: STATUS_META[refreshed.status]?.label || refreshed.status,
          color: STATUS_META[refreshed.status]?.color || 'gray',
        });
      } else {
        const draft = resolveDayAttendance(
          {
            date,
            year: parsed.year,
            month: parsed.month,
            status: sunday ? 'sunday' : holiday ? 'holiday' : 'present',
            luongGio: rates.luongGio,
            luongNgay: rates.luongNgay,
          },
          settings
        );
        calendar.push({
          ...draft,
          worker: worker._id,
          persisted: false,
        });
      }
    }

    const persistedDays = calendar.filter((d) => d._id || d.persisted !== false);
    const summary = summarizeMonthAttendance(
      calendar.map((d) => ({
        ...d,
        luongGio: rates.luongGio,
        luongNgay: rates.luongNgay,
      })),
      {
        luongCoBan: meta.luongCoBan,
        ngayCongChuan: standard.ngayCongChuan,
        hoursPerDay: settings.hoursPerDay,
      }
    );

    return res.json({
      message: 'OK',
      worker: {
        _id: worker._id,
        ...meta,
      },
      year: parsed.year,
      month: parsed.month,
      ...standard,
      rates,
      settings,
      summary,
      days: calendar,
      persistedCount: persistedDays.length,
      statuses: STATUS_LIST,
    });
  } catch (err) {
    console.error('getWorkerMonth:', err);
    return res.status(500).json({ message: err.message });
  }
};

const buildResolvedDay = async (workerId, payload, settings, rates) => resolveDayAttendance(
  {
    ...payload,
    luongGio: rates.luongGio,
    luongNgay: rates.luongNgay,
    isHoliday: isHolidayDate(payload.date, settings.paidHolidays),
  },
  settings
);

/**
 * Ghi / cập nhật 1 hoặc nhiều ngày
 * body: { dates: ['YYYY-MM-DD'|number], status, lateMinutes, ... }
 */
const upsertDays = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const worker = await Worker.findById(req.params.workerId)
      .select('name soBaoDanh salaryProfile team teamRole')
      .populate('team', 'name');
    if (!worker) return res.status(404).json({ message: 'Không tìm thấy thợ' });

    const settings = await getAttendanceSettings();
    const standard = calcStandardWorkDays(parsed.year, parsed.month);
    const meta = resolveWorkerMeta(worker);
    const rates = calcDayHourRates(meta.luongCoBan, standard.ngayCongChuan, settings.hoursPerDay);

    const body = req.body || {};
    let dateList = [];

    if (Array.isArray(body.dates) && body.dates.length) {
      dateList = body.dates.map((d) => {
        if (typeof d === 'number') {
          return moment
            .tz({ year: parsed.year, month: parsed.month - 1, day: d }, TZ)
            .format('YYYY-MM-DD');
        }
        const s = String(d);
        if (/^\d{1,2}$/.test(s)) {
          return moment
            .tz({ year: parsed.year, month: parsed.month - 1, day: Number(s) }, TZ)
            .format('YYYY-MM-DD');
        }
        return s.slice(0, 10);
      });
    } else if (body.fromDate && body.toDate) {
      let cur = moment.tz(body.fromDate, 'YYYY-MM-DD', TZ);
      const end = moment.tz(body.toDate, 'YYYY-MM-DD', TZ);
      while (cur.isSameOrBefore(end, 'day')) {
        if (cur.year() === parsed.year && cur.month() + 1 === parsed.month) {
          dateList.push(cur.format('YYYY-MM-DD'));
        }
        cur = cur.add(1, 'day');
      }
    } else if (body.date) {
      dateList = [String(body.date).slice(0, 10)];
    }

    dateList = [...new Set(dateList)].filter((d) => {
      const m = moment.tz(d, 'YYYY-MM-DD', TZ);
      return m.isValid()
        && m.year() === parsed.year
        && m.month() + 1 === parsed.month;
    });

    if (!dateList.length) {
      return res.status(400).json({ message: 'Chưa chọn ngày hợp lệ' });
    }

    const results = [];
    for (const date of dateList) {
      const resolved = await buildResolvedDay(
        worker._id,
        {
          ...body,
          date,
          year: parsed.year,
          month: parsed.month,
        },
        settings,
        rates
      );

      const doc = await AttendanceDay.findOneAndUpdate(
        { worker: worker._id, date },
        {
          worker: worker._id,
          date,
          year: parsed.year,
          month: parsed.month,
          status: resolved.status,
          standardMinutes: resolved.standardMinutes,
          workedMinutes: resolved.workedMinutes,
          missingMinutes: resolved.missingMinutes,
          lateMinutes: resolved.lateMinutes,
          earlyLeaveMinutes: resolved.earlyLeaveMinutes,
          leaveMinutes: resolved.leaveMinutes,
          standardCheckIn: resolved.standardCheckIn,
          standardCheckOut: resolved.standardCheckOut,
          actualCheckIn: resolved.actualCheckIn,
          actualCheckOut: resolved.actualCheckOut,
          isPaidLeave: resolved.isPaidLeave,
          isSunday: resolved.isSunday,
          isHoliday: resolved.isHoliday,
          deductSalary: resolved.deductSalary,
          deductionAmount: resolved.deductionAmount,
          note: resolved.note,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      results.push(doc);
    }

    // Cập nhật LCB thợ nếu gửi kèm
    if (body.luongCoBan != null && body.luongCoBan !== '') {
      worker.salaryProfile = worker.salaryProfile || {};
      worker.salaryProfile.luongCoBan = roundVnd(body.luongCoBan);
      worker.markModified('salaryProfile');
      await worker.save();
    }

    return res.json({
      message: `Đã lưu ${results.length} ngày chấm công`,
      data: results,
    });
  } catch (err) {
    console.error('upsertDays:', err);
    return res.status(500).json({ message: err.message });
  }
};

const deleteDay = async (req, res) => {
  try {
    const date = String(req.params.date || '').slice(0, 10);
    const deleted = await AttendanceDay.findOneAndDelete({
      worker: req.params.workerId,
      date,
    });
    if (!deleted) return res.status(404).json({ message: 'Không có bản ghi ngày này' });
    return res.json({ message: 'Đã xóa chấm công ngày', data: deleted });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const listWorkers = async (req, res) => {
  try {
    const teamId = req.query.teamId;
    const filter = {};
    if (teamId) filter.team = teamId;

    const workers = await Worker.find(filter)
      .select('name soBaoDanh team teamRole salaryProfile')
      .populate('team', 'name')
      .sort({ name: 1 })
      .lean();

    return res.json({
      message: 'OK',
      data: workers.map((w) => ({
        _id: w._id,
        ...resolveWorkerMeta(w),
        teamId: w.team?._id || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const INPUT_MONEY_FIELDS = ['phuCap', 'thuong', 'tangCa', 'hoTro', 'baoHiem', 'phat', 'thue', 'tamUng', 'khauTruKhac'];

const buildDayWorkRow = (worker, summary, salarySettings, extras = {}) => {
  const meta = resolveWorkerMeta(worker);
  const input = {
    ...meta,
    ...summary,
    phuCap: extras.phuCap ?? 0,
    thuong: extras.thuong ?? 0,
    tangCa: extras.tangCa ?? 0,
    hoTro: extras.hoTro ?? 0,
    baoHiem: extras.baoHiem ?? 0,
    phat: extras.phat ?? 0,
    thue: extras.thue ?? 0,
    tamUng: extras.tamUng ?? 0,
    khauTruKhac: extras.khauTruKhac ?? 0,
    ghiChu: extras.ghiChu || '',
    thamGiaBaoHiem: extras.thamGiaBaoHiem ?? meta.thamGiaBaoHiem,
    mucLuongDongBaoHiem: extras.mucLuongDongBaoHiem ?? meta.mucLuongDongBaoHiem,
  };
  const computed = calculateDayWorkPayrollRow(input, {
    hoursPerDay: summary.hoursPerDay,
    bhxhRate: salarySettings.bhxhRate,
    bhytRate: salarySettings.bhytRate,
    bhtnRate: salarySettings.bhtnRate,
  });

  return {
    worker: worker._id,
    name: meta.name,
    soBaoDanh: meta.soBaoDanh,
    boPhan: meta.boPhan,
    chucVu: meta.chucVu,
    luongCoBan: computed.luongCoBan,
    ngayCongChuan: computed.ngayCongChuan,
    ngayCongThucTe: computed.ngayCongThucTe,
    ngayNghiKhongLuong: computed.ngayNghiKhongLuong,
    ngayNghiCoLuong: computed.ngayNghiCoLuong,
    soBuoiNghi: computed.soBuoiNghi,
    tongPhutDiTre: computed.tongPhutDiTre,
    tongPhutVeSom: computed.tongPhutVeSom,
    tongPhutNghi: computed.tongPhutNghi,
    tongPhutThieu: computed.tongPhutThieu,
    tongGioThieu: computed.tongGioThieu,
    luongNgay: computed.luongNgay,
    luongGio: computed.luongGio,
    tienTruNgayCong: computed.tienTruNgayCong,
    luongTheoNgayCong: computed.luongTheoNgayCong,
    phuCap: computed.phuCap,
    thuong: computed.thuong,
    tangCa: computed.tangCa,
    hoTro: computed.hoTro,
    baoHiem: computed.baoHiem,
    phat: computed.phat,
    thue: computed.thue,
    tamUng: computed.tamUng,
    khauTruKhac: computed.khauTruKhac,
    thamGiaBaoHiem: computed.thamGiaBaoHiem,
    mucLuongDongBaoHiem: computed.mucLuongDongBaoHiem,
    ghiChu: computed.ghiChu,
    computed,
  };
};

const summarizeDayWorkRows = (rows) => {
  const keys = [
    'luongCoBan', 'tienTruNgayCong', 'luongTheoNgayCong',
    'phuCap', 'thuong', 'tangCa', 'hoTro',
    'baoHiem', 'phat', 'thue', 'tamUng', 'khauTruKhac',
    'tongThuNhap', 'tongKhauTru', 'luongThucNhan',
  ];
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  rows.forEach((row) => {
    const c = row.computed || {};
    keys.forEach((k) => {
      totals[k] += roundVnd(c[k] ?? row[k]);
    });
  });
  return totals;
};

const refreshDayWorkFromAttendance = async (year, month) => {
  const settings = await getAttendanceSettings();
  const salarySettings = await getSalarySettings();
  const standard = calcStandardWorkDays(year, month);

  const workers = await Worker.find()
    .select('name soBaoDanh team teamRole salaryProfile')
    .populate('team', 'name')
    .sort({ name: 1 });

  let doc = await DayWorkPayroll.findOne({ year, month });
  const prevByWorker = new Map(
    (doc?.rows || []).map((r) => [String(r.worker), r])
  );

  const rows = [];
  // 1 query tháng thay vì N+1 theo thợ
  const allDays = await AttendanceDay.find({ year, month }).lean();
  const daysByWorker = new Map();
  allDays.forEach((day) => {
    const wid = String(day.worker);
    if (!daysByWorker.has(wid)) daysByWorker.set(wid, []);
    daysByWorker.get(wid).push(day);
  });

  workers.forEach((worker) => {
    const days = daysByWorker.get(String(worker._id)) || [];
    const meta = resolveWorkerMeta(worker);
    const summary = summarizeMonthAttendance(days, {
      luongCoBan: meta.luongCoBan,
      ngayCongChuan: standard.ngayCongChuan,
      hoursPerDay: settings.hoursPerDay,
    });
    const prev = prevByWorker.get(String(worker._id));
    const extras = prev
      ? {
        phuCap: prev.phuCap,
        thuong: prev.thuong,
        tangCa: prev.tangCa,
        hoTro: prev.hoTro,
        baoHiem: prev.baoHiem,
        phat: prev.phat,
        thue: prev.thue,
        tamUng: prev.tamUng,
        khauTruKhac: prev.khauTruKhac,
        ghiChu: prev.ghiChu,
        thamGiaBaoHiem: prev.thamGiaBaoHiem,
        mucLuongDongBaoHiem: prev.mucLuongDongBaoHiem,
      }
      : {};
    rows.push(buildDayWorkRow(worker, summary, salarySettings, extras));
  });

  if (!doc) {
    doc = await DayWorkPayroll.create({
      year,
      month,
      status: 'draft',
      ngayCongChuan: standard.ngayCongChuan,
      hoursPerDay: settings.hoursPerDay,
      rows,
    });
  } else {
    doc.ngayCongChuan = standard.ngayCongChuan;
    doc.hoursPerDay = settings.hoursPerDay;
    doc.rows = rows;
    await doc.save();
  }

  return doc;
};

const getDayWorkPayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    let doc = await DayWorkPayroll.findOne({
      year: parsed.year,
      month: parsed.month,
    });
    if (!doc) {
      doc = await refreshDayWorkFromAttendance(parsed.year, parsed.month);
    }

    const settings = await getAttendanceSettings();
    return res.json({
      message: 'OK',
      settings,
      data: {
        _id: doc._id,
        year: doc.year,
        month: doc.month,
        status: doc.status,
        ngayCongChuan: doc.ngayCongChuan,
        hoursPerDay: doc.hoursPerDay,
        rows: doc.rows,
        totals: summarizeDayWorkRows(doc.rows || []),
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error('getDayWorkPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

const syncDayWorkPayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    const doc = await refreshDayWorkFromAttendance(parsed.year, parsed.month);
    return res.json({
      message: 'Đã đồng bộ từ chấm công',
      data: {
        _id: doc._id,
        year: doc.year,
        month: doc.month,
        status: doc.status,
        ngayCongChuan: doc.ngayCongChuan,
        hoursPerDay: doc.hoursPerDay,
        rows: doc.rows,
        totals: summarizeDayWorkRows(doc.rows || []),
      },
    });
  } catch (err) {
    console.error('syncDayWorkPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

const saveDayWorkPayroll = async (req, res) => {
  try {
    const parsed = parseYearMonth(req.params.year, req.params.month);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const settings = await getAttendanceSettings();
    const salarySettings = await getSalarySettings();
    const body = req.body || {};
    const inputRows = Array.isArray(body.rows) ? body.rows : [];

    let doc = await DayWorkPayroll.findOne({ year: parsed.year, month: parsed.month });
    if (!doc) {
      doc = await refreshDayWorkFromAttendance(parsed.year, parsed.month);
    }

    const workers = await Worker.find({
      _id: { $in: inputRows.map((r) => r.worker).filter(Boolean) },
    }).select('salaryProfile');
    const workerById = new Map(workers.map((w) => [String(w._id), w]));

    doc.rows = inputRows.map((row) => {
      const computed = calculateDayWorkPayrollRow(
        {
          ...row,
          year: parsed.year,
          month: parsed.month,
          ngayCongChuan: row.ngayCongChuan || doc.ngayCongChuan,
        },
        {
          hoursPerDay: doc.hoursPerDay || settings.hoursPerDay,
          ...salarySettings,
        }
      );

      // Giữ LCB cho tháng sau
      const w = workerById.get(String(row.worker));
      if (w && row.luongCoBan != null) {
        w.salaryProfile = w.salaryProfile || {};
        w.salaryProfile.luongCoBan = roundVnd(row.luongCoBan);
        w.markModified('salaryProfile');
      }

      return {
        worker: row.worker,
        name: row.name || '',
        soBaoDanh: row.soBaoDanh || '',
        boPhan: row.boPhan || '',
        chucVu: row.chucVu || '',
        ...Object.fromEntries(
          [
            'luongCoBan', 'ngayCongChuan', 'ngayCongThucTe', 'ngayNghiKhongLuong',
            'ngayNghiCoLuong', 'soBuoiNghi', 'tongPhutDiTre', 'tongPhutVeSom',
            'tongPhutNghi', 'tongPhutThieu', 'tongGioThieu', 'luongNgay', 'luongGio',
            'tienTruNgayCong', 'luongTheoNgayCong',
            ...INPUT_MONEY_FIELDS,
            'thamGiaBaoHiem', 'mucLuongDongBaoHiem',
          ].map((k) => [k, computed[k]])
        ),
        ghiChu: computed.ghiChu,
        computed,
      };
    });

    await Promise.all(workers.map((w) => w.save()));

    doc.status = body.status === 'saved' ? 'saved' : (body.status || doc.status || 'draft');
    await doc.save();

    return res.json({
      message: 'Đã lưu bảng lương ngày công',
      data: {
        _id: doc._id,
        year: doc.year,
        month: doc.month,
        status: doc.status,
        ngayCongChuan: doc.ngayCongChuan,
        hoursPerDay: doc.hoursPerDay,
        rows: doc.rows,
        totals: summarizeDayWorkRows(doc.rows || []),
      },
    });
  } catch (err) {
    console.error('saveDayWorkPayroll:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getStatuses,
  getSettings,
  updateSettings,
  getMonthMeta,
  getWorkerMonth,
  upsertDays,
  deleteDay,
  listWorkers,
  getDayWorkPayroll,
  syncDayWorkPayroll,
  saveDayWorkPayroll,
};
