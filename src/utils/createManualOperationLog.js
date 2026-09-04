const OperationLog = require('../models/OperationLog');

/** Ghi OperationLog thủ công (tem / xuất kho / ảnh / publish). Không thay middleware audit. */
const createManualOperationLog = (payload) => OperationLog.create(payload);

module.exports = { createManualOperationLog };
