const mongoose = require('mongoose');
const Role = require('../model/roleSchema');
const Permission = require('../model/permissionSchema');
require('dotenv').config();

const systemRoleDefinitions = [
  {
    name: 'Organization Owner',
    key: 'ORGANIZATION_OWNER',
    description: 'Full administrative control over the customer organization and all its branches.',
    isSystemRole: true,
    permissionFilter: (key) =>
      !key.startsWith('organization.create') &&
      !key.startsWith('organization.delete'),
  },
  {
    name: 'Hotel Administrator',
    key: 'ADMIN',
    description: 'Manages hotel operations, staff, branches, and resources.',
    isSystemRole: true,
    permissionFilter: (key) =>
      !key.startsWith('organization.') &&
      !key.startsWith('role.delete') &&
      !key.startsWith('audit_log.'),
  },
  {
    name: 'Hotel Manager',
    key: 'MANAGER',
    description: 'Oversees day-to-day operations across rooms, dining, and guests.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.') ||
      key.startsWith('reservation.') ||
      key.startsWith('room.') ||
      key.startsWith('guest.') ||
      key.startsWith('checkin.') ||
      key.startsWith('checkout.') ||
      key.startsWith('housekeeping.') ||
      key.startsWith('restaurant.') ||
      key.startsWith('table.') ||
      key.startsWith('cart.') ||
      key.startsWith('food_menu.') ||
      key.startsWith('payment.view') ||
      key.startsWith('payment.create') ||
      key.startsWith('report.view'),
  },
  {
    name: 'Front Desk Staff',
    key: 'FRONT_DESK',
    description: 'Manages room bookings, guest directory, check-ins, and check-outs.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('reservation.') ||
      key.startsWith('guest.') ||
      key.startsWith('checkin.') ||
      key.startsWith('checkout.') ||
      key.startsWith('room.view'),
  },
  {
    name: 'Housekeeping Staff',
    key: 'HOUSEKEEPING',
    description: 'Tracks room cleaning and maintenance operations.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('housekeeping.') ||
      key.startsWith('room.view') ||
      key.startsWith('room.update'),
  },
  {
    name: 'Restaurant Manager',
    key: 'RESTAURANT_MANAGER',
    description: 'Supervises dining floor, kitchen queue, tables, and food menus.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('restaurant.') ||
      key.startsWith('food_menu.') ||
      key.startsWith('table.') ||
      key.startsWith('cart.') ||
      key.startsWith('payment.view') ||
      key.startsWith('payment.create'),
  },
  {
    name: 'Restaurant Staff / Waiter',
    key: 'RESTAURANT_STAFF',
    description: 'Takes dine-in orders, views tables and manages live cart.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('restaurant.view') ||
      key.startsWith('restaurant.create') ||
      key.startsWith('restaurant.update') ||
      key.startsWith('food_menu.view') ||
      key.startsWith('table.view') ||
      key.startsWith('table.update') ||
      key.startsWith('cart.'),
  },
  {
    name: 'Accounts & Billing',
    key: 'ACCOUNTS',
    description: 'Manages billing payments, invoices, expenses, and financial reports.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('payment.') ||
      key.startsWith('expense.') ||
      key.startsWith('report.'),
  },
  {
    name: 'Inventory Manager',
    key: 'INVENTORY_MANAGER',
    description: 'Tracks stock levels, material procurement, and operational expenses.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('inventory.') ||
      key.startsWith('expense.view') ||
      key.startsWith('expense.create'),
  },
  {
    name: 'General Staff',
    key: 'STAFF',
    description: 'Standard operational staff with basic access to floor and POS.',
    isSystemRole: true,
    permissionFilter: (key) =>
      key.startsWith('dashboard.view') ||
      key.startsWith('table.view') ||
      key.startsWith('cart.') ||
      key.startsWith('food_menu.view') ||
      key.startsWith('restaurant.view') ||
      key.startsWith('restaurant.create'),
  },
];

async function seedRoles() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel-management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB at', uri);

  const allPermissions = await Permission.find();
  console.log(`Loaded ${allPermissions.length} permissions for role mapping`);

  for (const def of systemRoleDefinitions) {
    const matchedPermIds = allPermissions
      .filter((p) => def.permissionFilter(p.key))
      .map((p) => p._id);

    await Role.findOneAndUpdate(
      { key: def.key, organization: null },
      {
        $set: {
          name: def.name,
          key: def.key,
          description: def.description,
          isSystemRole: true,
          organization: null,
          permissions: matchedPermIds,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`Role ${def.key} synced with ${matchedPermIds.length} permissions`);
  }

  console.log('System roles seeded successfully!');
  await mongoose.disconnect();
}

if (require.main === module) {
  seedRoles().catch((err) => {
    console.error('Failed to seed roles:', err);
    process.exit(1);
  });
}

module.exports = { seedRoles };
