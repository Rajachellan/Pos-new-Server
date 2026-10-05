const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  addTableFun,
  getAllTables,
  getTableByArea,
  getTableByBranch,
  updateTable,
  deleteTable,
} = require('../controller/tableController');

router.post(
  '/add/tables',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.create'),
  addTableFun
);

router.get(
  '/get/all/tables',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.view'),
  getAllTables
);

router.get(
  '/get/tables/area/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.view'),
  getTableByArea
);

router.get(
  '/get/tables/branch',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.view'),
  getTableByBranch
);

router.put(
  '/tables/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.update'),
  updateTable
);

router.delete(
  '/tables/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('table.delete'),
  deleteTable
);

module.exports = router;