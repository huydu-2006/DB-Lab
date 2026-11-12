-- ============================================================================
-- BK-88 Stadium — seed data (T-SQL, idempotent).
-- Pitches mirror frontend/src/lib/data.ts; services and pricing rules mirror
-- PLAN.md (Water, Ball Rental, Bibs, Referee; prime-time surcharge from
-- booking.ts: >= 17:00 is prime at +15%; weekend rates +10%/+25%).
-- Run after 01_schema.sql (or via: python -m app.db.init_db).
-- ============================================================================

USE BK88_STADIUM;
GO

-- ----------------------------------------------------------------------------
-- FIELDS (8 pitches from the frontend mock catalogue)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'BK-88 Arena – Court 1')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'BK-88 Arena – Court 1', N'88 Phan Đăng Lưu, Bình Thạnh', N'Bình Thạnh',
        N'5v5', N'ARTIFICIAL_TURF', 280000.00, 4.8, 126,
        N'FLOODLIGHTS,CHANGING_ROOMS,PARKING,CAFE', '06:00', '23:00');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'BK-88 Arena – Court 2')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'BK-88 Arena – Court 2', N'88 Phan Đăng Lưu, Bình Thạnh', N'Bình Thạnh',
        N'7v7', N'ARTIFICIAL_TURF', 420000.00, 4.6, 98,
        N'FLOODLIGHTS,CHANGING_ROOMS,PARKING,SHOWERS', '06:00', '22:30');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Thống Nhất Field')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Thống Nhất Field', N'138 Đào Duy Từ, District 10', N'District 10',
        N'11v11', N'NATURAL_GRASS', 750000.00, 4.9, 214,
        N'FLOODLIGHTS,SHOWERS,PARKING,FIRST_AID,EQUIPMENT_HIRE', '06:00', '21:00');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Cửu Long Pitch')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Cửu Long Pitch', N'45 Trần Não, District 2', N'District 2',
        N'7v7', N'ARTIFICIAL_TURF', 380000.00, 4.4, 63,
        N'FLOODLIGHTS,PARKING,CAFE', '06:30', '22:00');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Rạch Miễu Pitch')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Rạch Miễu Pitch', N'12 Nguyễn Hữu Cảnh, Bình Thạnh', N'Bình Thạnh',
        N'5v5', N'ARTIFICIAL_TURF', 220000.00, 4.1, 41,
        N'FLOODLIGHTS,CHANGING_ROOMS', '06:00', '22:00');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Phú Thọ Stadium')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Phú Thọ Stadium', N'219 Lý Thường Kiệt, District 11', N'District 11',
        N'11v11', N'NATURAL_GRASS', 900000.00, 4.7, 187,
        N'FLOODLIGHTS,SHOWERS,CHANGING_ROOMS,PARKING,FIRST_AID', '06:00', '21:30');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Sân Kỳ Hòa')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Sân Kỳ Hòa', N'6 Cao Thắng, District 3', N'District 3',
        N'5v5', N'ARTIFICIAL_TURF', 260000.00, 4.3, 72,
        N'FLOODLIGHTS,CAFE,FREE_WIFI', '06:00', '23:00');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.FIELDS WHERE name = N'Sân Tao Đàn')
INSERT INTO dbo.FIELDS
  (name, address, district, field_type, surface_type, base_price_per_hour,
   rating, review_count, amenities, open_time, close_time)
VALUES (N'Sân Tao Đàn', N'55 Nguyễn Thị Minh Khai, District 1', N'District 1',
        N'7v7', N'NATURAL_GRASS', 480000.00, 4.5, 109,
        N'FLOODLIGHTS,CHANGING_ROOMS,SHOWERS,PARKING', '06:00', '22:00');
GO

-- ----------------------------------------------------------------------------
-- FIELDS geolocation (WGS-84) — backfills rows seeded before the location
-- columns existed and fills fresh inserts; the NULL guard makes every
-- statement idempotent.
-- ----------------------------------------------------------------------------
UPDATE dbo.FIELDS SET latitude = 10.803300, longitude = 106.687000
WHERE name IN (N'BK-88 Arena – Court 1', N'BK-88 Arena – Court 2') AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.770800, longitude = 106.662100
WHERE name = N'Thống Nhất Field' AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.791000, longitude = 106.746200
WHERE name = N'Cửu Long Pitch' AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.793800, longitude = 106.708600
WHERE name = N'Rạch Miễu Pitch' AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.775600, longitude = 106.631400
WHERE name = N'Phú Thọ Stadium' AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.771500, longitude = 106.690200
WHERE name = N'Sân Kỳ Hòa' AND latitude IS NULL;
UPDATE dbo.FIELDS SET latitude = 10.776500, longitude = 106.697200
WHERE name = N'Sân Tao Đàn' AND latitude IS NULL;
GO

-- ----------------------------------------------------------------------------
-- PRICING_RULES — per field: weekday (Mon–Fri) and weekend (Sat–Sun) windows.
-- Prime time (start >= 17:00): +15% weekday, +25% weekend; weekend off-peak +10%.
-- ----------------------------------------------------------------------------
INSERT INTO dbo.PRICING_RULES (field_id, day_of_week, start_time, end_time, price_per_hour, label)
SELECT f.field_id, d.day_of_week, '06:00', '17:00',
       CASE WHEN d.day_of_week IN (0, 6) THEN ROUND(f.base_price_per_hour * 1.10, -3) ELSE f.base_price_per_hour END,
       CASE WHEN d.day_of_week IN (0, 6) THEN N'WEEKEND' ELSE N'OFF_PEAK' END
