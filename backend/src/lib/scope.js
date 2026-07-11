// SALES accounts are locked to their own stores; ADMIN/MANAGER can reach any store.
function assertStoreAccess(user, storeId) {
  if (user.role !== 'SALES') return;
  if (!user.storeIds || user.storeIds.length === 0) {
    const err = new Error('Your account is not assigned to a store yet. Ask an admin to assign one.');
    err.status = 403;
    throw err;
  }
  if (!user.storeIds.includes(Number(storeId))) {
    const err = new Error('You can only access your own stores');
    err.status = 403;
    throw err;
  }
}

module.exports = { assertStoreAccess };
