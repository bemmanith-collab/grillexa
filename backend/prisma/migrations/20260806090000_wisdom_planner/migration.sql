-- The Grilling Wisdom Planner. Two audiences: what a salesperson reads when
-- they open the app, and what a customer reads on the bottom of their bill.
CREATE TABLE "WisdomMessage" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT 'The Grillexa Team',
    "audience" TEXT NOT NULL DEFAULT 'STAFF',
    "showOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'CURATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WisdomMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WisdomMessage_audience_active_idx" ON "WisdomMessage"("audience", "active");

-- The fifteen grilling lines that used to live in a source file
-- (src/data/grillingQuotes.js), so nothing a salesperson already sees
-- disappears the day this ships, plus the healthy-eating lines the planner
-- exists for. Seeded here rather than in seed.js because seed.js refuses to
-- run in production, and an empty planner on the live app would mean a blank
-- card on the dashboard and a bill with no footer.
INSERT INTO "WisdomMessage" ("text", "author", "audience", "source", "updatedAt") VALUES
('Great grilling, like great sales, comes down to patience and heat control.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Every order is a chance to fire up someone''s day.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('A cold grill sells nothing — stay hot, stay ready.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Success is a slow cook, not a quick sear.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Consistency is the secret marinade of every winning store.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('You don''t need perfect weather to grill greatness — just showing up does half the work.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Turn every ''no'' into practice for the next ''yes'', just like flipping the perfect patty.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('The best pitmasters and the best salespeople share one secret: they never leave the flame unattended.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Low stock today, sold out by tonight — that''s the grind.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Every customer who walks in is a coal waiting to catch — bring the spark.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('A great store, like a great grill, needs someone tending it every single day.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Season the small talk, sear the pitch, plate the sale.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('The fire doesn''t ask if you''re tired — neither does the next customer. Show up hot.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Small wins today are the embers for tomorrow''s big sales.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('You can''t rush a good brisket or a good relationship with a customer.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP);

-- Staff lines about what is actually on the van. These are the ones that make
-- the planner a planner: a salesperson who knows why sprouts are worth buying
-- can say so at the counter, which is the only place the customer decides.
INSERT INTO "WisdomMessage" ("text", "author", "audience", "source", "updatedAt") VALUES
('Lead with the sprouts. A cup has more protein than an egg and costs the customer less.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Fruit bowls sell themselves before 9am — that is when people decide what kind of day they are having.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Nobody buys "healthy". They buy fresh, filling and cheap. Say those three words.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('A customer who tries one bowl comes back for six. The first sale is the only hard one.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Put the greens at eye level. What the customer sees first is what they take home.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Suggest the fruit bowl beside the snack, not instead of it. Nobody likes being corrected.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP),
('Fresh stock sells; tired stock teaches. Rotate before you pitch.', 'The Grillexa Team', 'STAFF', 'CURATED', CURRENT_TIMESTAMP);

-- Customer lines. These print on the footer of a bill someone is holding
-- while they eat, so they are short, warm, and never lecture — a bill that
-- scolds its reader is a bill that loses a customer.
INSERT INTO "WisdomMessage" ("text", "author", "audience", "source", "updatedAt") VALUES
('🌱 Thank you! One bowl of sprouts a day is one of the cheapest good decisions there is.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('🙏 Thank you for shopping with us. Eat fresh today, feel it tomorrow.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('🥗 Thanks! Half your plate as fruit or vegetables — that is the whole trick.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('💪 Thank you! Sprouts carry more protein per rupee than almost anything on this bill.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('🍎 Thank you for shopping with us. Fresh food is a small habit that pays daily.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('🌞 Thanks! Breakfast with fruit beats breakfast with regret.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP),
('🥣 Thank you! Keep it simple: something fresh, every single day.', 'Grillexa', 'CUSTOMER', 'CURATED', CURRENT_TIMESTAMP);
