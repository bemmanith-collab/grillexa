// SALES accounts are locked to their own store; ADMIN/MANAGER can reach any store.
function assertStoreAccess(user, storeId) {
  if (user.role !== 'SALES') return;
  if (!user.storeId) {
    const err = new Error('Your account is not assigned to a store yet. Ask an admin to assign one.');
    err.status = 403;
    throw err;
  }
  if (Number(storeId) !== user.storeId) {
    const err = new Error('You can only access your own store');
    err.status = 403;
    throw err;
  }
}

module.exports = { assertStoreAccess };
