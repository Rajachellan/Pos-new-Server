const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  addBranch,
  getBranch,
  getBranchByRole,
  updateBranch,
  deleteBranch,
} = require('../controller/branchController');

router.post(
  '/add/branch',
  authMiddleware,
  organizationMiddleware,
  requirePermission('branch.create'),
  addBranch
);

router.get(
  '/get/branch',
  authMiddleware,
  organizationMiddleware,
  requirePermission('branch.view'),
  getBranch
);

const { optionalAuth } = require('../middleware/authMiddleware');

router.get(
  '/get/branch/role',
  optionalAuth,
  getBranchByRole
);

router.put(
  '/branch/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('branch.update'),
  updateBranch
);

router.delete(
  '/branch/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('branch.delete'),
  deleteBranch
);

module.exports = router;