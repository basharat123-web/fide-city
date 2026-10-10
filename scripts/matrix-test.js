'use strict';
const assert = require('node:assert');
const { getPermissions, getRoleMeta } = require('../lib/roles');

console.log('Testing Fide City Role & Permission Matrix...');

// 1. Root Admin (Executive Level 1)
const root = { email: 'basharathussain.mail@gmail.com', role: 'root_admin', staff_title: 'Project Management' };
const pRoot = getPermissions(root);
assert.strictEqual(pRoot.canPin, true);
assert.strictEqual(pRoot.canLock, true);
assert.strictEqual(pRoot.canDelete, true);
assert.strictEqual(pRoot.canMove, true);
assert.strictEqual(pRoot.canTagStatus, true);
assert.strictEqual(pRoot.canBan, true);
assert.strictEqual(pRoot.canWarn, true);
assert.strictEqual(pRoot.canUnban, true);
assert.strictEqual(pRoot.canRecoverAccount, true);
assert.strictEqual(pRoot.canChangeRole, true);
assert.strictEqual(pRoot.hasAdminPanel, true);
assert.strictEqual(pRoot.hasFullUsers, true);
assert.strictEqual(pRoot.hasNews, true);
assert.strictEqual(pRoot.hasAuditLog, true);
assert.strictEqual(pRoot.hasSystemPanel, true);
assert.strictEqual(pRoot.hasRootConsole, true);
console.log('  ok   Root Admin has unrestricted ALL access');

// 2. Technical Administrator (Engineering Level 2)
const tech = { email: 'tech@fidecity.com', role: 'admin', staff_title: 'Technical Administrator' };
const pTech = getPermissions(tech);
assert.strictEqual(pTech.canPin, true);
assert.strictEqual(pTech.canLock, true);
assert.strictEqual(pTech.canDelete, true);
assert.strictEqual(pTech.canMove, true);
assert.strictEqual(pTech.canTagStatus, true);
assert.strictEqual(pTech.canBan, false, 'Tech Admin cannot ban users');
assert.strictEqual(pTech.canRecoverAccount, true, 'Tech Admin has Account Recovery');
assert.strictEqual(pTech.canChangeRole, false, 'Tech Admin cannot change roles');
assert.strictEqual(pTech.hasAdminPanel, true);
assert.strictEqual(pTech.hasFullUsers, false);
assert.strictEqual(pTech.hasSystemPanel, true, 'Tech Admin has System/DB panel');
assert.strictEqual(pTech.hasAuditLog, true, 'Tech Admin has technical logs');
assert.strictEqual(pTech.hasRootConsole, false);
console.log('  ok   Technical Administrator matches Level 2 spec');

// 3. Chief Administrator (Operations Head Level 3)
const chief = { email: 'chief@fidecity.com', role: 'admin', staff_title: 'Chief Administrator' };
const pChief = getPermissions(chief);
assert.strictEqual(pChief.canPin, true);
assert.strictEqual(pChief.canLock, true);
assert.strictEqual(pChief.canDelete, true);
assert.strictEqual(pChief.canMove, true);
assert.strictEqual(pChief.canTagStatus, true);
assert.strictEqual(pChief.canBan, true);
assert.strictEqual(pChief.canWarn, true);
assert.strictEqual(pChief.canUnban, true);
assert.strictEqual(pChief.canRecoverAccount, false);
assert.strictEqual(pChief.canChangeRole, true, 'Chief Admin can manage staff hierarchy roles');
assert.strictEqual(pChief.hasAdminPanel, true);
assert.strictEqual(pChief.hasFullUsers, true);
assert.strictEqual(pChief.hasNews, true);
assert.strictEqual(pChief.hasAuditLog, true);
assert.strictEqual(pChief.hasSystemPanel, false);
console.log('  ok   Chief Administrator matches Level 3 spec');

