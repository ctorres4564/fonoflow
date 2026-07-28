import { describe, expect, it, vi } from 'vitest'
import { FINALIZE_ERROR_CODES, finalizeError } from './evolutionFinalizeErrors.js'
import { createEvolutionFinalizeHandler } from './evolutionFinalizeHandler.js'

function request(method = 'POST', headers = {}, body = {}) {
  return { method, headers, body }
}

function response() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end() { this.ended = true; return this },
  }
}

function enabled(overrides = {}) {
  return { EVOLUTION_QUALITY_REVIEW_ENABLED: 'true', ...overrides }
}

function handler({ environment = enabled(), authenticate = vi.fn(async () => ({ uid: 'professional-1' })), repository = {}, finalize } = {}) {
  return { authenticate, endpoint: createEvolutionFinalizeHandler({ environment, authenticate, repository, finalize }) }
}

describe('endpoint desligado, métodos e CORS', () => {
  it('feature geral desligada retorna 503 sem autenticar ou acessar repositório', async () => {
    const authenticate = vi.fn()
    const repository = { consumeRateLimit: vi.fn() }
    const endpoint = createEvolutionFinalizeHandler({ environment: {}, authenticate, repository })
    const res = response()
    await endpoint(request('POST'), res)
    expect(res.statusCode).toBe(503)
    expect(authenticate).not.toHaveBeenCalled()
    expect(repository.consumeRateLimit).not.toHaveBeenCalled()
  })

  it('OPTIONS permitido não autentica nem acessa Firestore', async () => {
    const { endpoint, authenticate } = handler({ environment: {} })
    const res = response()
    await endpoint(request('OPTIONS', { origin: 'https://fonoflow.vercel.app' }), res)
    expect(res.statusCode).toBe(204)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('rejeita método diferente e informa Allow', async () => {
    const { endpoint } = handler()
    const res = response()
    await endpoint(request('GET'), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST, OPTIONS')
  })

  it('permite origem explícita e adiciona Vary', async () => {
    const { endpoint } = handler({ environment: {} })
    const res = response()
    await endpoint(request('OPTIONS', { origin: 'http://localhost:5173' }), res)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(res.headers.Vary).toBe('Origin')
  })

  it('não reflete origem desconhecida', async () => {
    const { endpoint } = handler()
    const res = response()
    await endpoint(request('POST', { origin: 'https://evil.example' }), res)
    expect(res.statusCode).toBe(403)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('origem ausente segue política explícita sem emitir ACAO', async () => {
    const { endpoint } = handler({ environment: {} })
    const res = response()
    await endpoint(request('OPTIONS'), res)
    expect(res.statusCode).toBe(204)
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('não apresenta App Check como ativo', async () => {
    const { endpoint } = handler({ environment: {} })
    const res = response()
    await endpoint(request('OPTIONS'), res)
    expect(res.headers['Access-Control-Allow-Headers']).not.toContain('AppCheck')
    expect(res.headers['Access-Control-Allow-Headers']).not.toContain('Firebase-App-Check')
  })
})

describe('autenticação e erros seguros', () => {
  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])('rejeita Authorization inválido: %s', async (authorization) => {
    const { endpoint, authenticate } = handler()
    const res = response()
    await endpoint(request('POST', { authorization }), res)
    expect(res.statusCode).toBe(401)
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('mapeia token inválido para erro genérico', async () => {
    const { endpoint } = handler({ authenticate: vi.fn(async () => { throw new Error('token secreto') }) })
    const res = response()
    await endpoint(request('POST', { authorization: 'Bearer token' }), res)
    expect(res.statusCode).toBe(401)
    expect(JSON.stringify(res.body)).not.toContain('token secreto')
  })

  it('inclui Retry-After no rate limit', async () => {
    const finalize = vi.fn(async () => { throw finalizeError(FINALIZE_ERROR_CODES.RATE_LIMITED) })
    const { endpoint } = handler({ finalize })
    const res = response()
    await endpoint(request('POST', { authorization: 'Bearer token', 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' }, {}), res)
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('60')
  })
})
