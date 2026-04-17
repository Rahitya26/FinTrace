require('dotenv').config();
const db = require('./db');
db.query("UPDATE employees SET joining_date = '2026-01-14T18:30:00.000Z' WHERE name LIKE '%Employee 1%'")
    .then(() => {
        console.log('Fixed DB row');
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
