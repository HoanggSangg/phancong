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

module.exports = {
  formatDateVN,
  buildDeliveryTimeFromHeader,
  extractExternalCarFields,
};
