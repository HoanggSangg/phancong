const { createManualOperationLog } = require('../utils/createManualOperationLog');
const QrLabel = require('../models/QrLabel');

const MAX_ITEMS = 200;

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeItems = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const map = new Map();
  list.slice(0, MAX_ITEMS).forEach((item) => {
    const code = String(item?.code || item?.ma || '').trim();
    if (!code) return;
    const name = String(item?.name || item?.ten || '').trim();
    const qty = Math.max(1, Number(item?.soLuong ?? item?.qty ?? 1) || 1);
    const prev = map.get(code);
    if (prev) {
      prev.soLuong += qty;
      if (name) prev.name = name;
      return;
    }
    map.set(code, { code, name, soLuong: qty });
  });
  return [...map.values()];
};

const upsertQrLabels = async (items, user, method, printedAt = new Date()) => {
  const actor = user?.fullName || user?.username || '';
  await Promise.all(items
    .filter((item) => item.code && item.name)
    .map((item) => QrLabel.findOneAndUpdate(
      { code: item.code },
      {
        $set: {
          name: item.name,
          lastSoLuong: item.soLuong,
          lastMethod: method,
          lastPrintedAt: printedAt,
          lastPrintedBy: user?._id || null,
          lastPrintedByName: actor,
        },
        $inc: { printCount: 1 },
        $setOnInsert: { code: item.code },
      },
      { upsert: true },
    )));
};

let catalogBackfill = null;

const ensureLabelCatalog = () => {
  if (!catalogBackfill) {
    catalogBackfill = (async () => {
      const existing = await QrLabel.estimatedDocumentCount();
      if (existing > 0) return;
      const OperationLog = require('../models/OperationLog');
      const logs = await OperationLog.find({
        module: 'label',
        'metadata.items.0': { $exists: true },
      })
        .sort({ createdAt: 1 })
        .select('metadata createdAt user fullName username')
        .lean();

      const ops = [];
      logs.forEach((log) => {
        const items = normalizeItems(log.metadata?.items);
        if (!items.length) return;
        const method = String(log.metadata?.method || 'print').toLowerCase() === 'pdf' ? 'pdf' : 'print';
        const actor = log.fullName || log.username || '';
        items.forEach((item) => {
          if (!item.code || !item.name) return;
          ops.push({
            updateOne: {
              filter: { code: item.code },
              update: {
                $set: {
                  name: item.name,
                  lastSoLuong: item.soLuong,
                  lastMethod: method,
                  lastPrintedAt: log.createdAt || new Date(),
                  lastPrintedBy: log.user || null,
                  lastPrintedByName: actor,
                },
                $inc: { printCount: 1 },
                $setOnInsert: { code: item.code },
              },
              upsert: true,
            },
          });
        });
      });

      if (ops.length) {
        await QrLabel.bulkWrite(ops, { ordered: true });
      }
    })().catch((err) => {
      catalogBackfill = null;
      console.error('Không khôi phục được danh mục tem từ lịch sử:', err);
    });
  }
  return catalogBackfill;
};

const logLabelPrint = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Chưa đăng nhập' });
    }

    const method = String(req.body?.method || 'print').toLowerCase() === 'pdf' ? 'pdf' : 'print';
    const items = normalizeItems(req.body?.items);
    if (!items.length) {
      return res.status(400).json({ message: 'Chưa có tem để ghi lịch sử.' });
    }

    const widthMm = Number(req.body?.widthMm) || 60;
    const heightMm = Number(req.body?.heightMm) || 40;
    const total = items.reduce((sum, item) => sum + Number(item.soLuong || 0), 0);
    const methodLabel = method === 'pdf' ? 'Xuất PDF tem QR' : 'In tem QR';
    const actor = user.fullName || user.username || 'User';
    const codesPreview = items.slice(0, 4).map((item) => item.code).join(', ');
    const more = items.length > 4 ? ` (+${items.length - 4} mã)` : '';
    const targetLabel = items.length === 1
      ? `${items[0].code}${items[0].name ? ` — ${items[0].name}` : ''} × ${items[0].soLuong}`
      : `${total} tem · ${items.length} mã`;

    const details = [
      `Thao tác: ${methodLabel}`,
      `Khổ tem: ${widthMm}×${heightMm} mm`,
      `Tổng số tem: ${total}`,
      `Số mã: ${items.length}`,
      ...items.slice(0, 20).map((item) => (
        `• ${item.code}${item.name ? ` — ${item.name}` : ''} × ${item.soLuong}`
      )),
      items.length > 20 ? `• … và ${items.length - 20} mã khác` : null,
    ].filter(Boolean);

    try {
      await upsertQrLabels(items, user, method);
    } catch (catalogError) {
      console.error('Không lưu được danh mục tem QR:', catalogError);
    }

    await createManualOperationLog({
      user: user._id,
      username: user.username || '',
      fullName: user.fullName || '',
      role: user.role || '',
      action: method === 'pdf' ? 'export_pdf' : 'print',
      module: 'label',
      targetId: items[0]?.code || '',
      targetLabel,
      description: `${actor}: ${methodLabel} ${total} tem — ${codesPreview}${more}`,
      metadata: {
        success: true,
        method,
        methodLabel,
        size: `${widthMm}x${heightMm}mm`,
        widthMm,
        heightMm,
        total,
        itemCount: items.length,
        items,
        details,
      },
    });

    return res.json({ ok: true, total, itemCount: items.length });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Không ghi được lịch sử in tem.' });
  }
};

const listLabelHistory = async (req, res) => {
  try {
    await ensureLabelCatalog();
    const search = String(req.query.search || '').trim();
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (search) {
      const keyword = escapeRegex(search);
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { code: { $regex: keyword, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      QrLabel.find(filter)
        .sort({ lastPrintedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      QrLabel.countDocuments(filter),
    ]);

    return res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Không tải được lịch sử tem.' });
  }
};

module.exports = {
  logLabelPrint,
  listLabelHistory,
};
