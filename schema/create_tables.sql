CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS nz_addresses (
  id bigint PRIMARY KEY,
  full_address text,
  suburb text,
  town_city text,
  meshblock text,
  geom geometry(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_addr_trgm
  ON nz_addresses USING GIN (full_address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_addr_geom
  ON nz_addresses USING GIST (geom);

CREATE OR REPLACE FUNCTION search_addresses(query text)
RETURNS SETOF nz_addresses AS $$
  SELECT *
  FROM nz_addresses
  WHERE full_address ILIKE '%' || query || '%'
  ORDER BY similarity(full_address, query) DESC
  LIMIT 10;
$$ LANGUAGE sql;