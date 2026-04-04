import { DataTypes } from "sequelize";
import sequelize from "../db.js";

const UserSession = sequelize.define("UserSession", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  refresh_token_hash: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  csrf_token_hash: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  replaced_by_session_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: "user_sessions",
  timestamps: true,
  underscored: true
});

export default UserSession;
