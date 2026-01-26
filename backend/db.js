import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('products_db', 'springstudent', 'springstudent', {
  host: 'localhost',
  dialect: 'mysql'
});

export default sequelize;