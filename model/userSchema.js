const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    username: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please Provide Valid Email Address'],
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    systemRole: {
      type: String,
      enum: ['SUPER_ADMIN', 'ORGANIZATION_USER'],
      default: 'ORGANIZATION_USER',
      index: true,
    },
    organizationRole: {
      type: String,
      enum: ['OWNER', 'ADMIN', 'MANAGER', 'STAFF', null],
      default: null,
      index: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
      required: function () {
        return this.systemRole === 'ORGANIZATION_USER';
      },
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null,
      index: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for tenant queries
userSchema.index({ organization: 1, status: 1 });
userSchema.index({ organization: 1, branch: 1 });

// Backward compatibility virtual for legacy role
userSchema.virtual('legacyRole').get(function () {
  if (this.systemRole === 'SUPER_ADMIN') return 'Super-Admin';
  if (this.organizationRole === 'OWNER' || this.organizationRole === 'ADMIN') return 'Admin';
  return 'Staff';
});

const userModel = mongoose.model('User', userSchema);

module.exports = userModel;