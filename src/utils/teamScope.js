const mongoose = require('mongoose');
const Worker = require('../models/Worker');

const isGiamSat = (user) => user?.role === 'giam_sat';

const getLinkedWorkerId = (user) => {
  const id = user?.worker?._id || user?.worker;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return String(id);
};

const getLinkedWorker = async (user) => {
  const id = getLinkedWorkerId(user);
  if (!id) return null;
  return Worker.findById(id).select('team teamRole name').lean();
};

const getGiamSatTeamId = async (user) => {
  if (!isGiamSat(user)) return null;
  const worker = await getLinkedWorker(user);
  return worker?.team ? String(worker.team) : null;
};

const getTeamWorkerIds = async (teamId) => {
  if (!teamId) return [];
  const workers = await Worker.find({ team: teamId }).select('_id').lean();
  return workers.map((worker) => String(worker._id));
};

const getGiamSatWorkerIds = async (user) => {
  const teamId = await getGiamSatTeamId(user);
  if (!teamId) return [];
  return getTeamWorkerIds(teamId);
};

const assertGiamSatOwnsWorker = async (user, workerId) => {
  if (!isGiamSat(user)) return true;
  const ids = await getGiamSatWorkerIds(user);
  return ids.includes(String(workerId));
};

const getOutsideWorkerScopeMessage = async (user, workerId) => {
  const { isKtvLike } = require('./permissions');
  if (isKtvLike(user)) {
    const ownId = getLinkedWorkerId(user);
    if (!ownId || ownId !== String(workerId)) {
      return 'Bạn chỉ xem được hồ sơ thợ của mình';
    }
  }
  if (!(await assertGiamSatOwnsWorker(user, workerId))) {
    return 'Bạn chỉ xem được thợ trong tổ của mình';
  }
  return null;
};

const validateGiamSatWorkerLink = (role, linkedWorker) => {
  if (role !== 'giam_sat') return null;
  if (!linkedWorker) {
    return 'Tài khoản giám sát phải liên kết thợ TT của một tổ';
  }
  if (linkedWorker.teamRole !== 'TT' || !linkedWorker.team) {
    return 'Giám sát phải là TT của một tổ. Hãy chọn thợ có chức vụ TT.';
  }
  return null;
};

const wantsTeamScope = (req) =>
  req?.query?.teamScope === '1' || req?.query?.teamScope === 'true';

const resolveGiamSatTeamQuery = async (user, enabled) => {
  if (!enabled || !isGiamSat(user)) return { filter: {} };
  const teamId = await getGiamSatTeamId(user);
  if (!teamId) return { empty: true };
  return { filter: { team: teamId } };
};

module.exports = {
  isGiamSat,
  getLinkedWorkerId,
  getLinkedWorker,
  getGiamSatTeamId,
  getTeamWorkerIds,
  getGiamSatWorkerIds,
  assertGiamSatOwnsWorker,
  getOutsideWorkerScopeMessage,
  validateGiamSatWorkerLink,
  wantsTeamScope,
  resolveGiamSatTeamQuery,
};
