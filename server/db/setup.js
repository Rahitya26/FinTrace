const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const createDatabase = async () => {
    // Connect to default 'postgres' database to create the new database
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        database: 'postgres', // Default database
    });

    try {
        await client.connect();

        // Check if database exists
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${process.env.DB_NAME}'`);

        if (res.rowCount === 0) {
            console.log(`Creating database "${process.env.DB_NAME}"...`);
            await client.query(`CREATE DATABASE "${process.env.DB_NAME}"`);
            console.log('Database created successfully.');
        } else {
            console.log(`Database "${process.env.DB_NAME}" already exists.`);
        }
    } catch (err) {
        console.error('Error checking/creating database:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
};

const runSchema = async () => {
    // Connect to the target database
    const client = new Client({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

    try {
        await client.connect();
        console.log('Applying schema...');

        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        await client.query(schemaSql);
        console.log('Schema applied successfully (Tables created).');
    } catch (err) {
        console.error('Error applying schema:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
};

const setup = async () => {
    await createDatabase();
    await runSchema();
};

setup();
