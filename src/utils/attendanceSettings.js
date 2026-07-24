const AttendanceSettings = require('../models/AttendanceSettings');

const DEFAULT_SETTINGS = {
  hoursPerDay: 8,
  paidHolidays: [],
  standardCheckIn: '08:00',
  standardCheckOut: '17:00',
};

let cached = { ...DEFAULT_SETTINGS };

const normalizeHoliday = (item) => {
  if (!item) return null;
  const date = String(item.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, name: String(item.name || '').trim() };
};

const normalizeSettings = (raw = {}) => {
  const holidays = Array.isArray(raw.paidHolidays)
    ? raw.paidHolidays.map(normalizeHoliday).filter(Boolean)
    : [];
  const unique = [];
  const seen = new Set();
  holidays.forEach((h) => {
    if (seen.has(h.date)) return;
    seen.add(h.date);
    unique.push(h);
  });

  return {
    hoursPerDay: Math.min(24, Math.max(1, Number(raw.hoursPerDay) || DEFAULT_SETTINGS.hoursPerDay)),
    paidHolidays: unique,
    standardCheckIn: String(raw.standardCheckIn || DEFAULT_SETTINGS.standardCheckIn).slice(0, 5),
    standardCheckOut: String(raw.standardCheckOut || DEFAULT_SETTINGS.standardCheckOut).slice(0, 5),
  };
};

const getAttendanceSettings = async () => {
  const doc = await AttendanceSettings.findOne({ singletonKey: 'default' }).lean();
  if (!doc) {
    cached = { ...DEFAULT_SETTINGS };
    return { ...cached };
  }
  cached = normalizeSettings(doc);
  return { ...cached };
};

const saveAttendanceSettings = async (payload = {}) => {
  const next = normalizeSettings({ ...cached, ...payload });
  const doc = await AttendanceSettings.findOneAndUpdate(
    { singletonKey: 'default' },
    { singletonKey: 'default', ...next },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  cached = normalizeSettings(doc);
  return { ...cached };
};

const initAttendanceSettings = async () => {
  try {
    await getAttendanceSettings();
  } catch (err) {
    console.error('initAttendanceSettings error:', err.message);
    cached = { ...DEFAULT_SETTINGS };
  }
};

module.exports = {
  DEFAULT_SETTINGS,
  getAttendanceSettings,
  saveAttendanceSettings,
  initAttendanceSettings,
};
