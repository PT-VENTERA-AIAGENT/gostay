-- BookMe HMS — Seed Data (development only)
-- Run after migrations. Creates sample room types and rooms.

-- Room Types
insert into room_types (name, slug, description, base_rate, max_occupancy, amenities) values
  ('Standard', 'standard', 'Comfortable room with all essentials for a pleasant stay.', 500000, 2,
   array['WiFi', 'Air Conditioning', 'TV', 'Hot Shower', 'Mini Fridge']),
  ('Deluxe', 'deluxe', 'Spacious room with city view and premium amenities.', 850000, 2,
   array['WiFi', 'Air Conditioning', 'Smart TV', 'Hot Shower', 'Mini Bar', 'Bathtub', 'City View']),
  ('Suite', 'suite', 'Luxury suite with separate living area and premium services.', 1500000, 3,
   array['WiFi', 'Air Conditioning', 'Smart TV', 'Jacuzzi', 'Mini Bar', 'Lounge Area', 'Sea View', 'Butler Service']),
  ('Family', 'family', 'Larger room designed for families with extra beds available.', 1100000, 4,
   array['WiFi', 'Air Conditioning', 'TV', 'Hot Shower', 'Extra Beds', 'Family Dining Area']),
  ('Presidential Suite', 'presidential', 'The pinnacle of luxury with panoramic views and exclusive services.', 5000000, 4,
   array['WiFi', 'Air Conditioning', 'Smart TV', 'Private Pool', 'Full Kitchen', 'Butler Service', 'Panoramic View', 'Private Terrace']);

-- Standard Rooms (101–110)
insert into rooms (room_type_id, number, floor)
select id, num, floor(num::int / 100)::int
from room_types, unnest(array['101','102','103','104','105','106','107','108','109','110']) as num
where slug = 'standard';

-- Deluxe Rooms (201–206)
insert into rooms (room_type_id, number, floor)
select id, num, floor(num::int / 100)::int
from room_types, unnest(array['201','202','203','204','205','206']) as num
where slug = 'deluxe';

-- Suite Rooms (301–304)
insert into rooms (room_type_id, number, floor)
select id, num, floor(num::int / 100)::int
from room_types, unnest(array['301','302','303','304']) as num
where slug = 'suite';

-- Family Rooms (401–403)
insert into rooms (room_type_id, number, floor)
select id, num, floor(num::int / 100)::int
from room_types, unnest(array['401','402','403']) as num
where slug = 'family';

-- Presidential Suites (501, 502)
insert into rooms (room_type_id, number, floor)
select id, num, floor(num::int / 100)::int
from room_types, unnest(array['501','502']) as num
where slug = 'presidential';
