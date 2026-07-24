const moment = require('moment-timezone');

const TZ = 'Asia/Ho_Chi_Minh';
const roundVnd = (value) => Math.round(Number(value) || 0);

/** Catalog trạng thái chấm công */
const STATUS_META = {
  present: {
    key: 'present',
    label: 'Đi làm đủ ngày',
    color: 'green',
    deductSalary: false,
    isPaidLeave: false,
    category: 'work',
  },
  unpaid_full: {
    key: 'unpaid_full',
    label: 'Nghỉ nguyên ngày',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  paid_full: {
    key: 'paid_full',
    label: 'Nghỉ nguyên ngày',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  morning_off: {
    key: 'morning_off',
    label: 'Nghỉ buổi sáng',
    color: 'yellow',
    deductSalary: true,
    isPaidLeave: false,
    category: 'half',
    missingMode: 'half_day',
  },
  afternoon_off: {
    key: 'afternoon_off',
    label: 'Nghỉ buổi chiều',
    color: 'yellow',
    deductSalary: true,
    isPaidLeave: false,
    category: 'half',
    missingMode: 'half_day',
  },
  hourly_leave: {
    key: 'hourly_leave',
    label: 'Nghỉ theo số giờ',
    color: 'yellow',
    deductSalary: true,
    isPaidLeave: false,
    category: 'hours',
    missingMode: 'leave',
  },
  late: {
    key: 'late',
    label: 'Đi trễ',
    color: 'orange',
    deductSalary: true,
    isPaidLeave: false,
    category: 'late',
    missingMode: 'late',
  },
  early: {
    key: 'early',
    label: 'Về sớm',
    color: 'orange',
    deductSalary: true,
    isPaidLeave: false,
    category: 'early',
    missingMode: 'early',
  },
  late_early: {
    key: 'late_early',
    label: 'Đi trễ và về sớm',
    color: 'orange',
    deductSalary: true,
    isPaidLeave: false,
    category: 'late_early',
    missingMode: 'late_early',
  },
  annual_leave: {
    key: 'annual_leave',
    label: 'Nghỉ phép',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  sick_paid: {
    key: 'sick_paid',
    label: 'Nghỉ bệnh',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  sick_unpaid: {
    key: 'sick_unpaid',
    label: 'Nghỉ bệnh',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  holiday: {
    key: 'holiday',
    label: 'Nghỉ lễ (hưởng lương)',
    color: 'blue',
    deductSalary: false,
    isPaidLeave: true,
    category: 'holiday',
  },
  business_trip: {
    key: 'business_trip',
    label: 'Công tác',
    color: 'purple',
    deductSalary: false,
    isPaidLeave: true,
    category: 'paid',
  },
  compensatory: {
    key: 'compensatory',
    label: 'Nghỉ bù',
    color: 'red',
    deductSalary: true,
    isPaidLeave: false,
    category: 'unpaid',
    missingMode: 'full_day',
  },
  sunday: {
    key: 'sunday',
    label: 'Chủ nhật',
    color: 'gray',
    deductSalary: false,
    isPaidLeave: false,
    category: 'sunday',
  },
  other: {
    key: 'other',
    label: 'Trạng thái khác',
    color: 'gray',
    deductSalary: false,
    isPaidLeave: false,
    category: 'other',
    missingMode: 'manual',
  },
};

const STATUS_LIST = Object.values(STATUS_META);

const parseHmToMinutes = (hm) => {
  if (!hm || typeof hm !== 'string') return null;
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const isSundayDate = (dateStr) => {
  const d = moment.tz(dateStr, 'YYYY-MM-DD', TZ);
  return d.isValid() && d.day() === 0;
};

const isHolidayDate = (dateStr, paidHolidays = []) =>
  (paidHolidays || []).some((h) => h.date === dateStr);

/**
 * Ngày công chuẩn = tổng ngày tháng - số Chủ nhật
 */
const calcStandardWorkDays = (year, month) => {
  const start = moment.tz({ year, month: month - 1, day: 1 }, TZ);
  const daysInMonth = start.daysInMonth();
  let sundays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = moment.tz({ year, month: month - 1, day }, TZ);
    if (d.day() === 0) sundays += 1;
  }
  return {
    daysInMonth,
    sundays,
    ngayCongChuan: daysInMonth - sundays,
  };
};

const calcDayHourRates = (luongCoBan, ngayCongChuan, hoursPerDay = 8) => {
  const lcb = roundVnd(luongCoBan);
  const days = Math.max(1, Number(ngayCongChuan) || 1);
  const hours = Math.max(1, Number(hoursPerDay) || 8);
  const luongNgay = roundVnd(lcb / days);
  const luongGio = roundVnd(luongNgay / hours);
  return { luongNgay, luongGio, hoursPerDay: hours, ngayCongChuan: days };
};

/**
 * Tính phút thiếu / trừ lương cho 1 ngày
 */
const resolveDayAttendance = (input = {}, settings = {}) => {
  const hoursPerDay = Math.max(1, Number(settings.hoursPerDay) || 8);
  const standardMinutes = roundVnd(hoursPerDay * 60);
  const date = String(input.date || '').slice(0, 10);
  const sunday = isSundayDate(date);
  const holiday = Boolean(input.isHoliday) || isHolidayDate(date, settings.paidHolidays);

  let status = input.status || (sunday ? 'sunday' : holiday ? 'holiday' : 'present');
  if (sunday && status === 'present') status = 'sunday';

  const meta = STATUS_META[status] || STATUS_META.other;

  let lateMinutes = Math.max(0, Number(input.lateMinutes) || 0);
  let earlyLeaveMinutes = Math.max(0, Number(input.earlyLeaveMinutes) || 0);
  let leaveMinutes = Math.max(0, Number(input.leaveMinutes) || 0);

  // Tự tính phút từ giờ vào/ra nếu có
  const stdIn = parseHmToMinutes(input.standardCheckIn || settings.standardCheckIn);
  const stdOut = parseHmToMinutes(input.standardCheckOut || settings.standardCheckOut);
  const actIn = parseHmToMinutes(input.actualCheckIn);
  const actOut = parseHmToMinutes(input.actualCheckOut);

  if (actIn != null && stdIn != null && actIn > stdIn) {
    lateMinutes = Math.max(lateMinutes, actIn - stdIn);
  }
  if (actOut != null && stdOut != null && actOut < stdOut) {
    earlyLeaveMinutes = Math.max(earlyLeaveMinutes, stdOut - actOut);
  }

  let deductSalary = meta.deductSalary;
  let isPaidLeave = meta.isPaidLeave;
  let missingMinutes = 0;
  const luongNgay = roundVnd(input.luongNgay);
  const luongGio = roundVnd(input.luongGio);

  // Chủ nhật / ngày lễ cấu hình / công tác: không trừ
  if (status === 'sunday' || sunday) {
    status = 'sunday';
    deductSalary = false;
    missingMinutes = 0;
    isPaidLeave = false;
  } else if (status === 'holiday' || (holiday && ['present', 'holiday'].includes(status))) {
    status = 'holiday';
    deductSalary = false;
    missingMinutes = 0;
    isPaidLeave = true;
  } else if (status === 'business_trip') {
    deductSalary = false;
    missingMinutes = 0;
    isPaidLeave = true;
  } else if (status === 'other' && (input.deductSalary === true || input.deductSalary === false)) {
    // Chỉ cho phép ghi đè trừ lương với trạng thái "khác"
    deductSalary = input.deductSalary;
  }

  let deductionAmount = 0;
  if (deductSalary) {
    const mode = meta.missingMode || 'manual';
    if (mode === 'full_day') {
      // Nghỉ cả ngày = trừ đúng 1 ngày công
      missingMinutes = standardMinutes;
      deductionAmount = luongNgay > 0
        ? luongNgay
        : roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'half_day') {
      // Nghỉ buổi = 50% lương ngày
      missingMinutes = Math.round(standardMinutes * 0.5);
      deductionAmount = luongNgay > 0
        ? roundVnd(luongNgay * 0.5)
        : roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'leave') {
      missingMinutes = leaveMinutes;
      deductionAmount = roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'late') {
      missingMinutes = lateMinutes;
      deductionAmount = roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'early') {
      missingMinutes = earlyLeaveMinutes;
      deductionAmount = roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'late_early') {
      missingMinutes = lateMinutes + earlyLeaveMinutes;
      deductionAmount = roundVnd((missingMinutes / 60) * luongGio);
    } else if (mode === 'manual') {
      missingMinutes = Math.max(
        0,
        Number(input.missingMinutes) || leaveMinutes || lateMinutes + earlyLeaveMinutes
      );
      deductionAmount = roundVnd((missingMinutes / 60) * luongGio);
    }

    // Không trừ quá 1 ngày công
    if (missingMinutes > standardMinutes) {
      missingMinutes = standardMinutes;
      deductionAmount = luongNgay > 0
        ? luongNgay
        : roundVnd((standardMinutes / 60) * luongGio);
    }
  }

  const workedMinutes = Math.max(0, standardMinutes - (deductSalary ? missingMinutes : 0));

  return {
    date,
    year: Number(input.year) || moment.tz(date, 'YYYY-MM-DD', TZ).year(),
    month: Number(input.month) || moment.tz(date, 'YYYY-MM-DD', TZ).month() + 1,
    status,
    statusLabel: (STATUS_META[status] || meta).label,
    color: (STATUS_META[status] || meta).color,
    standardMinutes,
    workedMinutes,
    missingMinutes: deductSalary ? missingMinutes : 0,
    lateMinutes,
    earlyLeaveMinutes,
    leaveMinutes,
    standardCheckIn: input.standardCheckIn || settings.standardCheckIn || '',
    standardCheckOut: input.standardCheckOut || settings.standardCheckOut || '',
    actualCheckIn: input.actualCheckIn || '',
    actualCheckOut: input.actualCheckOut || '',
    isPaidLeave,
    isSunday: status === 'sunday' || sunday,
    isHoliday: status === 'holiday' || holiday,
    deductSalary,
    deductionAmount: deductSalary ? deductionAmount : 0,
    note: String(input.note || '').trim(),
  };
};

/**
 * Tổng hợp tháng từ danh sách ngày
 */
const summarizeMonthAttendance = (days = [], { luongCoBan, ngayCongChuan, hoursPerDay }) => {
  const rates = calcDayHourRates(luongCoBan, ngayCongChuan, hoursPerDay);
  let ngayDiLamDu = 0;
  let ngayNghiKhongLuong = 0;
  let ngayNghiCoLuong = 0;
  let soBuoiNghi = 0;
  let tongPhutDiTre = 0;
  let tongPhutVeSom = 0;
  let tongPhutNghi = 0;
  let tongPhutThieu = 0;
  let tienTruNgayCong = 0;

  const fullDayLeave = new Set([
    'unpaid_full', 'paid_full', 'annual_leave', 'sick_paid', 'sick_unpaid', 'compensatory',
  ]);

  days.forEach((day) => {
    // Luôn tính lại theo quy tắc hiện tại (nghỉ → trừ theo ngày/giờ)
    const resolved = resolveDayAttendance(
      { ...day, luongGio: rates.luongGio, luongNgay: rates.luongNgay },
      { hoursPerDay }
    );

    if (resolved.isSunday) return;

    if (resolved.status === 'present') ngayDiLamDu += 1;
    if (fullDayLeave.has(resolved.status)
      || (resolved.deductSalary && resolved.missingMinutes >= rates.hoursPerDay * 60)) {
      ngayNghiKhongLuong += 1;
    }
    if (resolved.isPaidLeave && !resolved.deductSalary) ngayNghiCoLuong += 1;
    if (['morning_off', 'afternoon_off'].includes(resolved.status)) soBuoiNghi += 1;

    tongPhutDiTre += Number(resolved.lateMinutes) || 0;
    tongPhutVeSom += Number(resolved.earlyLeaveMinutes) || 0;
    tongPhutNghi += Number(resolved.leaveMinutes) || 0;

    if (resolved.deductSalary) {
      tongPhutThieu += Number(resolved.missingMinutes) || 0;
      tienTruNgayCong += roundVnd(resolved.deductionAmount);
    }
  });

  // Ưu tiên tổng tiền trừ từng ngày (đúng lương ngày/giờ); fallback theo phút
  const tienTruFromMinutes = roundVnd((tongPhutThieu / 60) * rates.luongGio);
  const finalTienTru = tienTruNgayCong > 0 ? tienTruNgayCong : tienTruFromMinutes;
  const luongTheoNgayCong = roundVnd(Math.max(0, roundVnd(luongCoBan) - finalTienTru));

  const ngayCongThucTe = Math.max(
    0,
    Number((rates.ngayCongChuan - ngayNghiKhongLuong - soBuoiNghi * 0.5).toFixed(2))
  );

  return {
    ...rates,
    luongCoBan: roundVnd(luongCoBan),
    ngayDiLamDu,
    ngayNghiKhongLuong,
    ngayNghiCoLuong,
    soBuoiNghi,
    tongPhutDiTre,
    tongPhutVeSom,
    tongPhutNghi,
    tongPhutThieu,
    tongGioThieu: Number((tongPhutThieu / 60).toFixed(2)),
    tienTruNgayCong: finalTienTru,
    luongTheoNgayCong,
    ngayCongThucTe,
  };
};

/**
 * Tính dòng bảng lương ngày công (không có LNS / doanh thu)
 */
const calculateDayWorkPayrollRow = (input = {}, settings = {}) => {
  const hoursPerDay = Number(settings.hoursPerDay) || 8;
  const bhxhRate = Number(settings.bhxhRate ?? 8);
  const bhytRate = Number(settings.bhytRate ?? 1.5);
  const bhtnRate = Number(settings.bhtnRate ?? 1);

  const luongCoBan = roundVnd(input.luongCoBan);
  const ngayCongChuan = Number(input.ngayCongChuan) || calcStandardWorkDays(
    input.year || new Date().getFullYear(),
    input.month || 1
  ).ngayCongChuan;

  const summary = {
    ngayCongChuan,
    ngayCongThucTe: Number(input.ngayCongThucTe) || 0,
    ngayNghiKhongLuong: Number(input.ngayNghiKhongLuong) || 0,
    ngayNghiCoLuong: Number(input.ngayNghiCoLuong) || 0,
    soBuoiNghi: Number(input.soBuoiNghi) || 0,
    tongPhutDiTre: Number(input.tongPhutDiTre) || 0,
    tongPhutVeSom: Number(input.tongPhutVeSom) || 0,
    tongPhutNghi: Number(input.tongPhutNghi) || 0,
    tongPhutThieu: Number(input.tongPhutThieu) || 0,
    tongGioThieu: Number(input.tongGioThieu) || 0,
  };

  const rates = calcDayHourRates(luongCoBan, ngayCongChuan, hoursPerDay);
  const tienTruNgayCong = input.tienTruNgayCong != null
    ? roundVnd(input.tienTruNgayCong)
    : roundVnd((summary.tongPhutThieu / 60) * rates.luongGio);
  const luongTheoNgayCong = roundVnd(Math.max(0, luongCoBan - tienTruNgayCong));

  const phuCap = roundVnd(input.phuCap);
  const thuong = roundVnd(input.thuong);
  const tangCa = roundVnd(input.tangCa);
  const hoTro = roundVnd(input.hoTro);

  const thamGiaBaoHiem = input.thamGiaBaoHiem === true;
  const mucLuongDongBaoHiem = roundVnd(input.mucLuongDongBaoHiem);
  let baoHiem = roundVnd(input.baoHiem);
  if (thamGiaBaoHiem && mucLuongDongBaoHiem > 0 && !(input.baoHiem > 0)) {
    baoHiem = roundVnd(
      mucLuongDongBaoHiem * (bhxhRate + bhytRate + bhtnRate) / 100
    );
  }

  const phat = roundVnd(input.phat);
  const thue = roundVnd(input.thue);
  const tamUng = roundVnd(input.tamUng);
  const khauTruKhac = roundVnd(input.khauTruKhac);

  // Tiền trừ ngày công đã trừ trong luongTheoNgayCong — không cộng vào khấu trừ
  const tongThuNhap = roundVnd(luongTheoNgayCong + phuCap + thuong + tangCa + hoTro);
  const tongKhauTru = roundVnd(baoHiem + phat + thue + tamUng + khauTruKhac);
  const luongThucNhan = roundVnd(tongThuNhap - tongKhauTru);

  return {
    ...summary,
    luongCoBan,
    luongNgay: rates.luongNgay,
    luongGio: rates.luongGio,
    hoursPerDay: rates.hoursPerDay,
    tienTruNgayCong,
    luongTheoNgayCong,
    phuCap,
    thuong,
    tangCa,
    hoTro,
    baoHiem,
    phat,
    thue,
    tamUng,
    khauTruKhac,
    thamGiaBaoHiem,
    mucLuongDongBaoHiem,
    tongThuNhap,
    tongKhauTru,
    luongThucNhan,
    ghiChu: input.ghiChu || '',
  };
};

module.exports = {
  TZ,
  roundVnd,
  STATUS_META,
  STATUS_LIST,
  parseHmToMinutes,
  isSundayDate,
  isHolidayDate,
  calcStandardWorkDays,
  calcDayHourRates,
  resolveDayAttendance,
  summarizeMonthAttendance,
  calculateDayWorkPayrollRow,
};
