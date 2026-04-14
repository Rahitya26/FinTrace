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
const authRouter = require('./routes/auth');
const clientsRouter = require('./routes/clients');
const projectsRouter = require('./routes/projects');
const expensesRouter = require('./routes/expenses');
const dashboardRouter = require('./routes/dashboard');
const employeesRouter = require('./routes/employees');
const timesheetsRouter = require('./routes/timesheets');
const authMiddleware = require('./middleware/auth');

app.use('/api/auth', authRouter);

// Protected Data Routes
app.use('/api/clients', authMiddleware, clientsRouter);
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/expenses', authMiddleware, expensesRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/employees', authMiddleware, employeesRouter);
app.use('/api/timesheets', authMiddleware, timesheetsRouter);

app.get('/', (req, res) => {
    res.send('Service Financial Tracker API is running');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
