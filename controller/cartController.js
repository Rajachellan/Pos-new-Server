const cartModel = require("../model/cartSchema");
const menuModel = require("../model/foodMenuSchema");
const tableModel = require("../model/tableModel");

async function addToCart(req, res) {
  const { tableId, menuId, quantity = 1 } = req.body;

  try {
    if (!tableId || !menuId) {
      return res.status(400).json({
        success: false,
        message: "tableId and menuId are required",
      });
    }

    const menu = await menuModel.findById(menuId);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    let cart = await cartModel.findOne({
      tableId,
      status: "PENDING",
    });

    if (!cart) {
      cart = new cartModel({
        tableId,
        items: [],
        totalAmount: 0,
        status: "PENDING",
      });
    }

    const existingItem = cart.items.find(
      (item) => item.menuId.toString() === menuId
    );

    if (existingItem) {
      existingItem.quantity += Number(quantity);
    } else {
      cart.items.push({
        menuId: menu._id,
        name: menu.name,
        price: menu.price,
        quantity: Number(quantity),
      });
    }

    cart.totalAmount = cart.items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Item added to cart",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getCart(req, res) {
  const { tableId } = req.params;

  try {
    const cart = await cartModel
      .findOne({
        tableId,
        status: { $in: ["PENDING", "ORDERED"] },
      })
      .populate("tableId")
      .populate("items.menuId");

    return res.status(200).json({
      success: true,
      data: cart || {
        tableId,
        items: [],
        totalAmount: 0,
        status: "PENDING",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getKitchenOrders(req, res) {
  try {
    const orders = await cartModel
      .find({ status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] } })
      .populate("tableId", "tableNumber")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function removeFromCart(req, res) {
  const { tableId, menuId } = req.body;

  try {
    const cart = await cartModel.findOne({
      tableId,
      status: "PENDING",
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = cart.items.filter(
      (item) => item.menuId.toString() !== menuId
    );

    cart.totalAmount = cart.items.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Item removed from cart",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function takeOrder(req, res) {
  const { tableId } = req.body;

  try {
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "tableId is required",
      });
    }

    const cart = await cartModel.findOne({
      tableId,
      status: "PENDING",
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const table = await tableModel.findOneAndUpdate(
      {
        _id: tableId,
        availabilityStatus: "AVAILABLE",
      },
      {
        $set: { availabilityStatus: "OCCUPIED" },
      },
      { new: true }
    );

    if (!table) {
      return res.status(409).json({
        success: false,
        message: "Table is already occupied",
      });
    }

    cart.status = "ORDERED";
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Order placed and table booked",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function payOrder(req, res) {
  const { tableId } = req.body;

  try {
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "tableId is required",
      });
    }

    const cart = await cartModel.findOneAndUpdate(
      {
        tableId,
        status: "ORDERED",
      },
      {
        $set: { status: "COMPLETED" },
      },
      { new: true }
    );

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Ordered cart not found",
      });
    }

    const table = await tableModel.findOneAndUpdate(
      {
        _id: tableId,
        availabilityStatus: "OCCUPIED",
      },
      {
        $set: { availabilityStatus: "AVAILABLE" },
      },
      { new: true }
    );

    if (!table) {
      return res.status(409).json({
        success: false,
        message: "Occupied table not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment completed and table is available",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function updateKitchenOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ["PREPARING", "READY"];

  try {
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid kitchen order status",
      });
    }

    const order = await cartModel.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ["PENDING", "ORDERED", "PREPARING"] },
      },
      { $set: { status } },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Active kitchen order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Order marked as ${status}`,
      data: order,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getOrderHistory(req, res) {
  try {
    const { status } = req.query;
    let filter = { "items.0": { $exists: true } };

    if (status && status !== "ALL") {
      filter.status = status;
    }

    const orders = await cartModel
      .find(filter)
      .populate("tableId", "tableNumber areaId")
      .sort({ createdAt: -1 });

    // Calculate total summary metrics
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === "COMPLETED");
    const totalRevenue = completedOrders.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const activeCount = orders.filter((o) => ["PENDING", "ORDERED", "PREPARING", "READY"].includes(o.status)).length;
    const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;

    return res.status(200).json({
      success: true,
      data: orders,
      summary: {
        totalOrders,
        totalRevenue,
        activeCount,
        cancelledCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  addToCart,
  getCart,
  getKitchenOrders,
  getOrderHistory,
  removeFromCart,
  takeOrder,
  payOrder,
  updateKitchenOrderStatus,
};