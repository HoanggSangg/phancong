const formatDateVN = (yyyymmdd) => {
  if (!yyyymmdd || String(yyyymmdd).length !== 8) return '';
  const s = String(yyyymmdd);
  return `${s.slice(6, 8)}-${s.slice(4, 6)}-${s.slice(0, 4)}`;
};

const buildDeliveryTimeFromHeader = (header = {}) => {
  if (!header.ngayDuKienHoanThanh || !header.gioDuKienHoanThanh) {
    return null;
  }

  const hour = String(header.gioDuKienHoanThanh).split(':')[0];
  return `${formatDateVN(header.ngayDuKienHoanThanh)} ${hour}[h]`;
};

const extractExternalCarFields = ({ baogiaGanNhat, vehicle = null } = {}) => {
  const header = baogiaGanNhat?.header || {};
  const loaiXe = vehicle?.loaiXe || header.loaiXe || {};

  return {
    externalCarTypeName: loaiXe.tenViet || loaiXe.tenAnh || loaiXe.ma || '',
    advisorName: header.coVanDichVu1 || '',
    deliveryTime: buildDeliveryTimeFromHeader(header),
  };
};

/** Flag checkbox API (huy / ghiThem / thuHoi…): 1 | true | '1' | 'true' */
const isExternalFlagOn = (value) => {
  if (value === 1 || value === true) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'x';
  }
  return false;
};

/**
 * Dòng chi tiết không đưa vào báo giá / phân công:
 * - Hủy (`huy`)
 * - Ghi thêm (`isGhiThem` từ API OtoBaThanh)
 */
const isExcludedQuoteLine = (item = {}) =>
  isExternalFlagOn(item.huy)
  || isExternalFlagOn(item.isGhiThem)
  || isExternalFlagOn(item.ghiThem)
  || isExternalFlagOn(item.GhiThem)
  || isExternalFlagOn(item.IsGhiThem);

const filterQuoteChiTiet = (chiTiet = []) =>
  (Array.isArray(chiTiet) ? chiTiet : []).filter((item) => !isExcludedQuoteLine(item));

/** Làm sạch báo giá trước khi trả FE / lưu — bỏ Hủy & Ghi thêm ngay từ lookup. */
const sanitizeBaoGiaPayload = (baogiaGanNhat) => {
  if (!baogiaGanNhat || typeof baogiaGanNhat !== 'object') return baogiaGanNhat;
  return {
    ...baogiaGanNhat,
    chiTiet: filterQuoteChiTiet(baogiaGanNhat.chiTiet || []),
  };
};

module.exports = {
  formatDateVN,
  buildDeliveryTimeFromHeader,
  extractExternalCarFields,
  isExternalFlagOn,
  isExcludedQuoteLine,
  filterQuoteChiTiet,
  sanitizeBaoGiaPayload,
};
