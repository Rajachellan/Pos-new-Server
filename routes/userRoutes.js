const express = require('express');
const router = express.Router();

const {
  userRegister,
  userLogin,
  getUserProfile,
  listOrganizationUsers,
  updateUser,
  deleteUser,
} = require('../controller/userController');

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

// Public authentication
router.post('/user/login', userLogin);
router.post('/auth/login', userLogin);

// Current user profile
router.get('/user/get', authMiddleware, getUserProfile);
router.get('/auth/me', authMiddleware, getUserProfile);

// Organization staff management routes
router.post(
  '/user/register',
  authMiddleware,
  organizationMiddleware,
  requirePermission('user.create'),
  userRegister
);

router.get(
  '/users',
  authMiddleware,
  organizationMiddleware,
  requirePermission('user.view'),
  listOrganizationUsers
);

router.put(
  '/users/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('user.update'),
  updateUser
);

router.delete(
  '/users/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('user.delete'),
  deleteUser
);

module.exports = router;