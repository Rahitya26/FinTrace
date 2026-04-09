const db = require('./db');

async function patch() {
    try {
        const result = await db.query(
            "UPDATE projects SET quoted_bid_value = 100000 WHERE name = 'Arjun Test 2' RETURNING *;"
        );
        console.log("Patched:", result.rows);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
patch();
