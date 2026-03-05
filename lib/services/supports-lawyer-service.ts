import { createServerClient } from '@/lib/supabase'

export interface AsistenteListItem {
  user_id: string
  email: string
  nombre: string
  added_at: string
}

export interface SupportRelation {
  id: string
  lawyer_id: string
  assistant_id: string
  notaria_id: string
  created_at: string
  removed_at: string | null
}

/**
 * Lista asistentes asignados a un abogado (solo relaciones activas: removed_at NULL).
 */
export async function listAsistentesForLawyer(lawyerId: string): Promise<AsistenteListItem[]> {
  const supabase = createServerClient()
  const { data: relations, error: relError } = await supabase
    .from('usuarios_supports_lawyer')
    .select('assistant_id, created_at')
    .eq('lawyer_id', lawyerId)
    .is('removed_at', null)

  if (relError) throw new Error(relError.message)
  if (!relations?.length) return []

  const ids = relations.map((r) => r.assistant_id)
  const { data: users, error: usersError } = await supabase
    .from('usuarios')
    .select('id, email, nombre')
    .in('id', ids)

  if (usersError) throw new Error(usersError.message)
  const byId = new Map((users || []).map((u) => [u.id, u]))

  return relations.map((r) => {
    const u = byId.get(r.assistant_id)
    return {
      user_id: r.assistant_id,
      email: u?.email ?? '',
      nombre: u?.nombre ?? '',
      added_at: r.created_at,
    }
  })
}

/**
 * Obtiene la relación activa (removed_at NULL) entre lawyer y assistant.
 */
export async function findActiveRelation(
  lawyerId: string,
  assistantId: string
): Promise<SupportRelation | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('usuarios_supports_lawyer')
    .select('*')
    .eq('lawyer_id', lawyerId)
    .eq('assistant_id', assistantId)
    .is('removed_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as SupportRelation | null
}

/**
 * Crea relación lawyer–assistant. Lanza si ya existe una relación activa.
 */
export async function addAssistant(
  lawyerId: string,
  assistantId: string,
  notariaId: string
): Promise<{ lawyer_id: string; assistant_id: string; created_at: string }> {
  const supabase = createServerClient()
  const existing = await findActiveRelation(lawyerId, assistantId)
  if (existing) throw new Error('CONFLICT')

  const { data, error } = await supabase
    .from('usuarios_supports_lawyer')
    .insert({
      lawyer_id: lawyerId,
      assistant_id: assistantId,
      notaria_id: notariaId,
    })
    .select('lawyer_id, assistant_id, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('CONFLICT')
    throw new Error(error.message)
  }
  return {
    lawyer_id: data.lawyer_id,
    assistant_id: data.assistant_id,
    created_at: data.created_at,
  }
}

/**
 * Soft delete: marca removed_at. Si no hay relación activa, lanza NOT_FOUND.
 */
export async function removeAssistant(
  lawyerId: string,
  assistantId: string
): Promise<{ lawyer_id: string; assistant_id: string; removed_at: string }> {
  const supabase = createServerClient()
  const rel = await findActiveRelation(lawyerId, assistantId)
  if (!rel) throw new Error('NOT_FOUND')

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('usuarios_supports_lawyer')
    .update({ removed_at: now })
    .eq('id', rel.id)

  if (error) throw new Error(error.message)
  return { lawyer_id: lawyerId, assistant_id: assistantId, removed_at: now }
}
