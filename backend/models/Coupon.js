import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const Coupon = sequelize.define(
  "Coupon",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    discount_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: { min: 0, max: 100 }
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    max_uses: { type: DataTypes.INTEGER, allowNull: true },
    uses_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  },
  {
    tableName: "coupons",
    timestamps: true,
    underscored: true
  }
);

export default Coupon;
