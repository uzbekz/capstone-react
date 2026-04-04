import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { Op } from "sequelize";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import { authenticate, authorize, hashToken } from "../middleware/auth.js";

const router = express.Router();

const BCRYPT_ROUNDS = Math.max(12, Number(process.env.BCRYPT_ROUNDS || 12));
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_ALGORITHM = "HS256";
const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const CSRF_TOKEN_COOKIE = "csrf_token";

if (!ACCESS_TOKEN_SECRET) {
  throw new Error("JWT_SECRET must be set");
}

const hasSmtpConfig =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : null;

function getCookieOptions(maxAgeMs, overrides = {}) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeMs,
    ...overrides
  };
}

function getCsrfCookieOptions(maxAgeMs) {
  return {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeMs
  };
}

async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `${FRONTEND_URL}/forgot-password?token=${resetToken}`;

  if (!transporter) {
    console.warn("[forgot-password] SMTP is not configured. Token not sent via email.");
    console.log(`[forgot-password] reset token for ${email}: ${resetToken}`);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Reset your password",
    text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes.</p>`
  });
}

function signAccessToken(user, sessionId) {
  return jwt.sign(
    { sessionId },
    ACCESS_TOKEN_SECRET,
    {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      subject: String(user.id)
    }
  );
}

async function issueSessionCookies(res, user, session) {
  const accessToken = signAccessToken(user, session.id);
  const refreshToken = crypto.randomBytes(48).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const refreshMaxAge = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + refreshMaxAge);

  await session.update({
    refresh_token_hash: hashToken(refreshToken),
    csrf_token_hash: hashToken(csrfToken),
    expires_at: expiresAt,
    last_used_at: new Date()
  });

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(ACCESS_TOKEN_TTL_SECONDS * 1000));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getCookieOptions(refreshMaxAge, { path: "/auth" }));
  res.cookie(CSRF_TOKEN_COOKIE, csrfToken, getCsrfCookieOptions(refreshMaxAge));

  return { accessToken, csrfToken, refreshExpiresAt: expiresAt };
}

function clearAuthCookies(res) {
  const commonCookieOptions = {
    secure: IS_PRODUCTION,
    sameSite: "strict"
  };

  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...commonCookieOptions, path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...commonCookieOptions, path: "/auth" });
  res.clearCookie(CSRF_TOKEN_COOKIE, { ...commonCookieOptions, path: "/" });
}

async function revokeSession(session, replacementSessionId = null) {
  if (!session || session.revoked_at) {
    return;
  }

  await session.update({
    revoked_at: new Date(),
    replaced_by_session_id: replacementSessionId
  });
}

async function handleFailedLogin(user) {
  if (!user) {
    return;
  }

  const attempts = user.failed_login_attempts + 1;
  const updates = { failed_login_attempts: attempts };

  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    updates.lock_until = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
    updates.failed_login_attempts = 0;
  }

  await user.update(updates);
}

async function resetFailedLoginState(user) {
  if (user.failed_login_attempts || user.lock_until) {
    await user.update({
      failed_login_attempts: 0,
      lock_until: null
    });
  }
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(400).json({
        error: `Email "${email}" is already registered. Please use a different email or login.`
      });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const requestedRole = role === "product_manager" ? "product_manager" : "customer";

    await User.create({
      email,
      password: hashed,
      role: requestedRole,
      admin_status: "pending"
    });

    return res.json({
      message: "Registration received. Your account is pending approval from an authorized admin."
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      return res.status(423).json({
        message: `Too many failed attempts. Try again after ${new Date(user.lock_until).toISOString()}.`
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await handleFailedLogin(user);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    await resetFailedLoginState(user);

    if (user.admin_status === "pending") {
      return res.status(403).json({
        message: "Your registration is pending approval. Please wait for an admin to approve your account."
      });
    }

    if (user.admin_status === "rejected") {
      return res.status(403).json({
        message: "Your registration request was rejected by an admin."
      });
    }

    if (!user.isValid) {
      return res.status(403).json({
        message: "Your account is temporarily disabled. Please contact an admin."
      });
    }

    const session = await UserSession.create({
      user_id: user.id,
      refresh_token_hash: "pending",
      csrf_token_hash: "pending",
      expires_at: new Date()
    });

    await issueSessionCookies(res, user, session);

    res.json({
      role: user.role,
      id: user.id,
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const session = await UserSession.findOne({
      where: {
        refresh_token_hash: hashToken(refreshToken)
      }
    });

    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh token invalid or expired" });
    }

    const user = await User.findByPk(session.user_id);
    if (!user || !user.isValid) {
      await revokeSession(session);
      clearAuthCookies(res);
      return res.status(401).json({ message: "Account is unavailable" });
    }

    const replacementSession = await UserSession.create({
      user_id: user.id,
      refresh_token_hash: "pending",
      csrf_token_hash: "pending",
      expires_at: new Date()
    });

    await revokeSession(session, replacementSession.id);
    await issueSessionCookies(res, user, replacementSession);

    res.json({
      role: user.role,
      id: user.id,
      email: user.email
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/logout", authenticate, async (req, res) => {
  try {
    await revokeSession(req.session);
    clearAuthCookies(res);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.json({
        message: "If an account exists for this email, a reset token has been generated."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await user.update({
      reset_password_token: resetTokenHash,
      reset_password_expires: expiresAt
    });

    await sendPasswordResetEmail(email, resetToken);
    return res.json({
      message: "If an account exists for this email, a reset token has been generated."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      where: {
        reset_password_token: hashedToken,
        reset_password_expires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ message: "Reset token is invalid or expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.update({
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    });

    await UserSession.update(
      { revoked_at: new Date() },
      {
        where: {
          user_id: user.id,
          revoked_at: null
        }
      }
    );

    clearAuthCookies(res);
    return res.json({ message: "Password reset successful. You can now login." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/admin-requests", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    const currentAdmin = await User.findByPk(req.user.id);
    if (!currentAdmin || currentAdmin.admin_status !== "approved") {
      return res.status(403).json({ message: "Only approved admins can access this route" });
    }

    const pendingUsers = await User.findAll({
      where: {
        admin_status: "pending"
      },
      attributes: ["id", "email", "role", "admin_status", "created_at"],
      order: [["created_at", "ASC"]]
    });

    res.json(pendingUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/admin-requests/:id", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    const currentAdmin = await User.findByPk(req.user.id);
    if (!currentAdmin || currentAdmin.admin_status !== "approved") {
      return res.status(403).json({ message: "Only approved admins can access this route" });
    }

    const { decision } = req.body;
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Decision must be approve or reject" });
    }

    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (targetUser.id === 1) {
      return res.status(400).json({ message: "Primary admin cannot be modified" });
    }
    if (targetUser.admin_status !== "pending") {
      return res.status(400).json({ message: "Only pending requests can be reviewed" });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    await targetUser.update({ admin_status: nextStatus });

    res.json({
      message: decision === "approve" ? "User request approved" : "User request rejected"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
