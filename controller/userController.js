const bcrypt = require('bcrypt');
require('../model/permissionSchema');
require('../model/organizationSchema');
const userModel = require('../model/userSchema');
const Role = require('../model/roleSchema');
const Branch = require('../model/branchSchema');
const generateToken = require('../utils/generateToken');
const { logAudit } = require('../utils/auditLogger');

// 1. User Register (Tenant-Scoped with Petpooja Workflow)
async function userRegister(req, res) {
  const {
    name,
    username,
    email,
    password,
    confirmPassword,
    branch,
    role,
    organizationRole: explicitOrgRole,
    roleId,
    department,
    isActive = true,
    status: explicitStatus,
  } = req.body;

  try {
    const rawUsername = (username || (name ? name.toLowerCase().replace(/\s+/g, '') : '')).trim();
    const rawEmail = (email || '').toLowerCase().trim();
    const displayName = (name || rawUsername || rawEmail.split('@')[0]).trim();

    if (!rawUsername && !rawEmail) {
      return res.status(400).json({
        success: false,
        message: 'Username or email is required',
      });
    }

    if (rawEmail) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(rawEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid email address',
        });
      }
    }

    // Tenant derivation
    let targetOrgId = req.organizationId || req.user?.organizationId;
    if (req.user?.systemRole === 'SUPER_ADMIN') {
      const reqOrg = req.headers['x-organization-id'] || req.body?.organizationId;
      if (reqOrg) {
        targetOrgId = reqOrg;
      } else {
        const Organization = require('../model/organizationSchema');
        const fallbackOrg = await Organization.findOne({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        if (fallbackOrg) targetOrgId = fallbackOrg._id;
      }
    }

    if (!targetOrgId && req.user?.systemRole !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Cannot create users without an active organization context',
      });
    }

    // Role mapping: strictly 3 roles (ADMIN, MANAGER, STAFF)
    const inputRole = (explicitOrgRole || role || 'STAFF').toString().toUpperCase();
    let finalOrgRole = 'STAFF';
    let finalDepartment = department || '';

    if (inputRole === 'ADMIN') {
      finalOrgRole = 'ADMIN';
    } else if (inputRole === 'MANAGER') {
      finalOrgRole = 'MANAGER';
    } else {
      finalOrgRole = 'STAFF';
    }

    // Protection: Non-SuperAdmin CANNOT create SUPER_ADMIN or OWNER
    if (req.user?.systemRole !== 'SUPER_ADMIN') {
      if (finalOrgRole === 'OWNER') {
        return res.status(403).json({
          success: false,
          message: 'Cannot create another organization owner',
        });
      }
    }

    // Check duplicate user by email or username
    if (rawEmail) {
      const existingEmail = await userModel.findOne({ email: rawEmail });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: `A user with email "${rawEmail}" already exists.`,
        });
      }
    }

    if (rawUsername) {
      const existingUsername = await userModel.findOne({
        username: { $regex: new RegExp(`^${rawUsername}$`, 'i') },
      });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: `The username "${rawUsername}" is already taken. Please choose another username.`,
        });
      }
    }

    // Password handling: default to 'defaultpassword123' if blank (Petpooja standard)
    const effectivePassword = (password && password.trim().length > 0)
      ? password.trim()
      : 'defaultpassword123';

    if (confirmPassword && confirmPassword !== effectivePassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }

    // Branch validation: allow null/empty for "All Branches"
    let assignedBranch = null;
    if (branch && branch !== '--------' && branch !== 'ALL' && branch !== '') {
      const branchDoc = await Branch.findById(branch);
      if (branchDoc) {
        assignedBranch = branchDoc._id;
      }
    }

    // Role resolution
    let assignedRole = null;
    if (roleId) {
      const customRole = await Role.findById(roleId);
      if (customRole) assignedRole = customRole._id;
    }
    if (!assignedRole) {
      const templateRole = await Role.findOne({
        key: finalOrgRole,
        organization: null,
      });
      if (templateRole) assignedRole = templateRole._id;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(effectivePassword, salt);

    const userStatus = explicitStatus || (isActive === false ? 'INACTIVE' : 'ACTIVE');

    const newUser = new userModel({
      name: displayName,
      username: rawUsername || rawEmail.split('@')[0],
      email: rawEmail || `${rawUsername}@pos.local`,
      password: hashedPassword,
      systemRole: 'ORGANIZATION_USER',
      organizationRole: finalOrgRole,
      organization: targetOrgId,
      branch: assignedBranch,
      role: assignedRole,
      department: finalDepartment,
      status: userStatus,
      createdBy: req.user?.userId,
    });

    await newUser.save();

    await logAudit({
      req,
      action: 'USER_CREATED',
      module: 'user',
      targetId: newUser._id,
      description: `User "${newUser.username}" (${newUser.organizationRole}) registered`,
      metadata: { role: finalOrgRole, branch: assignedBranch },
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        username: newUser.username,
        systemRole: newUser.systemRole,
        organizationRole: newUser.organizationRole,
        branch: newUser.branch,
        status: newUser.status,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. User Login
async function userLogin(req, res) {
  const { email, username, password } = req.body;
  const loginIdentifier = (email || username || '').trim();

  try {
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide credentials',
      });
    }

    const escaped = loginIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await userModel.findOne({
      $or: [
        { email: loginIdentifier.toLowerCase() },
        { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        { name: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      ],
    })
      .populate('organization')
      .populate('branch');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check account status
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive or suspended. Please contact administrator.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    // Check organization status for organization users
    if (user.systemRole !== 'SUPER_ADMIN' && user.organization) {
      if (user.organization.status !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          message: 'Your organization is inactive or suspended. Please contact platform support.',
          code: 'ORGANIZATION_SUSPENDED',
        });
      }
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password',
      });
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    // Generate JWT
    const token = generateToken(user);

    // Fetch user's permissions
    let permissions = [];
    if (user.role) {
      const roleDoc = await Role.findById(user.role).populate('permissions', 'key');
      if (roleDoc && roleDoc.permissions) {
        permissions = roleDoc.permissions.map((p) => p.key);
      }
    } else if (user.systemRole !== 'SUPER_ADMIN' && user.organizationRole) {
      const templateRole = await Role.findOne({
        key: user.organizationRole,
        organization: null,
      }).populate('permissions', 'key');
      if (templateRole && templateRole.permissions) {
        permissions = templateRole.permissions.map((p) => p.key);
      }
    }

    if (permissions.length === 0) {
      if (user.systemRole === 'SUPER_ADMIN' || user.organizationRole === 'OWNER' || user.organizationRole === 'ADMIN') {
        permissions = ['*'];
      } else if (user.organizationRole === 'MANAGER') {
        permissions = [
          'dashboard.view',
          'branch.view', 'branch.create', 'branch.update', 'branch.delete',
          'table.view', 'table.create', 'table.update', 'table.delete',
          'food_menu.view', 'food_menu.create', 'food_menu.update', 'food_menu.delete',
          'restaurant.view', 'restaurant.create', 'restaurant.update', 'restaurant.delete',
          'cart.view', 'cart.create', 'cart.update', 'cart.delete',
          'user.view', 'user.create', 'user.update',
          'role.view', 'role.create', 'role.update',
          'reservation.view', 'reservation.create', 'reservation.update', 'reservation.delete',
          'room.view', 'room.create', 'room.update', 'room.delete',
          'guest.view', 'guest.create', 'guest.update', 'guest.delete',
          'checkin.create', 'checkout.create',
          'housekeeping.view', 'housekeeping.create', 'housekeeping.update', 'housekeeping.delete',
          'payment.view', 'payment.create',
          'report.view',
        ];
      } else if (user.organizationRole === 'STAFF') {
        permissions = [
          'dashboard.view',
          'table.view', 'table.update',
          'food_menu.view',
          'restaurant.view', 'restaurant.create', 'restaurant.update',
          'cart.view', 'cart.create', 'cart.update', 'cart.delete',
          'branch.view',
        ];
      }
    }

    // Log audit
    await logAudit({
      user: user._id,
      organization: user.organization ? user.organization._id : null,
      action: 'LOGIN',
      module: 'auth',
      description: `User "${user.name}" logged in successfully`,
    });

    const isSuperAdmin = user.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = user.organizationRole === 'OWNER' || user.organizationRole === 'ADMIN';
    const isManager = user.organizationRole === 'MANAGER';
    const isStaff = !isSuperAdmin && !isOwnerOrAdmin && !isManager;

    const legacyRole = isSuperAdmin
      ? 'Super-Admin'
      : isOwnerOrAdmin
      ? 'Admin'
      : isManager
      ? 'Manager'
      : 'Staff';

    // Only Staff is locked to their designated branch. Admin and Manager can access all branches.
    const isBranchLocked = isStaff && !!user.branch;
    // Only Admin (and SuperAdmin) can view financial figures (revenue, sales reports).
    const canViewFinances = isSuperAdmin || isOwnerOrAdmin;

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      userId: user._id,
      userName: user.name,
      userRole: legacyRole,
      systemRole: user.systemRole,
      organizationRole: user.organizationRole,
      organizationId: user.organization ? user.organization._id : null,
      organizationName: user.organization ? user.organization.name : null,
      branchId: user.branch ? user.branch._id : null,
      branchName: user.branch ? user.branch.branchName : null,
      isBranchLocked,
      isAdmin: isSuperAdmin || isOwnerOrAdmin,
      isManager,
      isStaff,
      canViewFinances,
      permissions,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Get User Profile
async function getUserProfile(req, res) {
  try {
    const user = await userModel.findById(req.user.userId)
      .select('-password')
      .populate('organization')
      .populate('branch')
      .populate({
        path: 'role',
        populate: {
          path: 'permissions',
          select: 'name key module action',
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isSuperAdmin = user.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = user.organizationRole === 'OWNER' || user.organizationRole === 'ADMIN';
    const isManager = user.organizationRole === 'MANAGER';
    const isStaff = !isSuperAdmin && !isOwnerOrAdmin && !isManager;
    const isBranchLocked = isStaff && !!user.branch;
    const canViewFinances = isSuperAdmin || isOwnerOrAdmin;

    return res.status(200).json({
      success: true,
      data: {
        ...user.toObject(),
        isBranchLocked,
        isAdmin: isSuperAdmin || isOwnerOrAdmin,
        isManager,
        isStaff,
        canViewFinances,
        permissions: req.user.permissions || [],
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. List Users in current organization
async function listOrganizationUsers(req, res) {
  try {
    let orgId = req.organizationId || req.user?.organizationId;
    if (!orgId && req.user?.systemRole === 'SUPER_ADMIN') {
      orgId = req.headers['x-organization-id'] || req.query.organizationId;
      if (!orgId) {
        const Organization = require('../model/organizationSchema');
        const fallbackOrg = await Organization.findOne({ status: 'ACTIVE' }).sort({ createdAt: -1 });
        if (fallbackOrg) orgId = fallbackOrg._id;
      }
    }
    const filter = orgId ? { organization: orgId } : {};

    const users = await userModel.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .populate('organization', 'name slug')
      .populate('branch', 'branchName branchCode')
      .populate('role', 'name key');

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Update User
async function updateUser(req, res) {
  const { id } = req.params;
  const {
    name,
    username,
    email,
    password,
    department,
    branch,
    roleId,
    organizationRole,
    role,
    status,
    isActive,
  } = req.body;
  const orgId = req.organizationId || req.user?.organizationId;

  try {
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Tenant check
    if (req.user?.systemRole !== 'SUPER_ADMIN') {
      if (!user.organization || user.organization.toString() !== orgId?.toString()) {
        return res.status(404).json({
          success: false,
          message: 'User not found or inaccessible',
        });
      }
      // Non-SuperAdmin cannot edit SuperAdmin or Owner
      if (user.systemRole === 'SUPER_ADMIN' || user.organizationRole === 'OWNER') {
        if (req.user?.organizationRole !== 'OWNER') {
          return res.status(403).json({
            success: false,
            message: 'Only the Organization Owner can modify this account',
          });
        }
      }
    }

    if (name) user.name = name.trim();
    if (username) user.username = username.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (department !== undefined) user.department = department;

    // Status update: from status string or isActive boolean
    if (status && ['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
      user.status = status;
    } else if (isActive !== undefined) {
      user.status = isActive ? 'ACTIVE' : 'INACTIVE';
    }

    const inputRole = (organizationRole || role || '').toString().toUpperCase();
    if (inputRole) {
      if (['ADMIN', 'MANAGER', 'STAFF'].includes(inputRole)) {
        user.organizationRole = inputRole;
      }
    }

    // Branch assignment: null or empty string means "All Branches"
    if (branch === '' || branch === null || branch === '--------' || branch === 'ALL') {
      user.branch = null;
    } else if (branch) {
      const branchDoc = await Branch.findById(branch);
      if (branchDoc) {
        user.branch = branchDoc._id;
      }
    }

    // Password reset if provided
    if (password && password.trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password.trim(), salt);
    }

    if (roleId) {
      const roleDoc = await Role.findById(roleId);
      if (roleDoc) user.role = roleDoc._id;
    }

    await user.save();

    await logAudit({
      req,
      action: 'USER_UPDATED',
      module: 'user',
      targetId: user._id,
      description: `User "${user.name}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 6. Delete / Deactivate User
async function deleteUser(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const user = await userModel.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Protection
    if (user.systemRole === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Super Admin cannot be deleted',
      });
    }
    if (user.organizationRole === 'OWNER') {
      return res.status(403).json({
        success: false,
        message: 'Organization Owner cannot be deleted',
      });
    }

    if (req.user.systemRole !== 'SUPER_ADMIN') {
      if (!user.organization || user.organization.toString() !== orgId.toString()) {
        return res.status(404).json({
          success: false,
          message: 'User not found or inaccessible',
        });
      }
    }

    // Soft delete: set status to INACTIVE
    user.status = 'INACTIVE';
    await user.save();

    await logAudit({
      req,
      action: 'USER_DEACTIVATED',
      module: 'user',
      targetId: user._id,
      description: `User "${user.name}" was deactivated`,
    });

    return res.status(200).json({
      success: true,
      message: 'User account deactivated successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  userRegister,
  userLogin,
  getUserProfile,
  listOrganizationUsers,
  updateUser,
  deleteUser,
};