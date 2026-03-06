import { toast } from 'sonner'

/** Formato de error según API_CONTRACTS: { ok: false, error: { code, message, details } } */
export interface ApiErrorBody {
  ok?: boolean
  error?: {
    code?: string
    message?: string
    details?: Record<string, unknown>
  }
  message?: string
}

/**
 * Parsea la respuesta de error de la API y muestra un toast.
 * Si el body tiene formato { ok: false, error: { message } }, usa error.message; si no, usa fallback.
 */
export async function toastApiError(res: Response, fallbackTitle = 'Error'): Promise<void> {
  let title = fallbackTitle
  let description: string | undefined
  try {
    const body: ApiErrorBody = await res.json()
    if (body?.error?.message) {
      title = body.error.message
      if (body.error.code) description = body.error.code
    } else if (body?.message) {
      title = body.message
    }
  } catch {
    description = `${res.status} ${res.statusText}`
  }
  toast.error(title, { description })
}
