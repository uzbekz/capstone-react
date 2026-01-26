import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  name: {
    type: DataTypes.STRING(150), // sequlaize will automatically convert this to VARCHAR(150)
    allowNull: false
  },

  description: {
    type: DataTypes.TEXT
  },

  category: {
    type: DataTypes.STRING(100)
  },

  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },

  weight: {
    type: DataTypes.DECIMAL(8, 2)
  },

  image: {
    type: DataTypes.BLOB('long')   // LONGBLOB
  }

}, {
  tableName: 'products',
  timestamps: true,   // createdAt & updatedAt
  underscored: true  // created_at, updated_at
});

export default Product;