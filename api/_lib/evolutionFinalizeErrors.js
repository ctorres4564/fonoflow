export const FINALIZE_ERROR_CODES = Object.freeze({
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  INVALID_DECISION: 'INVALID_DECISION',
  OBJECTIVE_CONFLICT: 'OBJECTIVE_CONFLICT',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
})

const ERROR_DEFINITIONS = Object.freeze({
  METHOD_NOT_ALLOWED: [405, 'Método não permitido.'],
  IDEMPOTENCY_KEY_REQUIRED: [400, 'Chave de idempotência obrigatória.'],
  INVALID_IDEMPOTENCY_KEY: [400, 'Chave de idempotência inválida.'],
  INVALID_JSON: [400, 'JSON inválido.'],
  INVALID_PAYLOAD: [400, 'Solicitação inválida.'],
  UNSUPPORTED_VERSION: [409, 'Versão não suportada.'],
  INVALID_DECISION: [422, 'Decisão de revisão inválida.'],
  OBJECTIVE_CONFLICT: [409, 'Conflito nos objetivos relacionados.'],
  LIMIT_EXCEEDED: [413, 'Limite da solicitação excedido.'],
  UNAUTHENTICATED: [401, 'Sessão inválida ou expirada.'],
  FORBIDDEN: [403, 'Acesso não autorizado.'],
  NOT_FOUND: [404, 'Recurso não encontrado.'],
  CONFLICT: [409, 'A operação está em conflito com o estado atual.'],
  RATE_LIMITED: [429, 'Muitas solicitações. Tente novamente mais tarde.'],
  SERVICE_UNAVAILABLE: [503, 'Recurso temporariamente indisponível.'],
  INTERNAL_ERROR: [500, 'Não foi possível processar a solicitação.'],
})

export class EvolutionFinalizeError extends Error {
  constructor(code, internalReason = '') {
    const [status, clientMessage] = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL_ERROR
    super(clientMessage)
    this.name = 'EvolutionFinalizeError'
    this.code = ERROR_DEFINITIONS[code] ? code : FINALIZE_ERROR_CODES.INTERNAL_ERROR
    this.status = status
    this.clientMessage = clientMessage
    this.internalReason = internalReason
  }

  toClientResponse() {
    return { error: { code: this.code, message: this.clientMessage } }
  }
}

export function finalizeError(code, internalReason = '') {
  return new EvolutionFinalizeError(code, internalReason)
}

export function asSafeFinalizeError(error) {
  return error instanceof EvolutionFinalizeError ? error : finalizeError(FINALIZE_ERROR_CODES.INTERNAL_ERROR)
}
