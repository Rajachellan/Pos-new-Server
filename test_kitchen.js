const mongoose = require("mongoose");
require("dotenv").config({ path: "e:/pos/Pos-new-Server/.env" });
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/pos";

mongoose.connect(uri).then(async () => {
  const cartModel = mongoose.model("Orders", new mongoose.Schema({}, { strict: false }));
  
  const targetBranch = "6ac8e8fcf83bb81f6e8fdc69";
  let query = {
    status: { $in: ["PENDING", "ORDERED", "PREPARING", "READY"] },
    kitchenStatus: { $ne: "SERVED" },
    "items.0": { $exists: true },
  };

  const orders = await cartModel.find(query).sort({ createdAt: 1 });

  const filteredOrders = orders.filter((order) => {
    if (!targetBranch || targetBranch === "ALL" || targetBranch === "all") return true;
    const directBranch = order.branchId ? order.branchId.toString() : null;
    return directBranch === targetBranch.toString();
  });

  console.log("Filtered orders for branch", targetBranch, ":", filteredOrders.length);
  
  // Now simulate kitchen/page.tsx status tabs
  const newCount = filteredOrders.filter(o => 
    (o.kitchenStatus === "NEW" || o.status === "ORDERED" || o.status === "PENDING") && 
    o.kitchenStatus !== "PREPARING" && 
    o.kitchenStatus !== "READY"
  ).length;

  const prepCount = filteredOrders.filter(o => 
    o.kitchenStatus === "PREPARING" || o.status === "PREPARING"
  ).length;

  const readyCount = filteredOrders.filter(o => 
    o.kitchenStatus === "READY" || o.status === "READY"
  ).length;

  console.log("Tab counts in kitchen/page.tsx:");
  console.log("NEW (New Orders):", newCount);
  console.log("PREPARING (In Prep):", prepCount);
  console.log("READY (Ready to Serve):", readyCount);

  console.log("\nDetails of all active orders:");
  filteredOrders.forEach(o => {
    console.log({
      orderNumber: o.orderNumber,
      orderType: o.orderType,
      status: o.status,
      kitchenStatus: o.kitchenStatus,
      items: o.items?.map(i => i.name)
    });
  });

  process.exit(0);
});
