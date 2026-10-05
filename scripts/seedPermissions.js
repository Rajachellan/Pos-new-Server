const mongoose = require('mongoose');
const Permission = require('../model/permissionSchema');
require('dotenv').config();

const permissionsData = [
  // Dashboard
  { name: 'View Dashboard', key: 'dashboard.view', module: 'dashboard', action: 'view', description: 'Access dashboard analytics and metrics' },

  // Organization
  { name: 'View Organization', key: 'organization.view', module: 'organization', action: 'view', description: 'View organization details' },
  { name: 'Create Organization', key: 'organization.create', module: 'organization', action: 'create', description: 'Create new organization' },
  { name: 'Update Organization', key: 'organization.update', module: 'organization', action: 'update', description: 'Update organization profile and settings' },
  { name: 'Delete Organization', key: 'organization.delete', module: 'organization', action: 'delete', description: 'Delete organization' },

  // Users
  { name: 'View Users', key: 'user.view', module: 'user', action: 'view', description: 'View staff and user accounts' },
  { name: 'Create Users', key: 'user.create', module: 'user', action: 'create', description: 'Add new staff or admin users' },
  { name: 'Update Users', key: 'user.update', module: 'user', action: 'update', description: 'Edit staff profiles and permissions' },
  { name: 'Delete Users', key: 'user.delete', module: 'user', action: 'delete', description: 'Remove or deactivate staff accounts' },

  // Roles
  { name: 'View Roles', key: 'role.view', module: 'role', action: 'view', description: 'View roles and their assigned permissions' },
  { name: 'Create Roles', key: 'role.create', module: 'role', action: 'create', description: 'Create custom roles' },
  { name: 'Update Roles', key: 'role.update', module: 'role', action: 'update', description: 'Modify custom roles and permissions' },
  { name: 'Delete Roles', key: 'role.delete', module: 'role', action: 'delete', description: 'Delete custom roles' },

  // Branches
  { name: 'View Branches', key: 'branch.view', module: 'branch', action: 'view', description: 'View organization branches' },
  { name: 'Create Branches', key: 'branch.create', module: 'branch', action: 'create', description: 'Add a new branch' },
  { name: 'Update Branches', key: 'branch.update', module: 'branch', action: 'update', description: 'Edit branch details' },
  { name: 'Delete Branches', key: 'branch.delete', module: 'branch', action: 'delete', description: 'Deactivate or delete a branch' },

  // Reservations
  { name: 'View Reservations', key: 'reservation.view', module: 'reservation', action: 'view', description: 'View room bookings' },
  { name: 'Create Reservations', key: 'reservation.create', module: 'reservation', action: 'create', description: 'Book a room for a guest' },
  { name: 'Update Reservations', key: 'reservation.update', module: 'reservation', action: 'update', description: 'Modify room reservation' },
  { name: 'Delete Reservations', key: 'reservation.delete', module: 'reservation', action: 'delete', description: 'Cancel or delete reservation' },

  // Rooms
  { name: 'View Rooms', key: 'room.view', module: 'room', action: 'view', description: 'View room catalog and availability' },
  { name: 'Create Rooms', key: 'room.create', module: 'room', action: 'create', description: 'Add new hotel rooms' },
  { name: 'Update Rooms', key: 'room.update', module: 'room', action: 'update', description: 'Edit room specs and status' },
  { name: 'Delete Rooms', key: 'room.delete', module: 'room', action: 'delete', description: 'Delete a room' },

  // Guests
  { name: 'View Guests', key: 'guest.view', module: 'guest', action: 'view', description: 'View guest directory' },
  { name: 'Create Guests', key: 'guest.create', module: 'guest', action: 'create', description: 'Register a new guest' },
  { name: 'Update Guests', key: 'guest.update', module: 'guest', action: 'update', description: 'Edit guest information' },
  { name: 'Delete Guests', key: 'guest.delete', module: 'guest', action: 'delete', description: 'Delete guest record' },

  // Check-in / Check-out
  { name: 'Guest Check-in', key: 'checkin.create', module: 'reservation', action: 'create', description: 'Process guest check-in' },
  { name: 'Guest Check-out', key: 'checkout.create', module: 'reservation', action: 'create', description: 'Process guest check-out and bill settlement' },

  // Housekeeping
  { name: 'View Housekeeping', key: 'housekeeping.view', module: 'housekeeping', action: 'view', description: 'View cleaning tasks and room hygiene' },
  { name: 'Create Housekeeping Task', key: 'housekeeping.create', module: 'housekeeping', action: 'create', description: 'Assign housekeeping tasks' },
  { name: 'Update Housekeeping Task', key: 'housekeeping.update', module: 'housekeeping', action: 'update', description: 'Update cleaning status' },
  { name: 'Delete Housekeeping Task', key: 'housekeeping.delete', module: 'housekeeping', action: 'delete', description: 'Delete cleaning task' },

  // Restaurant & Orders
  { name: 'View Restaurant Orders', key: 'restaurant.view', module: 'restaurant', action: 'view', description: 'View dining floor and live KOT' },
  { name: 'Create Restaurant Order', key: 'restaurant.create', module: 'restaurant', action: 'create', description: 'Place food orders' },
  { name: 'Update Restaurant Order', key: 'restaurant.update', module: 'restaurant', action: 'update', description: 'Modify or advance order state' },
  { name: 'Delete Restaurant Order', key: 'restaurant.delete', module: 'restaurant', action: 'delete', description: 'Cancel restaurant orders' },

  // Food Menu
  { name: 'View Food Menu', key: 'food_menu.view', module: 'food_menu', action: 'view', description: 'Browse food menu catalog' },
  { name: 'Create Food Menu', key: 'food_menu.create', module: 'food_menu', action: 'create', description: 'Add dishes and items to menu' },
  { name: 'Update Food Menu', key: 'food_menu.update', module: 'food_menu', action: 'update', description: 'Edit dishes, prices and availability' },
  { name: 'Delete Food Menu', key: 'food_menu.delete', module: 'food_menu', action: 'delete', description: 'Delete items from menu' },

  // Tables & Areas
  { name: 'View Tables', key: 'table.view', module: 'table', action: 'view', description: 'View tables and dining areas' },
  { name: 'Create Tables', key: 'table.create', module: 'table', action: 'create', description: 'Add tables and dining zones' },
  { name: 'Update Tables', key: 'table.update', module: 'table', action: 'update', description: 'Update table status and layout' },
  { name: 'Delete Tables', key: 'table.delete', module: 'table', action: 'delete', description: 'Delete tables or areas' },

  // Cart & POS
  { name: 'View Cart', key: 'cart.view', module: 'cart', action: 'view', description: 'View active orders in cart' },
  { name: 'Create Cart Order', key: 'cart.create', module: 'cart', action: 'create', description: 'Take table orders and add to cart' },
  { name: 'Update Cart Order', key: 'cart.update', module: 'cart', action: 'update', description: 'Modify items in cart' },
  { name: 'Delete Cart Order', key: 'cart.delete', module: 'cart', action: 'delete', description: 'Clear or void cart' },

  // Payments & Billing
  { name: 'View Payments', key: 'payment.view', module: 'payment', action: 'view', description: 'View billing invoices and settlement records' },
  { name: 'Create Payment', key: 'payment.create', module: 'payment', action: 'create', description: 'Collect and settle payments' },
  { name: 'Update Payment', key: 'payment.update', module: 'payment', action: 'update', description: 'Adjust payment records or refund' },
  { name: 'Delete Payment', key: 'payment.delete', module: 'payment', action: 'delete', description: 'Void payment entries' },

  // Expenses
  { name: 'View Expenses', key: 'expense.view', module: 'expense', action: 'view', description: 'View organization expenses' },
  { name: 'Create Expense', key: 'expense.create', module: 'expense', action: 'create', description: 'Record an expense' },
  { name: 'Update Expense', key: 'expense.update', module: 'expense', action: 'update', description: 'Edit recorded expense' },
  { name: 'Delete Expense', key: 'expense.delete', module: 'expense', action: 'delete', description: 'Delete recorded expense' },

  // Inventory
  { name: 'View Inventory', key: 'inventory.view', module: 'inventory', action: 'view', description: 'View stock levels and inventory' },
  { name: 'Create Inventory Item', key: 'inventory.create', module: 'inventory', action: 'create', description: 'Add stock items' },
  { name: 'Update Inventory Item', key: 'inventory.update', module: 'inventory', action: 'update', description: 'Update stock counts and suppliers' },
  { name: 'Delete Inventory Item', key: 'inventory.delete', module: 'inventory', action: 'delete', description: 'Delete stock items' },

  // Reports
  { name: 'View Reports', key: 'report.view', module: 'report', action: 'view', description: 'View financial and operational reports' },
  { name: 'Export Reports', key: 'report.export', module: 'report', action: 'export', description: 'Export reports to CSV / Excel' },

  // Settings
  { name: 'View Settings', key: 'settings.view', module: 'settings', action: 'view', description: 'View system and hotel configurations' },
  { name: 'Update Settings', key: 'settings.update', module: 'settings', action: 'update', description: 'Modify taxes, branch info and preferences' },

  // Audit Logs
  { name: 'View Audit Logs', key: 'audit_log.view', module: 'audit_log', action: 'view', description: 'View security and change history logs' },
];

async function seedPermissions() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel-management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB at', uri);

  let inserted = 0;
  let updated = 0;

  for (const perm of permissionsData) {
    const res = await Permission.findOneAndUpdate(
      { key: perm.key },
      { $set: perm },
      { upsert: true, new: true, rawResult: true }
    );
    if (res.lastErrorObject && res.lastErrorObject.updatedExisting) {
      updated++;
    } else {
      inserted++;
    }
  }

  console.log(`Permissions seeded successfully: ${inserted} inserted, ${updated} updated. Total: ${permissionsData.length}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  seedPermissions().catch((err) => {
    console.error('Failed to seed permissions:', err);
    process.exit(1);
  });
}

module.exports = { seedPermissions, permissionsData };
