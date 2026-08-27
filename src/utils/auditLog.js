const OperationLog = require('../models/OperationLog');
const Car = require('../models/Car');
const Worker = require('../models/Worker');
const Team = require('../models/Team');
const User = require('../models/User');
const RepairOrderItem = require('../models/RepairOrderItem');
const Location = require('../models/Location');
const Supervisor = require('../models/Supervisor');

const SENSITIVE_KEYS = new Set(['password', 'token', 'newPassword', 'currentPassword']);

const CAR_STATUS_LABELS = {
  pending: 'Chờ sửa',
  working: 'Đang sửa',
  done: 'Sửa xong',
  waiting_wash: 'Chờ rửa',
  waiting_handover: 'Chờ giao',
  additional_repair: 'Sửa bổ sung',
  delivered: 'Đã giao',
};

const ROLE_LABELS = {
  admin: 'Admin',
  giam_sat: 'Giám sát',
  ktv: 'KTV',
  lai_xe: 'Lái xe',
  kho: 'Kho',
  cvdv: 'CVDV',
};

const CONDITION_LABELS = {
  vip: 'VIP',
  good: 'Tốt',
  normal: 'Bình thường',
  warranty: 'Bảo hành',
  rescue: 'Cứu hộ',
};

const CAR_FIELD_LABELS = {
  plateNumber: 'Biển số',
  deliveryTime: 'Giờ giao xe',
  location: 'Địa điểm',
  supervisor: 'Giám sát',
  condition: 'Tình trạng',
  note: 'Ghi chú',
  roCode: 'Mã RO',
  externalCarTypeName: 'Loại xe',
  status: 'Trạng thái',
};

const ROUTE_RULES = [
  { pattern: /^\/api\/auth\/login$/, method: 'POST', action: 'login', module: 'auth', label: 'Đăng nhập' },
  { pattern: /^\/api\/auth\/register$/, method: 'POST', action: 'register', module: 'auth', label: 'Đăng ký' },
  { pattern: /^\/api\/auth\/users$/, method: 'POST', action: 'create', module: 'user', label: 'Tạo tài khoản' },
  { pattern: /^\/api\/auth\/users\/[^/]+$/, method: 'PUT', action: 'update', module: 'user', label: 'Cập nhật tài khoản' },
  { pattern: /^\/api\/auth\/users\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'user', label: 'Xóa tài khoản' },
  { pattern: /^\/api\/cars$/, method: 'POST', action: 'create', module: 'car', label: 'Thêm xe' },
  { pattern: /^\/api\/cars\/[^/]+$/, method: 'PUT', action: 'update', module: 'car', label: 'Cập nhật xe' },
  { pattern: /^\/api\/cars\/[^/]+\/status$/, method: 'PUT', action: 'update_status', module: 'car', label: 'Cập nhật trạng thái xe' },
  { pattern: /^\/api\/cars\/[^/]+\/repair-items\/assignments$/, method: 'PUT', action: 'assign_workers', module: 'car', label: 'Phân công thợ hạng mục' },
  { pattern: /^\/api\/cars\/[^/]+\/repair-items\/manual$/, method: 'PUT', action: 'manual_items', module: 'car', label: 'Cập nhật hạng mục sửa chữa' },
  { pattern: /^\/api\/cars\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'car', label: 'Xóa xe' },
  { pattern: /^\/api\/worker$/, method: 'POST', action: 'create', module: 'worker', label: 'Thêm thợ' },
  { pattern: /^\/api\/worker\/import$/, method: 'POST', action: 'import', module: 'worker', label: 'Import danh sách thợ' },
  { pattern: /^\/api\/worker\/[^/]+\/count-revenue$/, method: 'PATCH', action: 'toggle_revenue', module: 'worker', label: 'Bật/tắt tính doanh thu thợ' },
  { pattern: /^\/api\/worker\/[^/]+\/manual-jobs$/, method: 'POST', action: 'add_job', module: 'worker', label: 'Thêm việc thủ công cho thợ' },
  { pattern: /^\/api\/worker\/[^/]+\/manual-jobs\/[^/]+$/, method: 'DELETE', action: 'remove_job', module: 'worker', label: 'Xóa việc thủ công của thợ' },
  { pattern: /^\/api\/worker\/[^/]+$/, method: 'PUT', action: 'update', module: 'worker', label: 'Cập nhật thợ' },
  { pattern: /^\/api\/worker\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'worker', label: 'Xóa thợ' },
  { pattern: /^\/api\/locations$/, method: 'POST', action: 'create', module: 'location', label: 'Thêm địa điểm' },
  { pattern: /^\/api\/locations\/[^/]+$/, method: 'PUT', action: 'update', module: 'location', label: 'Cập nhật địa điểm' },
  { pattern: /^\/api\/locations\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'location', label: 'Xóa địa điểm' },
  { pattern: /^\/api\/supervisors$/, method: 'POST', action: 'create', module: 'supervisor', label: 'Thêm giám sát' },
  { pattern: /^\/api\/supervisors\/[^/]+$/, method: 'PUT', action: 'update', module: 'supervisor', label: 'Cập nhật giám sát' },
  { pattern: /^\/api\/supervisors\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'supervisor', label: 'Xóa giám sát' },
  { pattern: /^\/api\/teams$/, method: 'POST', action: 'create', module: 'team', label: 'Tạo tổ' },
  { pattern: /^\/api\/teams\/[^/]+$/, method: 'PUT', action: 'update', module: 'team', label: 'Cập nhật tổ' },
  { pattern: /^\/api\/teams\/[^/]+$/, method: 'DELETE', action: 'delete', module: 'team', label: 'Xóa tổ' },
  { pattern: /^\/api\/teams\/[^/]+\/workers$/, method: 'POST', action: 'add_member', module: 'team', label: 'Thêm thợ vào tổ' },
  { pattern: /^\/api\/teams\/[^/]+\/workers\/[^/]+$/, method: 'DELETE', action: 'remove_member', module: 'team', label: 'Xóa thợ khỏi tổ' },
];

