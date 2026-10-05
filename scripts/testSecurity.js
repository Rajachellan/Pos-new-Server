const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../model/userSchema');
const Organization = require('../model/organizationSchema');
const Branch = require('../model/branchSchema');
const Role = require('../model/roleSchema');
const Permission = require('../model/permissionSchema');
require('dotenv').config();

const API_BASE = `http://localhost:${process.env.PORT || 8002}/api`;

async function apiRequest(path, { method = 'GET', body = null, headers = {} } = {}) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runSecurityTests() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel-management';
  await mongoose.connect(uri);
  console.log('--- Starting Multi-Tenant RBAC Security Test Suite ---');

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('TestPass@123', salt);

  // 1. Setup Test Organizations: Org A (Active), Org B (Active), Org C (Suspended)
  await Organization.deleteMany({ slug: { $in: ['test-org-a', 'test-org-b', 'test-org-c'] } });
  await User.deleteMany({ email: { $in: ['owner_a@test.com', 'owner_b@test.com', 'admin_a@test.com', 'staff_a@test.com', 'suspended_owner@test.com'] } });
  await Branch.deleteMany({ branchCode: { $in: ['TEST-CHN', 'TEST-BLR', 'TEST-B-BR'] } });

  const orgA = await Organization.create({
    name: 'Test Org A Hotel',
    slug: 'test-org-a',
    email: 'contact_a@test.com',
    status: 'ACTIVE',
    license: { type: 'LIFETIME', status: 'ACTIVE' },
  });

  const orgB = await Organization.create({
    name: 'Test Org B Hotel',
    slug: 'test-org-b',
    email: 'contact_b@test.com',
    status: 'ACTIVE',
    license: { type: 'SUBSCRIPTION', status: 'ACTIVE' },
  });

  const orgC = await Organization.create({
    name: 'Test Org C Suspended Hotel',
    slug: 'test-org-c',
    email: 'contact_c@test.com',
    status: 'SUSPENDED',
    license: { type: 'TRIAL', status: 'SUSPENDED' },
  });

  // Setup Branches for Org A
  const branchChennai = await Branch.create({
    organization: orgA._id,
    branchName: 'Org A Chennai',
    branchCode: 'TEST-CHN',
    createdBy: orgA._id,
  });

  const branchBangalore = await Branch.create({
    organization: orgA._id,
    branchName: 'Org A Bangalore',
    branchCode: 'TEST-BLR',
    createdBy: orgA._id,
  });

  // Branch for Org B
  const branchOrgB = await Branch.create({
    organization: orgB._id,
    branchName: 'Org B Main Branch',
    branchCode: 'TEST-B-BR',
    createdBy: orgB._id,
  });

  // Roles templates
  const ownerRole = await Role.findOne({ key: 'ORGANIZATION_OWNER', organization: null });
  const adminRole = await Role.findOne({ key: 'ADMIN', organization: null });
  const staffRole = await Role.findOne({ key: 'STAFF', organization: null });

  // Users
  const ownerA = await User.create({
    name: 'Owner A',
    email: 'owner_a@test.com',
    password: passwordHash,
    systemRole: 'ORGANIZATION_USER',
    organizationRole: 'OWNER',
    organization: orgA._id,
    branch: branchChennai._id,
    role: ownerRole ? ownerRole._id : null,
    status: 'ACTIVE',
  });
  orgA.owner = ownerA._id;
  await orgA.save();

  const ownerB = await User.create({
    name: 'Owner B',
    email: 'owner_b@test.com',
    password: passwordHash,
    systemRole: 'ORGANIZATION_USER',
    organizationRole: 'OWNER',
    organization: orgB._id,
    branch: branchOrgB._id,
    role: ownerRole ? ownerRole._id : null,
    status: 'ACTIVE',
  });
  orgB.owner = ownerB._id;
  await orgB.save();

  const adminA = await User.create({
    name: 'Admin A',
    email: 'admin_a@test.com',
    password: passwordHash,
    systemRole: 'ORGANIZATION_USER',
    organizationRole: 'ADMIN',
    organization: orgA._id,
    branch: branchChennai._id,
    role: adminRole ? adminRole._id : null,
    status: 'ACTIVE',
  });

  const staffA = await User.create({
    name: 'Staff Chennai',
    email: 'staff_a@test.com',
    password: passwordHash,
    systemRole: 'ORGANIZATION_USER',
    organizationRole: 'STAFF',
    organization: orgA._id,
    branch: branchChennai._id,
    role: staffRole ? staffRole._id : null,
    status: 'ACTIVE',
  });

  const suspendedOwner = await User.create({
    name: 'Suspended Owner C',
    email: 'suspended_owner@test.com',
    password: passwordHash,
    systemRole: 'ORGANIZATION_USER',
    organizationRole: 'OWNER',
    organization: orgC._id,
    status: 'ACTIVE',
  });
  orgC.owner = suspendedOwner._id;
  await orgC.save();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // Helper login
  async function login(email, password) {
    const res = await apiRequest('/user/login', {
      method: 'POST',
      body: { email, password },
    });
    return res;
  }

  // TEST 1: Super Admin logs in and accesses all organizations
  console.log('\n--- Running TEST 1: Super Admin Access ---');
  const saRes = await login('tanjavoorathefe@gmail.com', 'Aatif@78');
  assert(saRes.status === 200 && saRes.data.systemRole === 'SUPER_ADMIN', 'Super Admin logged in with systemRole === SUPER_ADMIN');

  const saHeaders = { Authorization: `Bearer ${saRes.data.token}` };
  const orgsRes = await apiRequest('/super-admin/organizations', { headers: saHeaders });
  assert(orgsRes.status === 200 && orgsRes.data.data.organizations.length >= 3, 'Super Admin can view platform-wide organizations');

  // TEST 2: Organization Owner logs in -> Scoped only to own organization
  console.log('\n--- Running TEST 2: Organization Owner Scoped Access ---');
  const ownerARes = await login('owner_a@test.com', 'TestPass@123');
  assert(ownerARes.status === 200 && ownerARes.data.organizationRole === 'OWNER', 'Owner A has organizationRole === OWNER');
  assert(ownerARes.data.organizationId === orgA._id.toString(), 'Owner A attached to Org A');

  const ownerAToken = ownerARes.data.token;
  const headersA = { Authorization: `Bearer ${ownerAToken}` };
  const branchRes = await apiRequest('/get/branch', { headers: headersA });
  const branches = branchRes.data.data;
  const allBelongToOrgA = branches.every((b) => (b.organization?._id || b.organization)?.toString() === orgA._id.toString());
  assert(allBelongToOrgA, 'Owner A only retrieves branches belonging to Org A');

  // TEST 3: Organization A user attempts to request Organization B resource -> DENIED
  console.log('\n--- Running TEST 3: Cross-Tenant Isolation ---');
  const crossTenantRes = await apiRequest('/add/area', {
    method: 'POST',
    body: { areaName: 'Malicious Area', areaCode: 'MAL01', branchName: branchOrgB._id.toString() },
    headers: headersA,
  });
  assert(crossTenantRes.status === 404, 'Cross-tenant branch access was rejected with 404');

  // TEST 4: Staff without permission attempts restricted action (role.create) -> 403
  console.log('\n--- Running TEST 4: Permission Enforcement (Deny) ---');
  const staffRes = await login('staff_a@test.com', 'TestPass@123');
  const staffToken = staffRes.data.token;
  const staffHeaders = { Authorization: `Bearer ${staffToken}` };

  const illegalRoleRes = await apiRequest('/roles', {
    method: 'POST',
    body: { name: 'Illegal Role', key: 'ILLEGAL' },
    headers: staffHeaders,
  });
  assert(illegalRoleRes.status === 403, 'Unauthorized staff action was blocked with 403 Forbidden');

  // TEST 5: User with table.create creates a table -> SUCCESS
  console.log('\n--- Running TEST 5: Permitted Action (Allow) ---');
  const areaRes = await apiRequest('/add/area', {
    method: 'POST',
    body: { areaName: 'AC Banquet Hall', areaCode: 'AC01', branchName: branchChennai._id.toString() },
    headers: headersA,
  });
  const createdArea = areaRes.data.data;

  const tableRes = await apiRequest('/add/tables', {
    method: 'POST',
    body: { tableNumber: 'T-101', areaName: createdArea._id.toString() },
    headers: headersA,
  });
  assert(tableRes.status === 201 && tableRes.data.success, 'Permitted user successfully created table');

  // TEST 6: Admin attempts to create OWNER/SUPER_ADMIN -> DENIED
  console.log('\n--- Running TEST 6: Privilege Escalation Prevention ---');
  const adminRes = await login('admin_a@test.com', 'TestPass@123');
  const adminHeaders = { Authorization: `Bearer ${adminRes.data.token}` };

  const escalateRes = await apiRequest('/user/register', {
    method: 'POST',
    body: {
      name: 'Hacker Admin',
      email: 'hacker@test.com',
      password: 'Password@123',
      organizationRole: 'OWNER',
    },
    headers: adminHeaders,
  });
  assert(escalateRes.status === 403, 'Privilege escalation was denied with 403 Forbidden');

  // TEST 7: Organization Owner attempts to access /super-admin -> DENIED
  console.log('\n--- Running TEST 7: Platform Boundary Protection ---');
  const superAdminAttempt = await apiRequest('/super-admin/stats', { headers: headersA });
  assert(superAdminAttempt.status === 403, 'Owner access to Super Admin API was denied with 403 Forbidden');

  // TEST 8: Branch staff from Chennai attempts to access Bangalore branch -> DENIED
  console.log('\n--- Running TEST 8: Branch Isolation ---');
  const branchViolation = await apiRequest('/add/area', {
    method: 'POST',
    body: { areaName: 'Intrusion Area', areaCode: 'INT01', branchName: branchBangalore._id.toString() },
    headers: staffHeaders,
  });
  assert(branchViolation.status === 403, 'Branch boundary violation was denied with 403 Forbidden');

  // TEST 9: Suspended organization user attempts login -> DENIED
  console.log('\n--- Running TEST 9: Suspended Organization Login Block ---');
  const suspendedLogin = await login('suspended_owner@test.com', 'TestPass@123');
  assert(suspendedLogin.status === 403, 'Suspended organization login was rejected with 403 Forbidden');

  // TEST 10: Super Admin accesses suspended organization -> ALLOWED for administrative management
  console.log('\n--- Running TEST 10: Super Admin Administration of Suspended Organization ---');
  const getSuspendedOrg = await apiRequest(`/super-admin/organizations/${orgC._id}`, { headers: saHeaders });
  assert(getSuspendedOrg.data.data.organization.status === 'SUSPENDED', 'Super Admin can view details of suspended organization');

  const activateRes = await apiRequest(`/super-admin/organizations/${orgC._id}/status`, {
    method: 'PATCH',
    body: { status: 'ACTIVE' },
    headers: saHeaders,
  });
  assert(activateRes.data.data.status === 'ACTIVE', 'Super Admin can administratively activate suspended organization');

  console.log(`\n========================================`);
  console.log(`Test Suite Completed: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runSecurityTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
