import { createServerClient } from '@/lib/supabase'
import { TramiteService } from './tramite-service'
import { findActiveRelation } from './supports-lawyer-service'
import type { Tramite } from '@/lib/types/expediente-types'

export interface AsignacionItem {
  id: string
  tramite_id: string
  assistant_id: string
  lawyer_id: string
  notaria_id: string
  created_at: string
  /** Datos mínimos del asistente (opcional) */
  asistente_email?: string
  asistente_nombre?: string
}

/**
 * Lista asignaciones activas de un trámite (asistentes asignados).
 */
export async function listAsignacionesPorTramite(tramiteId: string): Promise<AsignacionItem[]> {
  const supabase = createServerClient()
  const { data: rows, error } = await supabase
    .from('tramite_asignaciones')
    .select('id, tramite_id, assistant_id, lawyer_id, notaria_id, created_at')
    .eq('tramite_id', tramiteId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!rows?.length) return []

  const assistantIds = [...new Set(rows.map((r) => r.assistant_id))]
  const { data: users } = await supabase
    .from('usuarios')
    .select('id, email, nombre')
    .in('id', assistantIds)
  const byId = new Map((users || []).map((u) => [u.id, u]))

  return rows.map((r) => ({
    id: r.id,
    tramite_id: r.tramite_id,
    assistant_id: r.assistant_id,
    lawyer_id: r.lawyer_id,
    notaria_id: r.notaria_id,
    created_at: r.created_at,
    asistente_email: byId.get(r.assistant_id)?.email,
    asistente_nombre: byId.get(r.assistant_id)?.nombre,
  }))
}

/**
 * Lista trámites asignados a un asistente en una notaría (para ReBAC).
 */
export async function listTramitesAsignadosAAsistente(
  assistantId: string,
  notariaId: string
): Promise<Tramite[]> {
  const supabase = createServerClient()
  const { data: asignaciones, error } = await supabase
    .from('tramite_asignaciones')
    .select('tramite_id')
    .eq('assistant_id', assistantId)
    .eq('notaria_id', notariaId)

  if (error) throw new Error(error.message)
  if (!asignaciones?.length) return []

  const tramiteIds = asignaciones.map((a) => a.tramite_id)
  const { data: tramites, error: tramitesError } = await supabase
    .from('tramites')
    .select('*')
    .in('id', tramiteIds)
    .order('created_at', { ascending: false })

  if (tramitesError) throw new Error(tramitesError.message)
  return (tramites || []) as Tramite[]
}

/**
 * Valida que el usuario pertenezca a la notaría.
 */
async function userBelongsToNotaria(userId: string, notariaId: string): Promise<boolean> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select('notaria_id')
    .eq('id', userId)
    .single()
  if (error || !data) return false
  return data.notaria_id === notariaId
}

/**
 * Asigna un trámite a un asistente. Valida: trámite existe y es del lawyer;
 * lawyer y asistente en la notaría; relación activa supports_lawyer.
 */
export async function asignarTramiteAAasistente(
  tramiteId: string,
  assistantId: string,
  lawyerId: string,
  notariaId: string
): Promise<AsignacionItem> {
  const tramite = await TramiteService.findTramiteById(tramiteId)
  if (!tramite) throw new Error('NOT_FOUND')
  if ((tramite.user_id ?? null) !== lawyerId) throw new Error('FORBIDDEN')

  const lawyerOk = await userBelongsToNotaria(lawyerId, notariaId)
  if (!lawyerOk) throw new Error('FORBIDDEN')
  const assistantOk = await userBelongsToNotaria(assistantId, notariaId)
  if (!assistantOk) throw new Error('FORBIDDEN')

  const relation = await findActiveRelation(lawyerId, assistantId)
  if (!relation) throw new Error('FORBIDDEN')

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('tramite_asignaciones')
    .insert({
      tramite_id: tramiteId,
      assistant_id: assistantId,
      lawyer_id: lawyerId,
      notaria_id: notariaId,
    })
    .select('id, tramite_id, assistant_id, lawyer_id, notaria_id, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('CONFLICT') // unique violation
    throw new Error(error.message)
  }

  return {
    ...data,
    asistente_email: undefined,
    asistente_nombre: undefined,
  } as AsignacionItem
}

/**
 * Obtiene una asignación por trámite y asistente (para validar existencia antes de borrar).
 */
export async function getAsignacion(
  tramiteId: string,
  assistantId: string
): Promise<AsignacionItem | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('tramite_asignaciones')
    .select('id, tramite_id, assistant_id, lawyer_id, notaria_id, created_at')
    .eq('tramite_id', tramiteId)
    .eq('assistant_id', assistantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as AsignacionItem | null
}

/**
 * Quita la asignación de un trámite a un asistente.
 */
export async function quitarAsignacion(tramiteId: string, assistantId: string): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('tramite_asignaciones')
    .delete()
    .eq('tramite_id', tramiteId)
    .eq('assistant_id', assistantId)

  if (error) throw new Error(error.message)
}
