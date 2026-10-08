const Organization = require('../model/organizationSchema');
const Branch = require('../model/branchSchema');
const User = require('../model/userSchema');
const { logAudit } = require('../utils/auditLogger');

// Get current organization profile
async function getOrganizationProfile(req, res) {
  try {
    const organizationId = req.organizationId || req.user.organizationId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'No organization attached to session',
      });
    }

    const organization = await Organization.findById(organizationId)
      .populate('owner', 'name email username');

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
    }

    const branches = await Branch.find({ organization: organizationId });
    const userCount = await User.countDocuments({ organization: organizationId });

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

// Update organization settings
async function updateOrganizationSettings(req, res) {
  try {
    const organizationId = req.organizationId || req.user.organizationId;
    const { name, legalName, email, phno, address, gstNumber, logoUrl, settings } = req.body;

    const organization = await Organization.findById(organizationId);
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
    if (logoUrl !== undefined) organization.logoUrl = logoUrl.trim();
    if (settings) organization.settings = { ...organization.settings, ...settings };

    await organization.save();

    await logAudit({
      req,
      action: 'ORGANIZATION_SETTINGS_UPDATED',
      module: 'organization',
      targetId: organization._id,
      description: `Settings updated for organization "${organization.name}"`,
    });

    return res.status(200).json({
      success: true,
      message: 'Organization settings updated successfully',
      data: organization,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

module.exports = {
  getOrganizationProfile,
  updateOrganizationSettings,
};
