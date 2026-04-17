import {
  createServiceApp,
  getNumericSetting,
  serializeOrderWithReturnMeta,
  availableToSell,
  reserveStockForLines,
  releaseReservationForOrder,
  orderPlacementLimiter,
  MS_PER_DAY,
  getReturnDeadline
} from './shared.js';
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import Product from '../models/Product.js';
import User from '../models/User.js';
import AuditLog from "../models/AuditLog.js";
import { authenticate, authorize } from '../middleware/auth.js';
import sequelize from '../db.js';
import { Op } from "sequelize";
import { writeAudit } from "../lib/auditLog.js";
import {
  sendOrderEmail,
  orderPlacedBody,
  orderDispatchedBody,
  orderCancelledBody,
  orderDeliveredBody
} from "../lib/orderMail.js";

const app = createServiceApp();

app.post(
  "/orders",
  orderPlacementLimiter,
  authenticate,
  authorize("customer"),
  async (req, res) => {
    try {
      const { items, ship_line1, ship_city, ship_postal, ship_country } = req.body || {};
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

      const SHIPPING_CHARGE = await getNumericSetting("shipping_charge");
      const total = subtotal + SHIPPING_CHARGE;

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
            coupon_code: null,
            discount_amount: 0,
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

        await t.commit();
      } catch (inner) {
        await t.rollback();
        if (String(inner.message).startsWith("INSUFFICIENT_STOCK:")) {
          return res.status(400).json({
            message: `Not enough stock for ${inner.message.split(":")[0]}`
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
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      const dateFrom  = req.query.dateFrom;
      const dateTo    = req.query.dateTo;
      const statusParam = req.query.status;
      const emailParam  = req.query.email;
      const whereClause = {};

      if (statusParam) {
        const statuses = statusParam.split(",").map(s => s.trim()).filter(Boolean);
        whereClause.status = statuses.length === 1 ? statuses[0] : { [Op.in]: statuses };
      }

      if (dateFrom || dateTo) {
        const start = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : new Date(0);
        const end   = dateTo   ? new Date(`${dateTo}T23:59:59.999Z`)   : new Date();
        whereClause.created_at = { [Op.between]: [start, end] };
      }

      const userWhere = emailParam
        ? { email: { [Op.like]: `%${emailParam}%` } }
        : undefined;

      const [{ count, rows: orders }, returnWindowDays] = await Promise.all([
        Order.findAndCountAll({
          where: whereClause,
          order: [["created_at", "DESC"]],
          limit,
          offset,
          subQuery: false,
          distinct: true,
          col: "id",
          include: [
            {
              model: User,
              attributes: ["email"],
              ...(userWhere ? { where: userWhere } : {})
            },
            {
              model: OrderItem,
              as: "OrderItems",
              include: [{ model: Product, attributes: ["name"] }]
            }
          ]
        }),
        getNumericSetting("return_window_days")
      ]);

      const result = orders.map(order => ({
        ...serializeOrderWithReturnMeta({
          ...order.toJSON(),
          return_window_days: returnWindowDays
        }),
        customer_email: order.User?.email ?? null,
        items: order.OrderItems
      }));

      res.json({
        data: result,
        pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) }
      });
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
      if (order.status !== "pending") return res.status(400).json({ message: "Order already processed" });

      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      const now = new Date();
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);
        if (product.quantity < item.quantity) {
          return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
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

      await order.update({ status: "dispatched", delivered_at: deliveredAt, dispatched_at: now });

      setTimeout(async () => {
        try {
          const o = await Order.findByPk(order.id);
          if (o && o.status === "dispatched") {
            await o.update({ status: "delivered", delivered_at: new Date() });
            const custD = await User.findByPk(o.customer_id);
            if (custD?.email) {
              const { subject, text } = orderDeliveredBody(o.id);
              sendOrderEmail(custD.email, subject, text).catch(() => null);
            }
          }
        } catch (err) {
          console.error(err);
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

        const items = await OrderItem.findAll({ where: { order_id: order.id } });
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
            cancelReason = `Insufficient stock for ${name}`;
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

        const minutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;
        const deliveredAt = new Date(Date.now() + minutes * 60 * 1000);

        await order.update({ status: "dispatched", delivered_at: deliveredAt, dispatched_at: dispatchNow });
        
        const orderId = order.id;
        setTimeout(async () => {
          try {
            const o = await Order.findByPk(orderId);
            if (o && o.status === "dispatched") {
               await o.update({ status: "delivered", delivered_at: new Date() });
               const custD = await User.findByPk(o.customer_id);
               if (custD?.email) {
                 const { subject, text } = orderDeliveredBody(o.id);
                 sendOrderEmail(custD.email, subject, text).catch(() => null);
               }
            }
          } catch(err) { console.error(err); }
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
        message: cancelled.length === 0 ? "No pending orders to cancel." : `Cancelled ${cancelled.length} pending order(s).`,
        cancelled
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/orders/:id",
  authenticate,
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (req.user.role === "customer" && order.customer_id !== req.user.id) return res.status(403).json({ message: "Forbidden" });

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
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.customer_id !== req.user.id) return res.status(403).json({ message: "Forbidden" });
      if (order.status !== "delivered") return res.status(400).json({ message: "Only delivered orders can be returned" });

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

      const items = await OrderItem.findAll({ where: { order_id: order.id } });
      for (const item of items) {
        const product = await Product.findByPk(item.product_id);
        if (!product) continue;
        await product.update({ quantity: product.quantity + item.quantity });
      }

      await order.update({ status: "returned" });
      res.json({ message: "Order returned successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  "/orders/:id/cancel",
  authenticate,
  async (req, res) => {
    try {
      const order = await Order.findByPk(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.status !== "pending") return res.status(400).json({ message: "Order already processed" });
      if (req.user.role === "customer" && order.customer_id !== req.user.id) return res.status(403).json({ message: "Forbidden" });

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
      res.status(500).json({ error: err.message });
    }
  }
);

// Reports
app.get(
  "/reports/overview",
  authenticate,
  authorize("product_manager"),
  async (req, res) => {
    try {
      const revenueRows = await Order.findAll({
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
          [sequelize.fn('SUM', sequelize.col('total_price')), 'revenue']
        ],
        group: ['month'],
        order: [[sequelize.literal('month'), 'ASC']]
      });
      const revenueByMonth = revenueRows.map(r => ({ month: r.get('month'), revenue: parseFloat(r.get('revenue')) }));

      const ordersRows = await Order.findAll({
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('created_at'), '%Y-%m'), 'month'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'orders']
        ],
        group: ['month'],
        order: [[sequelize.literal('month'), 'ASC']]
      });
      const monthlyOrders = ordersRows.map(r => ({ month: r.get('month'), orders: parseInt(r.get('orders'), 10) }));

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
      const mostSoldProduct = soldRows.length ? {
            product_id: soldRows[0].product_id,
            name: soldRows[0].Product?.name,
            sold: parseInt(soldRows[0].get('sold'), 10)
          } : null;

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
      const mostProfitableCategory = profitRows.length ? {
            category: profitRows[0].get('category'),
            profit: parseFloat(profitRows[0].get('profit'))
          } : null;

      const pendingOrders = await Order.count({ where: { status: "pending" } });
      const sevenDaysAgo = new Date(Date.now() - 7 * MS_PER_DAY);
      const ordersLast7Days = await Order.count({ where: { created_at: { [Op.gte]: sevenDaysAgo } } });
      const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
      const cancelledLast30Days = await Order.count({
        where: { status: "cancelled", created_at: { [Op.gte]: thirtyDaysAgo } }
      });

      res.json({
        revenueByMonth,
        monthlyOrders,
        mostSoldProduct,
        mostProfitableCategory,
        funnel: { pendingOrders, ordersLast7Days, cancelledLast30Days }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
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
      res.json(rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          action: r.action,
          details: r.details,
          user: r.User ? { id: r.User.id, email: r.User.email } : null
        })));
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
      const lines = ["id,customer_id,status,total_price,created_at"];
      for (const o of orders) {
        const row = o.toJSON();
        lines.push([row.id, row.customer_id, row.status, row.total_price, row.created_at].join(","));
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
        lines.push([
            row.id,
            JSON.stringify(row.name || ""),
            JSON.stringify(row.category || ""),
            row.quantity,
            row.reserved_quantity ?? 0,
            row.price
          ].join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="low-stock.csv"');
      res.send(lines.join("\n"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);


const PORT = 5003;
app.listen(PORT, () => {
    console.log(`Order Service listening on port ${PORT}`);
});
