const roundVnd = (value) => Math.round(Number(value) || 0);

const isToTruong = (chucVu = '') => String(chucVu).trim().toUpperCase().startsWith('TT');

const getDefaultProductivityRates = (chucVu, settings = {}) => {
  const rate = isToTruong(chucVu)
    ? Number(settings.defaultTyLeToTruong ?? 5)
    : Number(settings.defaultTyLeKtv ?? 20);
  return {
    tyLeDatDinhMuc: rate,
    tyLeVuotDinhMuc: rate,
  };
};

const sumFields = (obj, keys) =>
  keys.reduce((sum, key) => sum + roundVnd(obj?.[key]), 0);

const ALLOWANCE_KEYS = [
  'phuCapTrachNhiem',
  'thuongSoLuongXe',
  'phuCapDienThoai',
  'phuCapXangXe',
  'phuCapChuyenCan',
  'phuCapBaoCaoNgay',
  'phuCapBaoVeTaiSan',
  'phuCapVeSinh',
  'phuCapTayNghe',
  'tienComTrua',
  'tienTangCa',
  'congTacXa',
  'hoTroBaoGiaThau',
  'hoTroSuaChuaLai',
  'hoTroCongViecDacBiet',
  'tienCuuPan',
  'tienHoTroKhac',
  'tienThuongKhac',
];

const PENALTY_KEYS = [
  'truThieuTrachNhiem',
  'truChatLuong',
  'truHuHong',
  'truViPhamNoiQuy',
];

const OTHER_DEDUCTION_KEYS = [
  'truNghiVuotPhep',
  'truThueTNCN',
  'truTamUng',
  'truCongNo',
  'truKhac',
];

/**
 * Tính lương 1 dòng thợ theo công thức yêu cầu.
 * @param {object} input - dữ liệu nhập / snapshot
 * @param {object} settings - SalarySettings
 */
const calculatePayrollRow = (input = {}, settings = {}) => {
  const donGiaCongHoTro = roundVnd(settings.donGiaCongHoTro ?? 250000);
  const bhxhRate = Number(settings.bhxhRate ?? 8);
  const bhytRate = Number(settings.bhytRate ?? 1.5);
  const bhtnRate = Number(settings.bhtnRate ?? 1);

  const luongCoBan = roundVnd(input.luongCoBan);
  const doanhThuDinhMuc = roundVnd(input.doanhThuDinhMuc);
  const doanhThuThang = roundVnd(input.doanhThuThang);
  const soCongHoTro = Number(input.soCongHoTro) || 0;

  const defaults = getDefaultProductivityRates(input.chucVu, settings);
  const tyLeDatDinhMuc = Number(
    input.tyLeDatDinhMuc != null ? input.tyLeDatDinhMuc : defaults.tyLeDatDinhMuc
  );
  const tyLeVuotDinhMuc = Number(
    input.tyLeVuotDinhMuc != null ? input.tyLeVuotDinhMuc : defaults.tyLeVuotDinhMuc
  );

  let tienCongHoTro;
  if (input.tienCongHoTroOverride != null && input.tienCongHoTroOverride !== '') {
    tienCongHoTro = roundVnd(input.tienCongHoTroOverride);
  } else {
    tienCongHoTro = roundVnd(soCongHoTro * donGiaCongHoTro);
  }

  const tongDoanhThu = roundVnd(doanhThuThang + tienCongHoTro);
  const dtDatDinhMuc = roundVnd(Math.min(tongDoanhThu, doanhThuDinhMuc));
  const dtVuotDinhMuc = roundVnd(Math.max(0, tongDoanhThu - doanhThuDinhMuc));

  const tienNsDat = roundVnd(dtDatDinhMuc * tyLeDatDinhMuc / 100);
  const tienNsVuot = roundVnd(dtVuotDinhMuc * tyLeVuotDinhMuc / 100);
  const luongNangSuat = roundVnd(tienNsDat + tienNsVuot);

  const allowances = {};
  ALLOWANCE_KEYS.forEach((key) => {
    allowances[key] = roundVnd(input[key]);
  });
  const tongCongThem = sumFields(allowances, ALLOWANCE_KEYS);

  const penalties = {};
  PENALTY_KEYS.forEach((key) => {
    penalties[key] = roundVnd(input[key]);
  });
  const tongPhat = sumFields(penalties, PENALTY_KEYS);

  const otherDeductions = {};
  OTHER_DEDUCTION_KEYS.forEach((key) => {
    otherDeductions[key] = roundVnd(input[key]);
  });

  const thamGiaBaoHiem = input.thamGiaBaoHiem === true;
  const mucLuongDongBaoHiem = roundVnd(input.mucLuongDongBaoHiem);

  let bhxh = 0;
  let bhyt = 0;
  let bhtn = 0;
  if (thamGiaBaoHiem && mucLuongDongBaoHiem > 0) {
    bhxh = roundVnd(mucLuongDongBaoHiem * bhxhRate / 100);
    bhyt = roundVnd(mucLuongDongBaoHiem * bhytRate / 100);
    bhtn = roundVnd(mucLuongDongBaoHiem * bhtnRate / 100);
  }
  const tongBaoHiem = roundVnd(bhxh + bhyt + bhtn);

  const tongThuNhap = roundVnd(luongCoBan + luongNangSuat + tongCongThem);
  const tongKhauTru = roundVnd(
    tongPhat
    + otherDeductions.truNghiVuotPhep
    + otherDeductions.truThueTNCN
    + otherDeductions.truTamUng
    + otherDeductions.truCongNo
    + tongBaoHiem
    + otherDeductions.truKhac
  );
  const luongThucNhan = roundVnd(tongThuNhap - tongKhauTru);

  return {
    luongCoBan,
    doanhThuDinhMuc,
    doanhThuThang,
    soCongHoTro,
    donGiaCongHoTro,
    tienCongHoTro,
    tienCongHoTroOverride:
      input.tienCongHoTroOverride != null && input.tienCongHoTroOverride !== ''
        ? roundVnd(input.tienCongHoTroOverride)
        : null,
    tongDoanhThu,
    dtDatDinhMuc,
    dtVuotDinhMuc,
    tyLeDatDinhMuc,
    tyLeVuotDinhMuc,
    tienNsDat,
    tienNsVuot,
    luongNangSuat,
    ...allowances,
    tongCongThem,
    ...penalties,
    tongPhat,
    ...otherDeductions,
    ghiChuTru: input.ghiChuTru || '',
    thamGiaBaoHiem,
    mucLuongDongBaoHiem,
    bhxh,
    bhyt,
    bhtn,
    tongBaoHiem,
    tongThuNhap,
    tongKhauTru,
    luongThucNhan,
    lcbCongLns: roundVnd(luongCoBan + luongNangSuat),
  };
};

module.exports = {
  roundVnd,
  isToTruong,
  getDefaultProductivityRates,
  calculatePayrollRow,
  ALLOWANCE_KEYS,
  PENALTY_KEYS,
  OTHER_DEDUCTION_KEYS,
};
