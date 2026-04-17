import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { hashToken } from '../middleware/auth.js';
import sequelize from '../db.js';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import Cart from "../models/Cart.js";
import AppSetting from "../models/AppSetting.js";
import AuditLog from "../models/AuditLog.js";
import WishlistItem from "../models/WishlistItem.js";
import Product from "../models/Product.js";
import { Op, Transaction } from "sequelize";

// Associations
Order.hasMany(OrderItem, { foreignKey: "order_id" });
OrderItem.belongsTo(Order, { foreignKey: "order_id" });
OrderItem.belongsTo(Product, { foreignKey: "product_id" });
Order.belongsTo(User, { foreignKey: "customer_id" });

User.hasMany(Cart, { foreignKey: "user_id" });
Cart.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(UserSession, { foreignKey: "user_id" });
UserSession.belongsTo(User, { foreignKey: "user_id" });

Product.hasMany(Cart, { foreignKey: "product_id" });
Cart.belongsTo(Product, { foreignKey: "product_id" });

User.hasMany(WishlistItem, { foreignKey: "user_id" });
WishlistItem.belongsTo(User, { foreignKey: "user_id" });
Product.hasMany(WishlistItem, { foreignKey: "product_id" });
WishlistItem.belongsTo(Product, { foreignKey: "product_id" });
User.hasMany(AuditLog, { foreignKey: "user_id" });
AuditLog.belongsTo(User, { foreignKey: "user_id" });

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_APP_SETTINGS = {
  return_window_days: 7,
  delivery_min_minutes: 2,
  delivery_max_minutes: 10,
  low_stock_threshold: 10,
  default_restock_increment: 100,
  max_product_quantity: 10,
  shipping_charge: 49
};

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const LOCAL_DEV_PORTS = ['5173', '5174', '3000', '8080'];
const LOCAL_DEV_ORIGINS = LOCAL_DEV_PORTS.map(port => `http://localhost:${port}`);
export const ALL_ALLOWED_ORIGINS = [...new Set([...ALLOWED_ORIGINS, ...LOCAL_DEV_ORIGINS])];

const CSRF_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/auth/resend-verification"
]);

function isStateChangingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

export async function csrfProtection(req, res, next) {
  if (!isStateChangingMethod(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }
  const csrfToken = req.cookies?.csrf_token;
  const csrfHeader = req.get("x-csrf-token");

  if (!csrfToken || !csrfHeader || csrfToken !== csrfHeader) {
    return res.status(403).json({ message: "CSRF validation failed" });
  }

  if (req.session) {
    const csrfHash = hashToken(csrfToken);
    if (req.session.csrf_token_hash !== csrfHash) {
      return res.status(403).json({ message: "CSRF validation failed" });
    }
  }
  next();
}

export async function getAppSettingsMap() {
  const rows = await AppSetting.findAll();
  const settings = { ...DEFAULT_APP_SETTINGS };
  rows.forEach((row) => {
    const numericValue = Number(row.value);
    settings[row.key] = Number.isNaN(numericValue) ? row.value : numericValue;
  });
  return settings;
}

export async function getNumericSetting(key) {
  const row = await AppSetting.findByPk(key);
  if (!row) return DEFAULT_APP_SETTINGS[key];
  const numericValue = Number(row.value);
  return Number.isNaN(numericValue) ? DEFAULT_APP_SETTINGS[key] : numericValue;
}

export function getReturnDeadline(order) {
  if (!order?.delivered_at) return null;
  const returnWindowDays = Number(order.return_window_days || DEFAULT_APP_SETTINGS.return_window_days);
  return new Date(new Date(order.delivered_at).getTime() + returnWindowDays * MS_PER_DAY);
}

export function canReturnOrder(order) {
  if (!order || order.status !== "delivered") return false;
  const deadline = getReturnDeadline(order);
  return Boolean(deadline && Date.now() <= deadline.getTime());
}

export function serializeOrderWithReturnMeta(order) {
  const deadline = getReturnDeadline(order);
  const orderData = typeof order.toJSON === "function" ? order.toJSON() : order;
  return {
    ...orderData,
    return_window_days: Number(orderData.return_window_days || DEFAULT_APP_SETTINGS.return_window_days),
    return_deadline: deadline,
    can_return: canReturnOrder(order)
  };
}

export function availableToSell(product) {
  const q = Number(product.quantity);
  const r = Number(product.reserved_quantity || 0);
  return Math.max(0, q - r);
}

export function enrichProductJson(product) {
  const p = product.toJSON ? product.toJSON() : { ...product };
  const qty = Number(p.quantity);
  const reserved = Number(p.reserved_quantity || 0);
  return {
    ...p,
    available_quantity: Math.max(0, qty - reserved)
  };
}

export async function releaseReservationForOrder(orderId, transaction) {
  const items = await OrderItem.findAll({
    where: { order_id: orderId },
    transaction
  });
  for (const item of items) {
    const product = await Product.findByPk(item.product_id, {
      transaction,
      lock: Transaction.LOCK.UPDATE
    });
    if (!product) continue;
    const next = Math.max(0, Number(product.reserved_quantity || 0) - item.quantity);
    await product.update({ reserved_quantity: next }, { transaction });
  }
}

export async function reserveStockForLines(lines, transaction) {
  for (const line of lines) {
    const product = await Product.findByPk(line.product_id, {
      transaction,
      lock: Transaction.LOCK.UPDATE
    });
    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }
    const avail = availableToSell(product);
    if (avail < line.quantity) {
      throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
    }
    await product.update(
      {
        reserved_quantity: Number(product.reserved_quantity || 0) + line.quantity
      },
      { transaction }
    );
  }
}

export const cartMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CART_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false
});

export const orderPlacementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ORDER_RATE_LIMIT || 25),
  standardHeaders: true,
  legacyHeaders: false
});

export function createServiceApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    crossOriginResourcePolicy: false
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || ALL_ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true
  }));
  app.use(cookieParser());
  app.use(express.json());
  
  // Request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });

  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.PUBLIC_API_RATE_LIMIT || 200),
    standardHeaders: true,
    legacyHeaders: false
  }));
  app.use(csrfProtection);

  // Error handler
  app.use((err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      path: req.path
    });
  });

  return app;
}
