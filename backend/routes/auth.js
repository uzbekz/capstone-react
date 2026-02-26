import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { Op } from "sequelize";

const router = express.Router();

const SECRET = "my_super_secret_key";  // later move to .env
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: `Email "${email}" is already registered. Please use a different email or login.` 
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const requestedRole = role === "product_manager" ? "product_manager" : "customer";
    const adminStatus = requestedRole === "product_manager" ? "pending" : "approved";

    await User.create({
      email,
      password: hashed,
      role: requestedRole,
      admin_status: adminStatus
    });

    if (requestedRole === "product_manager") {
      return res.json({
        message: "Registration received. Admin access is pending approval from the primary admin."
      });
    }

    res.json({ message: "User registered successfully" });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    if (user.role === "product_manager" && user.id !== 1) {
      if (user.admin_status === "pending") {
        return res.status(403).json({
          message: "Admin request pending approval. You can login after primary admin approval."
        });
      }

      if (user.admin_status === "rejected") {
        return res.status(403).json({
          message: "Admin request was rejected by the primary admin."
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      token,
      role: user.role,
      id: user.id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FORGOT PASSWORD (request reset token)
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ where: { email } });

    // Keep response generic to avoid account enumeration
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

// RESET PASSWORD (submit token + new password)
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await user.update({
      password: hashedPassword,
      reset_password_token: null,
      reset_password_expires: null
    });

    return res.json({ message: "Password reset successful. You can now login." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Primary admin (id=1) reviews pending admin requests
router.get("/admin-requests", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    if (req.user.id !== 1) {
      return res.status(403).json({ message: "Only the primary admin can access this route" });
    }

    const pendingAdmins = await User.findAll({
      where: {
        role: "product_manager",
        admin_status: "pending"
      },
      attributes: ["id", "email", "admin_status", "created_at"],
      order: [["created_at", "ASC"]]
    });

    res.json(pendingAdmins);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/admin-requests/:id", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    if (req.user.id !== 1) {
      return res.status(403).json({ message: "Only the primary admin can access this route" });
    }

    const { decision } = req.body;
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Decision must be approve or reject" });
    }

    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    if (targetUser.id === 1) {
      return res.status(400).json({ message: "Primary admin cannot be modified" });
    }
    if (targetUser.role !== "product_manager") {
      return res.status(400).json({ message: "Target user is not an admin requester" });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    await targetUser.update({ admin_status: nextStatus });

    res.json({
      message: decision === "approve" ? "Admin request approved" : "Admin request rejected"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
