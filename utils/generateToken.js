require('dotenv').config();
const jwt = require('jsonwebtoken');

function generateToken(user) {
  const isSuperAdmin = user.systemRole === 'SUPER_ADMIN';
  const legacyRole = isSuperAdmin
    ? 'Super-Admin'
    : user.organizationRole === 'OWNER' || user.organizationRole === 'ADMIN'
    ? 'Admin'
    : user.organizationRole === 'MANAGER'
    ? 'Manager'
    : 'Staff';

  const payload = {
    userId: user._id,
    systemRole: user.systemRole,
    organizationId: user.organization ? user.organization.toString() : null,
    organizationRole: user.organizationRole || null,
    branchId: user.branch ? user.branch.toString() : null,
    roleId: user.role ? user.role.toString() : null,
    // Backward compatibility
    role: legacyRole,
    branch: user.branch || null,
  };

  const secret = process.env.JWT_SECRET_KEY || 'antigravity_pos_jwt_secret_key_2025';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(payload, secret, { expiresIn });
}

module.exports = generateToken;