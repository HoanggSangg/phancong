const mongoose = require('mongoose');
const WorkerGroup = require('../models/WorkerGroup');
const Worker = require('../models/Worker');

const POPULATE_MEMBERS = { path: 'members.worker', select: 'name soBaoDanh avatar status' };

const normalizeMembers = async (members = []) => {
  const list = Array.isArray(members) ? members : [];
  const seen = new Set();
  const normalized = [];

  for (const entry of list) {
    const workerId = String(entry?.workerId || entry?.worker?._id || entry?.worker || '');
    if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) continue;
    if (seen.has(workerId)) continue;
    seen.add(workerId);

    normalized.push({
      worker: workerId,
      percentage: Math.min(100, Math.max(0, Number(entry.percentage) || 0)),
    });
  }

  const total = normalized.reduce((sum, entry) => sum + entry.percentage, 0);
  if (total > 100.01) {
    const error = new Error(`Tổng % thợ không được vượt quá 100 (hiện tại: ${total}%)`);
    error.status = 400;
    throw error;
  }

  if (normalized.length > 0) {
    const found = await Worker.find({ _id: { $in: normalized.map((entry) => entry.worker) } })
      .select('_id')
      .lean();
    if (found.length !== normalized.length) {
      const error = new Error('Có thợ không tồn tại trong nhóm');
      error.status = 400;
      throw error;
    }
  }

  return normalized;
};

const findDuplicateName = async (name, excludeId = null) => {
  const filter = { name: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
  if (excludeId) filter._id = { $ne: excludeId };
  return WorkerGroup.findOne(filter).select('_id').lean();
};

exports.getAllWorkerGroups = async (req, res) => {
  try {
    const groups = await WorkerGroup.find()
      .populate(POPULATE_MEMBERS)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách nhóm thợ',
      error: error.message,
    });
  }
};

exports.getWorkerGroupById = async (req, res) => {
  try {
    const group = await WorkerGroup.findById(req.params.id).populate(POPULATE_MEMBERS);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm thợ' });
    }

    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy chi tiết nhóm thợ',
      error: error.message,
    });
  }
};

exports.createWorkerGroup = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên nhóm' });
    }

    if (await findDuplicateName(name)) {
      return res.status(400).json({ success: false, message: 'Tên nhóm đã tồn tại' });
    }

    const members = await normalizeMembers(req.body.members);
    const group = await WorkerGroup.create({
      name,
      members,
      status: req.body.status || 'active',
    });

    const populated = await WorkerGroup.findById(group._id).populate(POPULATE_MEMBERS);

    return res.status(201).json({
      success: true,
      message: 'Tạo nhóm thợ thành công',
      data: populated,
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.code === 11000 ? 'Tên nhóm đã tồn tại' : (error.message || 'Lỗi khi tạo nhóm thợ'),
    });
  }
};

exports.updateWorkerGroup = async (req, res) => {
  try {
    const group = await WorkerGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm thợ' });
    }

    if (req.body.name != null) {
      const name = String(req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên nhóm' });
      }
      if (await findDuplicateName(name, group._id)) {
        return res.status(400).json({ success: false, message: 'Tên nhóm đã tồn tại' });
      }
      group.name = name;
    }

    if (req.body.members != null) {
      group.members = await normalizeMembers(req.body.members);
    }

    if (req.body.status) {
      group.status = req.body.status;
    }

    await group.save();
    const populated = await WorkerGroup.findById(group._id).populate(POPULATE_MEMBERS);

    return res.status(200).json({
      success: true,
      message: 'Cập nhật nhóm thợ thành công',
      data: populated,
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.code === 11000 ? 'Tên nhóm đã tồn tại' : (error.message || 'Lỗi khi cập nhật nhóm thợ'),
    });
  }
};

exports.deleteWorkerGroup = async (req, res) => {
  try {
    const group = await WorkerGroup.findByIdAndDelete(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm thợ' });
    }

    req.auditDeleted = {
      name: group.name,
      memberCount: group.members?.length || 0,
    };

    return res.status(200).json({
      success: true,
      message: 'Xóa nhóm thợ thành công',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa nhóm thợ',
      error: error.message,
    });
  }
};
