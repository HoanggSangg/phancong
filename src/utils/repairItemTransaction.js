const mongoose = require('mongoose');

// Mongoose propagates the transaction session to every query in the callback.
mongoose.set('transactionAsyncLocalStorage', true);

const invokeHandler = async (handler, req) => {
  let status = 200;
  let result;
  let failure;
  const response = {
    status(code) { status = code; return this; },
    json(body) {
      if (status >= 400) {
        failure ||= Object.assign(new Error(body.message || 'Lưu phân công thất bại'), { status });
        throw failure;
      }
      result = body;
      return body;
    },
  };
  await handler(req, response);
  return result;
};

const transactionalRepairHandler = (handler) => async (req, res) => {
  const previousAudit = req.auditChanges;
  try {
    const result = await mongoose.connection.transaction(async () => {
      req.auditChanges = previousAudit;
      return handler(req);
    });
    return res.json(result);
  } catch (error) {
    req.auditChanges = previousAudit;
    const unsupported = /Transaction numbers are only allowed|replica set|mongos/i.test(error.message);
    return res.status(unsupported ? 503 : (error.status || 500)).json({
      message: unsupported
        ? 'Chưa lưu dữ liệu. MongoDB cần replica set để lưu toàn bộ phân công trong một transaction.'
        : error.message,
    });
  }
};

module.exports = { invokeHandler, transactionalRepairHandler };
