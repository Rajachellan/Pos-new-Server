require('dotenv').config();
const mongoose = require('mongoose');
require('../model/areaSchema');
const Table = require('../model/tableModel');
const Cart = require('../model/cartSchema');

async function syncAllTables() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel-management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const tables = await Table.find();
  console.log(`Found ${tables.length} tables in database.`);

  let updatedCount = 0;
  for (const t of tables) {
    const activeCart = await Cart.findOne({
      tableId: t._id,
      status: { $in: ['PENDING', 'ORDERED', 'PREPARING', 'READY'] },
      'items.0': { $exists: true },
    });

    const correctStatus = activeCart ? 'OCCUPIED' : 'AVAILABLE';
    if (t.availabilityStatus !== correctStatus) {
      await Table.updateOne(
        { _id: t._id },
        { $set: { availabilityStatus: correctStatus } }
      );
      console.log(`Table ${t.tableNumber} fixed: ${t.availabilityStatus} -> ${correctStatus}`);
      updatedCount++;
    }
  }

  console.log(`Done! Synchronized ${updatedCount} tables.`);
  await mongoose.disconnect();
}

syncAllTables().catch((err) => {
  console.error(err);
  process.exit(1);
});
