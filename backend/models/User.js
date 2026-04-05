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

  isValid: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },

  reset_password_token: {
    type: DataTypes.STRING,
    allowNull: true
  },

  reset_password_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },

  email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },

  email_verification_token: {
    type: DataTypes.STRING,
    allowNull: true
  },

  email_verification_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },

  failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },

  lock_until: {
    type: DataTypes.DATE,
    allowNull: true
  },

  address_line1: { type: DataTypes.STRING(200), allowNull: true },
  address_line2: { type: DataTypes.STRING(200), allowNull: true },
  city: { type: DataTypes.STRING(100), allowNull: true },
  postal_code: { type: DataTypes.STRING(30), allowNull: true },
  country: { type: DataTypes.STRING(80), allowNull: true }

}, {
  tableName: "users",
  timestamps: true,
  underscored: true
});

export default User;
