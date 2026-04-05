import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const WishlistItem = sequelize.define(
  "WishlistItem",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    product_id: { type: DataTypes.INTEGER, allowNull: false }
  },
  {
    tableName: "wishlist_items",
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ["user_id", "product_id"] }]
  }
);

export default WishlistItem;
