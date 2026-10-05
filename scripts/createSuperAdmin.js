const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const userModel = require('../model/userSchema.js');
require('dotenv').config();

async function createSuperAdmin() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel-management';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB at', uri);

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'tanjavoorathefe@gmail.com').toLowerCase().trim();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Aatif@78';
  const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || 'Aatif';
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Aatif';

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(superAdminPassword, salt);

  const filter = {
    $or: [
      { username: superAdminUsername },
      { email: superAdminEmail },
      { systemRole: 'SUPER_ADMIN' },
    ],
  };

  const existingUser = await userModel.findOne(filter);

  if (existingUser) {
    existingUser.name = superAdminName;
    existingUser.username = superAdminUsername;
    existingUser.email = superAdminEmail;
    existingUser.password = hashedPassword;
    existingUser.systemRole = 'SUPER_ADMIN';
    existingUser.organizationRole = null;
    existingUser.organization = null;
    existingUser.branch = null;
    existingUser.role = null;
    existingUser.status = 'ACTIVE';

    await existingUser.save();
    console.log('Successfully updated existing user to SUPER_ADMIN:', {
      id: existingUser._id,
      name: existingUser.name,
      username: existingUser.username,
      email: existingUser.email,
      systemRole: existingUser.systemRole,
    });
  } else {
    const newUser = new userModel({
      name: superAdminName,
      username: superAdminUsername,
      email: superAdminEmail,
      password: hashedPassword,
      systemRole: 'SUPER_ADMIN',
      organizationRole: null,
      organization: null,
      branch: null,
      role: null,
      status: 'ACTIVE',
    });
    await newUser.save();
    console.log('Successfully created new SUPER_ADMIN user:', {
      id: newUser._id,
      name: newUser.name,
      username: newUser.username,
      email: newUser.email,
      systemRole: newUser.systemRole,
    });
  }

  await mongoose.disconnect();
  console.log('Super Admin configuration complete!');
}

if (require.main === module) {
  createSuperAdmin().catch((err) => {
    console.error('Error creating super admin:', err);
    process.exit(1);
  });
}

module.exports = { createSuperAdmin };
