-- Web push subscriptions, and a record of who added each store.
--
-- One row per browser-and-device that agreed to notifications, not one per
-- user: the same person on a phone and a laptop is two endpoints, and both
-- should buzz. The endpoint is the natural key — re-subscribing on the same
-- device returns the same one, so upserting on it is what stops duplicates
-- piling up every time the app is opened.
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- The send path asks "every subscription except this user's", never "who owns
-- this endpoint", so userId is the index that earns its keep.
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- Cascade: a deleted user's devices have nobody to notify.
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Authorship, distinct from the existing many-to-many "who covers this shop".
-- Nullable because every store already in the table was added before anyone
-- recorded this, and those cannot be attributed after the fact.
ALTER TABLE "Store" ADD COLUMN "createdById" INTEGER;

-- SET NULL, not CASCADE: removing a staff member must never delete their shops.
ALTER TABLE "Store" ADD CONSTRAINT "Store_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
