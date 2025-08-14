CREATE TABLE IF NOT EXISTS progress (
  id serial PRIMARY KEY,
  subject_name varchar(50) NOT NULL,
  table_type varchar(20) NOT NULL,
  current_progress integer NOT NULL DEFAULT 0,
  total_pdfs integer NOT NULL DEFAULT 0,
  UNIQUE(subject_name, table_type)
);
ALTER TABLE progress ADD COLUMN IF NOT EXISTS total_pdfs integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS ux_progress ON progress(subject_name, table_type);
