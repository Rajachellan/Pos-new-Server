const tableModel = require('../model/tableModel');
const areaModel = require('../model/areaSchema');
const { logAudit } = require('../utils/auditLogger');

// 1. Add Table (Tenant-Scoped)
async function addTableFun(req, res) {
  const { tableNumber, areaName } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    if (!tableNumber || !areaName) {
      return res.status(400).json({
        success: false,
        message: 'Table number and area are required',
      });
    }

    if (!orgId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context required to add table',
      });
    }

    // Verify area belongs to organization
    const areaDoc = await areaModel.findOne({
      _id: areaName,
      organization: orgId,
    });

    if (!areaDoc) {
      return res.status(404).json({
        success: false,
        message: 'Area not found or does not belong to your organization',
      });
    }

    const newTable = new tableModel({
      organization: orgId,
      branch: areaDoc.branchName,
      tableNumber: tableNumber.toUpperCase().trim(),
      areaName: areaDoc._id,
      availabilityStatus: 'AVAILABLE',
      createdBy: req.user.userId,
    });

    await newTable.save();

    await logAudit({
      req,
      action: 'TABLE_CREATED',
      module: 'table',
      targetId: newTable._id,
      description: `Table "${newTable.tableNumber}" created in area "${areaDoc.areaName}"`,
    });

    return res.status(201).json({
      success: true,
      message: 'Table Added Successfully',
      data: newTable,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

const cartModel = require('../model/cartSchema');

// Helper to auto-reconcile table availabilityStatus with active carts
async function reconcileTableStatuses(tables) {
  if (!tables || tables.length === 0) return tables;
  try {
    const tableIds = tables.map((t) => t._id);

    // Stale orders cutoff: orders older than 12 hours or served orders older than 2 hours should be auto-completed
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await cartModel.updateMany(
      {
        tableId: { $in: tableIds },
        status: { $in: ['PENDING', 'ORDERED', 'PREPARING', 'READY'] },
        $or: [
          { createdAt: { $lt: twelveHoursAgo } },
          { kitchenStatus: 'SERVED', updatedAt: { $lt: twoHoursAgo } },
        ],
      },
      {
        $set: {
          status: 'COMPLETED',
          kitchenStatus: 'SERVED',
          paidAt: new Date(),
          paymentMethod: 'CASH',
        },
      }
    );

    // Only PLACED orders that are active and not stale indicate real occupancy.
    // Note: 'PENDING' carts (draft items before clicking "Send KOT" / "Take Order") do NOT occupy a table!
    const activeCarts = await cartModel.find({
      tableId: { $in: tableIds },
      status: { $in: ['ORDERED', 'PREPARING', 'READY'] },
      'items.0': { $exists: true },
      createdAt: { $gte: twelveHoursAgo },
    }).select('tableId status items kitchenStatus');

    const activeTableIdSet = new Set(
      activeCarts
        .filter((c) => Array.isArray(c.items) && c.items.length > 0)
        .map((c) => c.tableId.toString())
    );

    const bulkOps = [];
    for (const table of tables) {
      const isOccupied = activeTableIdSet.has(table._id.toString());
      const expected = isOccupied ? 'OCCUPIED' : 'AVAILABLE';
      if (table.availabilityStatus !== expected) {
        table.availabilityStatus = expected;
        bulkOps.push({
          updateOne: {
            filter: { _id: table._id },
            update: { $set: { availabilityStatus: expected } },
          },
        });
      }
    }

    if (bulkOps.length > 0) {
      await tableModel.bulkWrite(bulkOps);
    }
  } catch (err) {
    console.error('Error reconciling table statuses:', err.message);
  }
  return tables;
}

// 2. Get All Tables (Tenant-Scoped & Branch-Scoped)
async function getAllTables(req, res) {
  const orgId = req.organizationId || req.user.organizationId;
  const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
  const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN' || req.user?.role === 'Admin';
  const isManager = req.user?.organizationRole === 'MANAGER' || req.user?.role === 'Manager';

  let targetBranch = req.query.branchId;
  if (targetBranch === 'ALL' || targetBranch === 'all') {
    targetBranch = null;
  }

  // Only Staff is locked strictly to their assigned branch (Admin and Manager have multi-branch access)
  const staffBranch = req.user?.branch || req.user?.branchId;
  if (!isSuperAdmin && !isOwnerOrAdmin && !isManager && staffBranch) {
    targetBranch = staffBranch;
  }

  try {
    let filter = orgId ? { organization: orgId } : {};

    if (targetBranch) {
      const areas = await areaModel.find({
        ...(orgId ? { organization: orgId } : {}),
        branchName: targetBranch,
      }).select('_id');
      const areaIds = areas.map((a) => a._id);

      filter.$or = [
        { branch: targetBranch },
        { areaName: { $in: areaIds } },
      ];
    }

    const getData = await tableModel.find(filter)
      .populate({
        path: 'areaName',
        select: 'areaName branchName areaCode',
        populate: {
          path: 'branchName',
          select: 'branchName branchCode',
        },
      })
      .sort({ tableNumber: 1 });

    await reconcileTableStatuses(getData);

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

// 3. Get Tables By Area (Tenant-Scoped)
async function getTableByArea(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const filter = {
      areaName: id,
      ...(orgId ? { organization: orgId } : {}),
    };

    const getData = await tableModel.find(filter)
      .populate({
        path: 'areaName',
        select: 'areaName branchName areaCode',
        populate: {
          path: 'branchName',
          select: 'branchName branchCode',
        },
      });

    await reconcileTableStatuses(getData);

    return res.status(200).json({
      success: true,
      message: 'Tables Fetched Successfully',
      data: getData,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. Get Tables By Branch (Tenant-Scoped)
async function getTableByBranch(req, res) {
  const orgId = req.organizationId || req.user.organizationId;
  const isSuperAdmin = req.user?.systemRole === 'SUPER_ADMIN';
  const isOwnerOrAdmin = req.user?.organizationRole === 'OWNER' || req.user?.organizationRole === 'ADMIN';

  let branchId = req.query.branchId;
  if (branchId === 'ALL' || branchId === 'all') {
    branchId = null;
  }

  // If user is staff/waiter, lock strictly to their assigned branch
  const staffBranch = req.user?.branch || req.user?.branchId;
  if (!isSuperAdmin && !isOwnerOrAdmin && staffBranch) {
    branchId = staffBranch;
  }

  try {
    let filter = orgId ? { organization: orgId } : {};

    if (branchId) {
      const areas = await areaModel.find({
        ...(orgId ? { organization: orgId } : {}),
        branchName: branchId,
      }).select('_id');

      const areaIds = areas.map((a) => a._id);

      filter.$or = [
        { branch: branchId },
        { areaName: { $in: areaIds } },
      ];
    }

    const tables = await tableModel.find(filter).populate({
      path: 'areaName',
      select: 'areaName branchName areaCode',
      populate: {
        path: 'branchName',
        select: 'branchName branchCode',
      },
    }).sort({ tableNumber: 1 });

    await reconcileTableStatuses(tables);

    return res.status(200).json({
      success: true,
      message: 'Tables fetched by branch',
      data: tables,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Update Table
async function updateTable(req, res) {
  const { id } = req.params;
  const { tableNumber, areaName, availabilityStatus } = req.body;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const table = await tableModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found or inaccessible',
      });
    }

    if (tableNumber) table.tableNumber = tableNumber.toUpperCase().trim();
    if (availabilityStatus) table.availabilityStatus = availabilityStatus;
    if (areaName) {
      const areaDoc = await areaModel.findOne({
        _id: areaName,
        ...(orgId ? { organization: orgId } : {}),
      });

      if (!areaDoc) {
        return res.status(404).json({
          success: false,
          message: 'Area not found or does not belong to your organization',
        });
      }

      table.areaName = areaDoc._id;
      table.branch = areaDoc.branchName;
    }

    await table.save();

    await logAudit({
      req,
      action: 'TABLE_UPDATED',
      module: 'table',
      targetId: table._id,
      description: `Table "${table.tableNumber}" updated`,
    });

    return res.status(200).json({
      success: true,
      message: 'Table updated successfully',
      data: table,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 6. Delete Table
async function deleteTable(req, res) {
  const { id } = req.params;
  const orgId = req.organizationId || req.user.organizationId;

  try {
    const table = await tableModel.findOne({
      _id: id,
      ...(orgId ? { organization: orgId } : {}),
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: 'Table not found or inaccessible',
      });
    }

    // Optional check: check if table is occupied
    if (table.availabilityStatus === 'OCCUPIED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an occupied table. Please clear the table first.',
      });
    }

    await tableModel.findByIdAndDelete(id);

    await logAudit({
      req,
      action: 'TABLE_DELETED',
      module: 'table',
      targetId: id,
      description: `Table "${table.tableNumber}" deleted`,
    });

    return res.status(200).json({
      success: true,
      message: 'Table deleted successfully',
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  addTableFun,
  getAllTables,
  getTableByArea,
  getTableByBranch,
  updateTable,
  deleteTable,
};