import { NextResponse } from "next/server"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

export const runtime = "nodejs"

const RULES_FILE_PATH = join(process.cwd(), "data", "rules.json")

// GET: Obtener reglas (solo notariales, las de colindancias son internas)
export async function GET() {
  try {
    const fileContent = readFileSync(RULES_FILE_PATH, "utf-8")
    const rules = JSON.parse(fileContent)
    
    // Retornar solo las reglas notariales (las de colindancias son internas)
    // Si existen colindancias en el JSON, las ignoramos pero las preservamos para compatibilidad
    return NextResponse.json({
      notarial: rules.notarial || {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        rules: "",
      },
      // Nota: colindancias no se retornan porque son solo internas
    })
  } catch (error) {
    console.error("[api/rules] Error reading rules:", error)
    // Si no existe el archivo, retornar estructura vacía para notarial
    return NextResponse.json({
      notarial: {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        rules: "",
      },
    })
  }
}

// PUT: Actualizar reglas (solo notariales, las de colindancias son internas)
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { notarial } = body

    if (!notarial || !notarial.rules) {
      return NextResponse.json(
        { error: "invalid_request", message: "Notarial rules are required" },
        { status: 400 }
      )
    }

    // Leer reglas existentes para preservar estructura si existe colindancias (backwards compatibility)
    let existingRules: any = {}
    try {
      const fileContent = readFileSync(RULES_FILE_PATH, "utf-8")
      existingRules = JSON.parse(fileContent)
    } catch (e) {
      // Si no existe el archivo, empezar con estructura vacía
      existingRules = {}
    }

    const updatedRules = {
      // Mantener colindancias en el JSON solo para compatibilidad, pero no se usan
      ...(existingRules.colindancias ? { colindancias: existingRules.colindancias } : {}),
      notarial: {
        ...notarial,
        version: notarial.version || existingRules.notarial?.version || "1.0.0",
        lastUpdated: new Date().toISOString(),
      },
    }

    writeFileSync(RULES_FILE_PATH, JSON.stringify(updatedRules, null, 2), "utf-8")

    return NextResponse.json({ success: true, rules: updatedRules })
  } catch (error) {
    console.error("[api/rules] Error updating rules:", error)
    return NextResponse.json(
      { error: "failed_to_update_rules", message: String(error) },
      { status: 500 }
    )
  }
}

