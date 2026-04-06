import express from 'express';
import multer from 'multer';
import Product from './models/Product.js';
import sequelize from './db.js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import { authenticate, authorize } from './middleware/auth.js';
import User from './models/User.js';
import UserSession from './models/UserSession.js';
import Order from "./models/Order.js";
import OrderItem from "./models/OrderItem.js";
import Cart from "./models/Cart.js";
import AppSetting from "./models/AppSetting.js";
import AuditLog from "./models/AuditLog.js";
import WishlistItem from "./models/WishlistItem.js";
import Coupon from "./models/Coupon.js";
import { Op, Transaction } from "sequelize";
import { hashToken } from './middleware/auth.js';
import { writeAudit } from "./lib/auditLog.js";
import {
  sendOrderEmail,
  orderPlacedBody,
  orderDispatchedBody,
  orderCancelledBody,
  orderDeliveredBody
} from "./lib/orderMail.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_APP_SETTINGS = {
  return_window_days: 7,
  delivery_min_minutes: 2,
  delivery_max_minutes: 10,
  low_stock_threshold: 10,
  default_restock_increment: 100,
  max_product_quantity: 10
};
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Also allow common local development ports
const LOCAL_DEV_PORTS = ['5173', '5174', '3000', '8080'];
const LOCAL_DEV_ORIGINS = LOCAL_DEV_PORTS.map(port => `http://localhost:${port}`);

const ALL_ALLOWED_ORIGINS = [...new Set([...ALLOWED_ORIGINS, ...LOCAL_DEV_ORIGINS])];
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

async function csrfProtection(req, res, next) {
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

async function getAppSettingsMap() {
  const rows = await AppSetting.findAll();
  const settings = { ...DEFAULT_APP_SETTINGS };

  rows.forEach((row) => {
    const numericValue = Number(row.value);
    settings[row.key] = Number.isNaN(numericValue) ? row.value : numericValue;
  });

  return settings;
}

async function getNumericSetting(key) {
  const row = await AppSetting.findByPk(key);
  if (!row) return DEFAULT_APP_SETTINGS[key];
  const numericValue = Number(row.value);
  return Number.isNaN(numericValue) ? DEFAULT_APP_SETTINGS[key] : numericValue;
}

function getReturnDeadline(order) {
  if (!order?.delivered_at) return null;
  const returnWindowDays = Number(order.return_window_days || DEFAULT_APP_SETTINGS.return_window_days);
  return new Date(new Date(order.delivered_at).getTime() + returnWindowDays * MS_PER_DAY);
}

function canReturnOrder(order) {
  if (!order || order.status !== "delivered") return false;
  const deadline = getReturnDeadline(order);
  return Boolean(deadline && Date.now() <= deadline.getTime());
}

function serializeOrderWithReturnMeta(order) {
  const deadline = getReturnDeadline(order);
  const orderData = typeof order.toJSON === "function" ? order.toJSON() : order;
  return {
    ...orderData,
    return_window_days: Number(orderData.return_window_days || DEFAULT_APP_SETTINGS.return_window_days),
    return_deadline: deadline,
    can_return: canReturnOrder(order)
  };
}

// associations
OrderItem.belongsTo(Product, { foreignKey: "product_id" });

// cart associations (already defined in model file too, but ensure here for sync.)
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

const app = express();

function availableToSell(product) {
  const q = Number(product.quantity);
  const r = Number(product.reserved_quantity || 0);
  return Math.max(0, q - r);
}

function enrichProductJson(product) {
  const p = product.toJSON ? product.toJSON() : { ...product };
  const qty = Number(p.quantity);
  const reserved = Number(p.reserved_quantity || 0);
  return {
    ...p,
    available_quantity: Math.max(0, qty - reserved)
  };
}

async function releaseReservationForOrder(orderId, transaction) {
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

async function reserveStockForLines(lines, transaction) {
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

const cartMutationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CART_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false
});

const orderPlacementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.ORDER_RATE_LIMIT || 25),
  standardHeaders: true,
  legacyHeaders: false
});

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
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PUBLIC_API_RATE_LIMIT || 200),
  standardHeaders: true,
  legacyHeaders: false
}));
app.use("/auth", rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 20),
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(csrfProtection);

app.use('/auth', authRoutes);

// Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// DB check connection
sequelize.authenticate()
  .then(() => console.log('Database connected'))
  .catch(err => console.error('DB error:', err));

  // `alter: true` on every boot can create duplicate MySQL indexes until ER_TOO_MANY_KEYS (max 64/table).
  // Default: create missing tables only. Enable one-off migrations with SQL_SYNC_ALTER=true in .env.
  const syncOptions =
    process.env.SQL_SYNC_ALTER === "true" ? { alter: true } : {};
  if (!syncOptions.alter) {
    console.log("Sequelize sync: alter disabled (set SQL_SYNC_ALTER=true temporarily to migrate schema).");
  }

