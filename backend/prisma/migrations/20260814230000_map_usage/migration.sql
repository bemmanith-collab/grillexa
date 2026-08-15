-- Map loads drawn per calendar month, against the Mapbox free tier.
CREATE TABLE "MapUsage" (
    "month" TEXT NOT NULL,
    "loads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MapUsage_pkey" PRIMARY KEY ("month")
);