const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;

  const scrub = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result = Array.isArray(obj) ? [] : {};
    Object.entries(obj).forEach(([key, value]) => {
      if (SENSITIVE_KEYS.has(key)) return;
      if (value && typeof value === 'object') {
        result[key] = scrub(value);
      } else {
        result[key] = value;
      }
    });
    return result;
  };

  return scrub(payload);
};

const matchRouteRule = (method, path) =>
  ROUTE_RULES.find((rule) => rule.method === method && rule.pattern.test(path));

const getAuditLabel = (req, fallback = '') =>
  req.auditDeleted?.label
  || req.auditDeleted?.name
  || req.auditDeleted?.fullName
  || fallback;

const formatStatus = (status) => {
  if (Array.isArray(status)) {
    return status.map((s) => CAR_STATUS_LABELS[s] || s).join(', ');
  }
  return CAR_STATUS_LABELS[status] || status || '';
};

const pickEntity = (responseBody) => {
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody)) return null;
  if (responseBody.plateNumber) return responseBody;
  if (responseBody.user) return responseBody.user;
  if (responseBody.car) return responseBody.car;
  if (responseBody.worker) return responseBody.worker;
  if (responseBody.team) return responseBody.team;
  if (responseBody.location) return responseBody.location;
  if (responseBody.supervisor) return responseBody.supervisor;
  if (responseBody.woker) return responseBody.woker;
  if (responseBody.data && typeof responseBody.data === 'object' && !Array.isArray(responseBody.data)) {
    return responseBody.data;
  }
  if (responseBody._id) return responseBody;
  return null;
};

const resolveCarPlate = async (carId, entity, body) => {
  if (body?.plateNumber) return body.plateNumber;
  if (entity?.plateNumber) return entity.plateNumber;
  if (!carId) return null;
  const car = await Car.findById(carId).select('plateNumber').lean();
  return car?.plateNumber || null;
};

