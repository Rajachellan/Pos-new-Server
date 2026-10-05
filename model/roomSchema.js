const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    number: {
      type: String,
      required: true,
      trim: true,
    },
    roomType: {
      type: String,
      enum: ['Standard', 'Deluxe', 'Super Deluxe', 'Executive Suite', 'Presidential Suite'],
      default: 'Deluxe',
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
      default: 'AVAILABLE',
      index: true,
    },
    currentBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoomBooking',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

roomSchema.index({ branch: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
