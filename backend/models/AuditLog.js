import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(120), allowNull: false },
    details: { type: DataTypes.TEXT, allowNull: true }
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    underscored: true,
    updatedAt: false
  }
);

export default AuditLog;