sequelize.sync(syncOptions)
  .then(async () => {
    const existingSettings = await AppSetting.findAll({ attributes: ["key"] });
    const existingKeys = new Set(existingSettings.map((setting) => setting.key));

    await Promise.all(
      Object.entries(DEFAULT_APP_SETTINGS)
        .filter(([key]) => !existingKeys.has(key))
        .map(([key, value]) => AppSetting.create({ key, value: String(value) }))
    );

    const existingCoupon = await Coupon.findOne({ where: { code: "WELCOME10" } });
    if (!existingCoupon) {
      await Coupon.create({
        code: "WELCOME10",
        discount_percent: 10,
        active: true,
        max_uses: null
      });
      console.log("Seeded default coupon WELCOME10");
    }

    const pendingList = await Order.findAll({ where: { status: "pending" } });
    const reservedByProduct = new Map();
    for (const o of pendingList) {
      const oItems = await OrderItem.findAll({ where: { order_id: o.id } });
      for (const it of oItems) {
        reservedByProduct.set(it.product_id, (reservedByProduct.get(it.product_id) || 0) + it.quantity);
      }
    }
    await Product.update({ reserved_quantity: 0 }, { where: {} });
    for (const [pid, qty] of reservedByProduct) {
      await Product.update({ reserved_quantity: qty }, { where: { id: pid } });
    }

    console.log("All models synced (tables created)");
  })
  .catch(err => console.error("Sync error:", err))

// Public routes
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "capstone-backend",
    timestamp: new Date().toISOString()
  });
});

app.get("/products", async (req, res) => {
  try {
    const { search, category, sort } = req.query;

    const where = {};

    // 🔍 Search
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } }
      ];
    }

    // 🏷 Category
    if (category && category !== "all") {
      where.category = category;
    }

    // ↕ Sorting
    const order = [];
    if (sort === "price-low-to-high") order.push(["price", "ASC"]);
    if (sort === "price-high-to-low") order.push(["price", "DESC"]);
    if (sort === "quantity-low-to-high") order.push(["quantity", "ASC"]);
    if (sort === "quantity-high-to-low") order.push(["quantity", "DESC"]);

    const products = await Product.findAll({
      where,
      order
    });

    res.json(products.map((p) => enrichProductJson(p)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products/:id', async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(enrichProductJson(product));
});

