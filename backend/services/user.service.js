import {
  createServiceApp,
  getAppSettingsMap,
  getNumericSetting,
  availableToSell,
  enrichProductJson,
  cartMutationLimiter,
  DEFAULT_APP_SETTINGS
} from './shared.js';

import sequelize from '../db.js';
import User from '../models/User.js';
import Cart from "../models/Cart.js";
import AppSetting from "../models/AppSetting.js";
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import { authenticate, authorize } from '../middleware/auth.js';

// DB Init only needed once, placing it here.
sequelize.authenticate()
  .then(() => console.log('Database connected'))
  .catch(err => console.error('DB error:', err));

const syncOptions = process.env.SQL_SYNC_ALTER === "true" ? { alter: true } : {};
if (!syncOptions.alter) {
  console.log("Sequelize sync: alter disabled (set SQL_SYNC_ALTER=true temporarily to migrate schema).");
}

sequelize.sync(syncOptions)
  .then(async () => {
    const existingSettings = await AppSetting.findAll({ attributes: ["key"] });
    const existingKeys = new Set(existingSettings.map((s) => s.key));

    await Promise.all(
      Object.entries(DEFAULT_APP_SETTINGS)
        .filter(([key]) => !existingKeys.has(key))
        .map(([key, value]) => AppSetting.create({ key, value: String(value) }))
    );

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
  .catch(err => console.error("Sync error:", err));

const app = createServiceApp();

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "capstone-backend",
    timestamp: new Date().toISOString()
  });
});

