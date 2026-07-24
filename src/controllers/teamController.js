const Team = require('../models/Team');
const Worker = require('../models/Worker');

const normalizeTeamRole = (role) => (String(role || '').toUpperCase() === 'TT' ? 'TT' : 'KTV');

/** Mỗi tổ chỉ 1 TT — thợ khác trong tổ về KTV */
const demoteOtherTeamLeaders = async (teamId, keepWorkerId) => {
  await Worker.updateMany(
    {
      team: teamId,
      teamRole: 'TT',
      ...(keepWorkerId ? { _id: { $ne: keepWorkerId } } : {}),
    },
    { $set: { teamRole: 'KTV' } }
  );
};

exports.getAllTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: -1 }).lean();
    const workers = await Worker.find({ team: { $ne: null } })
      .select('name soBaoDanh avatar status team teamRole')
      .lean();

    const byTeam = new Map();
    workers.forEach((w) => {
      const tid = String(w.team);
      if (!byTeam.has(tid)) byTeam.set(tid, []);
      byTeam.get(tid).push(w);
    });

    const result = teams.map((team) => ({
      ...team,
      workers: byTeam.get(String(team._id)) || [],
    }));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách tổ',
      error: error.message,
    });
  }
};

exports.getTeamById = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ',
      });
    }

    const workers = await Worker.find({ team: teamId }).select(
      'name soBaoDanh avatar status team teamRole'
    );

    res.status(200).json({
      success: true,
      data: {
        ...team.toObject(),
        workers,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin tổ',
      error: error.message,
    });
  }
};

exports.createTeam = async (req, res) => {
  try {
    const { name, status } = req.body;

    const team = await Team.create({
      name,
      status,
    });

    res.status(201).json({
      success: true,
      message: 'Tạo tổ thành công',
      data: team,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi tạo tổ',
      error: error.message,
    });
  }
};

exports.updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, status } = req.body;

    const team = await Team.findByIdAndUpdate(
      teamId,
      { name, status },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật tổ thành công',
      data: team,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi cập nhật tổ',
      error: error.message,
    });
  }
};

exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findByIdAndDelete(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ',
      });
    }

    const workerCount = await Worker.countDocuments({ team: teamId });

    req.auditDeleted = {
      name: team.name,
      workerCount,
    };

    await Worker.updateMany(
      { team: teamId },
      { $set: { team: null, teamRole: 'KTV' } }
    );

    res.status(200).json({
      success: true,
      message: 'Xóa tổ thành công',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa tổ',
      error: error.message,
    });
  }
};

exports.addWorkerToTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { workerId, teamRole: rawRole } = req.body;
    const teamRole = normalizeTeamRole(rawRole);

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ',
      });
    }

    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ',
      });
    }

    if (teamRole === 'TT') {
      await demoteOtherTeamLeaders(teamId, workerId);
    }

    worker.team = teamId;
    worker.teamRole = teamRole;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Thêm thợ vào tổ thành công',
      data: worker,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi thêm thợ vào tổ',
      error: error.message,
    });
  }
};

exports.updateWorkerTeamRole = async (req, res) => {
  try {
    const { teamId, workerId } = req.params;
    const teamRole = normalizeTeamRole(req.body?.teamRole);

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thợ' });
    }

    if (!worker.team || worker.team.toString() !== teamId) {
      return res.status(400).json({
        success: false,
        message: 'Thợ này không thuộc tổ này',
      });
    }

    if (teamRole === 'TT') {
      await demoteOtherTeamLeaders(teamId, workerId);
    }

    worker.teamRole = teamRole;
    await worker.save();

    res.status(200).json({
      success: true,
      message:
        teamRole === 'TT'
          ? 'Đã đặt làm tổ trưởng (TT). Tổ trưởng cũ (nếu có) chuyển về KTV.'
          : 'Đã đặt chức vụ KTV',
      data: worker,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi cập nhật chức vụ trong tổ',
      error: error.message,
    });
  }
};

exports.removeWorkerFromTeam = async (req, res) => {
  try {
    const { teamId, workerId } = req.params;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ',
      });
    }

    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ',
      });
    }

    if (!worker.team || worker.team.toString() !== teamId) {
      return res.status(400).json({
        success: false,
        message: 'Thợ này không thuộc tổ này',
      });
    }

    worker.team = null;
    worker.teamRole = 'KTV';
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Xóa thợ khỏi tổ thành công',
      data: worker,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi xóa thợ khỏi tổ',
      error: error.message,
    });
  }
};
