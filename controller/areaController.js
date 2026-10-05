const areaModel = require('../model/areaSchema');
const branchModel = require('../model/branchSchema');
const { logAudit } = require('../utils/auditLogger');

// 1. Add Area (Tenant-Scoped)
async function addArea(req, res) {
  const { areaName, areaCode, branchName } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    if (!areaName) {
      return res.status(400).json({
        success: false,
        message: 'Area name is required',
      });
    }

    if (!orgId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context required to add area',
      });
    }

    // Determine target branch
    let targetBranchId = branchName || req.user?.branch || req.user?.branchId;
    let branchDoc = null;

    if (targetBranchId) {
      branchDoc = await branchModel.findOne({
        _id: targetBranchId,
        organization: orgId,
      });
    }

    if (!branchDoc) {
      branchDoc = await branchModel.findOne({ organization: orgId }).sort({ createdAt: 1 });
    }

    if (!branchDoc) {
      return res.status(404).json({
        success: false,
        message: 'No branch found for your organization. Please create a branch first.',
      });
    }

    const finalAreaCode = areaCode ? areaCode.toUpperCase().trim() : (areaName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'AR') + '-' + Math.floor(100 + Math.random() * 900);

    const newArea = new areaModel({
      organization: orgId,
      areaName: areaName.trim(),
      areaCode: finalAreaCode,
      branchName: branchDoc._id,
      createdBy: req.user.userId,
    });

    await newArea.save();

    await logAudit({
      req,
      action: 'AREA_CREATED',
      module: 'table',
      targetId: newArea._id,
      description: `Dining Area "${newArea.areaName}" created in branch "${branchDoc.branchName}"`,
    });

    return res.status(201).json({
      success: true,
      message: 'Area Added Successfully',
      data: newArea,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. Get Areas By Branch (Tenant-Scoped)
async function getAreaByBranch(req, res) {
  const orgId = req.organizationId || req.user.organizationId;
  const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
  const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';
  const isManager = req.user?.organizationRole === 'MANAGER' || req.user?.role === 'Manager';

  let targetBranch = req.query.branchId;
  if (targetBranch === 'ALL' || targetBranch === 'all') {
    targetBranch = null;
  }

  // Only Staff is locked strictly to their assigned branch (Admin and Manager have multi-branch access)
  const staffBranch = req.user?.branch || req.user?.branchId;
  if (!isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
    targetBranch = staffBranch;
  }

  try {
    const filter = {
      ...(orgId ? { organization: orgId } : {}),
      ...(targetBranch ? { branchName: targetBranch } : {}),
    };

    const data = await areaModel.find(filter)
      .populate('branchName', 'branchName branchCode')
      .sort({ areaName: 1 });

    return res.status(200).json({
      success: true,
      message: 'Data Fetched',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Get All Areas for Organization
async function getAllArea(req, res) {
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const filter = orgId ? { organization: orgId } : {};

    const data = await areaModel.find(filter)
      .populate('branchName', 'branchName branchCode')
      .sort({ areaName: 1 });

    return res.status(200).json({
      success: true,
      message: 'Data Fetched',
      data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. Update Dining Area
async function updateArea(req, res) {
  const { id } = req.params;
  const { areaName, areaCode, branchName } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const area = await areaModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!area) {
      return res.status(404).json({
        success: false,
        message: 'Dining area not found or inaccessible',
      });
    }

    if (areaName) area.areaName = areaName.trim();
    if (areaCode) area.areaCode = areaCode.toUpperCase().trim();
    if (branchName) {
      const branchDoc = await branchModel.findOne({
        _id: branchName,
        organization: orgId,
      });
      if (branchDoc) {
        area.branchName = branchDoc._id;
      }
    }

    await area.save();

    await logAudit({
      req,
      action: 'AREA_UPDATED',
      module: 'table',
      targetId: area._id,
      description: `Dining Area "${area.areaName}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: 'Dining area updated successfully',
      data: area,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Delete Dining Area
async function deleteArea(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const area = await areaModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!area) {
      return res.status(404).json({
        success: false,
        message: 'Dining area not found or inaccessible',
      });
    }

    // Check if any tables are assigned to this area
    const tableModel = require('../model/tableModel');
    const tablesCount = await tableModel.countDocuments({ areaName: id });
    if (tablesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete area "${area.areaName}": ${tablesCount} table(s) are assigned to it. Please delete or reassign them first.`,
      });
    }

    await areaModel.findByIdAndDelete(id);

    await logAudit({
      req,
      action: 'AREA_DELETED',
      module: 'table',
      targetId: id,
      description: `Dining Area "${area.areaName}" deleted`,
    });

    return res.status(200).json({
      success: true,
      message: 'Dining area deleted successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  addArea,
  getAreaByBranch,
  getAllArea,
  updateArea,
  deleteArea,
};