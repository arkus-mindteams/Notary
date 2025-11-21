import { NextResponse } from "next/server"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

export const runtime = "nodejs"

const RULES_FILE_PATH = join(process.cwd(), "data", "rules.json")

// GET: Obtener reglas
export async function GET() {
  try {
    const fileContent = readFileSync(RULES_FILE_PATH, "utf-8")
    const rules = JSON.parse(fileContent)
    return NextResponse.json(rules)
  } catch (error) {
    console.error("[api/rules] Error reading rules:", error)
    return NextResponse.json(
      { error: "failed_to_read_rules", message: String(error) },
      { status: 500 }
    )
  }
}

// PUT: Actualizar reglas
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { colindancias, notarial } = body

    if (!colindancias || !notarial) {
      return NextResponse.json(
        { error: "invalid_request", message: "Both colindancias and notarial rules are required" },
        { status: 400 }
      )
    }

    const updatedRules = {
      colindancias: {
        ...colindancias,
        lastUpdated: new Date().toISOString(),
      },
      notarial: {
        ...notarial,
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

