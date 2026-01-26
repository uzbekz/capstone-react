import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const Order = sequelize.define("Order", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

  customer_id: { type: DataTypes.INTEGER, allowNull: false },

  status: {
    type: DataTypes.ENUM("pending", "dispatched", "cancelled"),
    defaultValue: "pending"
  },

  total_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }

}, {
  tableName: "orders",
  timestamps: true,
  underscored: true
});

export default Order;
