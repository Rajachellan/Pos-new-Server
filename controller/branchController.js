const branchModel = require('../model/branchSchema');
const { logAudit } = require('../utils/auditLogger');

// 1. Add Branch (Tenant-Scoped)
async function addBranch(req, res) {
  const { branchName, branchCode, address } = req.body;
  let orgId = req.organizationId || req.user?.organizationId;

  try {
    if (!branchName || !branchName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Branch name is required',
      });
    }

    if (!orgId && req.user?.systemRole === 'SUPER_ADMIN') {
      const reqOrg = req.headers['x-organization-id'] || req.body?.organizationId;
      if (reqOrg) {
        orgId = reqOrg;
      } else {
        const Organization = require('../model/organizationSchema');
        const fallbackOrg = await Organization.findOne({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        if (fallbackOrg) orgId = fallbackOrg._id;
      }
    }

    if (!orgId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context required to add branch',
      });
    }

    const code = (branchCode && branchCode.trim())
      ? branchCode.toUpperCase().trim()
      : (branchName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'BR') + '-' + Math.floor(100 + Math.random() * 900);

    // Check duplicate branchCode in organization
    const existing = await branchModel.findOne({
      organization: orgId,
      branchCode: code,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A branch with this code already exists in your organization',
      });
    }

    const newBranch = new branchModel({
      organization: orgId,
      branchName: branchName.trim(),
      branchCode: code,
      address: address ? address.trim() : '',
      createdBy: req.user.userId,
    });

    await newBranch.save();

    await logAudit({
      req,
      action: 'BRANCH_CREATED',
      module: 'branch',
      targetId: newBranch._id,
      description: `Branch "${newBranch.branchName}" (${newBranch.branchCode}) created`,
    });

    return res.status(201).json({
      success: true,
      message: 'New Branch Created Successfully',
      data: newBranch,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. Get Branches (Tenant-Scoped)
async function getBranch(req, res) {
  try {
    const orgId = req.organizationId || req.user.organizationId;
    const filter = orgId ? { organization: orgId } : {};

    const branches = await branchModel.find(filter)
      .populate('createdBy', '_id name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Data Fetched',
      data: branches,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Get Branch By Role / Scope
async function getBranchByRole(req, res) {
  try {
    const orgId = req.organizationId || req.user?.organizationId;
    const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';

    let filter = {};
    if (orgId) {
      filter.organization = orgId;
    }

    const isManager = req.user?.organizationRole === 'MANAGER' || req.user?.role === 'Manager';

    // Only Staff is locked to their designated branch; Admin and Manager can access all branches
    const staffBranch = req.user?.branch || req.user?.branchId;
    if (req.user && !isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
      filter._id = staffBranch;
    }

    const data = await branchModel.find(filter).sort({ branchName: 1 });

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

// 4. Update Branch
async function updateBranch(req, res) {
  const { id } = req.params;
  const { branchName, branchCode, address, isActive } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const branch = await branchModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found or inaccessible',
      });
    }

    if (branchName) branch.branchName = branchName.trim();
    if (branchCode) branch.branchCode = branchCode.toUpperCase().trim();
    if (address !== undefined) branch.address = address.trim();
    if (isActive !== undefined) branch.isActive = Boolean(isActive);

    await branch.save();

    await logAudit({
      req,
      action: 'BRANCH_UPDATED',
      module: 'branch',
      targetId: branch._id,
      description: `Branch "${branch.branchName}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: 'Branch updated successfully',
      data: branch,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Delete / Deactivate Branch
async function deleteBranch(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const branch = await branchModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found or inaccessible',
      });
    }

    const areaModel = require('../model/areaSchema');
    const linkedAreasCount = await areaModel.countDocuments({ branchName: id });

    if (linkedAreasCount > 0) {
      branch.isActive = false;
      await branch.save();

      await logAudit({
        req,
        action: 'BRANCH_DEACTIVATED',
        module: 'branch',
        targetId: branch._id,
        description: `Branch "${branch.branchName}" deactivated (has ${linkedAreasCount} linked areas)`,
      });

      return res.status(200).json({
        success: true,
        message: `Branch deactivated successfully (retained due to ${linkedAreasCount} linked area(s))`,
      });
    }

    await branchModel.findByIdAndDelete(id);

    await logAudit({
      req,
      action: 'BRANCH_DELETED',
      module: 'branch',
      targetId: id,
      description: `Branch "${branch.branchName}" deleted`,
    });

    return res.status(200).json({
      success: true,
      message: 'Branch deleted successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  addBranch,
  getBranch,
  getBranchByRole,
  updateBranch,
  deleteBranch,
};