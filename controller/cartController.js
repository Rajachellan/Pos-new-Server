const cartModel = require("../model/cartSchema");
const menuModel = require("../model/foodMenuSchema");
const tableModel = require("../model/tableModel");
const branchModel = require("../model/branchSchema");
const { emitToBranch } = require("../utils/socket");

function recalculateCart(cart) {
  const subtotal = cart.items.reduce(
    (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
  cart.subtotal = Math.round(subtotal * 100) / 100;
  cart.gstAmount = cart.gstEnabled ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
  const serviceCharge = Number(cart.serviceCharge) || 0;
  const discount = Number(cart.discount) || 0;
  cart.totalAmount = Math.max(0, Math.round((cart.subtotal + cart.gstAmount + serviceCharge - discount) * 100) / 100);
}

async function addToCart(req, res) {
  const { tableId, menuId, quantity = 1, isManual = false, name, price } = req.body;

  try {
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "tableId is required",
      });
    }

    if (!isManual && !menuId) {
      return res.status(400).json({
        success: false,
        message: "menuId is required for menu items",
      });
    }

    if (isManual && (!name || price === undefined || price === null)) {
      return res.status(400).json({
        success: false,
        message: "Item name and price are required for manual item",
      });
    }

    let menu = null;
    if (!isManual) {
      menu = await menuModel.findById(menuId);
      if (!menu) {
        return res.status(404).json({
          success: false,
          message: "Menu item not found",
        });
      }
    }

    const table = await tableModel.findById(tableId).populate({
      path: "areaName",
      select: "branchName",
    });
    const orgId = req.user?.organizationId || table?.organization;
    const branchId =
      table?.branch ||
      table?.areaName?.branchName?._id ||
      table?.areaName?.branchName ||
      req.user?.branchId ||
      req.user?.branch ||
      null;

    let cart = await cartModel.findOne({
      tableId,
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    }).sort({ createdAt: -1 });

    if (!cart) {
      cart = new cartModel({
        organization: orgId,
        branchId: branchId,
        tableId,
        items: [],
        subtotal: 0,
        gstEnabled: true,
        gstAmount: 0,
        serviceCharge: 0,
        totalAmount: 0,
        status: "PENDING",
      });
    } else {
      if (!cart.branchId && branchId) {
        cart.branchId = branchId;
      }
      if (!cart.organization && orgId) {
        cart.organization = orgId;
      }
    }

    if (isManual) {
      const existingManual = cart.items.find(
        (item) => item.isManual && item.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (existingManual) {
        existingManual.quantity += Number(quantity);
      } else {
        cart.items.push({
          name: name.trim(),
          price: Number(price),
          quantity: Number(quantity),
          isManual: true,
          kitchenStatus: "NEW",
        });
      }
    } else {
      const existingItem = cart.items.find(
        (item) => item.menuId && item.menuId.toString() === menuId
      );

      if (existingItem) {
        existingItem.quantity += Number(quantity);
      } else {
        cart.items.push({
          menuId: menu._id,
          name: menu.name,
          price: menu.price,
          quantity: Number(quantity),
          isManual: false,
          kitchenStatus: "NEW",
        });
      }
    }

    recalculateCart(cart);
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
    let cart = await cartModel
      .findOne({
        tableId,
        status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
      })
      .sort({ createdAt: -1 })
      .populate("tableId")
      .populate("items.menuId");

    if (cart) {
      // Ensure recalculation in case fields were unset
      recalculateCart(cart);
    }

    // If no active items exist for this table, ensure table is marked AVAILABLE
    if (!cart || !cart.items || cart.items.length === 0) {
      await tableModel.updateOne(
        { _id: tableId, availabilityStatus: "OCCUPIED" },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
    }

    return res.status(200).json({
      success: true,
      data: cart || {
        tableId,
        items: [],
        subtotal: 0,
        gstEnabled: true,
        gstAmount: 0,
        serviceCharge: 0,
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
    // Multi-tenant branch resolution
    let targetBranch = req.query.branchId;
    if (targetBranch === "ALL" || targetBranch === "all") {
      targetBranch = null;
    }

    const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';
    const isManager = req.user?.organizationRole === 'MANAGER' || req.user?.role === 'Manager';
    const staffBranch = req.user?.branch || req.user?.branchId;

    // Strict security enforcement: Only Staff is locked to their assigned branch (Admin and Manager have multi-branch access)
    if (!isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
      targetBranch = staffBranch;
    }

    // Query active kitchen orders (PENDING with items, ORDERED, PREPARING, READY)
    let query = {
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
      kitchenStatus: { $ne: "SERVED" },
      "items.0": { $exists: true },
    };

    if (req.user?.organizationId) {
      query.organization = req.user.organizationId;
    }

    const orders = await cartModel
      .find(query)
      .populate({
        path: "tableId",
        select: "tableNumber areaName availabilityStatus branch",
        populate: {
          path: "areaName",
          select: "areaName branchName",
          populate: {
            path: "branchName",
            select: "branchName branchCode address",
          },
        },
      })
      .populate("items.menuId", "name category price")
      .sort({ createdAt: 1 });

    // Multi-tenant branch filtering: direct branch, table branch, or fallback for organization orders
    const filteredOrders = orders.filter((order) => {
      if (!targetBranch || targetBranch === "ALL" || targetBranch === "all") return true;
      const directBranch = order.branchId ? order.branchId.toString() : null;
      const tableBranch =
        order.tableId?.areaName?.branchName?._id?.toString() ||
        order.tableId?.areaName?.branchName?.toString() ||
        order.tableId?.branch?.toString();
      
      if (directBranch) {
        return directBranch === targetBranch.toString();
      }
      if (tableBranch) {
        return tableBranch === targetBranch.toString();
      }
      // If takeaway/order has no branch assigned, include it for the organization's branch context
      return true;
    });

    // Keep READY orders from the last 24 hours so stale days-old orders do not flood the KDS
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeOrders = filteredOrders.filter((order) => {
      if (order.kitchenStatus === "READY" || order.status === "READY") {
        return new Date(order.createdAt) >= cutoff24h;
      }
      return true;
    });

    // Format output
    const formattedOrders = activeOrders.map((order) => {
      const orderObj = order.toObject();
      if (!orderObj.orderNumber) {
        orderObj.orderNumber = `#${order._id.toString().slice(-4).toUpperCase()}`;
      }
      if (!orderObj.kitchenStatus) {
        orderObj.kitchenStatus =
          orderObj.status === "PREPARING"
            ? "PREPARING"
            : orderObj.status === "READY"
            ? "READY"
            : "NEW";
      }
      return orderObj;
    });

    return res.status(200).json({
      success: true,
      data: formattedOrders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function removeFromCart(req, res) {
  const { tableId, menuId, itemId } = req.body;

  try {
    const cart = await cartModel.findOne({
      tableId,
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    }).sort({ createdAt: -1 });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemToRemove = cart.items.find((item) => {
      if (itemId && item._id.toString() === itemId) return true;
      if (menuId && item.menuId && item.menuId.toString() === menuId) return true;
      return false;
    });

    if (itemToRemove) {
      cart.items.pull(itemToRemove._id);
    } else {
      cart.items = cart.items.filter((item) => {
        if (itemId && item._id.toString() === itemId) return false;
        if (menuId && item.menuId && item.menuId.toString() === menuId) return false;
        return true;
      });
    }

    recalculateCart(cart);

    if (cart.items.length === 0) {
      cart.status = "CANCELLED";
      cart.kitchenStatus = "SERVED";
    }

    await cart.save();

    const branchIdStr = cart.branchId ? cart.branchId.toString() : null;

    if (cart.items.length === 0) {
      await tableModel.updateOne(
        { _id: tableId },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
      emitToBranch(branchIdStr, "table_updated", {
        tableId,
        availabilityStatus: "AVAILABLE",
      });
      emitToBranch(branchIdStr, "order_updated", {
        orderId: cart._id,
        status: "CANCELLED",
        kitchenStatus: "SERVED",
      });
    } else if (cart.status !== "PENDING") {
      emitToBranch(branchIdStr, "order_updated", {
        orderId: cart._id,
        branchId: branchIdStr,
        status: cart.status,
        kitchenStatus: cart.kitchenStatus,
        items: cart.items,
      });
    }

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

async function updateItemQuantity(req, res) {
  const { tableId, itemId, action } = req.body; // action: 'increase' | 'decrease'

  try {
    if (!tableId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "tableId and itemId are required",
      });
    }

    const cart = await cartModel.findOne({
      tableId,
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    }).sort({ createdAt: -1 });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const item = cart.items.id(itemId) || cart.items.find((i) => i._id.toString() === itemId || i.menuId?.toString() === itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    if (action === "decrease") {
      if (item.quantity > 1) {
        item.quantity -= 1;
        if (cart.status !== "PENDING") {
          item.kitchenStatus = "NEW";
        }
      } else {
        // Quantity is 1; pull the subdocument cleanly to avoid min: 1 validation error
        cart.items.pull(item._id);
      }
    } else {
      item.quantity += 1;
      if (cart.status !== "PENDING") {
        item.kitchenStatus = "NEW";
      }
    }

    recalculateCart(cart);

    if (cart.items.length === 0) {
      cart.status = "CANCELLED";
      cart.kitchenStatus = "SERVED";
    }

    await cart.save();

    const branchIdStr = cart.branchId ? cart.branchId.toString() : null;

    if (cart.items.length === 0) {
      await tableModel.updateOne(
        { _id: tableId },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
      emitToBranch(branchIdStr, "table_updated", {
        tableId,
        availabilityStatus: "AVAILABLE",
      });
      emitToBranch(branchIdStr, "order_updated", {
        orderId: cart._id,
        status: "CANCELLED",
        kitchenStatus: "SERVED",
      });
    } else if (cart.status !== "PENDING") {
      emitToBranch(branchIdStr, "order_updated", {
        orderId: cart._id,
        branchId: branchIdStr,
        status: cart.status,
        kitchenStatus: cart.kitchenStatus,
        items: cart.items,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Quantity updated",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function cancelOrder(req, res) {
  const { tableId, orderId, reason } = req.body;

  try {
    let cart = null;
    if (orderId) {
      cart = await cartModel.findById(orderId);
    } else if (tableId) {
      cart = await cartModel.findOne({
        tableId,
        status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
      }).sort({ createdAt: -1 });
    }

    const targetTableId = tableId || cart?.tableId;

    if (cart) {
      cart.status = "CANCELLED";
      cart.kitchenStatus = "SERVED";
      if (reason) {
        cart.notes = (cart.notes ? cart.notes + " | " : "") + `Cancelled: ${reason}`;
      }
      await cart.save();

      const branchIdStr = cart.branchId ? cart.branchId.toString() : null;
      emitToBranch(branchIdStr, "order_updated", {
        orderId: cart._id,
        branchId: branchIdStr,
        status: "CANCELLED",
        kitchenStatus: "SERVED",
      });
    }

    if (targetTableId) {
      await tableModel.updateOne(
        { _id: targetTableId },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
      emitToBranch(null, "table_updated", {
        tableId: targetTableId,
        availabilityStatus: "AVAILABLE",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order / Bill cancelled successfully",
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function toggleGst(req, res) {
  const { tableId, gstEnabled } = req.body;

  try {
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "tableId is required",
      });
    }

    const cart = await cartModel.findOne({
      tableId,
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    }).sort({ createdAt: -1 });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.gstEnabled = gstEnabled !== undefined ? Boolean(gstEnabled) : !cart.gstEnabled;
    recalculateCart(cart);
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "GST preference updated",
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
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    }).sort({ createdAt: -1 });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    const table = await tableModel
      .findOneAndUpdate(
        {
          _id: tableId,
        },
        {
          $set: { availabilityStatus: "OCCUPIED" },
        },
        { new: true }
      )
      .populate({
        path: "areaName",
        populate: { path: "branchName" },
      });

    // Determine branchId
    const branchId =
      table?.areaName?.branchName?._id ||
      table?.areaName?.branchName ||
      table?.branch ||
      cart.branchId ||
      req.user?.branch ||
      null;

    cart.status = "ORDERED";
    cart.kitchenStatus = "NEW";
    if (!cart.orderNumber) {
      cart.orderNumber = `#${cart._id.toString().slice(-4).toUpperCase()}`;
    }
    if (branchId) {
      cart.branchId = branchId;
    }

    // Mark all items as NEW for kitchen
    cart.items.forEach((item) => {
      item.kitchenStatus = "NEW";
    });

    recalculateCart(cart);
    await cart.save();

    // Realtime Socket.IO emission to branch room
    const branchIdStr = branchId ? branchId.toString() : null;
    emitToBranch(branchIdStr, "kot_received", {
      orderId: cart._id,
      branchId: branchIdStr,
      orderNumber: cart.orderNumber,
      orderType: cart.orderType || "DINE-IN",
      tableNumber: table?.tableNumber || "",
      roomNumber: cart.roomNumber || "",
      items: cart.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        isManual: i.isManual || false,
        notes: i.notes || "",
        kitchenStatus: i.kitchenStatus || "NEW",
      })),
      notes: cart.notes || "",
      status: "ORDERED",
      kitchenStatus: "NEW",
      createdAt: cart.createdAt || new Date(),
    });

    // Notify Table Grid of occupied status
    emitToBranch(branchIdStr, "table_updated", {
      tableId: table?._id,
      availabilityStatus: "OCCUPIED",
    });

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
  const { tableId, orderId, paymentMethod = "CASH" } = req.body;

  try {
    if (!tableId && !orderId) {
      return res.status(400).json({
        success: false,
        message: "tableId or orderId is required",
      });
    }

    const query = orderId
      ? { _id: orderId }
      : {
          tableId,
          status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
        };

    const cart = await cartModel.findOne(query).sort({ createdAt: -1 });

    if (!cart) {
      // If order was already paid, ensure table is marked available and return success
      const completedQuery = orderId
        ? { _id: orderId }
        : { tableId, status: "COMPLETED" };
      const alreadyPaidCart = await cartModel.findOne(completedQuery).sort({ updatedAt: -1 });

      if (alreadyPaidCart) {
        const targetTId = tableId || alreadyPaidCart.tableId;
        if (targetTId) {
          await tableModel.updateOne(
            { _id: targetTId },
            { $set: { availabilityStatus: "AVAILABLE" } }
          );
          emitToBranch(null, "table_updated", {
            tableId: targetTId,
            availabilityStatus: "AVAILABLE",
          });
        }
        return res.status(200).json({
          success: true,
          message: `Payment already completed and table is available`,
          data: alreadyPaidCart,
        });
      }

      return res.status(404).json({
        success: false,
        message: "Active order not found",
      });
    }

    cart.status = "COMPLETED";
    cart.kitchenStatus = "SERVED";
    cart.paymentMethod = paymentMethod.toUpperCase();
    cart.paidAt = new Date();
    recalculateCart(cart);
    await cart.save();

    const targetTableId = tableId || cart.tableId;

    // Close any other open orders for this table
    if (targetTableId) {
      await cartModel.updateMany(
        {
          tableId: targetTableId,
          _id: { $ne: cart._id },
          status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
        },
        {
          $set: {
            status: "COMPLETED",
            kitchenStatus: "SERVED",
            paidAt: new Date(),
            paymentMethod: paymentMethod.toUpperCase(),
          },
        }
      );
    }

    const table = await tableModel
      .findOneAndUpdate(
        {
          _id: targetTableId,
        },
        {
          $set: { availabilityStatus: "AVAILABLE" },
        },
        { new: true }
      )
      .populate({
        path: "areaName",
        populate: { path: "branchName" },
      });

    const branchId =
      cart.branchId ||
      table?.areaName?.branchName?._id ||
      table?.areaName?.branchName ||
      req.user?.branch ||
      null;

    const branchIdStr = branchId ? branchId.toString() : null;

    // Realtime notification of completed order and freed table
    emitToBranch(branchIdStr, "order_updated", {
      orderId: cart._id,
      branchId: branchIdStr,
      status: "COMPLETED",
      kitchenStatus: "SERVED",
      paymentMethod: cart.paymentMethod,
    });

    if (table) {
      emitToBranch(branchIdStr, "table_updated", {
        tableId: table._id,
        availabilityStatus: "AVAILABLE",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Payment completed via ${cart.paymentMethod} and table is now available`,
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
  const allowedStatuses = ["PREPARING", "READY", "SERVED", "CANCELLED"];

  try {
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid kitchen order status. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    const order = await cartModel
      .findById(id)
      .populate({
        path: "tableId",
        select: "tableNumber areaName",
        populate: {
          path: "areaName",
          select: "branchName",
        },
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Active kitchen order not found",
      });
    }

    const now = new Date();
    if (status === "PREPARING") {
      order.kitchenStatus = "PREPARING";
      order.status = "PREPARING";
      if (!order.startedAt) order.startedAt = now;
      order.items.forEach((item) => {
        if (item.kitchenStatus === "NEW" || !item.kitchenStatus) {
          item.kitchenStatus = "PREPARING";
        }
      });
    } else if (status === "READY") {
      order.kitchenStatus = "READY";
      order.status = "READY";
      if (!order.readyAt) order.readyAt = now;
      order.items.forEach((item) => {
        item.kitchenStatus = "READY";
      });
    } else if (status === "SERVED") {
      order.kitchenStatus = "SERVED";
      order.servedAt = now;
      order.items.forEach((item) => {
        item.kitchenStatus = "SERVED";
      });
    } else if (status === "CANCELLED") {
      order.kitchenStatus = "SERVED";
      order.status = "CANCELLED";
    }

    await order.save();

    const branchId =
      order.branchId ||
      order.tableId?.areaName?.branchName?._id ||
      order.tableId?.areaName?.branchName ||
      req.user?.branch ||
      null;

    const branchIdStr = branchId ? branchId.toString() : null;

    // Realtime broadcast to branch room
    emitToBranch(branchIdStr, "order_updated", {
      orderId: order._id,
      branchId: branchIdStr,
      status: order.status,
      kitchenStatus: order.kitchenStatus,
      startedAt: order.startedAt,
      readyAt: order.readyAt,
      servedAt: order.servedAt,
    });

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
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
    const { status, startDate, endDate } = req.query;
    let filter = {
      $or: [
        { "items.0": { $exists: true } },
        { status: "CANCELLED" },
        { status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] } },
      ],
    };

    if (req.user?.organizationId) {
      filter.organization = req.user.organizationId;
    }

    let targetBranch = req.query.branchId;
    if (targetBranch === "ALL" || targetBranch === "all") targetBranch = null;
    const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';
    const isManager = req.user?.organizationRole === 'MANAGER' || req.user?.role === 'Manager';
    const staffBranch = req.user?.branch || req.user?.branchId;

    // Only Staff is locked to their designated branch (Admin & Manager can view all)
    if (!isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
      targetBranch = staffBranch;
    }
    if (targetBranch) {
      filter.branchId = targetBranch;
    }

    if (status && status !== "ALL") {
      if (status === "ACTIVE") {
        filter.status = { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] };
      } else {
        filter.status = status;
      }
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const orders = await cartModel
      .find(filter)
      .populate({
        path: "tableId",
        select: "tableNumber areaName",
        populate: {
          path: "areaName",
          select: "areaName",
        },
      })
      .sort({ createdAt: -1 });

    // Calculate total summary metrics
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === "COMPLETED");
    const activeCount = orders.filter((o) => ["PENDING", "ORDERED", "PREPARING", "READY"].includes(o.status)).length;
    const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;

    // Financial Privacy: ONLY Admin / SuperAdmin can see revenue metrics!
    const canViewFinances = isSuperAdmin || isOwnerOrAdmin;
    const totalRevenue = canViewFinances
      ? completedOrders.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0)
      : null;

    // Reference revenues (Today, Yesterday, This Month) for quick reference
    let todayRevenue = 0;
    let yesterdayRevenue = 0;
    let thisMonthRevenue = 0;

    if (canViewFinances) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const minDate = startOfYesterday < startOfMonth ? startOfYesterday : startOfMonth;

      const baseOrgFilter = { "items.0": { $exists: true }, status: "COMPLETED" };
      if (req.user?.organizationId) baseOrgFilter.organization = req.user.organizationId;
      if (targetBranch) baseOrgFilter.branchId = targetBranch;
      baseOrgFilter.createdAt = { $gte: minDate, $lte: endOfMonth };

      const monthOrders = await cartModel.find(baseOrgFilter, "totalAmount createdAt").lean();
      monthOrders.forEach((o) => {
        const amt = Number(o.totalAmount) || 0;
        const d = new Date(o.createdAt);
        if (d >= startOfMonth && d <= endOfMonth) {
          thisMonthRevenue += amt;
        }
        if (d >= startOfToday && d <= endOfToday) {
          todayRevenue += amt;
        } else if (d >= startOfYesterday && d <= endOfYesterday) {
          yesterdayRevenue += amt;
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: orders,
      summary: {
        totalOrders,
        totalRevenue,
        canViewFinances,
        activeCount,
        cancelledCount,
        todayRevenue,
        yesterdayRevenue,
        thisMonthRevenue,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getPosStats(req, res) {
  try {
    const orgId = req.user?.organizationId;
    let query = { "items.0": { $exists: true } };
    if (orgId) query.organization = orgId;

    const orders = await cartModel.find(query).lean();

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalSalesMonth = 0;
    let dineInSales = 0;
    let takeawaySales = 0;
    let deliverySales = 0;
    let dineInActiveCount = 0;
    let takeawayCountToday = 0;
    let deliveryActiveCount = 0;

    orders.forEach((o) => {
      const orderDate = new Date(o.createdAt || o.updatedAt);
      const isThisMonth = orderDate >= startOfMonth;
      const isToday = orderDate >= startOfDay;
      const amount = Number(o.totalAmount) || 0;
      const type = (o.orderType || "DINE-IN").toUpperCase();
      const isActive = ["PENDING", "ORDERED", "PREPARING", "READY"].includes(o.status);

      if (o.status === "COMPLETED" && isThisMonth) {
        totalSalesMonth += amount;
      }

      if (isToday) {
        if (type.includes("DINE")) {
          if (o.status === "COMPLETED") dineInSales += amount;
        } else if (type.includes("TAKEAWAY")) {
          if (o.status === "COMPLETED") takeawaySales += amount;
          takeawayCountToday++;
        } else if (type.includes("DELIVERY")) {
          if (o.status === "COMPLETED") deliverySales += amount;
        }
      }

      if (isActive) {
        if (type.includes("DINE")) dineInActiveCount++;
        else if (type.includes("DELIVERY")) deliveryActiveCount++;
      }
    });

    const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
    const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';
    const canViewFinances = isSuperAdmin || isOwnerOrAdmin;

    return res.status(200).json({
      success: true,
      data: {
        totalSalesMonth: canViewFinances ? totalSalesMonth : null,
        dineInSales: canViewFinances ? dineInSales : null,
        takeawaySales: canViewFinances ? takeawaySales : null,
        deliverySales: canViewFinances ? deliverySales : null,
        dineInActiveCount,
        takeawayCountToday,
        deliveryActiveCount,
        canViewFinances,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function releaseTable(req, res) {
  const { tableId } = req.params;

  try {
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "tableId is required",
      });
    }

    const table = await tableModel
      .findOneAndUpdate(
        { _id: tableId },
        { $set: { availabilityStatus: "AVAILABLE" } },
        { new: true }
      )
      .populate({
        path: "areaName",
        populate: { path: "branchName" },
      });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Complete or clear any active carts for this table
    const activeCarts = await cartModel.find({
      tableId,
      status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    });

    const now = new Date();
    for (const c of activeCarts) {
      if (c.status === "PENDING" && (!c.items || c.items.length === 0)) {
        await cartModel.deleteOne({ _id: c._id });
      } else {
        c.status = "CANCELLED";
        c.kitchenStatus = "SERVED";
        c.cancelledAt = now;
        c.notes = (c.notes ? c.notes + " | " : "") + "Table released without settlement";
        await c.save();
      }
    }

    const branchId =
      table?.areaName?.branchName?._id ||
      table?.areaName?.branchName ||
      table?.branch ||
      req.user?.branch ||
      null;

    const branchIdStr = branchId ? branchId.toString() : null;

    emitToBranch(branchIdStr, "table_updated", {
      tableId: table._id,
      availabilityStatus: "AVAILABLE",
    });

    return res.status(200).json({
      success: true,
      message: `Table ${table.tableNumber} released and marked available`,
      data: table,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function cancelOrder(req, res) {
  try {
    const orderId = req.params.orderId || req.body.orderId;
    const { tableId, reason = "Cancelled by user" } = req.body;

    let cart = null;
    if (orderId) {
      cart = await cartModel.findById(orderId);
    } else if (tableId) {
      cart = await cartModel
        .findOne({
          tableId,
          status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
        })
        .sort({ createdAt: -1 });
    }

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Order not found or already settled/cancelled",
      });
    }

    const now = new Date();
    cart.status = "CANCELLED";
    cart.kitchenStatus = "SERVED";
    cart.cancelledAt = now;
    cart.notes = (cart.notes ? cart.notes + " | " : "") + `Cancelled: ${reason}`;
    await cart.save();

    const targetTableId = tableId || cart.tableId;
    if (targetTableId) {
      const freedTable = await tableModel
        .findByIdAndUpdate(
          targetTableId,
          { $set: { availabilityStatus: "AVAILABLE" } },
          { new: true }
        )
        .populate({
          path: "areaName",
          populate: { path: "branchName" },
        });

      const branchId =
        freedTable?.areaName?.branchName?._id ||
        freedTable?.areaName?.branchName ||
        freedTable?.branch ||
        req.user?.branch ||
        null;
      const branchIdStr = branchId ? branchId.toString() : null;

      emitToBranch(branchIdStr, "table_updated", {
        tableId: targetTableId,
        availabilityStatus: "AVAILABLE",
      });
    }

    const branchIdStr = (cart.branchId || req.user?.branch || "").toString() || null;
    emitToBranch(branchIdStr, "order_updated", {
      orderId: cart._id,
      status: "CANCELLED",
    });

    return res.status(200).json({
      success: true,
      message: `Order #${cart.orderNumber || cart._id.toString().slice(-6)} cancelled successfully`,
      data: cart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


// =========================================================================
// TAKEAWAY / PARCEL ORDER CONTROLLERS
// =========================================================================

async function createTakeawayOrder(req, res) {
  const {
    customerName = "",
    customerPhone = "",
    items = [],
    notes = "",
    paymentMethod = "",
    gstEnabled = true,
    discount = 0,
    branchId: bodyBranchId,
  } = req.body;

  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one item is required for takeaway order",
      });
    }

    const orgId = req.user?.organizationId;
    let branchId =
      bodyBranchId ||
      req.headers["x-branch-id"] ||
      req.user?.branch ||
      req.user?.branchId ||
      null;

    // Fallback: If no branch provided, auto-assign to the organization's primary/only branch
    if (!branchId && orgId) {
      const defaultBranch = await branchModel.findOne({ organization: orgId }).sort({ createdAt: 1 });
      if (defaultBranch) {
        branchId = defaultBranch._id;
      }
    }

    // Calculate sequential token number for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayCount = await cartModel.countDocuments({
      ...(orgId ? { organization: orgId } : {}),
      orderType: "TAKEAWAY",
      createdAt: { $gte: startOfToday },
    });

    const tokenNum = String(todayCount + 1).padStart(2, "0");
    const orderNumber = `TK-${tokenNum}`;

    const subtotal = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0
    );
    const gstAmount = gstEnabled ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
    const totalAmount = Math.max(0, Math.round((subtotal + gstAmount - (Number(discount) || 0)) * 100) / 100);

    const isPaid = Boolean(paymentMethod);

    const newCart = new cartModel({
      organization: orgId,
      branchId,
      orderType: "TAKEAWAY",
      orderNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      notes: notes.trim(),
      items: items.map((i) => ({
        menuId: i.menuId || undefined,
        name: i.name,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 1,
        isManual: Boolean(i.isManual),
        kitchenStatus: "NEW",
        notes: i.notes || "",
      })),
      subtotal,
      gstEnabled,
      gstAmount,
      discount: Number(discount) || 0,
      totalAmount,
      paymentMethod: paymentMethod || "",
      paidAt: isPaid ? new Date() : undefined,
      status: "ORDERED",
      kitchenStatus: "NEW",
      startedAt: new Date(),
    });

    await newCart.save();

    // Broadcast to kitchen & branch displays
    const branchIdStr = branchId ? branchId.toString() : null;
    emitToBranch(branchIdStr, "kot_received", {
      orderId: newCart._id,
      branchId: branchIdStr,
      orderNumber: newCart.orderNumber,
      orderType: "TAKEAWAY",
      customerName: newCart.customerName,
      customerPhone: newCart.customerPhone,
      items: newCart.items.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        isManual: i.isManual || false,
        notes: i.notes || "",
        kitchenStatus: i.kitchenStatus || "NEW",
      })),
      notes: newCart.notes,
      status: "ORDERED",
      kitchenStatus: "NEW",
      createdAt: newCart.createdAt,
    });

    emitToBranch(branchIdStr, "order_updated", {
      orderId: newCart._id,
      branchId: branchIdStr,
      orderNumber: newCart.orderNumber,
      orderType: "TAKEAWAY",
      status: "ORDERED",
      kitchenStatus: "NEW",
    });

    return res.status(201).json({
      success: true,
      message: "Takeaway order created successfully",
      data: newCart,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

async function getTakeawayOrders(req, res) {
  try {
    const orgId = req.user?.organizationId;
    let targetBranch = req.query.branchId;
    if (targetBranch === "ALL" || targetBranch === "all") targetBranch = null;
    const isSuperAdmin = req.user?.systemRole === "SUPER_ADMIN";
    const isOwnerOrAdmin = req.user?.organizationRole === "OWNER" || req.user?.organizationRole === "ADMIN" || req.user?.role === "Admin";
    const isManager = req.user?.organizationRole === "MANAGER" || req.user?.role === "Manager";
    const staffBranch = req.user?.branch || req.user?.branchId;

    if (!isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
      targetBranch = staffBranch;
    }

    const filter = {
      orderType: "TAKEAWAY",
      ...(orgId ? { organization: orgId } : {}),
      ...(targetBranch ? { branchId: targetBranch } : {}),
    };

    const orders = await cartModel.find(filter).sort({ createdAt: -1 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter((o) => new Date(o.createdAt) >= todayStart);

    const todaySales = todayOrders
      .filter((o) => o.status === "COMPLETED")
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const activeOrders = orders.filter((o) => ["ORDERED", "PREPARING", "READY"].includes(o.status));
    const readyOrders = orders.filter((o) => o.kitchenStatus === "READY" && o.status !== "COMPLETED");

    return res.status(200).json({
      success: true,
      data: orders,
      metrics: {
        todaySales,
        totalToday: todayOrders.length,
        activeCount: activeOrders.length,
        readyCount: readyOrders.length,
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
  getPosStats,
  removeFromCart,
  updateItemQuantity,
  toggleGst,
  takeOrder,
  payOrder,
  updateKitchenOrderStatus,
  releaseTable,
  cancelOrder,
  createTakeawayOrder,
  getTakeawayOrders,
};