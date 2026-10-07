/**
 * Multi-Tenant Permission & Role Enforcement Middleware
 */

function requirePermission(requiredPermission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // SUPER_ADMIN has platform-level bypass
    if (req.user.systemRole === 'SUPER_ADMIN') {
      return next();
    }

    // Organization user must belong to an organization
    if (!req.user.organizationId) {
      return res.status(403).json({
        success: false,
        message: 'User does not belong to an active organization',
        code: 'FORBIDDEN',
      });
    }

    // Organization OWNER and ADMIN have full access to all organization modules
    if (
      req.user.organizationRole === 'OWNER' ||
      req.user.organizationRole === 'ADMIN' ||
      req.user.isAdmin
    ) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    if (userPermissions.includes('*')) {
      return next();
    }

    // Support single permission key or array of required keys
    const permissionsToCheck = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];

    // Manager role has built-in access to restaurant operations (tables, areas, branches, menus, orders, cart, etc.)
    const isManagerUser = req.user.organizationRole === 'MANAGER' || req.user.isManager;
    const managerAllowedPrefixes = [
      'branch.', 'table.', 'food_menu.', 'restaurant.', 'cart.',
      'user.', 'role.',
      'reservation.', 'room.', 'guest.', 'checkin.', 'checkout.',
      'housekeeping.', 'dashboard.', 'payment.view', 'payment.create', 'report.view',
    ];

    const hasPermission = permissionsToCheck.some(
      (p) => userPermissions.includes(p) || (isManagerUser && managerAllowedPrefixes.some((pref) => p.startsWith(pref) || p === pref))
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        code: 'FORBIDDEN',
        required: requiredPermission,
      });
    }

    return next();
  };
}

function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  if (req.user.systemRole !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Platform Super Admin access required',
      code: 'FORBIDDEN',
    });
  }

  return next();
}

function requireOrgRole(allowedRoles) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    if (req.user.systemRole === 'SUPER_ADMIN') {
      return next();
    }

    if (!rolesArray.includes(req.user.organizationRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access restricted to specified organization roles',
        code: 'FORBIDDEN',
        requiredRoles: rolesArray,
      });
    }

    return next();
  };
}

module.exports = {
  requirePermission,
  requireSuperAdmin,
  requireOrgRole,
};
