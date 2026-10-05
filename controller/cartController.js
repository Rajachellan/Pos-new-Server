const cartModel = require("../model/cartSchema");
const menuModel = require("../model/foodMenuSchema");
const tableModel = require("../model/tableModel");
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

    // Multi-tenant branch filtering
    const filteredOrders = orders.filter((order) => {
      if (!targetBranch || targetBranch === "ALL" || targetBranch === "all") return true;
      const directBranch = order.branchId ? order.branchId.toString() : null;
      const tableBranch =
        order.tableId?.areaName?.branchName?._id?.toString() ||
        order.tableId?.areaName?.branchName?.toString() ||
        order.tableId?.branch?.toString();
      
      return directBranch === targetBranch.toString() || tableBranch === targetBranch.toString();
    });

    // Format output
    const formattedOrders = filteredOrders.map((order) => {
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

    cart.items = cart.items.filter((item) => {
      if (itemId && item._id.toString() === itemId) return false;
      if (menuId && item.menuId && item.menuId.toString() === menuId) return false;
      return true;
    });

    recalculateCart(cart);
    await cart.save();

    if (cart.items.length === 0) {
      await tableModel.updateOne(
        { _id: tableId },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
      emitToBranch(cart.branchId ? cart.branchId.toString() : null, "table_updated", {
        tableId,
        availabilityStatus: "AVAILABLE",
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
      item.quantity -= 1;
      if (item.quantity <= 0) {
        cart.items = cart.items.filter((i) => i._id.toString() !== item._id.toString());
      }
    } else {
      item.quantity += 1;
    }

    recalculateCart(cart);
    await cart.save();

    if (cart.items.length === 0) {
      await tableModel.updateOne(
        { _id: tableId },
        { $set: { availabilityStatus: "AVAILABLE" } }
      );
      emitToBranch(cart.branchId ? cart.branchId.toString() : null, "table_updated", {
        tableId,
        availabilityStatus: "AVAILABLE",
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
    const { status } = req.query;
    let filter = { "items.0": { $exists: true } };

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
      filter.status = status;
    }

    const orders = await cartModel
      .find(filter)
      .populate("tableId", "tableNumber areaId")
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

    return res.status(200).json({
      success: true,
      data: orders,
      summary: {
        totalOrders,
        totalRevenue,
        canViewFinances,
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
        c.status = "COMPLETED";
        c.kitchenStatus = "SERVED";
        c.paidAt = now;
        if (!c.paymentMethod) c.paymentMethod = "CASH";
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
};