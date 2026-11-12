-- ============================================================================
-- BK-88 Stadium — Football Field Booking and Management System
-- Microsoft SQL Server schema, constraints, indexes, triggers, and views.
--
-- Translation notes from the previous MySQL 8.0 version:
--   * ENUM columns   -> NVARCHAR + CHECK (col IN (...)) domain constraints.
--   * AUTO_INCREMENT -> IDENTITY(1,1).
--   * SET amenities  -> comma-separated NVARCHAR with a character-class CHECK.
--   * Generated cols  -> computed columns PERSISTED (same invariant purpose).
--   * BEFORE INSERT/UPDATE overlap triggers (SIGNAL SQLSTATE '45000')
--                     -> AFTER INSERT/UPDATE triggers (ROLLBACK + THROW 50001).
--   * updated_at     -> dropped: SQL Server has no ON UPDATE CURRENT_TIMESTAMP;
--                       auditability is covered by created_at + status history.
--   * utf8mb4         -> NVARCHAR (Unicode-native, Vietnamese addresses).
-- ============================================================================

IF DB_ID(N'BK88_STADIUM') IS NULL
    CREATE DATABASE BK88_STADIUM;
GO
USE BK88_STADIUM;
GO
-- Required for PERSISTED computed columns and indexed views; sqlcmd sessions
-- sometimes open with these off.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ANSI_PADDING ON;
GO

