const db = require('./db');
(async () => {
  try {
    await db.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS quoted_bid_value NUMERIC(12, 2) DEFAULT 0.00;');
    console.log("Success: Added quoted_bid_value");
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
