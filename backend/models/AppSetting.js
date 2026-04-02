import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const AppSetting = sequelize.define("AppSetting", {
  key: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  value: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: "app_settings",
  timestamps: true,
  underscored: true
});

export default AppSetting;
