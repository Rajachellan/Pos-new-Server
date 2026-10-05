const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  addArea,
  getAreaByBranch,
  getAllArea,
  updateArea,
  deleteArea,
} = require('../controller/areaController');

router.post(
  '/add/area',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.create'),
  addArea
);

router.get(
  '/get/area/branch',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.view'),
  getAreaByBranch
);

router.get(
  '/get/area/all',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.view'),
  getAllArea
);

router.put(
  '/area/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.update'),
  updateArea
);

router.delete(
  '/area/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.delete'),
  deleteArea
);

module.exports = router;