// 4. Deputy Chief Admin (Operations Head Level 3)
const depChief = { email: 'deputy@fidecity.com', role: 'admin', staff_title: 'Deputy Chief Admin' };
const pDepChief = getPermissions(depChief);
assert.strictEqual(pDepChief.canPin, true);
assert.strictEqual(pDepChief.canLock, true);
assert.strictEqual(pDepChief.canDelete, false, 'Deputy Chief cannot delete threads');
assert.strictEqual(pDepChief.canMove, true);
assert.strictEqual(pDepChief.canTagStatus, true);
assert.strictEqual(pDepChief.canBan, false, 'Deputy Chief cannot ban users');
assert.strictEqual(pDepChief.canWarn, true);
assert.strictEqual(pDepChief.canChangeRole, true, 'Deputy Chief can manage staff hierarchy roles');
assert.strictEqual(pDepChief.hasAdminPanel, true);
assert.strictEqual(pDepChief.hasFullUsers, true);
console.log('  ok   Deputy Chief Administrator matches Level 3 spec');

// 5. Curator of Admin (Senior Staff Level 4)
const curator = { email: 'curator@fidecity.com', role: 'admin', staff_title: 'Curator of Admin' };
const pCurator = getPermissions(curator);
assert.strictEqual(pCurator.canPin, false);
assert.strictEqual(pCurator.canLock, true);
assert.strictEqual(pCurator.canDelete, false);
assert.strictEqual(pCurator.canMove, true);
assert.strictEqual(pCurator.canTagStatus, true, 'Curator has Approve/Reject tags');
assert.strictEqual(pCurator.canBan, false);
assert.strictEqual(pCurator.canWarn, true);
assert.strictEqual(pCurator.hasAdminPanel, true);
assert.strictEqual(pCurator.hasAuditLog, true, 'Curator has Internal Review (audit)');
assert.strictEqual(pCurator.hasFullUsers, false);
console.log('  ok   Curator of Admin matches Level 4 spec');

// 6. Senior Administrator (Senior Staff Level 4)
const snr = { email: 'senior@fidecity.com', role: 'admin', staff_title: 'Senior Administrator' };
const pSnr = getPermissions(snr);
assert.strictEqual(pSnr.canPin, false);
assert.strictEqual(pSnr.canLock, true);
assert.strictEqual(pSnr.canTagStatus, true, 'Senior Admin can tag threads');
assert.strictEqual(pSnr.canMove, false);
assert.strictEqual(pSnr.canBan, false);
assert.strictEqual(pSnr.canWarn, true);
assert.strictEqual(pSnr.hasAdminPanel, false, 'Senior Admin has No ACP Access');
console.log('  ok   Senior Administrator matches Level 4 spec (No ACP Access)');

// 7. Server Administrator (Field Staff Level 5)
const srv = { email: 'server@fidecity.com', role: 'admin', staff_title: 'Server Administrator' };
const pSrv = getPermissions(srv);
assert.strictEqual(pSrv.canPin, false);
assert.strictEqual(pSrv.canLock, true);
assert.strictEqual(pSrv.canMove, true, 'Server Admin can lock and move assigned');
assert.strictEqual(pSrv.canTagStatus, false);
assert.strictEqual(pSrv.canBan, false);
assert.strictEqual(pSrv.canWarn, false, 'Server Admin is report only');
assert.strictEqual(pSrv.hasAdminPanel, false, 'Server Admin has No ACP Access');
console.log('  ok   Server Administrator matches Level 5 spec (No ACP Access)');

// 8. Junior Administrator (Field Staff Level 5)
const jnr = { email: 'junior@fidecity.com', role: 'mod', staff_title: 'Junior Administrator' };
const pJnr = getPermissions(jnr);
assert.strictEqual(pJnr.canPin, false);
assert.strictEqual(pJnr.canLock, false, 'Junior Admin cannot lock');
assert.strictEqual(pJnr.canDelete, false);
assert.strictEqual(pJnr.canMove, false);
assert.strictEqual(pJnr.canTagStatus, false);
assert.strictEqual(pJnr.canBan, false);
assert.strictEqual(pJnr.canWarn, false);
assert.strictEqual(pJnr.hasAdminPanel, false, 'Junior Admin has No ACP Access');
console.log('  ok   Junior Administrator matches Level 5 spec (Reply only, No ACP)');

// 9. Role Clamping for unauthorized users
const fakeRoot = { email: 'hacker@example.com', role: 'admin', staff_title: 'Project Management' };
const metaFake = getRoleMeta(fakeRoot);
assert.strictEqual(metaFake.name, 'Chief Administrator');
assert.strictEqual(metaFake.systemRole, 'admin');
console.log('  ok   Non-root user clamped from claiming Executive titles');

console.log('\nAll 9 Permission Matrix Level checks PASSED successfully!');
