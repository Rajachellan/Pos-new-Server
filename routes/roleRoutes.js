const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  listPermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} = require('../controller/roleController');

router.get('/permissions', authMiddleware, listPermissions);

router.get(
  '/roles',
  authMiddleware,
  organizationMiddleware,
  requirePermission('role.view'),
  listRoles
);

router.post(
  '/roles',
  authMiddleware,
  organizationMiddleware,
  requirePermission('role.create'),
  createRole
);

router.put(
  '/roles/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('role.update'),
  updateRole
);

router.delete(
  '/roles/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('role.delete'),
  deleteRole
);

module.exports = router;
