export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { TextractClient, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract"

const USE_STUBS =
  process.env.RUN_WITHOUT_AWS === "1" || process.env.OCR_USE_STUBS === "1" || process.env.NEXT_PUBLIC_OCR_USE_STUBS === "1"

const textract = new TextractClient({
  region: process.env.AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      }
    : undefined,
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const jobId = body?.jobId as string
    if (!jobId) return NextResponse.json({ error: "bad_request", message: "jobId required" }, { status: 400 })

    if (USE_STUBS || !process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json({
        status: "SUCCEEDED",
        text: "DEMO OCR: replace with real OCR by disabling OCR_USE_STUBS",
        pages: 1,
      })
    }

    let nextToken: string | undefined = undefined
    let allLines: string[] = []
    let status: string | undefined = undefined
    let pages = 0

    do {
      const resp = await textract.send(
        new GetDocumentTextDetectionCommand({
          JobId: jobId,
          NextToken: nextToken,
        }),
      )
      status = resp.JobStatus
      if (status === "SUCCEEDED") {
        const blocks = resp.Blocks || []
        allLines.push(...blocks.filter((b) => b.BlockType === "LINE" && b.Text).map((b) => String(b.Text)))
        pages += resp.DocumentMetadata?.Pages || 0
        nextToken = resp.NextToken
      } else {
        // Not done yet (IN_PROGRESS, FAILED, PARTIAL_SUCCESS)
        return NextResponse.json({ status })
      }
    } while (nextToken)

    return NextResponse.json({ status: "SUCCEEDED", text: allLines.join("\n"), pages })
  } catch (e: any) {
    console.error("[api/ocr/async/status] error:", e)
    return NextResponse.json({ error: "status_failed", message: String(e?.message || e) }, { status: 400 })
  }
}