const resolveWorkerName = async (workerId, entity, body) => {
  if (body?.name) return body.name;
  if (entity?.name) return entity.name;
  if (!workerId) return null;
  const worker = await Worker.findById(workerId).select('name').lean();
  return worker?.name || null;
};

const resolveTeamName = async (teamId, entity, body) => {
  if (body?.name) return body.name;
  if (entity?.name) return entity.name;
  if (!teamId) return null;
  const team = await Team.findById(teamId).select('name').lean();
  return team?.name || null;
};

const resolveLocationName = async (locationId, entity, body) => {
  if (body?.name) return body.name;
  if (entity?.name) return entity.name;
  if (!locationId) return null;
  const location = await Location.findById(locationId).select('name').lean();
  return location?.name || null;
};

const resolveSupervisorName = async (supervisorId, entity, body) => {
  if (body?.name) return body.name;
  if (entity?.name) return entity.name;
  if (!supervisorId) return null;
  const supervisor = await Supervisor.findById(supervisorId).select('name').lean();
  return supervisor?.name || null;
};

const resolveUserLabel = async (userId, entity, body) => {
  if (body?.fullName || body?.username) {
    return body.fullName
      ? `${body.fullName} (@${body.username || '—'})`
      : body.username;
  }
  if (entity?.fullName || entity?.username) {
    return entity.fullName
      ? `${entity.fullName} (@${entity.username})`
      : entity.username;
  }
  if (!userId) return null;
  const user = await User.findById(userId).select('fullName username').lean();
  if (!user) return null;
  return user.fullName ? `${user.fullName} (@${user.username})` : user.username;
};

const extractTarget = async (req, responseBody, rule) => {
  const body = req.body || {};
  const entity = pickEntity(responseBody);
  const params = req.params || {};
  const carId = params.id || entity?._id;

  if (rule.module === 'car') {
    const plate = await resolveCarPlate(carId, entity, body);
    return {
      targetId: entity?._id || params.id || null,
      targetLabel: plate,
    };
  }

  if (rule.module === 'user') {
    const label = await resolveUserLabel(params.id || entity?._id, entity, body);
    return {
      targetId: entity?._id || params.id || null,
      targetLabel: label,
    };
  }

  if (rule.module === 'worker') {
    const name = await resolveWorkerName(params.id || params.workerId || entity?._id, entity, body);
    return {
      targetId: entity?._id || params.id || params.workerId || null,
      targetLabel: name,
    };
  }

  if (rule.module === 'woker') {
    return {
      targetId: entity?._id || params.id || null,
      targetLabel: body.vieclamChiTiet || entity?.vieclamChiTiet || params.id || null,
    };
  }

  if (rule.module === 'location') {
    const name = await resolveLocationName(params.id || entity?._id, entity, body)
      || getAuditLabel(req);
    return {
      targetId: entity?._id || params.id || null,
      targetLabel: name || params.id || null,
    };
  }

  if (rule.module === 'supervisor') {
    const name = await resolveSupervisorName(params.id || entity?._id, entity, body)
      || getAuditLabel(req);
    return {
      targetId: entity?._id || params.id || null,
      targetLabel: name || params.id || null,
    };
  }

  if (rule.module === 'team') {
    const name = await resolveTeamName(params.teamId || params.id || entity?._id, entity, body)
      || getAuditLabel(req);
    return {
      targetId: entity?._id || params.teamId || params.id || null,
      targetLabel: name || params.teamId || params.id || null,
    };
  }

  if (rule.module === 'auth') {
    const user = responseBody?.user || entity;
    return {
      targetId: user?._id || null,
      targetLabel: user?.username || body.username || null,
    };
  }

  return {
    targetId: params.id || params.teamId || params.workerId || null,
    targetLabel: null,
  };
};

