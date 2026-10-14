-- Creates a separate database for the integration tests (npm test)
CREATE DATABASE IF NOT EXISTS ecommerce_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON ecommerce_test.* TO 'ecommerce'@'%';
FLUSH PRIVILEGES;
USE ecommerce_test;
SOURCE /docker-entrypoint-initdb.d/01-schema.sql;
