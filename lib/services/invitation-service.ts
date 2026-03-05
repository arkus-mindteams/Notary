import { createServerClient } from '@/lib/supabase'
import { createHash, randomBytes } from 'crypto'
import type { UserRole } from '@/lib/types/auth-types'

const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
} as const

export type InvitationStatus = (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS]

export interface UserInvitation {
  id: string
  email: string
  role: string
  notaria_id: string
  token: string // stored as hash in DB
  status: string
  preconfig_json: Record<string, unknown>
  created_at: string
  updated_at: string
  expires_at: string | null
  accepted_at: string | null
  revoked_at: string | null
  resent_at: string | null
}

export interface CreateInvitationInput {
  email: string
  role: UserRole
  notaria_id: string
  preconfig_json?: { supports_lawyer_user_ids?: string[] }
  expires_in_days?: number
}

export interface CreateInvitationResult {
  invitation: UserInvitation
  /** Token plano solo para enviar al usuario (email); no persistir. */
  plainToken: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  const supabase = createServerClient()
  const plainToken = generateToken()
  const tokenHash = hashToken(plainToken)
  const expiresAt = input.expires_in_days
    ? new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const preconfig = input.preconfig_json || {}
  if (input.role === 'asistente' && !preconfig.supports_lawyer_user_ids) {
    preconfig.supports_lawyer_user_ids = []
  }

  const { data, error } = await supabase
    .from('user_invitations')
    .insert({
      email: input.email.toLowerCase().trim(),
      role: input.role,
      notaria_id: input.notaria_id,
      token: tokenHash,
      status: INVITATION_STATUS.PENDING,
      preconfig_json: preconfig,
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('INVITATION_EXISTS') // unique violation (email or token)
    }
    throw new Error(`Error creando invitación: ${error.message}`)
  }

  return { invitation: data as UserInvitation, plainToken }
}

export async function findInvitationById(id: string): Promise<UserInvitation | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('id', id)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return (data as UserInvitation) || null
}

/** Lista invitaciones pendientes; si notariaId es null/undefined (superadmin) devuelve todas. */
export async function listPendingInvitations(notariaId?: string | null): Promise<UserInvitation[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('user_invitations')
    .select('*')
    .eq('status', INVITATION_STATUS.PENDING)
    .order('created_at', { ascending: false })
  if (notariaId != null) {
    query = query.eq('notaria_id', notariaId)
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data || []) as UserInvitation[]
}

export async function findInvitationByPlainToken(plainToken: string): Promise<UserInvitation | null> {
  const supabase = createServerClient()
  const tokenHash = hashToken(plainToken)
  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('token', tokenHash)
    .single()
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
  return (data as UserInvitation) || null
}

export function isInvitationValid(inv: UserInvitation): { valid: boolean; reason?: string } {
  if (inv.status !== INVITATION_STATUS.PENDING) {
    return { valid: false, reason: inv.status === INVITATION_STATUS.ACCEPTED ? 'already_accepted' : 'revoked_or_expired' }
  }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' }
  }
  return { valid: true }
}

export async function resendInvitation(invitationId: string): Promise<{ invitation: UserInvitation; plainToken: string }> {
  const supabase = createServerClient()
  const inv = await findInvitationById(invitationId)
  if (!inv) throw new Error('NOT_FOUND')
  const check = isInvitationValid(inv)
  if (!check.valid) throw new Error(check.reason === 'already_accepted' ? 'CONFLICT' : 'INVITATION_INVALID')

  const plainToken = generateToken()
  const tokenHash = hashToken(plainToken)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('user_invitations')
    .update({
      token: tokenHash,
      updated_at: now,
      resent_at: now,
    })
    .eq('id', invitationId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return { invitation: data as UserInvitation, plainToken }
}

export async function revokeInvitation(invitationId: string): Promise<UserInvitation> {
  const supabase = createServerClient()
  const inv = await findInvitationById(invitationId)
  if (!inv) throw new Error('NOT_FOUND')
  if (inv.status === INVITATION_STATUS.ACCEPTED) {
    throw new Error('CONFLICT')
  }
  if (inv.status === INVITATION_STATUS.REVOKED) {
    return inv
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('user_invitations')
    .update({
      status: INVITATION_STATUS.REVOKED,
      updated_at: now,
      revoked_at: now,
    })
    .eq('id', invitationId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as UserInvitation
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  const supabase = createServerClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('user_invitations')
    .update({
      status: INVITATION_STATUS.ACCEPTED,
      updated_at: now,
      accepted_at: now,
    })
    .eq('id', invitationId)
  if (error) throw new Error(error.message)
}
