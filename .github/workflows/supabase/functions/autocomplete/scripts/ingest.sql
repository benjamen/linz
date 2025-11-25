CREATE TEMP TABLE staging_addresses AS
SELECT *
FROM read_csv_auto('linz.csv');

-- Upsert
INSERT INTO nz_addresses (id, full_address, suburb, town_city, meshblock, geom)
SELECT id, full_address, suburb, town_city, meshblock,
       ST_SetSRID(ST_MakePoint(lon, lat), 4326)
FROM staging_addresses
ON CONFLICT (id)
DO UPDATE SET
  full_address = EXCLUDED.full_address,
  suburb = EXCLUDED.suburb,
  town_city = EXCLUDED.town_city,
  meshblock = EXCLUDED.meshblock,
  geom = EXCLUDED.geom;

DROP TABLE staging_addresses;
