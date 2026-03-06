import { createServerClient } from '@/lib/supabase'

export type AuditAction =
  | 'USER_INVITED'
  | 'USER_INVITATION_RESENT'
  | 'USER_INVITATION_REVOKED'
  | 'USER_ACTIVATED'
  | 'USER_STATUS_CHANGED'
  | 'LAWYER_SUPPORT_ASSIGNED'
  | 'LAWYER_SUPPORT_REMOVED'
  | 'TRAMITE_ASSIGNED_TO_ASSISTANT'
  | 'TRAMITE_UNASSIGNED_FROM_ASSISTANT'

export interface AuditLogEntry {
  actor_user_id: string | null
  action: AuditAction
  entity_type: string
  entity_id: string | null
  metadata_json: Record<string, unknown>
  notaria_id: string | null
}

export async function insertAuditLog(entry: AuditLogEntry): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase.from('audit_logs').insert({
    actor_user_id: entry.actor_user_id,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    metadata_json: entry.metadata_json,
    notaria_id: entry.notaria_id,
  })
  if (error) {
    console.error('[audit-log-service] Error inserting audit log:', error)
    // No lanzar: auditoría no debe romper el flujo principal
  }
}
