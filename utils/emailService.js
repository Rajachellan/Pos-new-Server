const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT || 465;
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const rawPass = (process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const pass = rawPass.replace(/\s+/g, ''); // strip spaces in Google App Password

  if (user && pass) {
    if (user.endsWith('@gmail.com') || host.includes('gmail')) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: {
          user,
          pass,
        },
      });
    }
  } else {
    // Fallback: If no SMTP credentials provided in .env, create transporter with JSON transport for logging
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return transporter;
}

/**
 * Send Onboarding Welcome Email with Credentials to the Organization Owner
 */
async function sendOnboardingEmail({
  ownerEmail,
  ownerName,
  ownerUsername,
  password,
  organizationName,
  licenseType,
  branchName,
  branchCode,
  clientUrl = process.env.CLIENT_URL || 'http://localhost:3000',
}) {
  try {
    const loginUrl = `${clientUrl}/user/login`;
    const fromAddress = process.env.EMAIL_FROM || '"Hotel Management SaaS" <no-reply@hotelsaas.com>';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${organizationName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(135deg, #b45309, #d97706); padding: 32px 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
    .header p { color: #fef3c7; margin: 8px 0 0; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.5px; }
    .content { padding: 32px 28px; }
    .welcome-text { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px; }
    .credentials-card { background-color: #020617; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    .card-title { font-size: 13px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; }
    .field-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
    .field-label { color: #94a3b8; font-weight: 500; }
    .field-value { color: #ffffff; font-weight: 600; font-family: monospace; }
    .highlight-pass { color: #38bdf8; background-color: #0c4a6e; padding: 2px 8px; border-radius: 6px; }
    .btn-container { text-align: center; margin: 32px 0 24px; }
    .login-btn { display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #020617 !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3); }
    .footer { background-color: #020617; padding: 20px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; }
    .footer p { margin: 4px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${organizationName}</h1>
      <p>Customer Onboarding Completed</p>
    </div>

    <div class="content">
      <p class="welcome-text">
        Hello <strong>${ownerName}</strong>,<br><br>
        Congratulations! Your hotel management organization <strong>${organizationName}</strong> has been successfully provisioned on the SaaS platform.
      </p>

      <div class="credentials-card">
        <div class="card-title">Your Login Credentials</div>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Login URL:</td>
            <td style="padding: 8px 0; text-align: right; color: #38bdf8; font-size: 13px; font-weight: 600;">
              <a href="${loginUrl}" style="color: #38bdf8; text-decoration: none;">${loginUrl}</a>
            </td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Email Address:</td>
            <td style="padding: 8px 0; text-align: right; color: #ffffff; font-size: 13px; font-family: monospace; font-weight: 600;">${ownerEmail}</td>
          </tr>
          ${ownerUsername ? `
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Username:</td>
            <td style="padding: 8px 0; text-align: right; color: #ffffff; font-size: 13px; font-family: monospace; font-weight: 600;">${ownerUsername}</td>
          </tr>` : ''}
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Password:</td>
            <td style="padding: 8px 0; text-align: right; font-size: 14px; font-family: monospace; font-weight: 700; color: #f59e0b;">${password}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Account Role:</td>
            <td style="padding: 8px 0; text-align: right; color: #10b981; font-size: 12px; font-weight: 700; text-transform: uppercase;">Organization Owner</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">License Entitlement:</td>
            <td style="padding: 8px 0; text-align: right; color: #f59e0b; font-size: 12px; font-weight: 700;">${licenseType}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Initial Branch:</td>
            <td style="padding: 8px 0; text-align: right; color: #ffffff; font-size: 13px; font-weight: 600;">${branchName} (${branchCode})</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${loginUrl}" class="login-btn">Sign In to Hotel Dashboard</a>
      </div>

      <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 24px; padding: 12px; background-color: #020617; border-radius: 8px; border-left: 3px solid #f59e0b;">
        <strong>Security Tip:</strong> Please keep these credentials confidential. You can update your password and invite administrators or branch staff directly from your owner dashboard.
      </p>
    </div>

    <div class="footer">
      <p>This is an automated notification from your SaaS Hotel Platform.</p>
      <p>&copy; ${new Date().getFullYear()} ${organizationName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: fromAddress,
      to: ownerEmail,
      subject: `Welcome to ${organizationName} - Your Hotel Management SaaS Credentials`,
      text: `Hello ${ownerName},\n\nYour organization "${organizationName}" has been successfully provisioned.\n\nLogin URL: ${loginUrl}\nEmail: ${ownerEmail}\n${ownerUsername ? `Username: ${ownerUsername}\n` : ''}Password: ${password}\nRole: Organization Owner\nLicense: ${licenseType}\nInitial Branch: ${branchName} (${branchCode})\n\nPlease sign in to access your hotel management dashboard.`,
      html: htmlContent,
    };

    const mailTransporter = getTransporter();
    const info = await mailTransporter.sendMail(mailOptions);

    console.log(`[EMAIL] Onboarding email dispatched to ${ownerEmail}. MessageId: ${info.messageId || 'local-json'}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send onboarding email to ${ownerEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Password Reset Email to User
 */
async function sendPasswordResetEmail({
  ownerEmail,
  ownerName,
  newPassword,
  organizationName,
  clientUrl = process.env.CLIENT_URL || 'http://localhost:3000',
}) {
  try {
    const loginUrl = `${clientUrl}/user/login`;
    const fromAddress = process.env.EMAIL_FROM || '"Hotel Management SaaS" <no-reply@hotelsaas.com>';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Your Password Has Been Reset</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; border: 1px solid #1e293b; padding: 32px; }
    .card { background-color: #020617; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .btn { display: inline-block; background: #f59e0b; color: #020617 !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h2 style="color: #f59e0b; margin-top: 0;">Password Reset Notification</h2>
    <p>Hello <strong>${ownerName}</strong>,</p>
    <p>Your password for <strong>${organizationName}</strong> has been reset by the platform administrator.</p>
    <div class="card">
      <div style="color: #94a3b8; font-size: 13px; margin-bottom: 6px;">New Temporary Password:</div>
      <div style="font-size: 18px; font-family: monospace; font-weight: bold; color: #38bdf8;">${newPassword}</div>
    </div>
    <p><a href="${loginUrl}" class="btn">Sign In with New Password</a></p>
    <p style="font-size: 12px; color: #64748b; margin-top: 24px;">If you did not request this change, please contact support immediately.</p>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: fromAddress,
      to: ownerEmail,
      subject: `Password Reset for ${organizationName} - Hotel SaaS`,
      text: `Hello ${ownerName},\n\nYour password for "${organizationName}" has been reset.\n\nNew Password: ${newPassword}\nLogin URL: ${loginUrl}\n\nPlease sign in with your new password.`,
      html: htmlContent,
    };

    const mailTransporter = getTransporter();
    const info = await mailTransporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send password reset email to ${ownerEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOnboardingEmail,
  sendPasswordResetEmail,
};
