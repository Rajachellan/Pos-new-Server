const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },

    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tables",
      required: false,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomBooking",
      required: false,
    },

    items: [
      {
        menuId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuLists",
          required: false,
        },

        name: {
          type: String,
          required: true,
        },

        price: {
          type: Number,
          required: true,
          min: 0,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
          default: 1,
        },

        isManual: {
          type: Boolean,
          default: false,
        },

        kitchenStatus: {
          type: String,
          enum: ["NEW", "PREPARING", "READY", "SERVED"],
          default: "NEW",
        },

        notes: {
          type: String,
          default: "",
        },
      },
    ],

    subtotal: {
      type: Number,
      default: 0,
      min: 0,
    },

    gstEnabled: {
      type: Boolean,
      default: true,
    },

    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    serviceCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: ["CASH", "CARD", "UPI", "CHEQUE", ""],
      default: "",
    },

    paidAt: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["PENDING", "ORDERED", "PREPARING", "READY", "COMPLETED", "CANCELLED"],
      default: "PENDING",
    },

    // Extended fields for Kitchen TV / KDS
    orderNumber: {
      type: String,
    },

    orderType: {
      type: String,
      enum: ["DINE-IN", "TAKEAWAY", "DELIVERY", "ROOM SERVICE", "ROOM-SERVICE"],
      default: "DINE-IN",
    },

    roomNumber: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
    },

    kitchenStatus: {
      type: String,
      enum: ["NEW", "PREPARING", "READY", "SERVED"],
      default: "NEW",
    },

    startedAt: {
      type: Date,
    },

    readyAt: {
      type: Date,
    },

    servedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ organization: 1, status: 1 });
orderSchema.index({ organization: 1, branchId: 1 });

module.exports = mongoose.model("Orders", orderSchema);