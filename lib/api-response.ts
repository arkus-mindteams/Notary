import { NextResponse } from 'next/server'

export function apiSuccess<T>(data: T, status: number = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details: Record<string, unknown> = {}
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        details,
        trace_id: undefined as string | undefined,
      },
    },
    { status }
  )
}
