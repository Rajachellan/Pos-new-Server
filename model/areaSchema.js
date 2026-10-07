const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    areaName: {
      type: String,
      required: true,
      trim: true,
    },
    areaCode: {
      type: String,
      required: false,
      default: '',
      uppercase: true,
      trim: true,
    },
    branchName: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
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

areaSchema.index({ organization: 1, branchName: 1 });

module.exports = mongoose.model('Areas', areaSchema);