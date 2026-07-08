const normalizeROPart = (value = '') =>
  String(value || '').trim().toUpperCase().replace(/\s/g, '');

const getROLookupTokens = (roNumber = '', roCode = '') => {
  const normNumber = normalizeROPart(roNumber);
  const normCode = normalizeROPart(roCode);
  return [...new Set([normNumber, normCode].filter(Boolean))];
};

const normalizeROFields = ({ roNumber = '', roCode = '' } = {}) => {
  const normNumber = normalizeROPart(roNumber);
  const normCode = normalizeROPart(roCode);

  return {
    roNumber: normNumber,
    roCode: normCode,
    roKey: normNumber || normCode,
  };
};

const buildDuplicateROFilter = (roNumber, roCode, excludeCarId = null) => {
  const tokens = getROLookupTokens(roNumber, roCode);
  if (tokens.length === 0) return null;

  const filter = {
    $or: tokens.flatMap((token) => [
      { roKey: token },
      { roNumber: token },
      { roCode: token },
    ]),
  };

  if (excludeCarId) {
    filter._id = { $ne: excludeCarId };
  }

  return filter;
};

module.exports = {
  normalizeROPart,
  getROLookupTokens,
  normalizeROFields,
  buildDuplicateROFilter,
};
