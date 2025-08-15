-- Script para inicializar las tablas en Neon
-- Ejecuta este script en tu consola de Neon

-- Crear tabla de progreso
CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  subject_name VARCHAR(255) NOT NULL,
  table_type VARCHAR(50) NOT NULL CHECK (table_type IN ('theory', 'practice')),
  current_progress INTEGER DEFAULT 0,
  total_pdfs INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subject_name, table_type)
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_progress_subject ON progress(subject_name);
CREATE INDEX IF NOT EXISTS idx_progress_type ON progress(table_type);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para actualizar updated_at
DROP TRIGGER IF EXISTS update_progress_updated_at ON progress;
CREATE TRIGGER update_progress_updated_at
    BEFORE UPDATE ON progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insertar datos de ejemplo (opcional)
INSERT INTO progress (subject_name, table_type, current_progress, total_pdfs) 
VALUES 
  ('Matemáticas', 'theory', 0, 10),
  ('Matemáticas', 'practice', 0, 8),
  ('Física', 'theory', 0, 12),
  ('Física', 'practice', 0, 6)
ON CONFLICT (subject_name, table_type) DO NOTHING;