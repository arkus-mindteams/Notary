import { createServerClient } from '@/lib/supabase'
import type { AuthContext } from '@/lib/auth/authContext'
import type { Tramite } from '@/lib/types/expediente-types'
import { listTramitesAsignadosAAsistente } from '@/lib/services/tramite-asignacion-service'

/**
 * ReBAC: visibilidad de expedientes/trámites por rol y relación.
 * Orden: 1) Filtrar por notaria_id (tenant). 2) SUPERADMIN/NOTARIO → todos de la notaría (o global). 3) ABOGADO → owner. 4) ASISTENTE → solo trámites en tramite_asignaciones.
 */

/**
 * Devuelve los trámites que el usuario puede ver según su rol y relaciones.
 * Nunca cruza notarías.
 */
export async function listVisibleCases(ctx: AuthContext): Promise<Tramite[]> {
  const supabase = createServerClient()

  if (ctx.role === 'superadmin') {
    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Tramite[]
  }

  if (ctx.role === 'notario') {
    if (!ctx.notaryOfficeId) return []
    const { data: usuariosNotaria } = await supabase
      .from('usuarios')
      .select('id')
      .eq('notaria_id', ctx.notaryOfficeId)
    const userIds = (usuariosNotaria || []).map((u) => u.id)
    if (userIds.length === 0) return []
    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Tramite[]
  }

  if (ctx.role === 'abogado') {
    const { data, error } = await supabase
      .from('tramites')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Tramite[]
  }

  if (ctx.role === 'asistente') {
    if (!ctx.notaryOfficeId) return []
    return listTramitesAsignadosAAsistente(ctx.userId, ctx.notaryOfficeId)
  }

  return []
}

/**
 * Indica si el usuario puede leer (ver) un trámite concreto.
 */
export async function canReadCase(ctx: AuthContext, caseId: string): Promise<boolean> {
  const supabase = createServerClient()
  const { data: tramite, error } = await supabase
    .from('tramites')
    .select('id, user_id')
    .eq('id', caseId)
    .single()

  if (error || !tramite) return false

  const ownerId = (tramite as { user_id?: string | null }).user_id ?? null

  if (ctx.role === 'superadmin') return true

  if (ctx.role === 'notario') {
    if (!ctx.notaryOfficeId) return false
    if (!ownerId) return false
    const { data: owner } = await supabase
      .from('usuarios')
      .select('notaria_id')
      .eq('id', ownerId)
      .single()
    return owner?.notaria_id === ctx.notaryOfficeId
  }

  if (ctx.role === 'abogado') {
    return ownerId === ctx.userId
  }

  if (ctx.role === 'asistente') {
    if (!ctx.notaryOfficeId) return false
    const { data: assign } = await supabase
      .from('tramite_asignaciones')
      .select('id, notaria_id')
      .eq('tramite_id', caseId)
      .eq('assistant_id', ctx.userId)
      .maybeSingle()
    if (!assign) return false
    return assign.notaria_id === ctx.notaryOfficeId
  }

  return false
}
