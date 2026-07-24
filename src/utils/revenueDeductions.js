const RevenueSettings = require('../models/RevenueSettings');

const DEFAULT_DEDUCTIONS = [
  { key: 'commission', label: 'Hoa hồng', rate: 25, enabled: true },
  { key: 'related_cost', label: 'Chi phí liên quan', rate: 0, enabled: false },
];

const DEFAULT_REVENUE_BASE = 'amount';

let cachedDeductions = [...DEFAULT_DEDUCTIONS];
let cachedRevenueBase = DEFAULT_REVENUE_BASE;

const normalizeRevenueBase = (value) => (value === 'cost' ? 'cost' : 'amount');

const normalizeDeductions = (deductions = []) => {
  const cleaned = deductions
    .map((item, index) => ({
      key: String(item.key || `deduction_${index + 1}`).trim(),
      label: String(item.label || `Khoản trừ ${index + 1}`).trim(),
      rate: Math.min(100, Math.max(0, Number(item.rate) || 0)),
      enabled: item.enabled !== false,
    }))
    .filter((item) => item.label);

  if (!cleaned.length) return [...DEFAULT_DEDUCTIONS];
  return cleaned;
};

const getEnabledDeductions = (deductions = cachedDeductions) =>
  normalizeDeductions(deductions).filter((item) => item.enabled && item.rate > 0);

const getTotalDeductionRate = (deductions = cachedDeductions) => {
  const total = getEnabledDeductions(deductions).reduce((sum, item) => sum + item.rate, 0);
  return Math.min(100, total);
};

const applyDeductionsToGross = (grossAmount, deductions = cachedDeductions) => {
  const gross = Math.max(0, Math.round(Number(grossAmount) || 0));
  const enabled = getEnabledDeductions(deductions);
  const breakdown = enabled.map((item) => ({
    key: item.key,
    label: item.label,
    rate: item.rate,
    amount: Math.round(gross * item.rate / 100),
  }));
  const totalDeducted = breakdown.reduce((sum, item) => sum + item.amount, 0);

  return {
    grossRevenue: gross,
    netRevenue: Math.max(0, gross - totalDeducted),
    deductions: breakdown,
    totalDeductionRate: getTotalDeductionRate(deductions),
  };
};

const getCachedDeductions = () => cachedDeductions;

const getCachedRevenueBase = () => cachedRevenueBase;

const setCachedRevenueBase = (revenueBase) => {
  cachedRevenueBase = normalizeRevenueBase(revenueBase);
  return cachedRevenueBase;
};

const setCachedDeductions = (deductions) => {
  cachedDeductions = normalizeDeductions(deductions);
  return cachedDeductions;
};

const getRevenueDeductions = async () => {
  const doc = await RevenueSettings.findOne({ singletonKey: 'default' }).lean();
  if (!doc) {
    setCachedRevenueBase(DEFAULT_REVENUE_BASE);
    return setCachedDeductions(DEFAULT_DEDUCTIONS);
  }

  setCachedRevenueBase(doc.revenueBase);

  if (!doc.deductions?.length) {
    return setCachedDeductions(DEFAULT_DEDUCTIONS);
  }
  return setCachedDeductions(doc.deductions);
};

const saveRevenueSettings = async ({ deductions, revenueBase } = {}) => {
  const normalized = normalizeDeductions(deductions ?? cachedDeductions);
  const totalRate = getTotalDeductionRate(normalized);
  if (totalRate > 100) {
    throw new Error('Tổng tỷ lệ trừ không được vượt quá 100%');
  }

  const nextRevenueBase = normalizeRevenueBase(
    revenueBase !== undefined ? revenueBase : cachedRevenueBase,
  );

  const doc = await RevenueSettings.findOneAndUpdate(
    { singletonKey: 'default' },
    { deductions: normalized, revenueBase: nextRevenueBase },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  setCachedRevenueBase(doc.revenueBase);
  return {
    deductions: setCachedDeductions(doc.deductions),
    revenueBase: getCachedRevenueBase(),
  };
};

const saveRevenueDeductions = async (deductions) =>
  saveRevenueSettings({ deductions });

const initRevenueDeductions = async () => {
  await getRevenueDeductions();
};

module.exports = {
  DEFAULT_DEDUCTIONS,
  DEFAULT_REVENUE_BASE,
  normalizeDeductions,
  normalizeRevenueBase,
  getEnabledDeductions,
  getTotalDeductionRate,
  applyDeductionsToGross,
  getCachedDeductions,
  getCachedRevenueBase,
  setCachedDeductions,
  setCachedRevenueBase,
  getRevenueDeductions,
  saveRevenueDeductions,
  saveRevenueSettings,
  initRevenueDeductions,
};
