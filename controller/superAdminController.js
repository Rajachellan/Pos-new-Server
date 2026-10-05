const bcrypt = require('bcrypt');
const Organization = require('../model/organizationSchema');
const User = require('../model/userSchema');
const Branch = require('../model/branchSchema');
const Role = require('../model/roleSchema');
const AuditLog = require('../model/auditLogSchema');
const { logAudit } = require('../utils/auditLogger');
const { sendOnboardingEmail, sendPasswordResetEmail } = require('../utils/emailService');

// 1. Platform Statistics & Metrics
async function getPlatformStats(req, res) {
  try {
    const totalOrganizations = await Organization.countDocuments();
    const activeOrganizations = await Organization.countDocuments({ status: 'ACTIVE' });
    const suspendedOrganizations = await Organization.countDocuments({ status: 'SUSPENDED' });

    const lifetimeCustomers = await Organization.countDocuments({ 'license.type': 'LIFETIME' });
    const subscriptionCustomers = await Organization.countDocuments({ 'license.type': 'SUBSCRIPTION' });

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'ACTIVE' });

    const recentOrganizations = await Organization.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('owner', 'name email username');

    const recentLogins = await User.find({ lastLoginAt: { $ne: null } })
      .sort({ lastLoginAt: -1 })
      .limit(5)
      .select('name email systemRole organizationRole lastLoginAt')
      .populate('organization', 'name');

    const recentAuditLogs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('user', 'name email')
      .populate('organization', 'name');

    return res.status(200).json({
      success: true,
      data: {
        totalOrganizations,
        activeOrganizations,
        suspendedOrganizations,
        lifetimeCustomers,
        subscriptionCustomers,
        totalUsers,
        activeUsers,
        recentOrganizations,
        recentLogins,
        recentAuditLogs,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 2. List Organizations
async function listOrganizations(req, res) {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Organization.countDocuments(filter);
    const organizations = await Organization.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('owner', 'name email username status');

    return res.status(200).json({
      success: true,
      data: {
        organizations,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 3. Complete Customer Onboarding Flow
async function createOrganizationOnboarding(req, res) {
  const {
    // Organization Info
    name,
    legalName,
    email,
    phno,
    address,
    gstNumber,
    // License Info
    licenseType = 'LIFETIME',
    licenseExpiresAt = null,
    // Owner Info
    ownerName,
    ownerEmail,
    ownerUsername,
    ownerPassword,
    // Initial Branch Info
    branchName,
    branchCode,
    branchAddress,
  } = req.body;

  try {
    const targetEmail = (email || ownerEmail || '').toLowerCase().trim();
    const targetOwnerEmail = (ownerEmail || email || '').toLowerCase().trim();

    if (!name || !targetEmail || !ownerName || !ownerPassword) {
      return res.status(400).json({
        success: false,
        message: 'Hotel name, email, owner name, and password are required',
      });
    }

    // Check existing organization email
    const existingOrgEmail = await Organization.findOne({ email: targetEmail });
    if (existingOrgEmail) {
      return res.status(400).json({
        success: false,
        message: `An organization with email "${targetEmail}" already exists`,
      });
    }

    // Check if email is already registered to another user
    const existingUserWithEmail = await User.findOne({ email: targetOwnerEmail });
    if (existingUserWithEmail) {
      return res.status(400).json({
        success: false,
        message: `A user with email "${targetOwnerEmail}" already exists. Please use a different login email.`,
      });
    }

    // Auto-resolve unique username so onboarding never fails on username collision
    let baseUsername = (ownerUsername || targetOwnerEmail.split('@')[0])
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_.-]/g, '');
    if (!baseUsername) {
      baseUsername = 'owner';
    }

    let finalUsername = baseUsername;
    let usernameCounter = 1;
    while (await User.findOne({ username: { $regex: new RegExp(`^${finalUsername}$`, 'i') } })) {
      finalUsername = `${baseUsername}${usernameCounter}`;
      usernameCounter++;
    }

    // Generate unique slug
    let baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    let slug = baseSlug;
    let counter = 1;
    while (await Organization.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // 1. Create Organization
    const organization = new Organization({
      name,
      slug,
      legalName: legalName || name,
      email: targetEmail,
      phno: phno || '',
      address: address || '',
      gstNumber: gstNumber || '',
      status: 'ACTIVE',
      license: {
        type: licenseType,
        status: 'ACTIVE',
        purchasedAt: new Date(),
        expiresAt: licenseType === 'LIFETIME' ? null : licenseExpiresAt,
      },
      createdBy: req.user.userId,
    });
    await organization.save();

    // 2. Hash owner password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ownerPassword, salt);

    // 3. Find OWNER system role template
    const ownerTemplateRole = await Role.findOne({
      key: 'ORGANIZATION_OWNER',
      organization: null,
    });

    // 4. Create Owner User
    const ownerUser = new User({
      name: ownerName,
      username: finalUsername,
      email: targetOwnerEmail,
      password: hashedPassword,
      systemRole: 'ORGANIZATION_USER',
      organizationRole: 'OWNER',
      organization: organization._id,
      role: ownerTemplateRole ? ownerTemplateRole._id : null,
      status: 'ACTIVE',
      createdBy: req.user.userId,
    });
    await ownerUser.save();

    // Link owner to organization
    organization.owner = ownerUser._id;
    await organization.save();

    // 5. Create Initial Branch
    let createdBranch = null;
    const initialBranchName = branchName || `${name} - Main Branch`;
    const initialBranchCode = (branchCode || 'HQ01').toUpperCase().trim();

    createdBranch = new Branch({
      organization: organization._id,
      branchName: initialBranchName,
      branchCode: initialBranchCode,
      address: branchAddress || address || '',
      createdBy: ownerUser._id,
    });
    await createdBranch.save();

    // Assign initial branch to owner
    ownerUser.branch = createdBranch._id;
    await ownerUser.save();

    // Audit log
    await logAudit({
      req,
      action: 'ORGANIZATION_CREATED',
      module: 'organization',
      targetId: organization._id,
      description: `Organization "${organization.name}" and Owner "${ownerUser.name}" created by Super Admin`,
      metadata: { organizationId: organization._id, ownerId: ownerUser._id, branchId: createdBranch._id },
    });

    // 6. Send Onboarding Credentials Email to the Owner
    const emailResult = await sendOnboardingEmail({
      ownerEmail: ownerUser.email,
      ownerName: ownerUser.name,
      ownerUsername: ownerUser.username,
      password: ownerPassword,
      organizationName: organization.name,
      licenseType: organization.license.type,
      branchName: createdBranch.branchName,
      branchCode: createdBranch.branchCode,
      clientUrl: req.headers.origin || process.env.CLIENT_URL || 'http://localhost:3000',
    });

    return res.status(201).json({
      success: true,
      message: 'Organization onboarded successfully with owner and initial branch. Welcome email dispatched.',
      data: {
        organization,
        owner: {
          id: ownerUser._id,
          name: ownerUser.name,
          email: ownerUser.email,
          username: ownerUser.username,
          systemRole: ownerUser.systemRole,
          organizationRole: ownerUser.organizationRole,
        },
        branch: createdBranch,
        emailDispatched: emailResult.success,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 4. Get Organization Details
async function getOrganizationById(req, res) {
  const { id } = req.params;
  try {
    const organization = await Organization.findById(id).populate('owner', 'name email username status lastLoginAt');
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
    }

    const branches = await Branch.find({ organization: id });
    const userCount = await User.countDocuments({ organization: id });

    return res.status(200).json({
      success: true,
      data: {
        organization,
        branches,
        userCount,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 5. Update Organization
async function updateOrganization(req, res) {
  const { id } = req.params;
  const {
    name,
    legalName,
    email,
    phno,
    address,
    gstNumber,
    settings,
    ownerName,
    ownerEmail,
    ownerPhone,
  } = req.body;

  try {
    const organization = await Organization.findById(id).populate('owner');
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
    }

    if (name) organization.name = name.trim();
    if (legalName !== undefined) organization.legalName = legalName.trim();
    if (email !== undefined && email.trim()) organization.email = email.trim().toLowerCase();
    if (phno !== undefined) organization.phno = phno.trim();
    if (address !== undefined) organization.address = address.trim();
    if (gstNumber !== undefined) organization.gstNumber = gstNumber.trim().toUpperCase();
    if (settings) organization.settings = { ...organization.settings, ...settings };

    await organization.save();

    // If owner details provided and organization has an owner, update owner user too
    if (organization.owner) {
      let ownerUpdated = false;
      if (ownerName && ownerName.trim()) {
        organization.owner.name = ownerName.trim();
        ownerUpdated = true;
      }
      if (ownerEmail && ownerEmail.trim()) {
        organization.owner.email = ownerEmail.trim().toLowerCase();
        ownerUpdated = true;
      }
      if (ownerPhone !== undefined) {
        organization.owner.phno = ownerPhone.trim();
        ownerUpdated = true;
      }
      if (ownerUpdated) {
        await organization.owner.save();
      }
    }

    await logAudit({
      req,
      action: 'ORGANIZATION_UPDATED',
      module: 'organization',
      targetId: organization._id,
      description: `Organization "${organization.name}" and details updated by Super Admin`,
    });

    const updatedOrg = await Organization.findById(id).populate('owner', 'name email username phno');

    return res.status(200).json({
      success: true,
      message: 'Organization details updated successfully',
      data: updatedOrg,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 6. Suspend / Activate Organization
async function updateOrganizationStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status must be ACTIVE, INACTIVE, or SUSPENDED',
    });
  }

  try {
    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
    }

    organization.status = status;
    await organization.save();

    await logAudit({
      req,
      action: `ORGANIZATION_${status}`,
      module: 'organization',
      targetId: organization._id,
      description: `Organization "${organization.name}" status changed to ${status}`,
    });

    return res.status(200).json({
      success: true,
      message: `Organization status updated to ${status}`,
      data: organization,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 7. Update License
async function updateOrganizationLicense(req, res) {
  const { id } = req.params;
  const { type, status, expiresAt } = req.body;

  try {
    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
    }

    if (type) organization.license.type = type;
    if (status) organization.license.status = status;
    if (expiresAt !== undefined) organization.license.expiresAt = expiresAt;

    await organization.save();

    await logAudit({
      req,
      action: 'LICENSE_CHANGED',
      module: 'organization',
      targetId: organization._id,
      description: `License updated for "${organization.name}" to ${organization.license.type} (${organization.license.status})`,
    });

    return res.status(200).json({
      success: true,
      message: 'License updated successfully',
      data: organization.license,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 8. Securely Reset Owner Credentials
async function resetOwnerCredentials(req, res) {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long',
    });
  }

  try {
    const organization = await Organization.findById(id).populate('owner');
    if (!organization || !organization.owner) {
      return res.status(404).json({
        success: false,
        message: 'Organization or owner not found',
      });
    }

    const salt = await bcrypt.genSalt(10);
    organization.owner.password = await bcrypt.hash(newPassword, salt);
    await organization.owner.save();

    await logAudit({
      req,
      action: 'OWNER_PASSWORD_RESET',
      module: 'user',
      targetId: organization.owner._id,
      description: `Super Admin reset password for owner of "${organization.name}"`,
    });

    return res.status(200).json({
      success: true,
      message: `Password reset successfully for owner ${organization.owner.email}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 9. Platform-wide Users List
async function listPlatformUsers(req, res) {
  try {
    const { page = 1, limit = 20, organizationId } = req.query;
    const filter = {};
    if (organizationId) filter.organization = organizationId;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('organization', 'name status')
      .populate('branch', 'branchName branchCode')
      .populate('role', 'name key');

    return res.status(200).json({
      success: true,
      data: {
        users,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

// 10. Platform Audit Logs
async function listAuditLogs(req, res) {
  try {
    const { page = 1, limit = 30, action, organizationId } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (organizationId) filter.organization = organizationId;

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('user', 'name email username')
      .populate('organization', 'name');

    return res.status(200).json({
      success: true,
      data: {
        logs,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  getPlatformStats,
  listOrganizations,
  createOrganizationOnboarding,
  getOrganizationById,
  updateOrganization,
  updateOrganizationStatus,
  updateOrganizationLicense,
  resetOwnerCredentials,
  listPlatformUsers,
  listAuditLogs,
};
