const AuditLog = require('../model/auditLogSchema');

async function logAudit({
  req = null,
  user = null,
  organization = null,
  action,
  module: mod,
  targetId = '',
  description = '',
  metadata = {},
}) {
  try {
    const userId = user || req?.user?.userId || req?.user?.id || null;
    const orgId = organization || req?.user?.organizationId || req?.organizationId || null;
    const ip = req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '';
    const userAgent = req?.headers?.['user-agent'] || '';

    await AuditLog.create({
      user: userId,
      organization: orgId,
      action,
      module: mod,
      targetId: targetId ? targetId.toString() : '',
      description,
      ipAddress: ip,
      userAgent,
      metadata,
    });
  } catch (err) {
    console.error('Audit log creation failed (non-blocking):', err.message);
  }
}

module.exports = { logAudit };
