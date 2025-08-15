import { Pool } from 'pg'

// Configuración del pool de conexiones para Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Configuraciones específicas para Neon
  max: 20, // máximo número de conexiones en el pool
  idleTimeoutMillis: 30000, // tiempo antes de cerrar conexiones inactivas
  connectionTimeoutMillis: 2000, // tiempo máximo para establecer conexión
})

// Función helper para ejecutar queries
export async function query(text: string, params?: any[]) {
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

// Función para verificar la conexión
export async function testConnection() {
  try {
    const result = await query('SELECT NOW()')
    console.log('✅ Conexión a Neon exitosa:', result.rows[0])
    return true
  } catch (error) {
    console.error('❌ Error conectando a Neon:', error)
    return false
  }
}

export default pool