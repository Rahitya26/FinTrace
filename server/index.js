const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Routes
const clientsRouter = require('./routes/clients');
const projectsRouter = require('./routes/projects');
const expensesRouter = require('./routes/expenses');
const dashboardRouter = require('./routes/dashboard');
const employeesRouter = require('./routes/employees');

app.use('/api/clients', clientsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/employees', employeesRouter);

app.get('/', (req, res) => {
    res.send('Service Financial Tracker API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
