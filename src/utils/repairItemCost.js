/**
 * giaVon / giá mua từ API báo giá đã là TỔNG giá vốn của dòng
 * (không phải đơn giá × số lượng).
 */
const resolveExternalItemCost = (item = {}) => {
  const totalCost = Math.round(
    Number(item.giaVon ?? item.costAmount ?? item.unitCostPrice ?? 0) || 0,
  );

  return {
    // Cột "Giá vốn" hiển thị đúng giá nhập (tổng)
    unitCostPrice: totalCost,
    costAmount: totalCost,
  };
};

const enrichRepairItemCost = (item = {}) => {
  const doc = item?.toObject ? item.toObject() : { ...item };

  // Ưu tiên giaVon từ raw API — nguồn đúng, đã là tổng (sửa dữ liệu cũ bị nhân SL)
  if (doc.raw?.giaVon != null && doc.raw?.giaVon !== '') {
    const totalCost = Math.round(Number(doc.raw.giaVon) || 0);
    return {
      ...doc,
      unitCostPrice: totalCost,
      costAmount: totalCost,
    };
  }

  if (doc.costAmount != null && doc.costAmount !== '') {
    const costAmount = Math.round(Number(doc.costAmount) || 0);
    return {
      ...doc,
      unitCostPrice: Number(doc.unitCostPrice) || costAmount,
      costAmount,
    };
  }

  const fromRaw = resolveExternalItemCost({
    giaVon: doc.unitCostPrice,
  });

  return {
    ...doc,
    unitCostPrice: fromRaw.unitCostPrice,
    costAmount: fromRaw.costAmount,
  };
};

module.exports = {
  resolveExternalItemCost,
  enrichRepairItemCost,
};
