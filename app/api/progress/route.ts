import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { subject, tableType, delta } = await req.json();
    
    if (
      typeof subject !== "string" ||
      typeof tableType !== "string" ||
      typeof delta !== "number"
    ) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // Obtener el progreso actual
    const { data: currentData, error: fetchError } = await supabase
      .from('progress')
      .select('current_progress, total_pdfs')
      .eq('subject_name', subject)
      .eq('table_type', tableType)
      .single();

    if (fetchError) {
      console.error('Error fetching current progress:', fetchError);
      return NextResponse.json({ error: "Error fetching progress" }, { status: 500 });
    }

    // Calcular nuevo progreso
    const newProgress = Math.max(0, Math.min(
      currentData.total_pdfs, 
      currentData.current_progress + delta
    ));

    // Actualizar el progreso
    const { error: updateError } = await supabase
      .from('progress')
      .update({ 
        current_progress: newProgress,
        updated_at: new Date().toISOString()
      })
      .eq('subject_name', subject)
      .eq('table_type', tableType);

    if (updateError) {
      console.error('Error updating progress:', updateError);
      return NextResponse.json({ error: "Error updating progress" }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      newProgress,
      total: currentData.total_pdfs 
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('progress')
      .select('*')
      .order('subject_name', { ascending: true });

    if (error) {
      console.error('Error fetching progress:', error);
      return NextResponse.json({ error: "Error fetching progress" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}