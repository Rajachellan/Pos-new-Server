const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  getOrganizationProfile,
  updateOrganizationSettings,
} = require('../controller/organizationController');

router.get(
  '/organizations/profile',
  authMiddleware,
  organizationMiddleware,
  requirePermission('organization.view'),
  getOrganizationProfile
);

router.put(
  '/organizations/settings',
  authMiddleware,
  organizationMiddleware,
  requirePermission('organization.update'),
  updateOrganizationSettings
);

module.exports = router;