FROM dbo.FIELDS f
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(day_of_week)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.PRICING_RULES r
    WHERE r.field_id = f.field_id AND r.day_of_week = d.day_of_week
      AND r.start_time = '06:00'
);
GO
INSERT INTO dbo.PRICING_RULES (field_id, day_of_week, start_time, end_time, price_per_hour, label)
SELECT f.field_id, d.day_of_week, '17:00',
       f.close_time,
       CASE WHEN d.day_of_week IN (0, 6) THEN ROUND(f.base_price_per_hour * 1.25, -3)
            ELSE ROUND(f.base_price_per_hour * 1.15, -3) END,
       N'PEAK'
FROM dbo.FIELDS f
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(day_of_week)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.PRICING_RULES r
    WHERE r.field_id = f.field_id AND r.day_of_week = d.day_of_week
      AND r.start_time = '17:00'
);
GO

-- ----------------------------------------------------------------------------
-- SERVICES — add-on matchday catalogue (PLAN.md: Water, Ball Rental, Bibs, Referee)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.SERVICES WHERE name = N'Bottled Water')
INSERT INTO dbo.SERVICES (name, unit, unit_price, stock_quantity)
VALUES (N'Bottled Water', N'BOTTLE', 10000.00, 480);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SERVICES WHERE name = N'Ball Rental')
INSERT INTO dbo.SERVICES (name, unit, unit_price, stock_quantity)
VALUES (N'Ball Rental', N'MATCH', 50000.00, 40);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SERVICES WHERE name = N'Bibs / Vests')
INSERT INTO dbo.SERVICES (name, unit, unit_price, stock_quantity)
VALUES (N'Bibs / Vests', N'MATCH', 20000.00, 60);
GO
IF NOT EXISTS (SELECT 1 FROM dbo.SERVICES WHERE name = N'Referee')
INSERT INTO dbo.SERVICES (name, unit, unit_price, stock_quantity)
VALUES (N'Referee', N'MATCH', 300000.00, 10);
GO

-- ----------------------------------------------------------------------------
-- SAMPLE ACCOUNTS (ADMIN/STAFF/CUSTOMER) — use these from the dev login screen.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.USERS WHERE email = N'admin@bk88.vn')
INSERT INTO dbo.USERS (clerk_user_id, full_name, email, phone, role)
VALUES (N'user_seed_admin_00000000001', N'Stadium Admin', N'admin@bk88.vn', N'0900000001', N'ADMIN');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.USERS WHERE email = N'staff@bk88.vn')
INSERT INTO dbo.USERS (clerk_user_id, full_name, email, phone, role)
VALUES (N'user_seed_staff_00000000001', N'Reception Desk', N'staff@bk88.vn', N'0900000002', N'STAFF');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.USERS WHERE email = N'ron@bk88.vn')
INSERT INTO dbo.USERS (clerk_user_id, full_name, email, phone, role, team_name)
VALUES (N'user_seed_customer_00001', N'Ron Smith', N'ron@bk88.vn', N'0900000003', N'CUSTOMER', N'BK United');
GO
IF NOT EXISTS (SELECT 1 FROM dbo.USERS WHERE email = N'charles@bk88.vn')
INSERT INTO dbo.USERS (clerk_user_id, full_name, email, role)
VALUES (N'user_seed_customer_00002', N'Charles', N'charles@bk88.vn', N'CUSTOMER');
GO

-- ----------------------------------------------------------------------------
-- SAMPLE BOOKINGS — one evening CONFIRMED booking and one upcoming PENDING
-- booking for the seed customer on a mid-range pitch, plus a 30% DEPOSIT on the
-- confirmed one. Dates are relative to GETDATE() so the demo always has
-- upcoming matches.
-- ----------------------------------------------------------------------------
DECLARE @ron INT = (SELECT user_id FROM dbo.USERS WHERE email = N'ron@bk88.vn');
DECLARE @court2 INT = (SELECT field_id FROM dbo.FIELDS WHERE name = N'BK-88 Arena – Court 2');
DECLARE @taodan INT = (SELECT field_id FROM dbo.FIELDS WHERE name = N'Sân Tao Đàn');
DECLARE @in2 DATE = CAST(DATEADD(DAY, 2, GETDATE()) AS DATE);
DECLARE @in3 DATE = CAST(DATEADD(DAY, 3, GETDATE()) AS DATE);

IF NOT EXISTS (SELECT 1 FROM dbo.BOOKINGS WHERE user_id = @ron AND field_id = @court2 AND booking_date = @in2)
BEGIN
    INSERT INTO dbo.BOOKINGS (user_id, field_id, booking_date, start_time, end_time, status, pitch_amount)
    VALUES (@ron, @court2, @in2, '19:00', '20:30', N'CONFIRMED', 483000.00);   -- 1.5h * 322000 (prime 420k*1.15)

    DECLARE @b1 INT = SCOPE_IDENTITY();
    INSERT INTO dbo.PAYMENTS (booking_id, amount, payment_type, payment_method, payment_status, paid_at)
    VALUES (@b1, 144900.00, N'DEPOSIT', N'BANK_TRANSFER', N'PAID', GETDATE());
END

IF NOT EXISTS (SELECT 1 FROM dbo.BOOKINGS WHERE user_id = @ron AND field_id = @taodan AND booking_date = @in3)
INSERT INTO dbo.BOOKINGS (user_id, field_id, booking_date, start_time, end_time, status, pitch_amount)
VALUES (@ron, @taodan, @in3, '09:00', '10:00', N'PENDING', 480000.00);         -- 1h off-peak
GO
