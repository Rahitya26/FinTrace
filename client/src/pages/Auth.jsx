import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { LogIn, UserPlus, Mail, Building, Key, Lock, ShieldCheck, Smartphone } from 'lucide-react';

const AUTH_MODES = { PASSWORD: 'password', OTP: 'otp' };

const Auth = () => {
    const [isSignup, setIsSignup] = useState(false);
    const [authMode, setAuthMode] = useState(AUTH_MODES.PASSWORD); // 'password' | 'otp'
    const [otpStep, setOtpStep] = useState(1); // 1: email, 2: otp code

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [orgName, setOrgName] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const resetForm = () => {
        setOtpStep(1);
        setOtp('');
        setPassword('');
        setOrgName('');
    };

    // ── Password Login ──
    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const response = await api.post('/auth/login-password', { email, password });
            login(response.data.token, response.data.user);
            toast.success('Logged in successfully!');
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Invalid email or password');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP: Step 1 — Request code ──
    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/auth/request-otp', { email });
            toast.success('Verification code sent to your email');
            setOtpStep(2);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to send verification code');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP: Step 2 — Verify ──
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = { email, otp };
            if (isSignup) {
                payload.orgName = orgName;
                if (password) payload.password = password; // store hash if signup provides a password
            }
            const response = await api.post('/auth/verify-otp', payload);
            login(response.data.token, response.data.user);
            toast.success(isSignup ? 'Account created successfully!' : 'Logged in successfully!');
            navigate('/');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    // ── Tab toggle helpers ──
    const switchMode = (signup) => {
        setIsSignup(signup);
        resetForm();
    };
    const switchAuthMode = (mode) => {
        setAuthMode(mode);
        resetForm();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full space-y-6">
                {/* Logo */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
                        <ShieldCheck className="w-7 h-7 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">FinTrace</h1>
                    <p className="text-slate-400 mt-1 text-sm">Financial Intelligence Platform</p>
                </div>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-7 shadow-2xl space-y-5">
                    {/* Login / Signup tabs */}
                    <div className="flex bg-white/5 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => switchMode(false)}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${!isSignup
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            <LogIn size={15} /> Login
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode(true)}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${isSignup
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            <UserPlus size={15} /> Sign Up
                        </button>
                    </div>

                    {/* Login Method toggle (Login mode only, not signup) */}
                    {!isSignup && (
                        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl">
                            <button
                                type="button"
                                onClick={() => switchAuthMode(AUTH_MODES.PASSWORD)}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${authMode === AUTH_MODES.PASSWORD
                                        ? 'bg-white/15 text-white'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                <Lock size={12} /> Use Password
                            </button>
                            <button
                                type="button"
                                onClick={() => switchAuthMode(AUTH_MODES.OTP)}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${authMode === AUTH_MODES.OTP
                                        ? 'bg-white/15 text-white'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                            >
                                <Smartphone size={12} /> Use OTP
                            </button>
                        </div>
                    )}

                    {/* ══ PASSWORD LOGIN FORM ══ */}
                    {!isSignup && authMode === AUTH_MODES.PASSWORD && (
                        <form onSubmit={handlePasswordLogin} className="space-y-4">
                            <Field label="Email Address" icon={<Mail size={16} />}>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="name@company.com"
                                    autoComplete="email"
                                />
                            </Field>
                            <Field label="Password" icon={<Lock size={16} />}>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="Your password"
                                    autoComplete="current-password"
                                />
                            </Field>
                            <SubmitBtn loading={loading} label="Sign In" />
                        </form>
                    )}

                    {/* ══ OTP LOGIN FORM (step 1) ══ */}
                    {!isSignup && authMode === AUTH_MODES.OTP && otpStep === 1 && (
                        <form onSubmit={handleRequestOtp} className="space-y-4">
                            <Field label="Email Address" icon={<Mail size={16} />}>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="name@company.com"
                                    autoComplete="email"
                                />
                            </Field>
                            <SubmitBtn loading={loading} label="Get Verification Code" />
                        </form>
                    )}

                    {/* ══ OTP LOGIN FORM (step 2) ══ */}
                    {!isSignup && authMode === AUTH_MODES.OTP && otpStep === 2 && (
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <OtpCodeField email={email} otp={otp} setOtp={setOtp} onBack={() => setOtpStep(1)} />
                            <SubmitBtn loading={loading} label="Verify & Sign In" />
                        </form>
                    )}

                    {/* ══ SIGNUP FORM ══ */}
                    {isSignup && otpStep === 1 && (
                        <form onSubmit={handleRequestOtp} className="space-y-4">
                            <Field label="Organization Name" icon={<Building size={16} />}>
                                <input
                                    type="text"
                                    required
                                    value={orgName}
                                    onChange={(e) => setOrgName(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="Company X"
                                />
                            </Field>
                            <Field label="Email Address" icon={<Mail size={16} />}>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="name@company.com"
                                    autoComplete="email"
                                />
                            </Field>
                            <Field label="Set Password" icon={<Lock size={16} />}>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="auth-input pl-10"
                                    placeholder="Create a password for future logins"
                                    autoComplete="new-password"
                                />
                            </Field>
                            <SubmitBtn loading={loading} label="Send Verification Code" />
                        </form>
                    )}

                    {/* ══ SIGNUP OTP VERIFY ══ */}
                    {isSignup && otpStep === 2 && (
                        <form onSubmit={handleVerifyOtp} className="space-y-4">
                            <OtpCodeField email={email} otp={otp} setOtp={setOtp} onBack={() => setOtpStep(1)} />
                            <SubmitBtn loading={loading} label="Create Account" />
                        </form>
                    )}

                    <p className="text-center text-xs text-slate-500">
                        By continuing, you agree to our Terms of Service.
                    </p>
                </div>
            </div>

            {/* Inline styles for auth inputs */}
            <style>{`
                .auth-input {
                    display: block;
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    padding-left: 2.5rem !important;
                    background: rgba(255,255,255,0.07);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 0.5rem;
                    color: white;
                    font-size: 0.875rem;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .auth-input::placeholder { color: rgba(148,163,184,0.6); }
                .auth-input:focus {
                    border-color: rgba(96,165,250,0.6);
                    box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
                }
                .auth-input:-webkit-autofill,
                .auth-input:-webkit-autofill:hover,
                .auth-input:-webkit-autofill:focus {
                    -webkit-text-fill-color: white;
                    -webkit-box-shadow: 0 0 0px 1000px rgba(30,41,59,0.9) inset;
                    transition: background-color 5000s ease-in-out 0s;
                }
            `}</style>
        </div>
    );
};

// ─── Reusable sub-components ───

const Field = ({ label, icon, children }) => (
    <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">{label}</label>
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                {icon}
            </div>
            {children}
        </div>
    </div>
);

const SubmitBtn = ({ loading, label }) => (
    <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 mt-2"
    >
        {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> : label}
    </button>
);

const OtpCodeField = ({ email, otp, setOtp, onBack }) => (
    <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wide">6-Digit Code</label>
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Key size={16} />
            </div>
            <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="auth-input pl-10 text-center text-xl tracking-[0.6em] font-mono"
                placeholder="000000"
                autoComplete="one-time-code"
            />
        </div>
        <p className="mt-2 text-xs text-slate-400 text-center">
            Code sent to <strong className="text-slate-200">{email}</strong>
            <button type="button" onClick={onBack} className="ml-2 text-blue-400 hover:text-blue-300 hover:underline">
                Change email
            </button>
        </p>
    </div>
);

export default Auth;
