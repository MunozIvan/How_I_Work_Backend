-- E-commerce schema (MySQL 8)
-- Prices are stored in cents (INT) to avoid floating point rounding errors.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(120) NOT NULL,
  role          ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT NULL,
  price_cents INT UNSIGNED NOT NULL,
  stock       INT UNSIGNED NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_products_category (category_id),
  KEY idx_products_active_created (is_active, created_at),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('pending', 'paid', 'shipped', 'cancelled') NOT NULL DEFAULT 'pending',
  total_cents INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_orders_user (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id         INT UNSIGNED NOT NULL,
  product_id       INT UNSIGNED NOT NULL,
  quantity         INT UNSIGNED NOT NULL,
  unit_price_cents INT UNSIGNED NOT NULL,
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
