const menuModel = require('../model/foodMenuSchema');
const { logAudit } = require('../utils/auditLogger');

// 1. Add Food Menu Item (Tenant-Scoped)
async function addMenuFun(req, res) {
  const { category, name, price, description, isAvailable } = req.body;
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

    const addMenu = new menuModel({
      organization: orgId,
      category: category.trim(),
      name: name.trim(),
      price: Number(price),
      description: description ? description.trim() : '',
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
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
  const { category, name, price, description, isAvailable } = req.body;
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

    if (category) item.category = category.trim();
    if (name) item.name = name.trim();
    if (price !== undefined) item.price = Number(price);
    if (description !== undefined) item.description = description.trim();
    if (isAvailable !== undefined) item.isAvailable = Boolean(isAvailable);

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

module.exports = {
  addMenuFun,
  getMenuFun,
  updateMenuFun,
  deleteMenuFun,
};