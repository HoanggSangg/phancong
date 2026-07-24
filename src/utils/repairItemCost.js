const resolveExternalItemCost = (item = {}) => {
  const unitCostPrice = Number(item.giaVon ?? item.unitCostPrice ?? 0) || 0;
  const quantity = Number(item.soLuong ?? item.quantity ?? 1) || 1;

  return {
    unitCostPrice,
    costAmount: Math.round(unitCostPrice * quantity),
  };
};

const enrichRepairItemCost = (item = {}) => {
  const doc = item?.toObject ? item.toObject() : { ...item };
  const hasStoredCost = doc.unitCostPrice != null && doc.unitCostPrice !== '';

  if (hasStoredCost) {
    const unitCostPrice = Number(doc.unitCostPrice) || 0;
    const quantity = Number(doc.quantity || 1) || 1;
    return {
      ...doc,
      unitCostPrice,
      costAmount: Number(doc.costAmount ?? Math.round(unitCostPrice * quantity)) || 0,
    };
  }

  const fromRaw = resolveExternalItemCost({
    giaVon: doc.raw?.giaVon,
    soLuong: doc.quantity ?? doc.raw?.soLuong,
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
