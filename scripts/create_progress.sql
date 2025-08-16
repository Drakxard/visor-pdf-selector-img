-- Create the progress table used by /api/progress
CREATE TABLE IF NOT EXISTS public.progress (
  id SERIAL PRIMARY KEY,
  subject_name TEXT NOT NULL,
  table_type   TEXT NOT NULL,
  current_progress INTEGER NOT NULL DEFAULT 0,
  total_pdfs       INTEGER NOT NULL DEFAULT 0
);

-- Ensure uniqueness for (subject_name, table_type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'progress_subject_table_unique'
  ) THEN
    CREATE UNIQUE INDEX progress_subject_table_unique ON public.progress (subject_name, table_type);
  END IF;
END $$;

-- Optional: sample seed rows
-- INSERT INTO public.progress (subject_name, table_type, current_progress, total_pdfs)
-- VALUES
--   ('math', 'algebra', 0, 10),
--   ('physics', 'mechanics', 2, 15)
-- ON CONFLICT DO NOTHING;