const buildUserChangeDetails = (body) => {
  const details = [];
  if (body.fullName) details.push(`Họ tên → ${body.fullName}`);
  if (body.role) details.push(`Vai trò → ${ROLE_LABELS[body.role] || body.role}`);
  if (typeof body.isActive === 'boolean') {
    details.push(body.isActive ? 'Kích hoạt tài khoản' : 'Khóa tài khoản');
  }
  if (body.workerId === null || body.workerId === '') details.push('Gỡ liên kết thợ');
  else if (body.workerId) details.push('Liên kết thợ mới');
  if (body.password) details.push('Đổi mật khẩu');
  return details;
};

const buildCarChangeDetails = (body) => {
  const details = [];
  Object.entries(body).forEach(([key, value]) => {
    if (['workers', 'repairItems', '_id', 'createdAt', 'updatedAt'].includes(key)) return;
    if (value === undefined || value === null || value === '') return;
    const label = CAR_FIELD_LABELS[key] || key;
    if (key === 'condition') {
      details.push(`${label}: ${CONDITION_LABELS[value] || value}`);
    } else if (key === 'status') {
      details.push(`${label}: ${formatStatus(value)}`);
    } else {
      details.push(`${label}: ${value}`);
    }
  });
  if (Array.isArray(body.workers)) {
    details.push(`Phân công ${body.workers.length} thợ`);
  }
  return details;
};

const collectWorkerIdsFromAssignments = (assignments = []) => {
  const ids = new Set();
  assignments.forEach((assignment) => {
    const workers = assignment.workers || [];
    workers.forEach((w) => {
      if (w?.workerId) ids.add(String(w.workerId));
    });
    if (assignment.workerId) ids.add(String(assignment.workerId));
  });
  return [...ids];
};

const formatWorkerList = (workers = [], workerNameMap) => {
  if (!workers.length) return 'Gỡ phân công thợ';

  return workers
    .map((entry) => {
      const workerId = entry.workerId || entry.worker;
      const name = workerNameMap.get(String(workerId)) || workerId || '—';
      const percentage = Number(entry.percentage) || 0;
      return `${name} (${percentage}%)`;
    })
    .join(', ');
};

const formatRepairItemLabel = (item, fallbackId = '') => {
  if (!item) return `Hạng mục ${fallbackId || '—'}`;

  const group = item.groupName ? `[${item.groupName}] ` : '';
  const content = item.content || item.name || fallbackId || '—';
  return `${group}${content}`.trim();
};

const buildWorkerNameMap = async (workerIds = []) => {
  if (!workerIds.length) return new Map();

  const workers = await Worker.find({ _id: { $in: workerIds } }).select('name').lean();
  return new Map(workers.map((worker) => [String(worker._id), worker.name]));
};

const buildRepairAssignmentDetails = async (assignments = []) => {
  if (!assignments.length) return [];

  const itemIds = assignments.map((assignment) => assignment.itemId).filter(Boolean);
  const repairItems = itemIds.length
    ? await RepairOrderItem.find({ _id: { $in: itemIds } }).select('content groupName').lean()
    : [];
  const itemMap = new Map(repairItems.map((item) => [String(item._id), item]));

  const workerNameMap = await buildWorkerNameMap(collectWorkerIdsFromAssignments(assignments));

  return assignments.map((assignment) => {
    const item = itemMap.get(String(assignment.itemId));
    const itemLabel = formatRepairItemLabel(
      assignment.content || assignment.groupName
        ? { groupName: assignment.groupName, content: assignment.content }
        : item,
      assignment.itemId
    );
    const workers = Array.isArray(assignment.workers)
      ? assignment.workers
      : assignment.workerId
        ? [{ workerId: assignment.workerId, percentage: 100 }]
        : [];
    const workerText = formatWorkerList(workers, workerNameMap);
    return `${itemLabel} → ${workerText}`;
  });
};

