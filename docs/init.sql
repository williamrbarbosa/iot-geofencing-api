-- Enable PostGIS extension for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Index hint: TypeORM will create tables, but we ensure PostGIS is ready
SELECT PostGIS_Version();
