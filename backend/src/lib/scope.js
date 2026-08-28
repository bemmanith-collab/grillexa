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

/**
 * Which stores an account covers.
 *
 * `allStores` is a standing assignment, not a saved list: it resolves to
 * whatever exists at the moment of the request. That is the whole difference
 * between it and ticking every box — a snapshot covers the shops that existed
 * when somebody opened the dialog, and silently misses the one that opened
 * afterwards.
 *
 * Pure so the rule can be checked without a database. auth.js supplies the ids.
 */
function resolveStoreIds(user, everyStoreId) {
  if (!user) return [];
  if (user.allStores) return everyStoreId;
  return (user.stores || []).map((s) => s.id);
}

module.exports = { assertStoreAccess, resolveStoreIds };