const buildManualRepairAssignmentDetails = async (items = []) => {
  if (!items.length) return [];

  const workerNameMap = await buildWorkerNameMap(
    items.flatMap((item) => collectWorkerIdsFromAssignments([{ workers: item.workers }]))
  );

  return items.map((item) => {
    const itemLabel = formatRepairItemLabel(item);
    const workers = Array.isArray(item.workers) ? item.workers : [];
    const workerText = formatWorkerList(workers, workerNameMap);
    const actionLabel = !item._id || String(item._id).startsWith('temp-') ? 'Thêm mới' : 'Cập nhật';
    const amount = item.amount != null ? `, ${Number(item.amount).toLocaleString('vi-VN')} đ` : '';
    return `${actionLabel}: ${itemLabel}${amount} → ${workerText}`;
  });
};

const buildDetailedDescription = async ({
  req,
  responseBody,
  rule,
  user,
  targetId,
  targetLabel,
}) => {
  const body = req.body || {};
  const entity = pickEntity(responseBody);
  const params = req.params || {};
  const responseMessage = typeof responseBody?.message === 'string' ? responseBody.message : '';
  const details = [];
  let description = '';

  const key = `${rule.module}:${rule.action}`;

  switch (key) {
    case 'auth:login':
      description = user
        ? `Đăng nhập — ${user.fullName || user.username} (@${user.username}), vai trò ${ROLE_LABELS[user.role] || user.role}`
        : `Đăng nhập — ${body.username || 'không xác định'}`;
      break;

    case 'auth:register':
      description = `Đăng ký tài khoản — ${user?.fullName || user?.username} (@${user?.username})`;
      if (user?.role) details.push(`Vai trò: ${ROLE_LABELS[user.role] || user.role}`);
      break;

    case 'user:create':
      description = `Tạo tài khoản ${body.username} — ${body.fullName}`;
      details.push(`Vai trò: ${ROLE_LABELS[body.role] || body.role || 'KTV'}`);
      details.push(body.isActive === false ? 'Trạng thái: Khóa' : 'Trạng thái: Hoạt động');
      if (body.workerId) details.push('Có liên kết thợ');
      break;

    case 'user:update': {
      const label = targetLabel || params.id;
      description = `Cập nhật tài khoản ${label}`;
      details.push(...buildUserChangeDetails(body));
      if (!details.length) details.push('Cập nhật thông tin tài khoản');
      break;
    }

    case 'user:delete': {
      const userInfo = req.auditDeleted?.label || responseBody?.user;
      const label = typeof userInfo === 'string'
        ? userInfo
        : userInfo?.fullName
          ? `${userInfo.fullName} (@${userInfo.username})`
          : userInfo?.username || targetLabel || params.id;
      description = `Xóa tài khoản ${label}`;
      break;
    }

    case 'car:create': {
      const plate = body.plateNumber || entity?.plateNumber || '—';
      description = `Thêm xe ${plate}`;
      const carType = body.externalCarTypeName || entity?.externalCarTypeName;
      if (carType) details.push(`Loại xe: ${carType}`);
      if (body.condition) details.push(`Tình trạng: ${CONDITION_LABELS[body.condition] || body.condition}`);
      if (body.deliveryTime) details.push(`Giờ giao: ${body.deliveryTime}`);
      if (body.roCode) details.push(`Mã RO: ${body.roCode}`);
      if (Array.isArray(body.workers) && body.workers.length) {
        details.push(`Phân công ${body.workers.length} thợ`);
      }
      if (Array.isArray(body.repairItems) && body.repairItems.length) {
        details.push(`${body.repairItems.length} hạng mục sửa chữa`);
      }
      break;
    }

    case 'car:update': {
      const plate = await resolveCarPlate(params.id, entity, body);
      description = `Cập nhật xe ${plate}`;
      details.push(...buildCarChangeDetails(body));
      if (!details.length) details.push('Cập nhật thông tin xe');
      break;
    }

    case 'car:update_status': {
      const carEntity = entity?.car || entity;
      const plate = await resolveCarPlate(params.id, carEntity, body);
      const statusLabel = formatStatus(body.status);
      description = responseMessage
        ? `Xe ${plate}: ${responseMessage}`
        : `Xe ${plate}: đổi trạng thái → ${statusLabel}`;
      if (body.status && !responseMessage.includes(statusLabel)) {
        details.push(`Trạng thái mới: ${statusLabel}`);
      }
      if (entity?.status) details.push(`Xác nhận: ${formatStatus(entity.status)}`);
      if (body.newWorkerId) {
        const workerName = await resolveWorkerName(body.newWorkerId);
        if (workerName) details.push(`Gán thợ: ${workerName}`);
      }
      const locationName = carEntity?.location?.name
        || await resolveLocationName(carEntity?.location, carEntity?.location, body);
      const supervisorName = carEntity?.supervisor?.name
        || await resolveSupervisorName(carEntity?.supervisor, carEntity?.supervisor, body);
      if (locationName) details.push(`Địa điểm: ${locationName}`);
      if (supervisorName) details.push(`Giám sát: ${supervisorName}`);
      break;
    }

    case 'car:assign_workers': {
      const plate = await resolveCarPlate(params.id, null, body);
      const assignments = Array.isArray(req.auditChanges?.assignments)
        ? req.auditChanges.assignments
        : [];
      const assignmentDetails = await buildRepairAssignmentDetails(assignments);
      description = assignments.length === 1
        ? `Xe ${plate}: cập nhật phân công hạng mục báo giá`
        : `Xe ${plate}: cập nhật phân công ${assignments.length} hạng mục báo giá`;
      details.push(...assignmentDetails);
      break;
    }

    case 'car:manual_items': {
      const plate = await resolveCarPlate(params.id, null, body);
      const items = Array.isArray(req.auditChanges?.manualItems)
        ? req.auditChanges.manualItems
        : [];
      const deletedItems = Array.isArray(req.auditChanges?.deletedManualItems)
        ? req.auditChanges.deletedManualItems
        : [];
      const manualDetails = await buildManualRepairAssignmentDetails(items);
      const deletedDetails = deletedItems.map(
        (item) => `Xóa: ${formatRepairItemLabel(item)}`
      );
      const totalChanges = items.length + deletedItems.length;

      description = totalChanges === 1
        ? `Xe ${plate}: cập nhật công việc ngoài báo giá`
        : `Xe ${plate}: cập nhật ${totalChanges} công việc ngoài báo giá`;
      details.push(...manualDetails, ...deletedDetails);
      break;
    }

    case 'car:delete': {
      const plate = getAuditLabel(req, targetLabel) || responseMessage?.match(/Xe (.+?) đã/)?.[1];
      description = plate ? `Xóa xe ${plate}` : (responseMessage || `Xóa xe ${params.id}`);
      break;
    }

    case 'worker:create':
      description = `Thêm thợ ${body.name || entity?.name || '—'}`;
      if (body.team) details.push('Gán vào tổ');
      if (body.phone) details.push(`SĐT: ${body.phone}`);
      break;

    case 'worker:update': {
      const name = await resolveWorkerName(params.id, entity, body);
      description = `Cập nhật thợ ${name}`;
      if (body.name) details.push(`Tên mới: ${body.name}`);
      if (body.phone) details.push(`SĐT: ${body.phone}`);
      if (body.team) details.push('Đổi tổ');
      if (typeof body.countRevenue === 'boolean') {
        details.push(body.countRevenue ? 'Bật tính doanh thu' : 'Tắt tính doanh thu');
      }
      if (!details.length) details.push('Cập nhật thông tin thợ');
      break;
    }

    case 'worker:delete': {
      const name = getAuditLabel(req, targetLabel || params.id);
      description = `Xóa thợ ${name}`;
      break;
    }

    case 'worker:import': {
      const workers = Array.isArray(body.workers) ? body.workers : [];
      description = `Import ${workers.length} thợ từ danh sách`;
      if (responseBody?.created) details.push(`Tạo mới: ${responseBody.created}`);
      if (responseBody?.updated) details.push(`Cập nhật: ${responseBody.updated}`);
      break;
    }

    case 'worker:toggle_revenue': {
      const name = await resolveWorkerName(params.id, entity, body);
      const enabled = body.countRevenue ?? entity?.countRevenue;
      description = `Thợ ${name}: ${enabled ? 'bật' : 'tắt'} tính doanh thu`;
      break;
    }

    case 'worker:add_job': {
      const name = await resolveWorkerName(params.id, entity, body);
      description = `Thợ ${name}: thêm việc ghi tay`;
      if (body.content) details.push(`Nội dung: ${body.content.trim()}`);
      if (body.date) details.push(`Ngày: ${body.date}`);
      break;
    }

    case 'worker:remove_job': {
      const name = getAuditLabel(req, await resolveWorkerName(params.id, entity, body));
      description = `Thợ ${name}: xóa việc ghi tay`;
      const jobContent = req.auditDeleted?.jobContent;
      if (jobContent) details.push(`Nội dung: ${jobContent}`);
      break;
    }

    case 'woker:create': {
      const workerName = await resolveWorkerName(body.worker, null, body);
      const plate = body.car ? await resolveCarPlate(body.car) : null;
      description = `Tạo công việc cho thợ ${workerName || '—'}`;
      if (body.vieclamChiTiet) details.push(`Chi tiết: ${body.vieclamChiTiet}`);
      if (plate) details.push(`Xe: ${plate}`);
      if (body.status) details.push(`Trạng thái: ${body.status === 'co_viec' ? 'Có việc' : 'Chưa có việc'}`);
      break;
    }

    case 'woker:update': {
      const workerName = await resolveWorkerName(entity?.worker || body.worker, entity, body);
      description = `Cập nhật công việc thợ ${workerName || '—'}`;
      if (body.vieclamChiTiet || entity?.vieclamChiTiet) {
        details.push(`Chi tiết: ${body.vieclamChiTiet || entity?.vieclamChiTiet}`);
      }
      if (body.status) details.push(`Trạng thái: ${body.status === 'co_viec' ? 'Có việc' : 'Chưa có việc'}`);
      break;
    }

    case 'woker:delete': {
      const workerName = req.auditDeleted?.workerName;
      const plate = req.auditDeleted?.plateNumber;
      const detail = req.auditDeleted?.vieclamChiTiet;
      description = `Xóa công việc thợ ${workerName || '—'}`;
      if (detail) details.push(`Chi tiết: ${detail}`);
      if (plate) details.push(`Xe: ${plate}`);
      break;
    }

    case 'location:create':
      description = `Thêm địa điểm "${body.name || entity?.name || '—'}"`;
      break;

    case 'location:update': {
      const name = targetLabel || body.name || params.id;
      description = `Cập nhật địa điểm "${name}"`;
      if (body.name) details.push(`Tên mới: ${body.name}`);
      break;
    }

    case 'location:delete': {
      const name = getAuditLabel(req, targetLabel || params.id);
      description = `Xóa địa điểm "${name}"`;
      break;
    }

    case 'supervisor:create':
      description = `Thêm giám sát "${body.name || entity?.name || '—'}"`;
      break;

    case 'supervisor:update': {
      const name = targetLabel || body.name || params.id;
      description = `Cập nhật giám sát "${name}"`;
      if (body.name) details.push(`Tên mới: ${body.name}`);
      break;
    }

    case 'supervisor:delete': {
      const name = getAuditLabel(req, targetLabel || params.id);
      description = `Xóa giám sát "${name}"`;
      break;
    }

    case 'team:create': {
      const name = body.name || entity?.name || req.auditDeleted?.name || '—';
      description = `Tạo tổ "${name}"`;
      if (body.status) details.push(`Trạng thái: ${body.status}`);
      break;
    }

    case 'team:update': {
      const name = targetLabel || body.name || params.teamId;
      description = `Cập nhật tổ "${name}"`;
      if (body.name) details.push(`Tên mới: ${body.name}`);
      if (body.status) details.push(`Trạng thái: ${body.status}`);
      break;
    }

    case 'team:delete': {
      const name = getAuditLabel(req, targetLabel || params.teamId);
      description = `Xóa tổ "${name}"`;
      if (req.auditDeleted?.workerCount) {
        details.push(`${req.auditDeleted.workerCount} thợ được gỡ khỏi tổ`);
      }
      break;
    }

    case 'team:add_member': {
      const teamName = await resolveTeamName(params.teamId);
      const workerName = await resolveWorkerName(body.workerId);
      description = `Thêm thợ ${workerName} vào tổ ${teamName}`;
      break;
    }

    case 'team:remove_member': {
      const teamName = await resolveTeamName(params.teamId);
      const workerName = await resolveWorkerName(params.workerId);
      description = `Xóa thợ ${workerName} khỏi tổ ${teamName}`;
      break;
    }

    default: {
      const actor = user?.fullName || user?.username || 'Hệ thống';
      const detail = targetLabel ? ` — ${targetLabel}` : '';
      description = `${actor}: ${rule.label}${detail}`;
    }
  }

  return { description, details: details.filter(Boolean) };
};

