const Team = require('../models/Team');
const Worker = require('../models/Worker');

// Lấy tất cả tổ
exports.getAllTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: -1 });

    const result = await Promise.all(
      teams.map(async (team) => {
        const workers = await Worker.find({ team: team._id });

        return {
          ...team.toObject(),
          workers
        };
      })
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách tổ',
      error: error.message
    });
  }
};

// Lấy chi tiết 1 tổ
exports.getTeamById = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ'
      });
    }

    const workers = await Worker.find({ team: teamId });

    res.status(200).json({
      success: true,
      data: {
        ...team.toObject(),
        workers
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy thông tin tổ',
      error: error.message
    });
  }
};

// Thêm tổ
exports.createTeam = async (req, res) => {
  try {
    const { name, status } = req.body;

    const team = await Team.create({
      name,
      status
    });

    res.status(201).json({
      success: true,
      message: 'Tạo tổ thành công',
      data: team
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi tạo tổ',
      error: error.message
    });
  }
};

// Sửa tổ
exports.updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, status } = req.body;

    const team = await Team.findByIdAndUpdate(
      teamId,
      { name, status },
      {
        new: true,
        runValidators: true
      }
    );

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật tổ thành công',
      data: team
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi cập nhật tổ',
      error: error.message
    });
  }
};

// Xóa tổ
exports.deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findByIdAndDelete(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ'
      });
    }

    const workerCount = await Worker.countDocuments({ team: teamId });

    req.auditDeleted = {
      name: team.name,
      workerCount,
    };

    // Khi xóa tổ thì các thợ thuộc tổ đó sẽ được đưa về chưa có tổ
    await Worker.updateMany(
      { team: teamId },
      { $set: { team: null } }
    );

    res.status(200).json({
      success: true,
      message: 'Xóa tổ thành công'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi xóa tổ',
      error: error.message
    });
  }
};

// Thêm thợ vào tổ
exports.addWorkerToTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { workerId } = req.body;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ'
      });
    }

    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ'
      });
    }

    worker.team = teamId;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Thêm thợ vào tổ thành công',
      data: worker
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi thêm thợ vào tổ',
      error: error.message
    });
  }
};

// Xóa thợ khỏi tổ
exports.removeWorkerFromTeam = async (req, res) => {
  try {
    const { teamId, workerId } = req.params;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tổ'
      });
    }

    const worker = await Worker.findById(workerId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thợ'
      });
    }

    if (!worker.team || worker.team.toString() !== teamId) {
      return res.status(400).json({
        success: false,
        message: 'Thợ này không thuộc tổ này'
      });
    }

    worker.team = null;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Xóa thợ khỏi tổ thành công',
      data: worker
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Lỗi khi xóa thợ khỏi tổ',
      error: error.message
    });
  }
};