const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db');
const { BrevoClient } = require('@getbrevo/brevo');

// Brevo Configuration (v5 API)
const brevo = new BrevoClient({
    apiKey: process.env.BREVO_API_KEY
});

// Helper: build the standard JWT + user response
const buildAuthResponse = (user, organizationId) => {
    const token = jwt.sign(
        { userId: user.id, organizationId },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    return {
        token,
        user: {
            id: user.id,
            email: user.email,
            organizationId
        }
    };
};

// ─────────────────────────────────────────────
// POST /api/auth/request-otp
// ─────────────────────────────────────────────
router.post('/request-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.query(
            'INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, $3)',
            [email, otp, expiresAt]
        );

        // Send Email via Brevo (v5 API)
        await brevo.transactionalEmails.sendTransacEmail({
            subject: 'Your FinTrace Verification Code',
            sender: {
                name: process.env.BREVO_SENDER_NAME || 'FinTrace Auth',
                email: process.env.BREVO_SENDER_EMAIL || 'no-reply@fintrace.com'
            },
            to: [{ email }],
            htmlContent: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #2563eb;">Welcome to FinTrace</h2>
                    <p>Use the following 6-digit code to verify your account:</p>
                    <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 15px; background: #f3f4f6; text-align: center; border-radius: 8px; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p style="font-size: 14px; color: #666;">This code will expire in 10 minutes.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999;">If you didn't request this, you can safely ignore this email.</p>
                </div>
            `
        });

        res.json({ message: 'OTP sent successfully' });
    } catch (err) {
        console.error('Request OTP Error:', err);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// ─────────────────────────────────────────────
// POST /api/auth/verify-otp
// Accepts optional `password` for signup to save a password_hash
// ─────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
    const { email, otp, orgName, password } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

    try {
        // 1. Verify OTP
        const otpRes = await db.query(
            'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [email, otp]
        );
        if (otpRes.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        let user;
        let organizationId;
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;

        if (orgName) {
            // ── SIGNUP FLOW ──
            const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: 'User already exists. Please login instead.' });
            }

            const orgRes = await db.query(
                'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
                [orgName]
            );
            organizationId = orgRes.rows[0].id;

            const userRes = await db.query(
                'INSERT INTO users (email, organization_id, password_hash) VALUES ($1, $2, $3) RETURNING *',
                [email, organizationId, passwordHash]
            );
            user = userRes.rows[0];
        } else {
            // ── LOGIN FLOW ──
            const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            if (userRes.rows.length === 0) {
                return res.status(400).json({ error: 'User not found. Please sign up first.' });
            }
            user = userRes.rows[0];
            organizationId = user.organization_id;

            // If a password was provided on OTP login, update the hash
            if (passwordHash) {
                await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
            }
        }

        // Cleanup used codes
        await db.query('DELETE FROM verification_codes WHERE email = $1', [email]);

        res.json(buildAuthResponse(user, organizationId));
    } catch (err) {
        console.error('Verify OTP Error:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ─────────────────────────────────────────────
// POST /api/auth/login-password
// ─────────────────────────────────────────────
router.post('/login-password', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = userRes.rows[0];

        if (!user.password_hash) {
            return res.status(400).json({ error: 'No password set for this account. Please use OTP login.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        res.json(buildAuthResponse(user, user.organization_id));
    } catch (err) {
        console.error('Login Password Error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

module.exports = router;
