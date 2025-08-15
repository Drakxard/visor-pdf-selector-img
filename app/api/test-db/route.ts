import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // Probar la conexión con una consulta simple
    const { data, error } = await supabase
      .from('progress')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error);
      return NextResponse.json({ 
        status: "error", 
        message: "No se pudo conectar a Supabase",
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({ 
      status: "success", 
      message: "Conexión a Supabase exitosa",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      status: "error", 
      message: "Error al probar la conexión",
      error: error instanceof Error ? error.message : "Error desconocido"
    }, { status: 500 });
  }
}