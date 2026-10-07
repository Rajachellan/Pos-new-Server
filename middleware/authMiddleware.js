require('dotenv').config();
const jwt = require('jsonwebtoken');
require('../model/permissionSchema');
require('../model/branchSchema');
const User = require('../model/userSchema');
const Role = require('../model/roleSchema');
const Organization = require('../model/organizationSchema');

async function populateUserContext(decoded) {
  const user = await User.findById(decoded.userId)
    .populate({
      path: 'role',
      populate: {
        path: 'permissions',
        select: 'key module action',
      },
    })
    .select('-password');

  if (!user) return null;
  if (user.status !== 'ACTIVE') {
    const error = new Error('User account is not active');
    error.statusCode = 403;
    throw error;
  }

  // Check organization status for non-superadmin
  let organization = null;
  if (user.systemRole !== 'SUPER_ADMIN' && user.organization) {
    organization = await Organization.findById(user.organization);
    if (!organization || organization.status !== 'ACTIVE') {
      const error = new Error('Organization is inactive or suspended');
      error.statusCode = 403;
      throw error;
    }
  }

  // Extract permission keys
  let permissions = [];
  if (user.role && Array.isArray(user.role.permissions)) {
    permissions = user.role.permissions.map((p) => (typeof p === 'string' ? p : p.key));
  } else if (user.systemRole !== 'SUPER_ADMIN' && user.organizationRole) {
    // If no custom role attached, fallback to matching system template role
    const systemTemplateRole = await Role.findOne({
      key: user.organizationRole,
      organization: null,
    }).populate('permissions', 'key');
    if (systemTemplateRole && Array.isArray(systemTemplateRole.permissions)) {
      permissions = systemTemplateRole.permissions.map((p) => (typeof p === 'string' ? p : p.key));
    }
  }

  // Default fallback permissions if roles table was unseeded or permissions array is empty
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

  return {
    id: user._id.toString(),
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    username: user.username,
    systemRole: user.systemRole,
    organizationId: user.organization ? user.organization.toString() : null,
    organizationRole: user.organizationRole || null,
    branchId: user.branch ? user.branch.toString() : null,
    branch: user.branch ? user.branch.toString() : null,
    roleId: user.role ? (user.role._id ? user.role._id.toString() : user.role.toString()) : null,
    role: legacyRole,
    isSuperAdmin,
    isAdmin: isSuperAdmin || isOwnerOrAdmin,
    isManager,
    isStaff,
    canViewFinances: isSuperAdmin || isOwnerOrAdmin,
    permissions,
    userDoc: user,
    organizationDoc: organization,
  };
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access Token Is Required',
      code: 'UNAUTHORIZED',
    });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET_KEY || 'antigravity_pos_jwt_secret_key_2025';

  try {
    const decoded = jwt.verify(token, secret);
    const userContext = await populateUserContext(decoded);

    if (!userContext) {
      return res.status(401).json({
        success: false,
        message: 'User Not Found or Token Invalid',
        code: 'UNAUTHORIZED',
      });
    }

    req.user = userContext;
    next();
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        code: 'FORBIDDEN',
      });
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or Expired Token',
        code: 'UNAUTHORIZED',
      });
    }
    console.error('Auth Middleware Internal Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal authentication error: ' + err.message,
      code: 'INTERNAL_ERROR',
    });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET_KEY || 'antigravity_pos_jwt_secret_key_2025';
    try {
      const decoded = jwt.verify(token, secret);
      const userContext = await populateUserContext(decoded);
      if (userContext) {
        req.user = userContext;
      }
    } catch (err) {
      // Ignore token errors for optional auth
    }
  }
  next();
}

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;