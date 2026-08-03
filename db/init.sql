CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL DEFAULT '',
  system_name TEXT NOT NULL DEFAULT '',
  seller TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  thickness TEXT NOT NULL DEFAULT '',
  colors TEXT NOT NULL DEFAULT '',
  magnetic_stripe BOOLEAN NOT NULL DEFAULT FALSE,
  magnetic_stripe_type TEXT NOT NULL DEFAULT '',
  chip_rfid BOOLEAN NOT NULL DEFAULT FALSE,
  chip_type TEXT NOT NULL DEFAULT '',
  infrared BOOLEAN NOT NULL DEFAULT FALSE,
  infrared_color TEXT NOT NULL DEFAULT '',
  finishing TEXT NOT NULL DEFAULT '',
  observations TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('frente', 'verso')),
  image_name TEXT NOT NULL,
  format TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  preview_data_url TEXT NOT NULL DEFAULT '',
  analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, side)
);

CREATE TABLE IF NOT EXISTS job_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL CHECK (export_type IN ('pdf', 'jpg')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_data BYTEA NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_faces_job_id_idx ON job_faces(job_id);
CREATE INDEX IF NOT EXISTS job_exports_job_id_created_at_idx ON job_exports(job_id, created_at DESC);
