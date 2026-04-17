import { createServiceApp, enrichProductJson } from './shared.js';
import multer from 'multer';
import Product from '../models/Product.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { writeAudit } from "../lib/auditLog.js";
import { Op } from "sequelize";
import { deleteProductImage, uploadProductImage } from "../lib/s3.js";

const app = createServiceApp();
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get("/products", async (req, res) => {
  try {
    const { search, category, sort } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { category: { [Op.like]: `%${search}%` } }
      ];
    }

    if (category && category !== "all") {
      where.category = category;
    }

    const order = [];
    if (sort === "price-low-to-high") order.push(["price", "ASC"]);
    if (sort === "price-high-to-low") order.push(["price", "DESC"]);
    if (sort === "quantity-low-to-high") order.push(["quantity", "ASC"]);
    if (sort === "quantity-high-to-low") order.push(["quantity", "DESC"]);

    const products = await Product.findAll({ where, order });
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

app.post(
  '/products/add',
  authenticate,
  authorize('product_manager'),
  upload.single('image'),
  async (req, res) => {
    try {
      const { name, description, category, price, quantity, weight } = req.body;
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
        image_key: null,
        image_url: null
      });
      if (req.file) {
        const uploadedImage = await uploadProductImage(req.file, newProduct.id);
        await newProduct.update({
          image_key: uploadedImage.key,
          image_url: uploadedImage.url
        });
      }
      res.status(201).json(enrichProductJson(await Product.findByPk(newProduct.id)));
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
    try {
      const updateData = { ...req.body };
      const prev = await Product.findByPk(req.params.id);
      if (!prev) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (req.file) {
        const uploadedImage = await uploadProductImage(req.file, prev.id);
        updateData.image_key = uploadedImage.key;
        updateData.image_url = uploadedImage.url;
      }

      await Product.update(updateData, { where: { id: req.params.id } });
      if (req.file && prev.image_key) {
        deleteProductImage(prev.image_key).catch(() => null);
      }
      if (updateData.quantity != null && Number(updateData.quantity) !== Number(prev.quantity)) {
        await writeAudit(req.user.id, "product_restock", {
          product_id: prev.id,
          from: prev.quantity,
          to: updateData.quantity
        });
      }
      res.json({ message: "Product updated" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  '/products/:id',
  authenticate,
  authorize('product_manager'),
  async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    await Product.destroy({ where: { id: req.params.id } });
    if (product.image_key) {
      deleteProductImage(product.image_key).catch(() => null);
    }
    res.json({ message: "Product deleted" });
  }
);

const PORT = 5002;
app.listen(PORT, () => {
    console.log(`Product Service listening on port ${PORT}`);
});
