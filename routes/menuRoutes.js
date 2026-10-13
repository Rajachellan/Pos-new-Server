const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const organizationMiddleware = require('../middleware/organizationMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

const {
  addMenuFun,
  getMenuFun,
  updateMenuFun,
  deleteMenuFun,
  getCategoriesFun,
  addCategoryFun,
  deleteCategoryFun,
} = require('../controller/foodMenuController');

router.post(
  '/add/menu',
  authMiddleware,
  organizationMiddleware,
  requirePermission('food_menu.create'),
  addMenuFun
);

router.get(
  '/get/menus',
  authMiddleware,
  organizationMiddleware,
  requirePermission('food_menu.view'),
  getMenuFun
);

router.put(
  '/menu/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('food_menu.update'),
  updateMenuFun
);

router.delete(
  '/menu/:id',
  authMiddleware,
  organizationMiddleware,
  requirePermission('food_menu.delete'),
  deleteMenuFun
);

// Tenant-scoped category routes
router.get(
  '/get/categories',
  authMiddleware,
  organizationMiddleware,
  getCategoriesFun
);

router.post(
  '/add/category',
  authMiddleware,
  organizationMiddleware,
  addCategoryFun
);

router.delete(
  '/category/:id',
  authMiddleware,
  organizationMiddleware,
  deleteCategoryFun
);

module.exports = router;
