const InsuranceCar = require('../models/InsuranceCar');
const InsurancePart = require('../models/InsurancePart');

const normalizePlate = (plate = '') => String(plate).toUpperCase().replace(/\s/g, '');

const normalizeTt = (value = '') =>
  String(value || '')
    .toUpperCase()
    .trim()
    .replace(/^HPT\//, '');

const parseDate = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const pickText = (value) => String(value || '').trim();

const pickPayload = (body = {}) => {
  const payload = {};

  if (body.plateNumber !== undefined) {
    payload.plateNumber = normalizePlate(body.plateNumber);
  }
  if (body.soChungTu !== undefined) {
    payload.soChungTu = normalizeTt(body.soChungTu);
  }
  if (body.roNumber !== undefined) {
    payload.roNumber = String(body.roNumber || '').toUpperCase().trim();
  }
  if (body.roCode !== undefined) {
    payload.roCode = String(body.roCode || '').toUpperCase().trim();
  }
  if (body.externalCarTypeName !== undefined) {
    payload.externalCarTypeName = pickText(body.externalCarTypeName);
  }
  if (body.advisorName !== undefined) {
    payload.advisorName = pickText(body.advisorName);
  }
  if (body.insuranceCompanyKey !== undefined) {
    payload.insuranceCompanyKey = pickText(body.insuranceCompanyKey);
  }
  if (body.insurancePolicyNumber !== undefined) {
    payload.insurancePolicyNumber = pickText(body.insurancePolicyNumber);
  }
  if (body.insuranceAssessor !== undefined) {
    payload.insuranceAssessor = pickText(body.insuranceAssessor);
  }
  if (body.insuranceAssessorPhone !== undefined) {
    payload.insuranceAssessorPhone = pickText(body.insuranceAssessorPhone);
  }
  if (body.insuranceStartDate !== undefined) {
    payload.insuranceStartDate = parseDate(body.insuranceStartDate);
  }
  if (body.insuranceApproved !== undefined) {
    payload.insuranceApproved = body.insuranceApproved === true || body.insuranceApproved === 1 || body.insuranceApproved === '1';
  }
  if (body.insuranceApprovedDate !== undefined) {
    payload.insuranceApprovedDate = parseDate(body.insuranceApprovedDate);
  }
  if (body.insuranceFileCompleted !== undefined) {
    payload.insuranceFileCompleted = body.insuranceFileCompleted === true
      || body.insuranceFileCompleted === 1
      || body.insuranceFileCompleted === '1';
  }
  if (body.deductibleAmount !== undefined) {
    const n = Number(body.deductibleAmount);
    payload.deductibleAmount = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  if (body.notes !== undefined) {
    payload.notes = pickText(body.notes);
  }
  if (body.deliveryDate !== undefined) {
    payload.deliveryDate = parseDate(body.deliveryDate);
  }
  if (body.insuranceExpiryDate !== undefined) {
    payload.insuranceExpiryDate = parseDate(body.insuranceExpiryDate);
  }

  return payload;
};

exports.listInsuranceCars = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = [
        { plateNumber: re },
        { soChungTu: re },
        { roNumber: re },
        { roCode: re },
        { notes: re },
        { externalCarTypeName: re },
        { advisorName: re },
        { insuranceCompanyKey: re },
        { insurancePolicyNumber: re },
        { insuranceAssessor: re },
        { insuranceAssessorPhone: re },
      ];
    }

    const sort = {
      // Chưa hoàn tất hồ sơ BH lên trước, rồi theo ngày duyệt BH (mới → cũ)
      insuranceFileCompleted: 1,
      insuranceApprovedDate: -1,
      createdAt: -1,
    };

    const [items, total] = await Promise.all([
      InsuranceCar.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      InsuranceCar.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('❌ listInsuranceCars:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách xe bảo hiểm', error: error.message });
  }
};

exports.getInsuranceCar = async (req, res) => {
  try {
    const item = await InsuranceCar.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ message: 'Không tìm thấy xe bảo hiểm' });
    }
    res.json(item);
  } catch (error) {
    console.error('❌ getInsuranceCar:', error);
    res.status(500).json({ message: 'Lỗi khi lấy xe bảo hiểm', error: error.message });
  }
};

