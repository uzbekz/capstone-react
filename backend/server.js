import express from 'express';
import multer from 'multer';
import Product from './models/Product.js';
import sequelize from './db.js';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import { authenticate, authorize } from './middleware/auth.js';
import User from './models/User.js';
import Order from "./models/Order.js";
import OrderItem from "./models/OrderItem.js";
import Cart from "./models/Cart.js";
import { Op } from "sequelize";

const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS || 7);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getReturnDeadline(order) {
  if (!order?.delivered_at) return null;
  return new Date(new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * MS_PER_DAY);
}

function canReturnOrder(order) {
  if (!order || order.status !== "delivered") return false;
  const deadline = getReturnDeadline(order);
  return Boolean(deadline && Date.now() <= deadline.getTime());
}

function serializeOrderWithReturnMeta(order) {
  const deadline = getReturnDeadline(order);
  return {
    ...order.toJSON(),
    return_window_days: RETURN_WINDOW_DAYS,
    return_deadline: deadline,
    can_return: canReturnOrder(order)
  };
}

// associations
OrderItem.belongsTo(Product, { foreignKey: "product_id" });

// cart associations (already defined in model file too, but ensure here for sync.)
User.hasMany(Cart, { foreignKey: "user_id" });
Cart.belongsTo(User, { foreignKey: "user_id" });

Product.hasMany(Cart, { foreignKey: "product_id" });
Cart.belongsTo(Product, { foreignKey: "product_id" });


const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);

// Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// DB check connection
sequelize.authenticate()
  .then(() => console.log('Database connected'))
  .catch(err => console.error('DB error:', err));

  //creats the users table if not exits and connects to the table
sequelize.sync({ alter: true })
  .then(() => console.log("All models synced (tables created)"))
  .catch(err => console.error("Sync error:", err))

// Public routes
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

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/products/:id', async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: "Not found" });
  res.json(product);
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

    await Product.update(updateData, { where: { id: req.params.id } });
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
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { items } = req.body;
      const customerId = req.user.id;

      let total = 0;

      // Validate stock
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);

        if (!product || product.quantity < item.quantity) {
          return res.status(400).json({
            message: `Not enough stock for ${product?.name}`
          });
        }

        total += product.price * item.quantity;
      }

      // Create order
      const order = await Order.create({
        customer_id: customerId,
        total_price: total
      });

      // Create order items
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);

        await OrderItem.create({
          order_id: order.id,
          product_id: product.id,
          quantity: item.quantity,
          price: product.price
        });
      }

      res.status(201).json({
        message: "Order placed successfully",
        orderId: order.id
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
          ...serializeOrderWithReturnMeta(order),
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

      const result = [];

      for (const order of orders) {
        const items = await OrderItem.findAll({
          where: { order_id: order.id },
          include: [
            { model: Product, attributes: ["name", "quantity", "image"] }
          ]
        });

        result.push({
          ...serializeOrderWithReturnMeta(order),
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

      // Deduct stock
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);

        if (product.quantity < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${product.name}`
          });
        }

        await product.update({
          quantity: product.quantity - item.quantity
        });
      }

      // compute randomized delivery ETA between 2 and 10 minutes
      const minutes = Math.floor(Math.random() * 9) + 2; // 2..10
      const deliveredAt = new Date(Date.now() + minutes * 60 * 1000);

      await order.update({ status: "dispatched", delivered_at: deliveredAt });

      // schedule background update to "delivered" after delay
      setTimeout(async () => {
        try {
          const o = await Order.findByPk(order.id);
          if (o && o.status === "dispatched") {
            await o.update({ status: "delivered", delivered_at: new Date() });
            console.log(`Order ${o.id} automatically marked delivered at ${new Date().toISOString()}`);
          }
        } catch (err) {
          console.error('auto-deliver error for order', order.id, err);
        }
      }, minutes * 60 * 1000);

      res.json({ message: "Order dispatched successfully", eta_minutes: minutes, delivered_at: deliveredAt });

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
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { product_id, quantity } = req.body;
      const userId = req.user.id;
      const product = await Product.findByPk(product_id);
      if (!product) return res.status(404).json({ message: "Product not found" });
      if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
      // upsert
      let cartItem = await Cart.findOne({ where: { user_id: userId, product_id } });
      if (cartItem) {
        cartItem.quantity += quantity;
        await cartItem.save();
      } else {
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
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { quantity } = req.body;
      const cartItem = await Cart.findByPk(req.params.id);
      if (!cartItem || cartItem.user_id !== req.user.id) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      if (quantity <= 0) return res.status(400).json({ message: "Invalid quantity" });
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
        attributes: ["id", "email", "role", "created_at"]
      });
      res.json(user);
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

      const itemsWithBase64 = items.map(item => {
        const obj = item.toJSON();
        if (obj.Product.image && Buffer.isBuffer(obj.Product.image)) {
          obj.Product.image = item.Product.image.toString('base64');
        }
        return obj;
      });

      res.json({
        ...serializeOrderWithReturnMeta(order),
        items: itemsWithBase64
      });
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

      const deadline = getReturnDeadline(order);
      if (!deadline || Date.now() > deadline.getTime()) {
        return res.status(400).json({
          message: `Return window closed. Returns are allowed for ${RETURN_WINDOW_DAYS} days after delivery.`
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

      // allow both roles to cancel
      await order.update({ status: "cancelled" });

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

      res.json({
        revenueByMonth,
        monthlyOrders,
        mostSoldProduct,
        mostProfitableCategory
      });
    } catch (err) {
      console.error("reports/overview error", err);
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  }
);


app.listen(5000, () => {
  console.log('Server is listening on port 5000');
});