// Protected routes
app.post(
  '/products/add',
  authenticate,
  authorize('product_manager'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { name, description, category, price, quantity, weight } = req.body;

      // Check if product with same name already exists
      const existingProduct = await Product.findOne({
        where: { name: name.trim() }
      });

      if (existingProduct) {
        return res.status(400).json({ 
          error: `Product with name "${name}" already exists. Please use a different name.` 
        });
      }

      const newProduct = await Product.create({
        name,
        description,
        category,
        price,
        quantity,
        weight,
        image: req.file ? req.file.buffer : null
      });

      res.status(201).json(newProduct);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.put(
  '/products/:id',
  authenticate,
  authorize('product_manager'),
  upload.single('image'),
  async (req, res) => {
    const updateData = { ...req.body };

    if (req.file) updateData.image = req.file.buffer;

    const prev = await Product.findByPk(req.params.id);
    await Product.update(updateData, { where: { id: req.params.id } });
    if (prev && updateData.quantity != null && Number(updateData.quantity) !== Number(prev.quantity)) {
      await writeAudit(req.user.id, "product_restock", {
        product_id: prev.id,
        from: prev.quantity,
        to: updateData.quantity
      });
    }
    res.json({ message: "Product updated" });
  }
);

app.delete(
  '/products/:id',
  authenticate,
  authorize('product_manager'),
  async (req, res) => {
    await Product.destroy({ where: { id: req.params.id } });
    res.json({ message: "Product deleted" });
  }
);

app.post(
  "/orders",
  orderPlacementLimiter,
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { items, coupon_code, ship_line1, ship_city, ship_postal, ship_country } =
        req.body || {};
      const customerId = req.user.id;
      const idemKey = (req.get("Idempotency-Key") || "").trim();

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Cart items required" });
      }

      if (idemKey) {
        const existing = await Order.findOne({
          where: { customer_id: customerId, idempotency_key: idemKey }
        });
        if (existing) {
          return res.status(200).json({
            message: "Order already placed",
            orderId: existing.id,
            idempotent: true
          });
        }
      }

      const user = await User.findByPk(customerId);
      const ship1 = ship_line1 ?? user?.address_line1 ?? null;
      const shipCi = ship_city ?? user?.city ?? null;
      const shipPo = ship_postal ?? user?.postal_code ?? null;
      const shipCo = ship_country ?? user?.country ?? null;

      let subtotal = 0;
      const lines = [];

      for (const item of items) {
        const product = await Product.findByPk(item.product_id);
        if (!product || availableToSell(product) < item.quantity) {
          return res.status(400).json({
            message: `Not enough stock for ${product?.name || "product"}`
          });
        }
        subtotal += Number(product.price) * item.quantity;
        lines.push({
          product_id: product.id,
          quantity: item.quantity,
          price: product.price
        });
      }

      let discountAmount = 0;
      let appliedCouponCode = null;
      let couponToRedeem = null;
      const rawCoupon = typeof coupon_code === "string" ? coupon_code.trim().toUpperCase() : "";
      if (rawCoupon) {
        const coupon = await Coupon.findOne({ where: { code: rawCoupon, active: true } });
        if (
          coupon &&
          (!coupon.expires_at || new Date(coupon.expires_at) > new Date()) &&
          (coupon.max_uses == null || coupon.uses_count < coupon.max_uses)
        ) {
          discountAmount = Math.min(
            subtotal,
            (subtotal * Number(coupon.discount_percent)) / 100
          );
          appliedCouponCode = coupon.code;
          couponToRedeem = coupon;
        }
      }

      const total = Math.max(0, subtotal - discountAmount);

      let createdOrder = null;
      const t = await sequelize.transaction();
      try {
        await reserveStockForLines(
          lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
          t
        );

        createdOrder = await Order.create(
          {
            customer_id: customerId,
            total_price: total,
            idempotency_key: idemKey || null,
            coupon_code: appliedCouponCode,
            discount_amount: discountAmount,
            ship_line1: ship1,
            ship_city: shipCi,
            ship_postal: shipPo,
            ship_country: shipCo
          },
          { transaction: t }
        );

        for (const line of lines) {
          await OrderItem.create(
            {
              order_id: createdOrder.id,
              product_id: line.product_id,
              quantity: line.quantity,
              price: line.price
            },
            { transaction: t }
          );
        }

        if (couponToRedeem) {
          await couponToRedeem.update(
            { uses_count: couponToRedeem.uses_count + 1 },
            { transaction: t }
          );
        }

        await t.commit();
      } catch (inner) {
        await t.rollback();
        if (String(inner.message).startsWith("INSUFFICIENT_STOCK:")) {
          return res.status(400).json({
            message: `Not enough stock for ${inner.message.split(":")[1]}`
          });
        }
        throw inner;
      }

      const finalId = createdOrder.id;

      await writeAudit(customerId, "order_placed", { order_id: finalId, total });
      if (user?.email) {
        const { subject, text } = orderPlacedBody(finalId, total);
        sendOrderEmail(user.email, subject, text).catch(() => null);
      }

      res.status(201).json({
        message: "Order placed successfully",
        orderId: finalId
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/orders",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const customerId = req.user.id;

      const orders = await Order.findAll({
        where: { customer_id: customerId },
        order: [["created_at", "DESC"]]
      });
      const returnWindowDays = await getNumericSetting("return_window_days");

      const result = [];

      for (const order of orders) {
        const items = await OrderItem.findAll({
          where: { order_id: order.id },
          include: [
            {
              model: Product,
              attributes: ["name", "image"]
            }
          ]
        });

        // Convert image buffers to base64 strings (use itemObj consistently)
        const itemsWithBase64 = items.map(item => {
          const itemObj = item.toJSON();
          if (itemObj.Product && itemObj.Product.image && Buffer.isBuffer(itemObj.Product.image)) {
            itemObj.Product.image = itemObj.Product.image.toString('base64');
          }
          return itemObj;
        });

        result.push({
          ...serializeOrderWithReturnMeta({
            ...order.toJSON(),
            return_window_days: returnWindowDays
          }),
          items: itemsWithBase64
        });
      }

      res.json(result);

    } catch (err) {
        console.error('GET /orders error', err);
        res.status(500).json({ error: err.message, stack: err.stack });
    }
  }
);

app.get(
  "/orders/all",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const orders = await Order.findAll({
        order: [["created_at", "DESC"]]
      });
      const returnWindowDays = await getNumericSetting("return_window_days");

      const result = [];

      for (const order of orders) {
        const items = await OrderItem.findAll({
          where: { order_id: order.id },
          include: [
            { model: Product, attributes: ["name", "quantity", "image"] }
          ]
        });

        result.push({
          ...serializeOrderWithReturnMeta({
            ...order.toJSON(),
            return_window_days: returnWindowDays
          }),
          items
        });
      }

      res.json(result);

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/:id/dispatch",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);

      if (!order) return res.status(404).json({ message: "Order not found" });

      if (order.status !== "pending") {
        return res.status(400).json({ message: "Order already processed" });
      }

      const items = await OrderItem.findAll({
        where: { order_id: order.id }
      });

      const now = new Date();
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);

        if (product.quantity < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.name}`
          });
        }

        const nextReserved = Math.max(0, Number(product.reserved_quantity || 0) - item.quantity);
        await product.update({
          quantity: product.quantity - item.quantity,
          reserved_quantity: nextReserved
        });
      }

      const deliveryMinMinutes = await getNumericSetting("delivery_min_minutes");
      const deliveryMaxMinutes = await getNumericSetting("delivery_max_minutes");
      const minMinutes = Math.min(deliveryMinMinutes, deliveryMaxMinutes);
      const maxMinutes = Math.max(deliveryMinMinutes, deliveryMaxMinutes);
      const minutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
      const deliveredAt = new Date(Date.now() + minutes * 60 * 1000);

      await order.update({
        status: "dispatched",
        delivered_at: deliveredAt,
        dispatched_at: now
      });

      // schedule background update to "delivered" after delay
      setTimeout(async () => {
        try {
          const o = await Order.findByPk(order.id);
          if (o && o.status === "dispatched") {
            await o.update({ status: "delivered", delivered_at: new Date() });
            console.log(`Order ${o.id} automatically marked delivered at ${new Date().toISOString()}`);
            
            const custD = await User.findByPk(o.customer_id);
            if (custD?.email) {
              const { subject, text } = orderDeliveredBody(o.id);
              sendOrderEmail(custD.email, subject, text).catch(() => null);
            }
          }
        } catch (err) {
          console.error('auto-deliver error for order', order.id, err);
        }
      }, minutes * 60 * 1000);

      await writeAudit(req.user.id, "order_dispatched", { order_id: order.id });
      const cust = await User.findByPk(order.customer_id);
      if (cust?.email) {
        const { subject, text } = orderDispatchedBody(order.id, minutes);
        sendOrderEmail(cust.email, subject, text).catch(() => null);
      }

      res.json({ message: "Order dispatched successfully", eta_minutes: minutes, delivered_at: deliveredAt });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/bulk-dispatch",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const pendingOrders = await Order.findAll({
        where: { status: "pending" },
        order: [["created_at", "ASC"]]
      });

      const deliveryMinMinutes = await getNumericSetting("delivery_min_minutes");
      const deliveryMaxMinutes = await getNumericSetting("delivery_max_minutes");
      const minMinutes = Math.min(deliveryMinMinutes, deliveryMaxMinutes);
      const maxMinutes = Math.max(deliveryMinMinutes, deliveryMaxMinutes);

      const dispatched = [];
      const cancelled = [];

      for (const orderRow of pendingOrders) {
        const order = await Order.findByPk(orderRow.id);
        if (!order || order.status !== "pending") continue;

        const items = await OrderItem.findAll({
          where: { order_id: order.id }
        });

        const simulatedStock = new Map();

        let canDispatch = true;
        let cancelReason = "";

        for (const item of items) {
          let available = simulatedStock.get(item.product_id);
          if (available === undefined) {
            const product = await Product.findByPk(item.product_id);
            if (!product) {
              canDispatch = false;
              cancelReason = "Product no longer exists";
              break;
            }
            available = product.quantity;
            simulatedStock.set(item.product_id, available);
          }

          if (available < item.quantity) {
            canDispatch = false;
            const product = await Product.findByPk(item.product_id);
            const name = product?.name || `product #${item.product_id}`;
            cancelReason = `Insufficient stock for ${name} (ordered ${item.quantity}, available ${available})`;
            break;
          }

          simulatedStock.set(item.product_id, available - item.quantity);
        }

        if (!canDispatch) {
          const relT = await sequelize.transaction();
          try {
            await releaseReservationForOrder(order.id, relT);
            await order.update(
              { status: "cancelled", internal_cancel_note: cancelReason },
              { transaction: relT }
            );
            await relT.commit();
          } catch (e) {
            await relT.rollback();
            throw e;
          }
          cancelled.push({ id: order.id, reason: cancelReason });
          const custX = await User.findByPk(order.customer_id);
          if (custX?.email) {
            const { subject, text } = orderCancelledBody(order.id);
            sendOrderEmail(custX.email, subject, text).catch(() => null);
          }
          await writeAudit(req.user.id, "order_cancelled_bulk_stock", { order_id: order.id, reason: cancelReason });
          continue;
        }

        const dispatchNow = new Date();
        for (const item of items) {
          const product = await Product.findByPk(item.product_id);
          const nextReserved = Math.max(0, Number(product.reserved_quantity || 0) - item.quantity);
          await product.update({
            quantity: product.quantity - item.quantity,
            reserved_quantity: nextReserved
          });
        }

        const minutes =
          Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        const deliveredAt = new Date(Date.now() + minutes * 60 * 1000);

        await order.update({
          status: "dispatched",
          delivered_at: deliveredAt,
          dispatched_at: dispatchNow
        });

        const orderId = order.id;
        setTimeout(async () => {
          try {
            const o = await Order.findByPk(orderId);
            if (o && o.status === "dispatched") {
              await o.update({ status: "delivered", delivered_at: new Date() });
              console.log(
                `Order ${o.id} automatically marked delivered at ${new Date().toISOString()}`
              );
              
              const custD = await User.findByPk(o.customer_id);
              if (custD?.email) {
                const { subject, text } = orderDeliveredBody(o.id);
                sendOrderEmail(custD.email, subject, text).catch(() => null);
              }
            }
          } catch (err) {
            console.error("auto-deliver error for order", orderId, err);
          }
        }, minutes * 60 * 1000);

        await writeAudit(req.user.id, "order_dispatched", { order_id: order.id, bulk: true });
        const custD = await User.findByPk(order.customer_id);
        if (custD?.email) {
          const { subject, text } = orderDispatchedBody(order.id, minutes);
          sendOrderEmail(custD.email, subject, text).catch(() => null);
        }

        dispatched.push({ id: order.id, eta_minutes: minutes });
      }

      res.json({
        message: `Bulk dispatch complete: ${dispatched.length} dispatched, ${cancelled.length} cancelled.`,
        dispatched,
        cancelled
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/bulk-cancel",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const pendingOrders = await Order.findAll({
        where: { status: "pending" },
        order: [["created_at", "ASC"]]
      });

      const cancelled = [];

      for (const orderRow of pendingOrders) {
        const order = await Order.findByPk(orderRow.id);
        if (!order || order.status !== "pending") continue;
        const t = await sequelize.transaction();
        try {
          await releaseReservationForOrder(order.id, t);
          await order.update(
            { status: "cancelled", internal_cancel_note: "Bulk cancel (admin)" },
            { transaction: t }
          );
          await t.commit();
        } catch (e) {
          await t.rollback();
          throw e;
        }
        cancelled.push({ id: order.id });
        const custB = await User.findByPk(order.customer_id);
        if (custB?.email) {
          const { subject, text } = orderCancelledBody(order.id);
          sendOrderEmail(custB.email, subject, text).catch(() => null);
        }
        await writeAudit(req.user.id, "order_cancelled", { order_id: order.id, bulk: true });
      }

      res.json({
        message:
          cancelled.length === 0
            ? "No pending orders to cancel."
            : `Cancelled ${cancelled.length} pending order(s).`,
        cancelled
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ----- wishlist -----
app.get(
  "/wishlist",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const rows = await WishlistItem.findAll({
        where: { user_id: req.user.id },
        include: [{ model: Product }]
      });
      const products = rows
        .map((w) => w.Product)
        .filter(Boolean)
        .map((p) => enrichProductJson(p));
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/wishlist",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { product_id } = req.body;
      const product = await Product.findByPk(product_id);
      if (!product) return res.status(404).json({ message: "Product not found" });
      await WishlistItem.findOrCreate({
        where: { user_id: req.user.id, product_id }
      });
      res.status(201).json({ message: "Added to wishlist" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  "/wishlist/:productId",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      await WishlistItem.destroy({
        where: { user_id: req.user.id, product_id: req.params.productId }
      });
      res.json({ message: "Removed" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ----- cart endpoints -----
// get current user cart items
app.get(
  "/cart",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const items = await Cart.findAll({
        where: { user_id: userId },
        include: [{ model: Product }]
      });

      const result = items.map(it => {
        const obj = it.toJSON();
        if (obj.Product.image && Buffer.isBuffer(obj.Product.image)) {
          obj.Product.image = obj.Product.image.toString('base64');
        }
        return obj;
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// add or increment item
app.post(
  "/cart",
  cartMutationLimiter,
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { product_id, quantity } = req.body;
      const userId = req.user.id;
      const maxProductQuantity = await getNumericSetting("max_product_quantity");
      const product = await Product.findByPk(product_id);
      if (!product) return res.status(404).json({ message: "Product not found" });
      if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
      const sellable = availableToSell(product);
      // upsert
      let cartItem = await Cart.findOne({ where: { user_id: userId, product_id } });
      if (cartItem) {
        if (cartItem.quantity + quantity > maxProductQuantity) {
          return res.status(400).json({
            message: `You can add up to ${maxProductQuantity} units of a product to your cart`
          });
        }
        if (cartItem.quantity + quantity > sellable) {
          return res.status(400).json({
            message: `Only ${sellable} units available for ${product.name}`
          });
        }
        cartItem.quantity += quantity;
        await cartItem.save();
      } else {
        if (quantity > maxProductQuantity) {
          return res.status(400).json({
            message: `You can add up to ${maxProductQuantity} units of a product to your cart`
          });
        }
        if (quantity > sellable) {
          return res.status(400).json({
            message: `Only ${sellable} units available for ${product.name}`
          });
        }
        cartItem = await Cart.create({
          user_id: userId,
          product_id,
          quantity
        });
      }
      res.status(201).json(cartItem);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// update qty of a cart item
app.put(
  "/cart/:id",
  cartMutationLimiter,
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { quantity } = req.body;
      const maxProductQuantity = await getNumericSetting("max_product_quantity");
      const cartItem = await Cart.findByPk(req.params.id);
      if (!cartItem || cartItem.user_id !== req.user.id) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
      if (quantity > maxProductQuantity) {
        return res.status(400).json({
          message: `You can add up to ${maxProductQuantity} units of a product to your cart`
        });
      }
      const product = await Product.findByPk(cartItem.product_id);
      const sellable = product ? availableToSell(product) : 0;
      if (quantity > sellable) {
        return res.status(400).json({
          message: `Only ${sellable} units available for ${product?.name || "this product"}`
        });
      }
      cartItem.quantity = quantity;
      await cartItem.save();
      res.json(cartItem);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// remove a single cart item
app.delete(
  "/cart/:id",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const cartItem = await Cart.findByPk(req.params.id);
      if (!cartItem || cartItem.user_id !== req.user.id) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      await cartItem.destroy();
      res.json({ message: "Item removed" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// clear entire cart
app.delete(
  "/cart",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      await Cart.destroy({ where: { user_id: req.user.id } });
      res.json({ message: "Cart cleared" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ----- user profile -----
app.get(
  "/users/me",
  authenticate,
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id, {
        attributes: [
          "id",
          "email",
          "role",
          "admin_status",
          "isValid",
          "email_verified",
          "created_at",
          "address_line1",
          "address_line2",
          "city",
          "postal_code",
          "country"
        ]
      });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/users/me",
  authenticate,
  async (req, res) => {
    try {
      const {
        address_line1,
        address_line2,
        city,
        postal_code,
        country
      } = req.body || {};
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      await user.update({
        ...(address_line1 !== undefined ? { address_line1: String(address_line1).slice(0, 200) } : {}),
        ...(address_line2 !== undefined ? { address_line2: String(address_line2).slice(0, 200) } : {}),
        ...(city !== undefined ? { city: String(city).slice(0, 100) } : {}),
        ...(postal_code !== undefined ? { postal_code: String(postal_code).slice(0, 30) } : {}),
        ...(country !== undefined ? { country: String(country).slice(0, 80) } : {})
      });
      const fresh = await User.findByPk(req.user.id, {
        attributes: [
          "id",
          "email",
          "role",
          "created_at",
          "address_line1",
          "address_line2",
          "city",
          "postal_code",
          "country"
        ]
      });
      res.json(fresh);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/users",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") {
        return res.status(403).json({ message: "Only approved admins can access this route" });
      }

      const users = await User.findAll({
        attributes: ["id", "email", "role", "admin_status", "isValid", "email_verified", "created_at"],
        order: [["created_at", "DESC"]]
      });

      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/settings",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") {
        return res.status(403).json({ message: "Only approved admins can access this route" });
      }

      const settings = await getAppSettingsMap();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Public settings endpoint for customers (read-only access to specific settings)
app.get(
  "/public-settings",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      // Only return specific settings that customers need
      const publicSettings = {
        max_product_quantity: await getNumericSetting("max_product_quantity")
      };
      res.json(publicSettings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/settings",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") {
        return res.status(403).json({ message: "Only approved admins can access this route" });
      }

      const updates = req.body || {};
      const allowedKeys = Object.keys(DEFAULT_APP_SETTINGS);
      const incomingEntries = Object.entries(updates).filter(([key]) => allowedKeys.includes(key));

      if (incomingEntries.length === 0) {
        return res.status(400).json({ message: "No valid settings were provided" });
      }

      for (const [key, value] of incomingEntries) {
        if (!Number.isInteger(value) || value < 1) {
          return res.status(400).json({ message: `${key} must be a positive whole number` });
        }
      }

      const mergedSettings = { ...(await getAppSettingsMap()), ...Object.fromEntries(incomingEntries) };
      if (mergedSettings.delivery_min_minutes > mergedSettings.delivery_max_minutes) {
        return res.status(400).json({ message: "Minimum delivery time cannot exceed maximum delivery time" });
      }

      await Promise.all(
        incomingEntries.map(([key, value]) =>
          AppSetting.upsert({ key, value: String(value) })
        )
      );

      const settings = await getAppSettingsMap();
      res.json({ message: "Settings updated successfully", settings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/users/:id/validity",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") {
        return res.status(403).json({ message: "Only approved admins can access this route" });
      }

      const targetUser = await User.findByPk(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.id === req.user.id) {
        return res.status(400).json({ message: "You cannot disable your own account" });
      }

      const { isValid } = req.body;
      if (typeof isValid !== "boolean") {
        return res.status(400).json({ message: "isValid must be a boolean value" });
      }

      await targetUser.update({ isValid });

      res.json({
        message: isValid ? "User account enabled successfully" : "User account disabled successfully"
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  "/users/:id",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") {
        return res.status(403).json({ message: "Only approved admins can access this route" });
      }

      const targetUser = await User.findByPk(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.id === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      await Cart.destroy({ where: { user_id: targetUser.id } });
      await User.destroy({ where: { id: targetUser.id } });

      res.json({ message: "User account removed successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ----- orders -----
app.get(
  "/orders/:id",
  authenticate,
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (
        req.user.role === "customer" &&
        order.customer_id !== req.user.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const items = await OrderItem.findAll({
        where: { order_id: order.id },
        include: [{ model: Product, attributes: ["name", "price", "image"] }]
      });
      const returnWindowDays = await getNumericSetting("return_window_days");

      const itemsWithBase64 = items.map(item => {
        const obj = item.toJSON();
        if (obj.Product.image && Buffer.isBuffer(obj.Product.image)) {
          obj.Product.image = item.Product.image.toString('base64');
        }
        return obj;
      });

      const payload = {
        ...serializeOrderWithReturnMeta({
          ...order.toJSON(),
          return_window_days: returnWindowDays
        }),
        items: itemsWithBase64
      };
      if (req.user.role === "customer") {
        delete payload.internal_cancel_note;
      }

      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/:id/return",
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.customer_id !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (order.status !== "delivered") {
        return res.status(400).json({ message: "Only delivered orders can be returned" });
      }

      const returnWindowDays = await getNumericSetting("return_window_days");
      const deadline = getReturnDeadline({
        ...order.toJSON(),
        return_window_days: returnWindowDays
      });

      if (!deadline || Date.now() > deadline.getTime()) {
        return res.status(400).json({
          message: `Return window closed. Returns are allowed for ${returnWindowDays} days after delivery.`
        });
      }

      const items = await OrderItem.findAll({
        where: { order_id: order.id }
      });

      for (const item of items) {
        const product = await Product.findByPk(item.product_id);
        if (!product) continue;
        await product.update({
          quantity: product.quantity + item.quantity
        });
      }

      await order.update({ status: "returned" });

      res.json({ message: "Order returned successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// modify cancel logic: allow customers to cancel their own pending orders
app.patch(
  "/orders/:id/cancel",
  authenticate,
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // only pm or owner can cancel pending orders
      if (order.status !== "pending") {
        return res.status(400).json({ message: "Order already processed" });
      }

      if (
        req.user.role === "customer" &&
        order.customer_id !== req.user.id
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const internalNote =
        req.user.role === "product_manager" && typeof req.body?.internal_note === "string"
          ? req.body.internal_note.slice(0, 2000)
          : null;

      const t = await sequelize.transaction();
      try {
        await releaseReservationForOrder(order.id, t);
        await order.update(
          {
            status: "cancelled",
            ...(internalNote ? { internal_cancel_note: internalNote } : {})
          },
          { transaction: t }
        );
        await t.commit();
      } catch (e) {
        await t.rollback();
        throw e;
      }

      const cust = await User.findByPk(order.customer_id);
      if (cust?.email) {
        const { subject, text } = orderCancelledBody(order.id);
        sendOrderEmail(cust.email, subject, text).catch(() => null);
      }
      await writeAudit(req.user.id, "order_cancelled", { order_id: order.id });

      res.json({ message: "Order cancelled successfully" });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ----- reports for dashboard -----
app.get(
  "/reports/overview",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      // revenue by month (YYYY-MM)
      const revenueRows = await Order.findAll({
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
          [sequelize.fn('SUM', sequelize.col('total_price')), 'revenue']
        ],
        group: ['month'],
        order: [[sequelize.literal('month'), 'ASC']]
      });

      const revenueByMonth = revenueRows.map(r => ({
        month: r.get('month'),
        revenue: parseFloat(r.get('revenue'))
      }));

      // monthly orders count
      const ordersRows = await Order.findAll({
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'orders']
        ],
        group: ['month'],
        order: [[sequelize.literal('month'), 'ASC']]
      });

      const monthlyOrders = ordersRows.map(r => ({
        month: r.get('month'),
        orders: parseInt(r.get('orders'), 10)
      }));

      // most sold product
      const soldRows = await OrderItem.findAll({
        attributes: [
          'product_id',
          [sequelize.fn('SUM', sequelize.literal('`OrderItem`.`quantity`')), 'sold']
        ],
        group: ['product_id'],
        order: [[sequelize.literal('sold'), 'DESC']],
        limit: 1,
        include: [{ model: Product, attributes: ['name'] }]
      });

      const mostSoldProduct = soldRows.length
        ? {
            product_id: soldRows[0].product_id,
            name: soldRows[0].Product?.name,
            sold: parseInt(soldRows[0].get('sold'), 10)
          }
        : null;

      // most profitable category
      const profitRows = await OrderItem.findAll({
        attributes: [
          [sequelize.literal('`Product`.`category`'), 'category'],
          [sequelize.fn('SUM', sequelize.literal('`OrderItem`.`quantity` * `OrderItem`.`price`')), 'profit']
        ],
        include: [{ model: Product, attributes: [] }],
        group: ['Product.category'],
        order: [[sequelize.literal('profit'), 'DESC']],
        limit: 1
      });

      const mostProfitableCategory = profitRows.length
        ? {
            category: profitRows[0].get('category'),
            profit: parseFloat(profitRows[0].get('profit'))
          }
        : null;

      const pendingOrders = await Order.count({ where: { status: "pending" } });
      const sevenDaysAgo = new Date(Date.now() - 7 * MS_PER_DAY);
      const ordersLast7Days = await Order.count({
        where: { created_at: { [Op.gte]: sevenDaysAgo } }
      });
      const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
      const cancelledLast30Days = await Order.count({
        where: { status: "cancelled", created_at: { [Op.gte]: thirtyDaysAgo } }
      });
      const ordersWithCoupon = await Order.count({
        where: { coupon_code: { [Op.ne]: null } }
      });

      res.json({
        revenueByMonth,
        monthlyOrders,
        mostSoldProduct,
        mostProfitableCategory,
        funnel: {
          pendingOrders,
          ordersLast7Days,
          cancelledLast30Days,
          ordersWithCoupon
        }
      });
    } catch (err) {
      console.error("reports/overview error", err);
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  }
);

app.get(
  "/reports/audit-log",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const rows = await AuditLog.findAll({
        order: [["created_at", "DESC"]],
        limit,
        include: [{ model: User, attributes: ["id", "email"] }]
      });
      res.json(
        rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          action: r.action,
          details: r.details,
          user: r.User ? { id: r.User.id, email: r.User.email } : null
        }))
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/reports/export/orders",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const orders = await Order.findAll({ order: [["created_at", "DESC"]], limit: 5000 });
      const lines = [
        "id,customer_id,status,total_price,coupon_code,discount_amount,created_at"
      ];
      for (const o of orders) {
        const row = o.toJSON();
        lines.push(
          [
            row.id,
            row.customer_id,
            row.status,
            row.total_price,
            row.coupon_code || "",
            row.discount_amount ?? 0,
            row.created_at
          ].join(",")
        );
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="orders.csv"');
      res.send(lines.join("\n"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/reports/export/low-stock",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const threshold = await getNumericSetting("low_stock_threshold");
      const products = await Product.findAll({
        where: { quantity: { [Op.lt]: threshold } },
        order: [["quantity", "ASC"]]
      });
      const lines = ["id,name,category,quantity,reserved_quantity,price"];
      for (const p of products) {
        const row = p.toJSON();
        lines.push(
          [
            row.id,
            JSON.stringify(row.name || ""),
            JSON.stringify(row.category || ""),
            row.quantity,
            row.reserved_quantity ?? 0,
            row.price
          ].join(",")
        );
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="low-stock.csv"');
      res.send(lines.join("\n"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


app.listen(5000, () => {
  console.log('Server is listening on port 5000');
});