exports.createInsuranceCar = async (req, res) => {
  try {
    const payload = pickPayload(req.body);
    if (!payload.plateNumber) {
      return res.status(400).json({ message: 'Biển số xe là bắt buộc' });
    }

    if (req.user?._id) {
      payload.createdBy = req.user._id;
    }

    const created = await InsuranceCar.create(payload);
    res.status(201).json(created);
  } catch (error) {
    console.error('❌ createInsuranceCar:', error);
    res.status(500).json({ message: 'Lỗi khi thêm xe bảo hiểm', error: error.message });
  }
};

exports.updateInsuranceCar = async (req, res) => {
  try {
    const payload = pickPayload(req.body);
    if (payload.plateNumber === '') {
      return res.status(400).json({ message: 'Biển số xe không được để trống' });
    }

    const updated = await InsuranceCar.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy xe bảo hiểm' });
    }

    res.json(updated);
  } catch (error) {
    console.error('❌ updateInsuranceCar:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật xe bảo hiểm', error: error.message });
  }
};

exports.deleteInsuranceCar = async (req, res) => {
  try {
    const deleted = await InsuranceCar.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy xe bảo hiểm' });
    }

    req.auditDeleted = {
      plateNumber: deleted.plateNumber,
      soChungTu: deleted.soChungTu,
    };

    res.json({ message: 'Xóa xe bảo hiểm thành công' });
  } catch (error) {
    console.error('❌ deleteInsuranceCar:', error);
    res.status(500).json({ message: 'Lỗi khi xóa xe bảo hiểm', error: error.message });
  }
};

const pickPartPayload = (body = {}) => {
  const payload = {};
  if (body.name !== undefined) payload.name = pickText(body.name);
  if (body.carTypeName !== undefined) payload.carTypeName = pickText(body.carTypeName);
  if (body.carBrand !== undefined) payload.carBrand = pickText(body.carBrand);
  if (body.notes !== undefined) payload.notes = pickText(body.notes);
  if (body.costPrice !== undefined) {
    const n = Number(body.costPrice);
    payload.costPrice = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return payload;
};

exports.listInsuranceParts = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      filter.$or = [
        { name: re },
        { carTypeName: re },
        { carBrand: re },
        { notes: re },
      ];
    }

    const [items, total] = await Promise.all([
      InsurancePart.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      InsurancePart.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      },
    });
  } catch (error) {
    console.error('❌ listInsuranceParts:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phụ tùng BH', error: error.message });
  }
};

exports.createInsurancePart = async (req, res) => {
  try {
    const payload = pickPartPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ message: 'Tên phụ tùng là bắt buộc' });
    }
    if (payload.costPrice == null) payload.costPrice = 0;
    if (req.user?._id) payload.createdBy = req.user._id;

    const created = await InsurancePart.create(payload);
    res.status(201).json(created);
  } catch (error) {
    console.error('❌ createInsurancePart:', error);
    res.status(500).json({ message: 'Lỗi khi thêm phụ tùng BH', error: error.message });
  }
};

exports.updateInsurancePart = async (req, res) => {
  try {
    const payload = pickPartPayload(req.body);
    if (payload.name === '') {
      return res.status(400).json({ message: 'Tên phụ tùng không được để trống' });
    }

    const updated = await InsurancePart.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Không tìm thấy phụ tùng BH' });
    }

    res.json(updated);
  } catch (error) {
    console.error('❌ updateInsurancePart:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật phụ tùng BH', error: error.message });
  }
};

exports.deleteInsurancePart = async (req, res) => {
  try {
    const deleted = await InsurancePart.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Không tìm thấy phụ tùng BH' });
    }

    req.auditDeleted = { name: deleted.name };

    res.json({ message: 'Xóa phụ tùng BH thành công' });
  } catch (error) {
    console.error('❌ deleteInsurancePart:', error);
    res.status(500).json({ message: 'Lỗi khi xóa phụ tùng BH', error: error.message });
  }
};
