const SalarySettings = require('../models/SalarySettings');

const DEFAULT_SETTINGS = {
  donGiaCongHoTro: 250000,
  bhxhRate: 8,
  bhytRate: 1.5,
  bhtnRate: 1,
  defaultTyLeKtv: 20,
  defaultTyLeToTruong: 5,
};

let cached = { ...DEFAULT_SETTINGS };

const normalizeSettings = (raw = {}) => ({
  donGiaCongHoTro: Math.max(0, Number(raw.donGiaCongHoTro) || DEFAULT_SETTINGS.donGiaCongHoTro),
  bhxhRate: Math.min(100, Math.max(0, Number(raw.bhxhRate) ?? DEFAULT_SETTINGS.bhxhRate)),
  bhytRate: Math.min(100, Math.max(0, Number(raw.bhytRate) ?? DEFAULT_SETTINGS.bhytRate)),
  bhtnRate: Math.min(100, Math.max(0, Number(raw.bhtnRate) ?? DEFAULT_SETTINGS.bhtnRate)),
  defaultTyLeKtv: Math.min(100, Math.max(0, Number(raw.defaultTyLeKtv) ?? DEFAULT_SETTINGS.defaultTyLeKtv)),
  defaultTyLeToTruong: Math.min(
    100,
    Math.max(0, Number(raw.defaultTyLeToTruong) ?? DEFAULT_SETTINGS.defaultTyLeToTruong)
  ),
});

const getCachedSalarySettings = () => ({ ...cached });

const getSalarySettings = async () => {
  const doc = await SalarySettings.findOne({ singletonKey: 'default' }).lean();
  if (!doc) {
    cached = { ...DEFAULT_SETTINGS };
    return { ...cached };
  }
  cached = normalizeSettings(doc);
  return { ...cached };
};

const saveSalarySettings = async (payload = {}) => {
  const next = normalizeSettings({ ...cached, ...payload });
  const doc = await SalarySettings.findOneAndUpdate(
    { singletonKey: 'default' },
    { singletonKey: 'default', ...next },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  cached = normalizeSettings(doc);
  return { ...cached };
};

const initSalarySettings = async () => {
  try {
    await getSalarySettings();
  } catch (err) {
    console.error('initSalarySettings error:', err.message);
    cached = { ...DEFAULT_SETTINGS };
  }
};

module.exports = {
  DEFAULT_SETTINGS,
  getCachedSalarySettings,
  getSalarySettings,
  saveSalarySettings,
  initSalarySettings,
};
