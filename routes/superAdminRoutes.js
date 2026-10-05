const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const { requireSuperAdmin } = require('../middleware/permissionMiddleware');

const {
  getPlatformStats,
  listOrganizations,
  createOrganizationOnboarding,
  getOrganizationById,
  updateOrganization,
  updateOrganizationStatus,
  updateOrganizationLicense,
  resetOwnerCredentials,
  listPlatformUsers,
  listAuditLogs,
} = require('../controller/superAdminController');

// All routes here strictly require authentication + SUPER_ADMIN systemRole
router.use('/super-admin', authMiddleware, requireSuperAdmin);

router.get('/super-admin/stats', getPlatformStats);
router.get('/super-admin/organizations', listOrganizations);
router.post('/super-admin/organizations', createOrganizationOnboarding);
router.get('/super-admin/organizations/:id', getOrganizationById);
router.put('/super-admin/organizations/:id', updateOrganization);
router.patch('/super-admin/organizations/:id/status', updateOrganizationStatus);
router.patch('/super-admin/organizations/:id/license', updateOrganizationLicense);
router.post('/super-admin/organizations/:id/reset-owner', resetOwnerCredentials);
router.get('/super-admin/users', listPlatformUsers);
router.get('/super-admin/audit-logs', listAuditLogs);

module.exports = router;