// CART
app.get("/cart", authenticate, authorize("customer"), async (req, res) => {
  try {
    const userId = req.user.id;
    const items = await Cart.findAll({
      where: { user_id: userId },
      include: [{ model: Product }]
    });
    const result = items.map((it) => it.toJSON());
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/cart", cartMutationLimiter, authenticate, authorize("customer"), async (req, res) => {
  try {
    const { product_id, quantity } = req.body;
    const userId = req.user.id;
    const maxProductQuantity = await getNumericSetting("max_product_quantity");
    const product = await Product.findByPk(product_id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
    const sellable = availableToSell(product);
    let cartItem = await Cart.findOne({ where: { user_id: userId, product_id } });

    if (cartItem) {
      if (cartItem.quantity + quantity > maxProductQuantity) {
        return res.status(400).json({ message: `You can add up to ${maxProductQuantity} units of a product to your cart` });
      }
      if (cartItem.quantity + quantity > sellable) {
        return res.status(400).json({ message: `Only ${sellable} units available for ${product.name}` });
      }
      cartItem.quantity += quantity;
      await cartItem.save();
    } else {
      if (quantity > maxProductQuantity) {
        return res.status(400).json({ message: `You can add up to ${maxProductQuantity} units of a product to your cart` });
      }
      if (quantity > sellable) {
        return res.status(400).json({ message: `Only ${sellable} units available for ${product.name}` });
      }
      cartItem = await Cart.create({ user_id: userId, product_id, quantity });
    }
    res.status(201).json(cartItem);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/cart/:id", cartMutationLimiter, authenticate, authorize("customer"), async (req, res) => {
  try {
    const { quantity } = req.body;
    const maxProductQuantity = await getNumericSetting("max_product_quantity");
    const cartItem = await Cart.findByPk(req.params.id);
    if (!cartItem || cartItem.user_id !== req.user.id) return res.status(404).json({ message: "Cart item not found" });
    if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
    if (quantity > maxProductQuantity) {
      return res.status(400).json({ message: `You can add up to ${maxProductQuantity} units of a product to your cart` });
    }
    const product = await Product.findByPk(cartItem.product_id);
    const sellable = product ? availableToSell(product) : 0;
    if (quantity > sellable) {
      return res.status(400).json({ message: `Only ${sellable} units available for ${product?.name || "this product"}` });
    }
    cartItem.quantity = quantity;
    await cartItem.save();
    res.json(cartItem);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/cart/:id", authenticate, authorize("customer"), async (req, res) => {
  try {
    const cartItem = await Cart.findByPk(req.params.id);
    if (!cartItem || cartItem.user_id !== req.user.id) return res.status(404).json({ message: "Cart item not found" });
    await cartItem.destroy();
    res.json({ message: "Item removed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/cart", authenticate, authorize("customer"), async (req, res) => {
  try {
    await Cart.destroy({ where: { user_id: req.user.id } });
    res.json({ message: "Cart cleared" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// USERS
app.get("/users/me", authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: [ "id", "email", "role", "admin_status", "isValid", "email_verified", "created_at", "address_line1", "address_line2", "city", "postal_code", "country" ]
    });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/users/me", authenticate, async (req, res) => {
  try {
    const { address_line1, address_line2, city, postal_code, country } = req.body || {};
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await user.update({
      ...(address_line1 !== undefined ? { address_line1: String(address_line1).slice(0, 200) } : {}),
      ...(address_line2 !== undefined ? { address_line2: String(address_line2).slice(0, 200) } : {}),
      ...(city !== undefined ? { city: String(city).slice(0, 100) } : {}),
      ...(postal_code !== undefined ? { postal_code: String(postal_code).slice(0, 30) } : {}),
      ...(country !== undefined ? { country: String(country).slice(0, 80) } : {})
    });
    res.json(await User.findByPk(req.user.id, { attributes: [ "id", "email", "role", "created_at", "address_line1", "address_line2", "city", "postal_code", "country" ] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/users", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    const currentAdmin = await User.findByPk(req.user.id);
    if (!currentAdmin || currentAdmin.admin_status !== "approved") return res.status(403).json({ message: "Only approved admins can access this route" });
    const users = await User.findAll({ attributes: ["id", "email", "role", "admin_status", "isValid", "email_verified", "created_at"], order: [["created_at", "DESC"]] });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/users/:id/validity", authenticate, authorize("product_manager"), async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") return res.status(403).json({ message: "Only approved admins can access this route" });
      const targetUser = await User.findByPk(req.params.id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      if (targetUser.id === req.user.id) return res.status(400).json({ message: "You cannot disable your own account" });
      const { isValid } = req.body;
      if (typeof isValid !== "boolean") return res.status(400).json({ message: "isValid must be a boolean value" });
      await targetUser.update({ isValid });
      res.json({ message: isValid ? "User account enabled successfully" : "User account disabled successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/users/:id", authenticate, authorize("product_manager"), async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") return res.status(403).json({ message: "Only approved admins can access this route" });
      const targetUser = await User.findByPk(req.params.id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      if (targetUser.id === req.user.id) return res.status(400).json({ message: "You cannot delete your own account" });
      await Cart.destroy({ where: { user_id: targetUser.id } });
      await User.destroy({ where: { id: targetUser.id } });
      res.json({ message: "User account removed successfully" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// SETTINGS
app.get("/settings", authenticate, authorize("product_manager"), async (req, res) => {
  try {
    const currentAdmin = await User.findByPk(req.user.id);
    if (!currentAdmin || currentAdmin.admin_status !== "approved") return res.status(403).json({ message: "Only approved admins can access this route" });
    res.json(await getAppSettingsMap());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/public-settings", authenticate, async (req, res) => {
  try {
    const [maxProductQuantity, returnWindowDays, shippingCharge] = await Promise.all([
      getNumericSetting("max_product_quantity"),
      getNumericSetting("return_window_days"),
      getNumericSetting("shipping_charge")
    ]);
    res.json({ 
      max_product_quantity: maxProductQuantity, 
      return_window_days: returnWindowDays,
      shipping_charge: shippingCharge
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch("/settings", authenticate, authorize("product_manager"), async (req, res) => {
    try {
      const currentAdmin = await User.findByPk(req.user.id);
      if (!currentAdmin || currentAdmin.admin_status !== "approved") return res.status(403).json({ message: "Only approved admins can access this route" });

      const updates = req.body || {};
      const allowedKeys = Object.keys(DEFAULT_APP_SETTINGS);
      const incomingEntries = Object.entries(updates).filter(([key]) => allowedKeys.includes(key));
      if (incomingEntries.length === 0) return res.status(400).json({ message: "No valid settings were provided" });
      for (const [key, value] of incomingEntries) {
        if (!Number.isInteger(value) || value < 1) return res.status(400).json({ message: `${key} must be a positive whole number` });
      }
      const mergedSettings = { ...(await getAppSettingsMap()), ...Object.fromEntries(incomingEntries) };
      if (mergedSettings.delivery_min_minutes > mergedSettings.delivery_max_minutes) {
        return res.status(400).json({ message: "Minimum delivery time cannot exceed maximum delivery time" });
      }
      await Promise.all(incomingEntries.map(([key, value]) => AppSetting.upsert({ key, value: String(value) })));
      res.json({ message: "Settings updated successfully", settings: await getAppSettingsMap() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 5004;
app.listen(PORT, () => {
    console.log(`User Service listening on port ${PORT}`);
});
