import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const Order = sequelize.define("Order", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  customer_id: { type: DataTypes.INTEGER, allowNull: false },

  status: {
    type: DataTypes.ENUM("pending", "dispatched", "delivered", "returned", "cancelled"),
    defaultValue: "pending"
  },

  total_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  delivered_at: { type: DataTypes.DATE, allowNull: true },

  dispatched_at: { type: DataTypes.DATE, allowNull: true },

  internal_cancel_note: { type: DataTypes.TEXT, allowNull: true },

  idempotency_key: { type: DataTypes.STRING(120), allowNull: true },

  coupon_code: { type: DataTypes.STRING(40), allowNull: true },
  discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },

  ship_line1: { type: DataTypes.STRING(200), allowNull: true },
  ship_city: { type: DataTypes.STRING(100), allowNull: true },
  ship_postal: { type: DataTypes.STRING(30), allowNull: true },
  ship_country: { type: DataTypes.STRING(80), allowNull: true }

}, {
  tableName: "orders",
  timestamps: true,
  underscored: true
});

export default Order;
