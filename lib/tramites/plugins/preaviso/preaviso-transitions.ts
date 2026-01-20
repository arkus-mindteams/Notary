type TransitionRule = {
  id: string
  from: string
  to: string
  when: (context: any) => boolean
  reason: string
}

type TransitionInfo = {
  from: string | null
  to: string
  allowed: boolean
  reason: string
  ruleId?: string
}

const hasInmuebleBasico = (ctx: any): boolean => {
  return !!ctx?.inmueble?.folio_real &&
    Array.isArray(ctx?.inmueble?.partidas) &&
    ctx.inmueble.partidas.length > 0 &&
    !!ctx?.inmueble?.direccion?.calle
}

const hasVendedorBasico = (ctx: any): boolean => {
  const v0 = ctx?.vendedores?.[0]
  const nombre = v0?.persona_fisica?.nombre || v0?.persona_moral?.denominacion_social
  return !!nombre && !!v0?.tipo_persona
}

const hasCompradorBasico = (ctx: any): boolean => {
  const c0 = ctx?.compradores?.[0]
  const nombre = c0?.persona_fisica?.nombre || c0?.persona_moral?.denominacion_social
  const estadoCivil = c0?.persona_fisica?.estado_civil
  return !!nombre && !!c0?.tipo_persona && (!!estadoCivil || c0?.tipo_persona === 'persona_moral')
}

const isCasado = (ctx: any): boolean =>
  ctx?.compradores?.[0]?.persona_fisica?.estado_civil === 'casado'

const hasConyuge = (ctx: any): boolean =>
  !!ctx?.compradores?.[0]?.persona_fisica?.conyuge?.nombre

const hasCredito = (ctx: any): boolean =>
  Array.isArray(ctx?.creditos) && ctx.creditos.length > 0

const hasCreditoCompleto = (ctx: any): boolean => {
  const c0 = ctx?.creditos?.[0]
  return !!c0?.institucion && Array.isArray(c0?.participantes) && c0.participantes.length > 0
}

const hasGravamenAcreedor = (ctx: any): boolean => {
  const g0 = Array.isArray(ctx?.gravamenes) ? ctx.gravamenes[0] : null
  return !!g0?.institucion
}

const rules: TransitionRule[] = [
  {
    id: 'inmueble_completo',
    from: 'ESTADO_2',
    to: 'ESTADO_3',
    when: hasInmuebleBasico,
    reason: 'inmueble_completo'
  },
  {
    id: 'vendedor_completo',
    from: 'ESTADO_3',
    to: 'ESTADO_1',
    when: hasVendedorBasico,
    reason: 'vendedor_completo'
  },
  {
    id: 'pago_confirmado',
    from: 'ESTADO_1',
    to: 'ESTADO_4',
    when: (ctx) => ctx?.creditos !== undefined,
    reason: 'forma_pago_confirmada'
  },
  {
    id: 'comprador_casado',
    from: 'ESTADO_4',
    to: 'ESTADO_4B',
    when: (ctx) => hasCompradorBasico(ctx) && isCasado(ctx) && !hasConyuge(ctx),
    reason: 'conyuge_requerido'
  },
  {
    id: 'comprador_completo_credito',
    from: 'ESTADO_4',
    to: 'ESTADO_5',
    when: (ctx) => hasCompradorBasico(ctx) && hasCredito(ctx),
    reason: 'comprador_completo_con_credito'
  },
  {
    id: 'comprador_completo_contado',
    from: 'ESTADO_4',
    to: 'ESTADO_6',
    when: (ctx) => hasCompradorBasico(ctx) && !hasCredito(ctx),
    reason: 'comprador_completo_sin_credito'
  },
  {
    id: 'conyuge_completo_credito',
    from: 'ESTADO_4B',
    to: 'ESTADO_5',
    when: (ctx) => hasConyuge(ctx) && hasCredito(ctx),
    reason: 'conyuge_completo_con_credito'
  },
  {
    id: 'conyuge_completo_contado',
    from: 'ESTADO_4B',
    to: 'ESTADO_6',
    when: (ctx) => hasConyuge(ctx) && !hasCredito(ctx),
    reason: 'conyuge_completo_sin_credito'
  },
  {
    id: 'credito_completo',
    from: 'ESTADO_5',
    to: 'ESTADO_6',
    when: hasCreditoCompleto,
    reason: 'credito_completo'
  },
  {
    id: 'gravamen_acreedor',
    from: 'ESTADO_6',
    to: 'ESTADO_6B',
    when: (ctx) => ctx?.inmueble?.existe_hipoteca === true && hasGravamenAcreedor(ctx),
    reason: 'gravamen_con_acreedor'
  }
]

export const getPreavisoTransitionRules = () =>
  rules.map((r) => ({
    id: r.id,
    from: r.from,
    to: r.to,
    reason: r.reason
  }))

export const getPreavisoTransitionInfo = (
  fromState: string | null,
  toState: string,
  context: any
): TransitionInfo => {
  if (!fromState) {
    return {
      from: null,
      to: toState,
      allowed: true,
      reason: 'inicio_flujo'
    }
  }

  if (fromState === toState) {
    return {
      from: fromState,
      to: toState,
      allowed: true,
      reason: 'estado_pendiente'
    }
  }

  const match = rules.find((r) => r.from === fromState && r.to === toState && r.when(context))
  if (match) {
    return {
      from: fromState,
      to: toState,
      allowed: true,
      reason: match.reason,
      ruleId: match.id
    }
  }

  if (toState === 'ESTADO_8') {
    return {
      from: fromState,
      to: toState,
      allowed: true,
      reason: 'todo_completo'
    }
  }

  return {
    from: fromState,
    to: toState,
    allowed: false,
    reason: 'salto_flexible'
  }
}