const logOperation = async ({
  req,
  res,
  responseBody,
  user: explicitUser,
  rule: explicitRule,
}) => {
  const method = req.method;
  const path = (req.originalUrl || req.url || '').split('?')[0];
  const rule = explicitRule || matchRouteRule(method, path);

  if (!rule) return null;

  const responseUser = responseBody?.user || pickEntity(responseBody);
  const user = explicitUser || req.user || (rule.module === 'auth' ? responseUser : null);

  if (!user && rule.module !== 'auth') return null;

  if (req.auditChanges) {
    if (rule.action === 'assign_workers' && !(req.auditChanges.assignments || []).length) {
      return null;
    }

    if (rule.action === 'manual_items') {
      const manualCount = (req.auditChanges.manualItems || []).length;
      const deletedCount = (req.auditChanges.deletedManualItems || []).length;
      if (manualCount + deletedCount === 0) return null;
    }
  }

  const { targetId, targetLabel } = await extractTarget(req, responseBody, rule);
  const { description: baseDescription, details: baseDetails } = await buildDetailedDescription({
    req,
    responseBody,
    rule,
    user,
    targetId,
    targetLabel,
  });

  const statusCode = Number(res?.statusCode) || 200;
  const success = statusCode >= 200 && statusCode < 300;
  const errorMessage = success
    ? ''
    : String(responseBody?.detail || responseBody?.message || responseBody?.title || '').trim()
      || `HTTP ${statusCode}`;
  const details = [...(baseDetails || [])];
  let description = baseDescription;

  if (!success) {
    details.unshift('Kết quả: Không thực hiện được');
    if (errorMessage && !details.some((line) => String(line).includes(errorMessage))) {
      details.push(`Lý do: ${errorMessage}`);
    }
    description = `Không thực hiện được — ${baseDescription}${errorMessage ? `. ${errorMessage}` : ''}`;
  }

  return OperationLog.create({
    user: user?._id || null,
    username: user?.username || req.body?.username || '',
    fullName: user?.fullName || '',
    role: user?.role || '',
    action: rule.action,
    module: rule.module,
    targetId: targetId ? String(targetId) : '',
    targetLabel: targetLabel ? String(targetLabel) : '',
    description,
    metadata: {
      success,
      method,
      path,
      params: req.params || {},
      body: sanitizePayload(req.body),
      details,
      errorMessage,
      statusCode,
    },
  });
};

const shouldAuditResponse = (req, statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return true;
  if (statusCode < 400) return false;
  if (statusCode !== 401) return true;
  const path = (req.originalUrl || req.url || '').split('?')[0];
  const rule = matchRouteRule(req.method, path);
  return rule?.module === 'auth';
};

const setupAuditLog = (req, res) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (shouldAuditResponse(req, res.statusCode || 200)) {
      logOperation({ req, res, responseBody: body }).catch((err) => {
        console.error('Audit log error:', err.message);
      });
    }
    return originalJson(body);
  };
};

module.exports = {
  logOperation,
  setupAuditLog,
  matchRouteRule,
};
