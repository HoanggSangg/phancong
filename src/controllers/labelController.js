const { createManualOperationLog } = require('../utils/createManualOperationLog');

const MAX_ITEMS = 200;

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

module.exports = {
  logLabelPrint,
};
