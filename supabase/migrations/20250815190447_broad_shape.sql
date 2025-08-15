/*
  # Crear tabla de progreso para la aplicación PDF

  1. Nueva tabla
    - `progress`
      - `id` (uuid, primary key)
      - `subject_name` (text, nombre de la materia)
      - `table_type` (text, 'theory' o 'practice')
      - `current_progress` (integer, progreso actual)
      - `total_pdfs` (integer, total de PDFs)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Seguridad
    - Habilitar RLS en la tabla `progress`
    - Política para permitir todas las operaciones (para simplicidad inicial)
*/

CREATE TABLE IF NOT EXISTS progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name text NOT NULL,
  table_type text NOT NULL CHECK (table_type IN ('theory', 'practice')),
  current_progress integer DEFAULT 0,
  total_pdfs integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(subject_name, table_type)
);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

-- Política permisiva para desarrollo (ajustar según necesidades de autenticación)
CREATE POLICY "Allow all operations on progress"
  ON progress
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
CREATE TRIGGER update_progress_updated_at
    BEFORE UPDATE ON progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insertar datos de ejemplo
INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs) 
VALUES 
  ('Matemáticas', 'theory', 0, 10),
  ('Matemáticas', 'practice', 0, 8),
  ('Física', 'theory', 0, 12),
  ('Física', 'practice', 0, 6),
  ('Química', 'theory', 0, 15),
  ('Química', 'practice', 0, 10)
ON CONFLICT (subject_name, table_type) DO NOTHING;