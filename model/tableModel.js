const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    tableNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    areaName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Areas',
      required: true,
      index: true,
    },
    availabilityStatus: {
      type: String,
      enum: ['AVAILABLE', 'OCCUPIED'],
      required: true,
      default: 'AVAILABLE',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

tableSchema.index({ organization: 1, areaName: 1 });
tableSchema.index({ organization: 1, branch: 1 });

module.exports = mongoose.model('Tables', tableSchema);