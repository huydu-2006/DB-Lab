-- ============================================================================
-- BK-88 Stadium — Football Field Booking and Management System
-- MySQL 8.0+ (InnoDB) schema, constraints, indexes, triggers, and views.
--
-- Conventions
--   * utf8mb4 / utf8mb4_0900_ai_ci  — full Unicode (Vietnamese addresses).
--   * INT UNSIGNED AUTO_INCREMENT surrogate PKs (single-DB app).
--   * DECIMAL(12,2) for VND money (no fractions, stored exactly).
--   * Auditing: created_at / updated_at on every operational table.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS bk88_stadium
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE bk88_stadium;

-- ----------------------------------------------------------------------------
-- 1. USERS — synced from Clerk (Google OAuth / email+password)
-- ----------------------------------------------------------------------------
CREATE TABLE USERS (
  user_id        INT UNSIGNED AUTO_INCREMENT,
  clerk_user_id  VARCHAR(191)     NOT NULL,
  full_name      VARCHAR(150)     NOT NULL,
  email          VARCHAR(191)     NOT NULL,
  phone          VARCHAR(20)      NULL,
  auth_provider  ENUM('CLERK', 'GOOGLE') NOT NULL DEFAULT 'CLERK',
  role           ENUM('CUSTOMER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  team_name      VARCHAR(150)     NULL,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_clerk_id (clerk_user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone)      -- MySQL allows multiple NULLs
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 2. FIELDS — pitch inventory (columns mirror the frontend Pitch model)
-- ----------------------------------------------------------------------------
CREATE TABLE FIELDS (
  field_id            INT UNSIGNED AUTO_INCREMENT,
  name                VARCHAR(120)    NOT NULL,
  address             VARCHAR(255)    NOT NULL,
  district            VARCHAR(80)     NOT NULL,
  field_type          ENUM('5v5', '7v7', '11v11') NOT NULL,
  surface_type        ENUM('ARTIFICIAL_TURF', 'NATURAL_GRASS') NOT NULL,
  base_price_per_hour DECIMAL(12, 2)  NOT NULL,
  rating              DECIMAL(2, 1)   NOT NULL DEFAULT 0.0,
  review_count        INT UNSIGNED    NOT NULL DEFAULT 0,
  -- Fixed amenity flags presented on pitch cards. A normalized junction table
  -- would be overkill for this never-queried display-only attribute set.
  amenities           SET('FLOODLIGHTS', 'CHANGING_ROOMS', 'PARKING', 'SHOWERS',
                           'CAFE', 'FREE_WIFI', 'EQUIPMENT_HIRE', 'FIRST_AID')
                                    NOT NULL DEFAULT '',
  open_time           TIME            NOT NULL DEFAULT '06:00:00',
  close_time          TIME            NOT NULL DEFAULT '22:00:00',
  status              ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') NOT NULL
                                    DEFAULT 'ACTIVE',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (field_id),
  UNIQUE KEY uq_fields_name (name),
  KEY idx_fields_type_status (field_type, status),
  CONSTRAINT chk_fields_price CHECK (base_price_per_hour >= 0),
  CONSTRAINT chk_fields_hours CHECK (close_time > open_time)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 3. PRICING_RULES — time-of-day / day-of-week dynamic pricing per pitch
-- ----------------------------------------------------------------------------
CREATE TABLE PRICING_RULES (
  rule_id        INT UNSIGNED AUTO_INCREMENT,
  field_id       INT UNSIGNED    NOT NULL,
  day_of_week    TINYINT UNSIGNED NOT NULL,       -- 0=Sun .. 6=Sat
  start_time     TIME            NOT NULL,
  end_time       TIME            NOT NULL,
  price_per_hour DECIMAL(12, 2)  NOT NULL,
  label          ENUM('OFF_PEAK', 'PEAK', 'WEEKEND') NOT NULL,
  PRIMARY KEY (rule_id),
  KEY idx_pricing_field_day (field_id, day_of_week),
  CONSTRAINT fk_pricing_field
    FOREIGN KEY (field_id) REFERENCES FIELDS (field_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_pricing_window CHECK (end_time > start_time),
  CONSTRAINT chk_pricing_dow
    CHECK (day_of_week BETWEEN 0 AND 6)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 4. SERVICES — add-on matchday catalogue with on-site stock
-- ----------------------------------------------------------------------------
CREATE TABLE SERVICES (
  service_id     INT UNSIGNED AUTO_INCREMENT,
  name           VARCHAR(120)   NOT NULL,
  unit           ENUM('BOTTLE', 'MATCH', 'HOUR', 'PIECE') NOT NULL,
  unit_price     DECIMAL(12, 2) NOT NULL,
  stock_quantity INT            NOT NULL DEFAULT 0,
  is_active      TINYINT(1)     NOT NULL DEFAULT 1,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id),
  UNIQUE KEY uq_services_name (name),
  CONSTRAINT chk_services_price CHECK (unit_price >= 0),
  CONSTRAINT chk_services_stock CHECK (stock_quantity >= 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 5. BOOKINGS — core reservation table.
--    total_amount is a STORED generated column: pitch + services is always
--    consistent; only the two source amounts are ever written.
-- ----------------------------------------------------------------------------
CREATE TABLE BOOKINGS (
  booking_id    INT UNSIGNED AUTO_INCREMENT,
  user_id       INT UNSIGNED  NOT NULL,
  field_id      INT UNSIGNED  NOT NULL,
  booking_date  DATE          NOT NULL,
  start_time    TIME          NOT NULL,
  end_time      TIME          NOT NULL,
  status        ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
                              NOT NULL DEFAULT 'PENDING',
  pitch_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  service_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount  DECIMAL(13,2) GENERATED ALWAYS AS (pitch_amount + service_amount)
                              STORED,
  notes         VARCHAR(500)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (booking_id),
  -- serves both the availability lookup and the trigger's overlap probe
  KEY idx_bookings_slot (field_id, booking_date, start_time, end_time),
  KEY idx_bookings_user (user_id, booking_date),
  KEY idx_bookings_status (status),
  CONSTRAINT fk_bookings_user
    FOREIGN KEY (user_id) REFERENCES USERS (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_bookings_field
    FOREIGN KEY (field_id) REFERENCES FIELDS (field_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_bookings_time CHECK (end_time > start_time),
  CONSTRAINT chk_bookings_amounts
    CHECK (pitch_amount >= 0 AND service_amount >= 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 6. BOOKING_SERVICES — line items linking bookings to add-on services.
--    unit_price_snapshot keeps the historical price so later catalogue price
--    changes never rewrite past invoices; subtotal is derived, not duplicated.
-- ----------------------------------------------------------------------------
CREATE TABLE BOOKING_SERVICES (
  booking_service_id INT UNSIGNED AUTO_INCREMENT,
  booking_id         INT UNSIGNED  NOT NULL,
  service_id         INT UNSIGNED  NOT NULL,
  quantity           INT           NOT NULL,
  unit_price_snapshot DECIMAL(12,2) NOT NULL,
  subtotal           DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price_snapshot)
                                   STORED,
  created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (booking_service_id),
  UNIQUE KEY uq_booking_service (booking_id, service_id),
  CONSTRAINT fk_bsvc_booking
    FOREIGN KEY (booking_id) REFERENCES BOOKINGS (booking_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bsvc_service
    FOREIGN KEY (service_id) REFERENCES SERVICES (service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_bsvc_quantity CHECK (quantity > 0),
  CONSTRAINT chk_bsvc_price CHECK (unit_price_snapshot >= 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS — deposits (30%), settlements, and refunds per booking
-- ----------------------------------------------------------------------------
CREATE TABLE PAYMENTS (
  payment_id     INT UNSIGNED AUTO_INCREMENT,
  booking_id     INT UNSIGNED  NOT NULL,
  recorded_by    INT UNSIGNED  NULL,             -- staff/admin who took the money
  amount         DECIMAL(12,2) NOT NULL,
  payment_type   ENUM('DEPOSIT', 'FULL', 'REMAINDER', 'REFUND') NOT NULL,
  payment_method ENUM('CASH', 'BANK_TRANSFER', 'E_WALLET', 'CARD') NOT NULL,
  payment_status ENUM('PENDING', 'PAID', 'FAILED') NOT NULL DEFAULT 'PENDING',
  paid_at        DATETIME      NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  KEY idx_payments_booking (booking_id),
  KEY idx_payments_created (created_at),          -- daily revenue reports
  CONSTRAINT fk_payments_booking
    FOREIGN KEY (booking_id) REFERENCES BOOKINGS (booking_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (recorded_by) REFERENCES USERS (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------------------------
-- 8. MAINTENANCE_LOGS — pitch downtime windows (block availability UI)
-- ----------------------------------------------------------------------------
CREATE TABLE MAINTENANCE_LOGS (
  maintenance_id  INT UNSIGNED AUTO_INCREMENT,
  field_id        INT UNSIGNED  NOT NULL,
  start_datetime  DATETIME      NOT NULL,
  end_datetime    DATETIME      NOT NULL,
  description     VARCHAR(500)  NULL,
  cost            DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (maintenance_id),
  KEY idx_maintenance_field (field_id, start_datetime, end_datetime),
  CONSTRAINT fk_maintenance_field
    FOREIGN KEY (field_id) REFERENCES FIELDS (field_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_maintenance_window CHECK (end_datetime > start_datetime),
  CONSTRAINT chk_maintenance_cost CHECK (cost >= 0)
) ENGINE = InnoDB;

-- ============================================================================
-- TRIGGERS — double-booking prevention (paired with SELECT ... FOR UPDATE
-- transactions in the backend, this is the last line of defence).
-- ============================================================================

DELIMITER $$

CREATE TRIGGER trg_bookings_no_overlap_ins
BEFORE INSERT ON BOOKINGS
FOR EACH ROW
BEGIN
  DECLARE v_conflicts INT DEFAULT 0;
  IF NEW.status IN ('PENDING', 'CONFIRMED') THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM BOOKINGS
    WHERE field_id = NEW.field_id
      AND booking_date = NEW.booking_date
      AND status IN ('PENDING', 'CONFIRMED')
      AND NEW.start_time < end_time
      AND NEW.end_time > start_time;
    IF v_conflicts > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Slot conflict: this pitch is already booked in the requested time window';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_bookings_no_overlap_upd
BEFORE UPDATE ON BOOKINGS
FOR EACH ROW
BEGIN
  DECLARE v_conflicts INT DEFAULT 0;
  IF NEW.status IN ('PENDING', 'CONFIRMED')
     AND (NEW.field_id   <> OLD.field_id
       OR NEW.booking_date <> OLD.booking_date
       OR NEW.start_time  <> OLD.start_time
       OR NEW.end_time     <> OLD.end_time) THEN
    SELECT COUNT(*) INTO v_conflicts
    FROM BOOKINGS
    WHERE field_id = NEW.field_id
      AND booking_date = NEW.booking_date
      AND status IN ('PENDING', 'CONFIRMED')
      AND booking_id <> OLD.booking_id
      AND NEW.start_time < end_time
      AND NEW.end_time > start_time;
    IF v_conflicts > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Slot conflict: this pitch is already booked in the requested time window';
    END IF;
  END IF;
END$$

-- Keep BOOKINGS.service_amount in sync with its line items, so
-- total_amount (generated) always matches the invoice recalculation rule.
CREATE TRIGGER trg_bsvc_recalc_ins
AFTER INSERT ON BOOKING_SERVICES
FOR EACH ROW
BEGIN
  UPDATE BOOKINGS
     SET service_amount = (
           SELECT COALESCE(SUM(subtotal), 0)
           FROM BOOKING_SERVICES
           WHERE booking_id = NEW.booking_id
         )
   WHERE booking_id = NEW.booking_id;
END$$

CREATE TRIGGER trg_bsvc_recalc_upd
AFTER UPDATE ON BOOKING_SERVICES
FOR EACH ROW
BEGIN
  UPDATE BOOKINGS
     SET service_amount = (
           SELECT COALESCE(SUM(subtotal), 0)
           FROM BOOKING_SERVICES
           WHERE booking_id = NEW.booking_id
         )
   WHERE booking_id = NEW.booking_id;
END$$

CREATE TRIGGER trg_bsvc_recalc_del
AFTER DELETE ON BOOKING_SERVICES
FOR EACH ROW
BEGIN
  UPDATE BOOKINGS
     SET service_amount = (
           SELECT COALESCE(SUM(subtotal), 0)
           FROM BOOKING_SERVICES
           WHERE booking_id = OLD.booking_id
         )
   WHERE booking_id = OLD.booking_id;
END$$

DELIMITER ;

-- ============================================================================
-- VIEWS — analytical read models for the Admin dashboard (GET /api/reports/*)
-- ============================================================================

CREATE OR REPLACE VIEW vw_revenue_daily AS
SELECT DATE(p.paid_at)                       AS payment_date,
       f.field_id,
       f.name                                AS field_name,
       f.field_type,
       SUM(p.amount)                         AS revenue,
       COUNT(DISTINCT p.booking_id)          AS paid_bookings
FROM PAYMENTS p
JOIN BOOKINGS b  ON b.booking_id = p.booking_id
JOIN FIELDS   f  ON f.field_id   = b.field_id
WHERE p.payment_status = 'PAID'
GROUP BY DATE(p.paid_at), f.field_id, f.name, f.field_type;

CREATE OR REPLACE VIEW vw_field_utilization AS
SELECT f.field_id,
       f.name                                        AS field_name,
       b.booking_date,
       SUM(TIME_TO_SEC(TIMEDIFF(b.end_time, b.start_time)) / 3600) AS booked_hours,
       ROUND(
         SUM(TIME_TO_SEC(TIMEDIFF(b.end_time, b.start_time)) / 3600)
         / (TIME_TO_SEC(TIMEDIFF(f.close_time, f.open_time)) / 3600) * 100,
         2
       )                                            AS utilization_pct
FROM BOOKINGS b
JOIN FIELDS f ON f.field_id = b.field_id
WHERE b.status IN ('CONFIRMED', 'COMPLETED')
GROUP BY f.field_id, f.name, b.booking_date;

CREATE OR REPLACE VIEW vw_customer_stats AS
SELECT u.user_id,
       u.full_name,
       COUNT(b.booking_id)                                   AS total_bookings,
       SUM(b.total_amount)                                   AS lifetime_value,
       SUM(b.status = 'CANCELLED')                            AS cancellations,
       SUM(b.status = 'NO_SHOW')                             AS no_shows
FROM USERS u
LEFT JOIN BOOKINGS b ON b.user_id = u.user_id
GROUP BY u.user_id, u.full_name;
