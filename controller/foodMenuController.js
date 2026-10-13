const menuModel = require('../model/foodMenuSchema');
const categoryModel = require('../model/categorySchema');
const { logAudit } = require('../utils/auditLogger');

// 1. Add Food Menu Item (Tenant-Scoped)
async function addMenuFun(req, res) {
  const { category, name, price, description, imageUrl, isAvailable, foodType } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    if (!category || !name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Category, name, and price are required',
      });
    }

    if (!orgId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context required to add menu item',
      });
    }

    const catUpper = category.trim().toUpperCase();

    // Auto-register category in organization's category collection if not present
    await categoryModel.updateOne(
      { organization: orgId, name: catUpper },
      { $setOnInsert: { organization: orgId, name: catUpper, createdBy: req.user.userId } },
      { upsert: true }
    );

    const addMenu = new menuModel({
      organization: orgId,
      category: catUpper,
      name: name.trim(),
      price: Number(price),
      description: description ? description.trim() : '',
      imageUrl: imageUrl ? imageUrl.trim() : '',
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
      foodType: foodType ? String(foodType).toUpperCase() : '',
      createdBy: req.user.userId,
    });

    await addMenu.save();

    await logAudit({
      req,
      action: 'MENU_ITEM_CREATED',
      module: 'food_menu',
      targetId: addMenu._id,
      description: `Dish "${addMenu.name}" added to menu under "${addMenu.category}"`,
    });

    return res.status(201).json({
      success: true,
      message: 'Menu Added Successfully',
      data: addMenu,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. Get Food Menu Items (Tenant-Scoped)
async function getMenuFun(req, res) {
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const filter = orgId ? { organization: orgId } : {};

    const getData = await menuModel.find(filter).sort({ category: 1, name: 1 });

    return res.status(200).json({
      success: true,
      message: 'Data Fetched',
      data: getData,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Update Menu Item
async function updateMenuFun(req, res) {
  const { id } = req.params;
  const { category, name, price, description, imageUrl, isAvailable, foodType } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const item = await menuModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found or inaccessible',
      });
    }

    if (category) {
      const catUpper = category.trim().toUpperCase();
      item.category = catUpper;
      if (orgId) {
        await categoryModel.updateOne(
          { organization: orgId, name: catUpper },
          {
            $setOnInsert: {
              organization: orgId,
              name: catUpper,
              createdBy: req.user?.userId || req.user?.id || req.user?._id || null,
            },
          },
          { upsert: true }
        );
      }
    }
    if (name) item.name = name.trim();
    if (price !== undefined) item.price = Number(price);
    if (description !== undefined) item.description = description.trim();
    if (imageUrl !== undefined) item.imageUrl = imageUrl.trim();
    if (isAvailable !== undefined) item.isAvailable = Boolean(isAvailable);
    if (foodType !== undefined) item.foodType = String(foodType).toUpperCase();

    await item.save();

    await logAudit({
      req,
      action: 'MENU_ITEM_UPDATED',
      module: 'food_menu',
      targetId: item._id,
      description: `Dish "${item.name}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: 'Menu item updated successfully',
      data: item,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. Delete Menu Item
async function deleteMenuFun(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const item = await menuModel.findOneAndDelete({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found or inaccessible',
      });
    }

    await logAudit({
      req,
      action: 'MENU_ITEM_DELETED',
      module: 'food_menu',
      targetId: id,
      description: `Dish "${item.name}" deleted from menu`,
    });

    return res.status(200).json({
      success: true,
      message: 'Menu item deleted successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Get Categories (Tenant-Scoped, Dynamic)
async function getCategoriesFun(req, res) {
  const orgId = req.organizationId || req.user.organizationId;
  try {
    const filter = orgId ? { organization: orgId } : {};

    // Fetch explicitly created categories
    const explicitCategories = await categoryModel.find(filter).sort({ name: 1 });

    // Also fetch distinct categories from menu items to include existing ones
    const itemCategories = await menuModel.distinct('category', filter);

    const categoryMap = new Map();
    explicitCategories.forEach((c) => {
      const upper = c.name.toUpperCase().trim();
      categoryMap.set(upper, {
        _id: c._id,
        name: upper,
        description: c.description || '',
      });
    });

    itemCategories.forEach((catStr) => {
      if (catStr && catStr.trim()) {
        const upper = catStr.toUpperCase().trim();
        if (!categoryMap.has(upper)) {
          categoryMap.set(upper, {
            _id: upper,
            name: upper,
            description: '',
          });
        }
      }
    });

    const result = Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      message: 'Categories fetched successfully',
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 6. Add Category (Tenant-Scoped)
async function addCategoryFun(req, res) {
  const { name, description = '' } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    if (!orgId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context required',
      });
    }

    const trimmedUpper = name.trim().toUpperCase();

    const existing = await categoryModel.findOne({
      organization: orgId,
      name: trimmedUpper,
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Category already exists',
        data: existing,
      });
    }

    const newCategory = new categoryModel({
      organization: orgId,
      name: trimmedUpper,
      description: description.trim(),
      createdBy: req.user?.userId || req.user?.id || req.user?._id || null,
    });

    await newCategory.save();

    await logAudit({
      req,
      action: 'CATEGORY_CREATED',
      module: 'food_menu',
      targetId: newCategory._id,
      description: `Category "${newCategory.name}" created`,
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: newCategory,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 7. Delete Category (Tenant-Scoped)
async function deleteCategoryFun(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const filter = {
      ...(orgId ? { organization: orgId } : {}),
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { name: id.toUpperCase().trim() }],
    };

    const deleted = await categoryModel.findOneAndDelete(filter);

    return res.status(200).json({
      success: true,
      message: 'Category removed successfully',
      data: deleted,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  addMenuFun,
  getMenuFun,
  updateMenuFun,
  deleteMenuFun,
  getCategoriesFun,
  addCategoryFun,
  deleteCategoryFun,
};