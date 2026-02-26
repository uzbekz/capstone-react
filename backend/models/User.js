import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },

  password: {
    type: DataTypes.STRING,
    allowNull: false
  },

  role: {
    type: DataTypes.ENUM("customer", "product_manager"),
    defaultValue: "customer"
  },

  admin_status: {
    type: DataTypes.ENUM("approved", "pending", "rejected"),
    allowNull: false,
    defaultValue: "approved"
  },

  reset_password_token: {
    type: DataTypes.STRING,
    allowNull: true
  },

  reset_password_expires: {
    type: DataTypes.DATE,
    allowNull: true
  }

}, {
  tableName: "users",
  timestamps: true,
  underscored: true
});

export default User;
