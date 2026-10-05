const Branch = require('../model/branchSchema');
const Organization = require('../model/organizationSchema');

async function organizationMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  // Super Admin handling: platform owner can optionally specify organization in header/query for admin scope
  if (req.user.systemRole === 'SUPER_ADMIN') {
    const targetOrgId = req.headers['x-organization-id'] || req.query.organizationId || req.params.organizationId;
    if (targetOrgId) {
      req.organizationId = targetOrgId;
    } else {
      req.organizationId = null; // Unrestricted platform view
    }
    return next();
  }

  // Non-SuperAdmin must belong to an organization
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    return res.status(403).json({
      success: false,
      message: 'User does not belong to any organization',
      code: 'FORBIDDEN',
    });
  }

  // Set trusted tenant ID directly from the authenticated user
  req.organizationId = organizationId;

  // Protect against client tampering: overwrite body/query tenant references
  if (req.body) {
    delete req.body.organization;
    delete req.body.organizationId;
  }

  // Branch creation endpoints (/add/branch) create a new branch, so skip existing branch verification
  if (req.path === '/add/branch' || req.originalUrl?.includes('/add/branch')) {
    return next();
  }

  // Branch isolation validation: only validate if an existing branch ObjectId reference is provided
  const rawBranchId = req.body?.branch || req.body?.branchId || req.params?.branchId || req.query?.branchId;
  if (rawBranchId) {
    // If it's not a valid ObjectId (or if it's undefined), don't treat it as a branch lookup failure
    if (!require('mongoose').Types.ObjectId.isValid(rawBranchId)) {
      return next();
    }

    try {
      const branchDoc = await Branch.findById(rawBranchId);
      if (!branchDoc || branchDoc.organization.toString() !== organizationId.toString()) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found or inaccessible',
          code: 'NOT_FOUND',
        });
      }

      // If user is restricted to a specific branch (e.g. staff), ensure they only access their assigned branch
      if (
        req.user.branchId &&
        req.user.organizationRole !== 'OWNER' &&
        req.user.organizationRole !== 'ADMIN' &&
        req.user.branchId.toString() !== rawBranchId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: 'Access restricted to assigned branch',
          code: 'FORBIDDEN',
        });
      }
    } catch (err) {
      return res.status(404).json({
        success: false,
        message: 'Invalid branch reference',
        code: 'NOT_FOUND',
      });
    }
  }

  next();
}

module.exports = organizationMiddleware;
