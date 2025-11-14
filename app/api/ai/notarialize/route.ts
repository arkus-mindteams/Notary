import { NextResponse } from "next/server"
import { notarialize } from "@/lib/notarial-formatter"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "unsupported_media_type", message: "Content-Type must be application/json" },
        { status: 415 },
      )
    }
    const body = await req.json()
    const unitName = (body?.unitName || "").toString().trim()
    const colindanciasText = (body?.colindanciasText || "").toString()

    if (!unitName || !colindanciasText) {
      return NextResponse.json(
        { error: "bad_request", message: "unitName and colindanciasText are required" },
        { status: 400 },
      )
    }

    const result = notarialize(colindanciasText, unitName)
    return NextResponse.json({ notarialText: result })
  } catch (err: any) {
    console.error("[notarialize] error:", err)
    return NextResponse.json(
      { error: "server_error", message: err?.message || "Internal error" },
      { status: 500 },
    )
  }
}


