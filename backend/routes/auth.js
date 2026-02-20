import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

const SECRET = "my_super_secret_key";  // later move to .env

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

    const user = await User.create({
      email,
      password: hashed,
      role
    });

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

    const token = jwt.sign(
      { id: user.id, role: user.role },
      SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      token,
      role: user.role 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
