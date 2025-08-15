import { NextResponse } from "next/server";
import { testConnection } from "@/lib/db";

export async function GET() {
  try {
    const isConnected = await testConnection();
    
    if (isConnected) {
      return NextResponse.json({ 
        status: "success", 
        message: "Conexión a Neon exitosa" 
      });
    } else {
      return NextResponse.json({ 
        status: "error", 
        message: "No se pudo conectar a Neon" 
      }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ 
      status: "error", 
      message: "Error al probar la conexión",
      error: error instanceof Error ? error.message : "Error desconocido"
    }, { status: 500 });
  }
}