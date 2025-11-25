CREATE OR REPLACE FUNCTION search_addresses(query text)
RETURNS SETOF nz_addresses AS $$
  SELECT *
  FROM nz_addresses
  WHERE full_address ILIKE '%' || query || '%'
  ORDER BY similarity(full_address, query) DESC
  LIMIT 10;
$$ LANGUAGE sql;