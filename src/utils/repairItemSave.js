const RepairOrderItem = require('../models/RepairOrderItem');
const { getPinnedRevenueDate } = require('./revenue');

const invokeHandler = async (handler, req) => {
  let status = 200;
  let result;
  let failure;
  await handler(req, {
    status(code) { status = code; return this; },
    json(body) {
      if (status >= 400) {
        failure ||= Object.assign(new Error(body.message || 'Lưu phân công thất bại'), { status });
        throw failure;
      }
      result = body;
      return body;
    },
  });
  return result;
};

// Prepare and validate every document before issuing any write. bulkWrite does not
// execute findOneAndUpdate middleware, so pin revenueDate explicitly here.
const prepareRepairUpdate = async (plan, existing, update) => {
  const plain = existing.toObject();
  const revenueDate = getPinnedRevenueDate(plain, { ...plain, ...update });
  const values = { ...update, ...(revenueDate ? { revenueDate } : {}) };
  await new RepairOrderItem({ ...plain, ...values }).validate();
  plan.push({ updateOne: { filter: { _id: existing._id, car: existing.car }, update: { $set: values } } });
};

const prepareRepairInsert = async (plan, values) => {
  const item = new RepairOrderItem(values);
  item.revenueDate = getPinnedRevenueDate(null, item);
  await item.validate();
  plan.push({ insertOne: { document: item.toObject() } });
  return item;
};

const preparedRepairHandler = (prepare, loadResponse) => async (req, res) => {
  const previousAudit = req.auditChanges;
  const plan = [];
  req.repairWritePlan = plan;
  let writing = false;
  try {
    await prepare(req);
    if (plan.length) {
      writing = true;
      await RepairOrderItem.bulkWrite(plan, { ordered: true });
    }
    return res.json(await loadResponse(req));
  } catch (error) {
    req.auditChanges = previousAudit;
    const validationError = error.name === 'ValidationError' || error.name === 'CastError';
    return res.status(error.status || (validationError ? 400 : 500)).json({
      message: writing
        ? 'Lỗi khi ghi hoặc tải lại dữ liệu. Một số hạng mục có thể đã lưu; hãy mở lại chi tiết để kiểm tra trước khi thử lại.'
        : error.message,
    });
  } finally {
    delete req.repairWritePlan;
  }
};

module.exports = { invokeHandler, prepareRepairUpdate, prepareRepairInsert, preparedRepairHandler };
