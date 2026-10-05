const Role = require('../model/roleSchema');
const Permission = require('../model/permissionSchema');
const { logAudit } = require('../utils/auditLogger');

// 1. List all available system permissions grouped by module
async function listPermissions(req, res) {
  try {
    const permissions = await Permission.find().sort({ module: 1, action: 1 });

    const grouped = {};
    for (const p of permissions) {
      if (!grouped[p.module]) {
        grouped[p.module] = [];
      }
      grouped[p.module].push(p);
    }

    return res.status(200).json({
      success: true,
      data: {
        all: permissions,
        grouped,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. List roles for the current organization (including global system templates)
async function listRoles(req, res) {
  try {
    const orgId = req.organizationId || req.user.organizationId;
    const filter = orgId
      ? { $or: [{ organization: orgId }, { isSystemRole: true, organization: null }] }
      : { isSystemRole: true, organization: null };

    const roles = await Role.find(filter)
      .populate('permissions', 'name key module action')
      .sort({ isSystemRole: -1, name: 1 });

    return res.status(200).json({
      success: true,
      data: roles,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Create a custom role for the organization
async function createRole(req, res) {
  const { name, key, description, permissions } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  if (!orgId) {
    return res.status(403).json({
      success: false,
      message: 'Custom roles require an active organization',
    });
  }

  if (!name || !key) {
    return res.status(400).json({
      success: false,
      message: 'Role name and key are required',
    });
  }

  try {
    const formattedKey = key.toUpperCase().replace(/\s+/g, '_');

    // Check if key already exists in this organization
    const existing = await Role.findOne({
      key: formattedKey,
      organization: orgId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A role with this key already exists in your organization',
      });
    }

    const newRole = new Role({
      name,
      key: formattedKey,
      description: description || '',
      organization: orgId,
      permissions: permissions || [],
      isSystemRole: false,
      createdBy: req.user.userId,
    });

    await newRole.save();

    await logAudit({
      req,
      action: 'ROLE_CREATED',
      module: 'role',
      targetId: newRole._id,
      description: `Role "${newRole.name}" created with ${newRole.permissions.length} permissions`,
    });

    const populated = await Role.findById(newRole._id).populate('permissions', 'name key module action');

    return res.status(201).json({
      success: true,
      message: 'Custom role created successfully',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. Update an existing custom role
async function updateRole(req, res) {
  const { id } = req.params;
  const { name, description, permissions } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    if (role.isSystemRole || !role.organization) {
      return res.status(403).json({
        success: false,
        message: 'System default template roles cannot be modified',
      });
    }

    if (role.organization.toString() !== orgId.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Role not found or inaccessible',
      });
    }

    if (name) role.name = name;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;

    await role.save();

    await logAudit({
      req,
      action: 'ROLE_UPDATED',
      module: 'role',
      targetId: role._id,
      description: `Role "${role.name}" updated`,
    });

    const populated = await Role.findById(role._id).populate('permissions', 'name key module action');

    return res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Delete custom role
async function deleteRole(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found',
      });
    }

    if (role.isSystemRole || !role.organization) {
      return res.status(403).json({
        success: false,
        message: 'System default template roles cannot be deleted',
      });
    }

    if (role.organization.toString() !== orgId.toString()) {
      return res.status(404).json({
        success: false,
        message: 'Role not found or inaccessible',
      });
    }

    await Role.findByIdAndDelete(id);

    await logAudit({
      req,
      action: 'ROLE_DELETED',
      module: 'role',
      targetId: id,
      description: `Role "${role.name}" deleted`,
    });

    return res.status(200).json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  listPermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
};