-- ----------------------------------------------------------------------------
-- 1. USERS — synced from Clerk (Google OAuth / email+password)
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.USERS', N'U') IS NULL
CREATE TABLE dbo.USERS (
  user_id        INT IDENTITY(1,1),
  clerk_user_id  NVARCHAR(191)  NOT NULL,
  full_name      NVARCHAR(150)  NOT NULL,
  email          NVARCHAR(191)  NOT NULL,
  phone          NVARCHAR(20)   NULL,
  auth_provider  NVARCHAR(10)   NOT NULL DEFAULT N'CLERK',
  role           NVARCHAR(10)   NOT NULL DEFAULT N'CUSTOMER',
  team_name      NVARCHAR(150)  NULL,
  created_at     DATETIME2      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_USERS PRIMARY KEY (user_id),
  CONSTRAINT UQ_USERS_clerk_id UNIQUE (clerk_user_id),
  CONSTRAINT UQ_USERS_email UNIQUE (email),
  -- phone uniqueness is a FILTERED index (below): SQL Server UNIQUE constraints
  -- allow only a single NULL, but many users legitimately have no phone number.
  CONSTRAINT CHK_USERS_auth_provider CHECK (auth_provider IN (N'CLERK', N'GOOGLE')),
  CONSTRAINT CHK_USERS_role CHECK (role IN (N'CUSTOMER', N'STAFF', N'ADMIN'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_USERS_phone'
               AND object_id = OBJECT_ID(N'dbo.USERS'))
CREATE UNIQUE INDEX UQ_USERS_phone ON dbo.USERS (phone) WHERE phone IS NOT NULL;
GO

-- ----------------------------------------------------------------------------
-- 2. FIELDS — pitch inventory (columns mirror the frontend Pitch model)
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.FIELDS', N'U') IS NULL
CREATE TABLE dbo.FIELDS (
  field_id            INT IDENTITY(1,1),
  name                NVARCHAR(120)    NOT NULL,
  address             NVARCHAR(255)    NOT NULL,
  district            NVARCHAR(80)     NOT NULL,
  -- Provider-agnostic geolocation (WGS-84). The app currently renders a plain
  -- Google Maps search link; coordinates let any future map provider / embed
  -- / navigation deep-link consume the same data without a schema change.
  latitude            DECIMAL(9, 6)    NULL,
  longitude           DECIMAL(9, 6)    NULL,
  field_type          NVARCHAR(5)      NOT NULL,
  surface_type        NVARCHAR(20)     NOT NULL,
  base_price_per_hour DECIMAL(12, 2)   NOT NULL,
  rating              DECIMAL(2, 1)   NOT NULL DEFAULT 0.0,
  review_count        INT              NOT NULL DEFAULT 0,
  -- Fixed amenity flags presented on pitch cards (comma-separated tokens).
  -- A normalized junction table would be overkill for this display-only,
  -- never-queried attribute set; the CHECK limits the character class.
  amenities           NVARCHAR(200)    NOT NULL DEFAULT N'',
  open_time           TIME             NOT NULL DEFAULT '06:00',
  close_time          TIME             NOT NULL DEFAULT '22:00',
  status              NVARCHAR(12)     NOT NULL DEFAULT N'ACTIVE',
  created_at          DATETIME2        NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_FIELDS PRIMARY KEY (field_id),
  CONSTRAINT UQ_FIELDS_name UNIQUE (name),
  CONSTRAINT CHK_FIELDS_type CHECK (field_type IN (N'5v5', N'7v7', N'11v11')),
  CONSTRAINT CHK_FIELDS_surface CHECK (surface_type IN (N'ARTIFICIAL_TURF', N'NATURAL_GRASS')),
  CONSTRAINT CHK_FIELDS_status CHECK (status IN (N'ACTIVE', N'MAINTENANCE', N'INACTIVE')),
  CONSTRAINT CHK_FIELDS_price CHECK (base_price_per_hour >= 0),
  CONSTRAINT CHK_FIELDS_hours CHECK (close_time > open_time),
  CONSTRAINT CHK_FIELDS_amenities CHECK (amenities NOT LIKE N'%[^A-Z_, ]%')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FIELDS_type_status' AND object_id = OBJECT_ID(N'dbo.FIELDS'))
CREATE INDEX IX_FIELDS_type_status ON dbo.FIELDS (field_type, status);
GO
-- Location columns added for Google Maps integration: guarded so re-running
-- the schema on an existing database is a no-op migration, not an error.
IF COL_LENGTH(N'dbo.FIELDS', N'latitude') IS NULL
    ALTER TABLE dbo.FIELDS ADD latitude DECIMAL(9, 6) NULL;
GO
IF COL_LENGTH(N'dbo.FIELDS', N'longitude') IS NULL
    ALTER TABLE dbo.FIELDS ADD longitude DECIMAL(9, 6) NULL;
GO

-- ----------------------------------------------------------------------------
-- 3. PRICING_RULES — time-of-day / day-of-week dynamic pricing per pitch
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.PRICING_RULES', N'U') IS NULL
CREATE TABLE dbo.PRICING_RULES (
  rule_id        INT IDENTITY(1,1),
  field_id       INT            NOT NULL,
  day_of_week    TINYINT        NOT NULL,        -- 0=Sun .. 6=Sat
  start_time     TIME           NOT NULL,
  end_time       TIME           NOT NULL,
  price_per_hour DECIMAL(12, 2) NOT NULL,
  label          NVARCHAR(10)   NOT NULL,
  CONSTRAINT PK_PRICING_RULES PRIMARY KEY (rule_id),
  CONSTRAINT FK_PRICING_field FOREIGN KEY (field_id) REFERENCES dbo.FIELDS (field_id)
    ON DELETE CASCADE,
  CONSTRAINT CHK_PRICING_window CHECK (end_time > start_time),
  CONSTRAINT CHK_PRICING_dow CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT CHK_PRICING_label CHECK (label IN (N'OFF_PEAK', N'PEAK', N'WEEKEND'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PRICING_field_day' AND object_id = OBJECT_ID(N'dbo.PRICING_RULES'))
CREATE INDEX IX_PRICING_field_day ON dbo.PRICING_RULES (field_id, day_of_week);
GO

-- ----------------------------------------------------------------------------
-- 4. SERVICES — add-on matchday catalogue with on-site stock
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.SERVICES', N'U') IS NULL
CREATE TABLE dbo.SERVICES (
  service_id     INT IDENTITY(1,1),
  name           NVARCHAR(120)   NOT NULL,
  unit           NVARCHAR(10)    NOT NULL,
  unit_price     DECIMAL(12, 2) NOT NULL,
  stock_quantity INT             NOT NULL DEFAULT 0,
  is_active      BIT             NOT NULL DEFAULT 1,
  created_at     DATETIME2       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_SERVICES PRIMARY KEY (service_id),
  CONSTRAINT UQ_SERVICES_name UNIQUE (name),
  CONSTRAINT CHK_SERVICES_unit CHECK (unit IN (N'BOTTLE', N'MATCH', N'HOUR', N'PIECE')),
  CONSTRAINT CHK_SERVICES_price CHECK (unit_price >= 0),
  CONSTRAINT CHK_SERVICES_stock CHECK (stock_quantity >= 0)
);
GO

-- ----------------------------------------------------------------------------
-- 5. BOOKINGS — core reservation table.
--    total_amount is a PERSISTED computed column: pitch + services is always
--    consistent; only the two source amounts are ever written.
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.BOOKINGS', N'U') IS NULL
CREATE TABLE dbo.BOOKINGS (
  booking_id     INT IDENTITY(1,1),
  user_id        INT             NOT NULL,
  field_id       INT             NOT NULL,
  booking_date   DATE             NOT NULL,
  start_time     TIME             NOT NULL,
  end_time       TIME             NOT NULL,
  status         NVARCHAR(12)     NOT NULL DEFAULT N'PENDING',
  pitch_amount   DECIMAL(12, 2)   NOT NULL DEFAULT 0,
  service_amount DECIMAL(12, 2)   NOT NULL DEFAULT 0,
  total_amount   AS (pitch_amount + service_amount) PERSISTED,
  notes          NVARCHAR(500)    NULL,
  created_at     DATETIME2       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_BOOKINGS PRIMARY KEY (booking_id),
  CONSTRAINT FK_BOOKINGS_user FOREIGN KEY (user_id) REFERENCES dbo.USERS (user_id),
  CONSTRAINT FK_BOOKINGS_field FOREIGN KEY (field_id) REFERENCES dbo.FIELDS (field_id),
  CONSTRAINT CHK_BOOKINGS_status
    CHECK (status IN (N'PENDING', N'CONFIRMED', N'COMPLETED', N'CANCELLED', N'NO_SHOW')),
  CONSTRAINT CHK_BOOKINGS_time CHECK (end_time > start_time),
  CONSTRAINT CHK_BOOKINGS_amounts CHECK (pitch_amount >= 0 AND service_amount >= 0)
);
GO
-- serves both the availability lookup and the triggers' overlap probes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BOOKINGS_slot' AND object_id = OBJECT_ID(N'dbo.BOOKINGS'))
CREATE INDEX IX_BOOKINGS_slot ON dbo.BOOKINGS (field_id, booking_date, start_time, end_time);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BOOKINGS_user' AND object_id = OBJECT_ID(N'dbo.BOOKINGS'))
CREATE INDEX IX_BOOKINGS_user ON dbo.BOOKINGS (user_id, booking_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BOOKINGS_status' AND object_id = OBJECT_ID(N'dbo.BOOKINGS'))
CREATE INDEX IX_BOOKINGS_status ON dbo.BOOKINGS (status);
GO

-- ----------------------------------------------------------------------------
-- 6. BOOKING_SERVICES — line items linking bookings to add-on services.
--    unit_price_snapshot keeps the historical price so later catalogue price
--    changes never rewrite past invoices; subtotal is derived, not duplicated.
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.BOOKING_SERVICES', N'U') IS NULL
CREATE TABLE dbo.BOOKING_SERVICES (
  booking_service_id  INT IDENTITY(1,1),
  booking_id          INT             NOT NULL,
  service_id          INT             NOT NULL,
  quantity            INT             NOT NULL,
  unit_price_snapshot DECIMAL(12, 2)  NOT NULL,
  subtotal            AS (quantity * unit_price_snapshot) PERSISTED,
  created_at          DATETIME2       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_BOOKING_SERVICES PRIMARY KEY (booking_service_id),
  CONSTRAINT UQ_BOOKING_SERVICE UNIQUE (booking_id, service_id),
  CONSTRAINT FK_BSVCS_booking FOREIGN KEY (booking_id) REFERENCES dbo.BOOKINGS (booking_id)
    ON DELETE CASCADE,
  CONSTRAINT FK_BSVCS_service FOREIGN KEY (service_id) REFERENCES dbo.SERVICES (service_id),
  CONSTRAINT CHK_BSVC_quantity CHECK (quantity > 0),
  CONSTRAINT CHK_BSVC_price CHECK (unit_price_snapshot >= 0)
);
GO

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS — deposits (30%), settlements, and refunds per booking
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.PAYMENTS', N'U') IS NULL
CREATE TABLE dbo.PAYMENTS (
  payment_id     INT IDENTITY(1,1),
  booking_id     INT             NOT NULL,
  recorded_by    INT             NULL,          -- staff/admin who took the money
  amount         DECIMAL(12, 2)  NOT NULL,
  payment_type   NVARCHAR(10)     NOT NULL,
  payment_method NVARCHAR(15)     NOT NULL,
  payment_status NVARCHAR(10)     NOT NULL DEFAULT N'PENDING',
  paid_at        DATETIME2        NULL,
  created_at     DATETIME2       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_PAYMENTS PRIMARY KEY (payment_id),
  CONSTRAINT FK_PAYMENTS_booking FOREIGN KEY (booking_id) REFERENCES dbo.BOOKINGS (booking_id)
    ON DELETE CASCADE,
  CONSTRAINT FK_PAYMENTS_user FOREIGN KEY (recorded_by) REFERENCES dbo.USERS (user_id)
    ON DELETE SET NULL,
  CONSTRAINT CHK_PAYMENTS_amount CHECK (amount >= 0),
  CONSTRAINT CHK_PAYMENTS_type CHECK (payment_type IN (N'DEPOSIT', N'FULL', N'REMAINDER', N'REFUND')),
  CONSTRAINT CHK_PAYMENTS_method CHECK (payment_method IN (N'CASH', N'BANK_TRANSFER', N'E_WALLET', N'CARD')),
  CONSTRAINT CHK_PAYMENTS_status CHECK (payment_status IN (N'PENDING', N'PAID', N'FAILED'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PAYMENTS_booking' AND object_id = OBJECT_ID(N'dbo.PAYMENTS'))
CREATE INDEX IX_PAYMENTS_booking ON dbo.PAYMENTS (booking_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_PAYMENTS_created' AND object_id = OBJECT_ID(N'dbo.PAYMENTS'))
CREATE INDEX IX_PAYMENTS_created ON dbo.PAYMENTS (created_at);   -- daily revenue reports
GO

-- ----------------------------------------------------------------------------
-- 8. MAINTENANCE_LOGS — pitch downtime windows (block availability UI)
-- ----------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.MAINTENANCE_LOGS', N'U') IS NULL
CREATE TABLE dbo.MAINTENANCE_LOGS (
  maintenance_id  INT IDENTITY(1,1),
  field_id        INT             NOT NULL,
  start_datetime  DATETIME2       NOT NULL,
  end_datetime    DATETIME2       NOT NULL,
  description     NVARCHAR(500)   NULL,
  cost            DECIMAL(12, 2)  NOT NULL DEFAULT 0,
  created_at      DATETIME2       NOT NULL DEFAULT GETDATE(),
  CONSTRAINT PK_MAINTENANCE_LOGS PRIMARY KEY (maintenance_id),
  CONSTRAINT FK_MAINTENANCE_field FOREIGN KEY (field_id) REFERENCES dbo.FIELDS (field_id)
    ON DELETE CASCADE,
  CONSTRAINT CHK_MAINTENANCE_window CHECK (end_datetime > start_datetime),
  CONSTRAINT CHK_MAINTENANCE_cost CHECK (cost >= 0)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MAINTENANCE_field'
               AND object_id = OBJECT_ID(N'dbo.MAINTENANCE_LOGS'))
CREATE INDEX IX_MAINTENANCE_field
  ON dbo.MAINTENANCE_LOGS (field_id, start_datetime, end_datetime);
GO

-- ============================================================================
-- TRIGGERS — double-booking prevention.
-- SQL Server has no BEFORE triggers: the AFTER triggers below roll the
-- statement back and re-raise via THROW, producing the same external
-- behaviour as the previous MySQL SIGNAL SQLSTATE '45000' design and pairing
-- with UPDLOCK/HOLDLOCK transaction hints in the backend.
-- ============================================================================

-- 5a. Reject overlapping INSERTs
CREATE OR ALTER TRIGGER dbo.trg_bookings_no_overlap_ins
ON dbo.BOOKINGS
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM dbo.BOOKINGS b
    JOIN inserted i
      ON b.field_id = i.field_id
     AND b.booking_date = i.booking_date
     AND b.booking_id <> i.booking_id
    WHERE b.status IN (N'PENDING', N'CONFIRMED')
      AND i.status IN (N'PENDING', N'CONFIRMED')
      AND i.start_time < b.end_time
      AND i.end_time > b.start_time
  )
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 50001, 'Slot conflict: this pitch is already booked in the requested time window', 1;
  END
END
GO

-- 5b. Reject overlapping time changes on UPDATE
--     (fires only when a slot-defining column actually changed; pure status
--     transitions and recalc-trigger writes never re-run the overlap check)
CREATE OR ALTER TRIGGER dbo.trg_bookings_no_overlap_upd
ON dbo.BOOKINGS
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (
    SELECT 1
    FROM inserted i
    JOIN deleted d ON d.booking_id = i.booking_id
    JOIN dbo.BOOKINGS b
      ON b.field_id = i.field_id
     AND b.booking_date = i.booking_date
     AND b.booking_id <> i.booking_id
    WHERE i.status IN (N'PENDING', N'CONFIRMED')
      AND (i.field_id <> d.field_id
        OR i.booking_date <> d.booking_date
        OR i.start_time <> d.start_time
        OR i.end_time <> d.end_time)
      AND b.status IN (N'PENDING', N'CONFIRMED')
      AND i.start_time < b.end_time
      AND i.end_time > b.start_time
  )
  BEGIN
    ROLLBACK TRANSACTION;
    THROW 50001, 'Slot conflict: this pitch is already booked in the requested time window', 1;
  END
END
GO

-- Keep BOOKINGS.service_amount in sync with its line items, so
-- total_amount (computed) always matches the invoice recalculation rule.
CREATE OR ALTER TRIGGER dbo.trg_bsvc_recalc_ins
ON dbo.BOOKING_SERVICES
AFTER INSERT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE b
     SET service_amount = COALESCE(
           (SELECT SUM(bs.subtotal) FROM dbo.BOOKING_SERVICES bs
             WHERE bs.booking_id = b.booking_id), 0)
    FROM dbo.BOOKINGS b
    JOIN (SELECT DISTINCT booking_id FROM inserted) i
      ON i.booking_id = b.booking_id;
END
GO

CREATE OR ALTER TRIGGER dbo.trg_bsvc_recalc_upd
ON dbo.BOOKING_SERVICES
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE b
     SET service_amount = COALESCE(
           (SELECT SUM(bs.subtotal) FROM dbo.BOOKING_SERVICES bs
             WHERE bs.booking_id = b.booking_id), 0)
    FROM dbo.BOOKINGS b
    JOIN (SELECT DISTINCT booking_id FROM inserted) i
      ON i.booking_id = b.booking_id;
END
GO

CREATE OR ALTER TRIGGER dbo.trg_bsvc_recalc_del
ON dbo.BOOKING_SERVICES
AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE b
     SET service_amount = COALESCE(
           (SELECT SUM(bs.subtotal) FROM dbo.BOOKING_SERVICES bs
             WHERE bs.booking_id = b.booking_id), 0)
    FROM dbo.BOOKINGS b
    JOIN (SELECT DISTINCT booking_id FROM deleted) del
      ON del.booking_id = b.booking_id;
END
GO

-- ============================================================================
-- VIEWS — analytical read models for the Admin dashboard (GET /api/reports/*)
-- ============================================================================

CREATE OR ALTER VIEW dbo.vw_revenue_daily
AS
SELECT CAST(p.paid_at AS DATE)          AS payment_date,
       f.field_id,
       f.name                           AS field_name,
       f.field_type,
       SUM(p.amount)                    AS revenue,
       COUNT(DISTINCT p.booking_id)     AS paid_bookings
FROM dbo.PAYMENTS p
JOIN dbo.BOOKINGS b ON b.booking_id = p.booking_id
JOIN dbo.FIELDS   f ON f.field_id   = b.field_id
WHERE p.payment_status = N'PAID'
GROUP BY CAST(p.paid_at AS DATE), f.field_id, f.name, f.field_type;
GO

CREATE OR ALTER VIEW dbo.vw_field_utilization
AS
SELECT f.field_id,
       f.name                                   AS field_name,
       b.booking_date,
       SUM(DATEDIFF(MINUTE, b.start_time, b.end_time) / 60.0) AS booked_hours,
       CAST(
         SUM(DATEDIFF(MINUTE, b.start_time, b.end_time) / 60.0)
         / (DATEDIFF(MINUTE, f.open_time, f.close_time) / 60.0) * 100
         AS DECIMAL(6, 2))                      AS utilization_pct
FROM dbo.BOOKINGS b
JOIN dbo.FIELDS f ON f.field_id = b.field_id
WHERE b.status IN (N'CONFIRMED', N'COMPLETED')
GROUP BY f.field_id, f.name, b.booking_date,
         DATEDIFF(MINUTE, f.open_time, f.close_time);
GO

CREATE OR ALTER VIEW dbo.vw_customer_stats
AS
SELECT u.user_id,
       u.full_name,
       COUNT(b.booking_id)                                      AS total_bookings,
       SUM(b.total_amount)                                     AS lifetime_value,
       SUM(CASE WHEN b.status = N'CANCELLED' THEN 1 ELSE 0 END) AS cancellations,
       SUM(CASE WHEN b.status = N'NO_SHOW' THEN 1 ELSE 0 END)    AS no_shows
FROM dbo.USERS u
LEFT JOIN dbo.BOOKINGS b ON b.user_id = u.user_id
GROUP BY u.user_id, u.full_name;
GO
