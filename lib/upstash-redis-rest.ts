type UpstashResult<T = any> = { result: T; error?: string }

function getEnv(name: string): string | null {
  const v = process.env[name]
  return v && String(v).trim() ? String(v).trim() : null
}

function getUpstashConfig() {
  const url = getEnv('UPSTASH_REDIS_REST_URL')
  const token = getEnv('UPSTASH_REDIS_REST_TOKEN')
  return { url, token }
}

async function postJson(url: string, token: string, body: any): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!resp.ok) {
    const msg = parsed?.error || parsed?.message || text || `HTTP ${resp.status}`
    throw new Error(`Upstash REST error: ${msg}`)
  }
  return parsed
}

/**
 * Ejecuta un comando Redis vía Upstash REST.
 * Upstash soporta comandos como JSON array: ["SET","key","value","EX",7200]
 * En algunos despliegues el endpoint es la URL base, en otros `.../pipeline`.
 * Aquí intentamos el base primero y luego pipeline (single command) como fallback.
 */
export async function upstashCommand<T = any>(cmd: any[]): Promise<UpstashResult<T>> {
  const { url, token } = getUpstashConfig()
  if (!url || !token) return { result: null as any, error: 'missing_upstash_env' }

  // Intento 1: POST a la URL base con el array del comando
  try {
    const data = await postJson(url, token, cmd)
    return data as UpstashResult<T>
  } catch (e1: any) {
    // Intento 2: POST a /pipeline con una lista de comandos
    try {
      const data = await postJson(`${url.replace(/\/$/, '')}/pipeline`, token, [cmd])
      // pipeline devuelve { result: [..] }
      if (data && Array.isArray(data.result)) {
        return { result: data.result[0] } as any
      }
      return data as UpstashResult<T>
    } catch (e2: any) {
      return { result: null as any, error: e2?.message || e1?.message || 'upstash_error' }
    }
  }
}

export async function upstashPipeline<T = any>(cmds: any[][]): Promise<UpstashResult<T>> {
  const { url, token } = getUpstashConfig()
  if (!url || !token) return { result: null as any, error: 'missing_upstash_env' }

  try {
    const data = await postJson(`${url.replace(/\/$/, '')}/pipeline`, token, cmds)
    return data as UpstashResult<T>
  } catch (e: any) {
    return { result: null as any, error: e?.message || 'upstash_error' }
  }
}

