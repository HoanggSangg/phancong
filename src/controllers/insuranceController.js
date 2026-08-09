const InsuranceCar = require('../models/InsuranceCar');

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
    payload.externalCarTypeName = String(body.externalCarTypeName || '').trim();
  }
  if (body.advisorName !== undefined) {
    payload.advisorName = String(body.advisorName || '').trim();
  }
  if (body.notes !== undefined) {
    payload.notes = String(body.notes || '').trim();
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
      ];
    }

    const items = await InsuranceCar.find(filter)
      .sort({
        insuranceExpiryDate: 1,
        createdAt: -1,
      })
      .lean();

    res.json(items);
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
