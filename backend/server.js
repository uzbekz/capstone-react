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
import { Op } from "sequelize";
OrderItem.belongsTo(Product, { foreignKey: "product_id" });


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
sequelize.sync()
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

        // Convert image buffers to base64 strings
        const itemsWithBase64 = items.map(item => {
          const itemObj = item.toJSON();
          if (itemObj.Product.image && Buffer.isBuffer(item.Product.image)) {
            itemObj.Product.image = item.Product.image.toString('base64');
          }
          return itemObj;
        });

        result.push({
          ...order.toJSON(),
          items: itemsWithBase64
        });
      }

      res.json(result);

    } catch (err) {
      res.status(500).json({ error: err.message });
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
          ...order.toJSON(),
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

      await order.update({ status: "dispatched" });

      res.json({ message: "Order dispatched successfully" });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/:id/cancel",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status !== "pending") {
        return res
          .status(400)
          .json({ message: "Order already processed" });
      }

      await order.update({ status: "cancelled" });

      res.json({ message: "Order cancelled successfully" });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);


app.listen(5000, () => {
  console.log('Server is listening on port 5000');
});
