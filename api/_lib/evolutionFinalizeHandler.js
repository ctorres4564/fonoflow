import { asSafeFinalizeError, FINALIZE_ERROR_CODES, finalizeError } from './evolutionFinalizeErrors.js'
import { parseJsonBody } from './evolutionFinalizeValidation.js'
import { finalizeEvolutionCreate } from './evolutionFinalizeWorkflow.js'

const DEFAULT_ORIGINS = Object.freeze(['https://fonoflow.vercel.app', 'http://localhost:3000', 'http://localhost:5173'])

function bearerToken(value) {
  if (typeof value !== 'string') return null
  return value.match(/^Bearer\s+(\S+)$/)?.[1] || null
}

function configuredOrigins(environment) {
  const extra = String(environment.EVOLUTION_QUALITY_REVIEW_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean)
  return new Set([...DEFAULT_ORIGINS, ...extra])
}

function configureCors(request, response, environment) {
  const origin = request.headers?.origin
  const allowed = !origin || configuredOrigins(environment).has(origin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key')
  if (origin && allowed) response.setHeader('Access-Control-Allow-Origin', origin)
  return allowed
}

export function createEvolutionFinalizeHandler({ environment = process.env, authenticate, repository, now = () => new Date(), finalize = finalizeEvolutionCreate }) {
  return async function evolutionFinalizeHandler(request, response) {
    const corsAllowed = configureCors(request, response, environment)
    if (request.method === 'OPTIONS') return response.status(corsAllowed ? 204 : 403).end()
    if (!corsAllowed) return response.status(403).json(finalizeError(FINALIZE_ERROR_CODES.FORBIDDEN).toClientResponse())
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST, OPTIONS')
      return response.status(405).json(finalizeError(FINALIZE_ERROR_CODES.METHOD_NOT_ALLOWED).toClientResponse())
    }
    if (environment.EVOLUTION_QUALITY_REVIEW_ENABLED !== 'true') {
      return response.status(503).json(finalizeError(FINALIZE_ERROR_CODES.SERVICE_UNAVAILABLE).toClientResponse())
    }
    try {
      const token = bearerToken(request.headers?.authorization)
      if (!token) throw finalizeError(FINALIZE_ERROR_CODES.UNAUTHENTICATED, 'missing_bearer')
      let identity
      try {
        identity = await authenticate(token)
      } catch (error) {
        if (error?.code === FINALIZE_ERROR_CODES.UNAUTHENTICATED) throw error
        throw finalizeError(FINALIZE_ERROR_CODES.UNAUTHENTICATED, 'token_verification_failed')
      }
      if (!identity?.uid) throw finalizeError(FINALIZE_ERROR_CODES.UNAUTHENTICATED, 'invalid_identity')
      const payload = parseJsonBody(request.body)
      const result = await finalize({
        uid: identity.uid,
        idempotencyKey: request.headers?.['idempotency-key'],
        payload,
        repository,
        now: now(),
      })
      return response.status(result.replayed ? 200 : 201).json(result)
    } catch (error) {
      const safe = asSafeFinalizeError(error)
      if (safe.code === FINALIZE_ERROR_CODES.RATE_LIMITED) response.setHeader('Retry-After', '60')
      if (safe.code === FINALIZE_ERROR_CODES.INTERNAL_ERROR) {
        console.error('Evolution finalize failed:', error?.code || error?.name || 'unknown_error')
      }
      return response.status(safe.status).json(safe.toClientResponse())
    }
  }
}
