import { describe, expect, it, vi, beforeEach } from 'vitest'
import { finalizeEvolutionWithQualityReview } from './evolutionFinalizeService'

vi.mock('../firebase/config', () => {
  return {
    auth: {
      currentUser: {
        getIdToken: vi.fn(async () => 'fake-token')
      }
    }
  }
})

global.fetch = vi.fn()

describe('evolutionFinalizeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constrói corretamente os headers e o endpoint de destino', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'created', replayed: false })
    })

    const payload = {
      operation: 'create',
      evolution: { notes: 'Notas clínicas' }
    }

    const result = await finalizeEvolutionWithQualityReview({
      patientId: 'patient-123',
      idempotencyKey: 'idemp-key-1',
      payload
    })

    expect(fetch).toHaveBeenCalledWith('/api/evolutions/finalize', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-token',
        'idempotency-key': 'idemp-key-1'
      },
      body: JSON.stringify({
        patientId: 'patient-123',
        ...payload
      })
    }))
    expect(result).toEqual({ status: 'created', replayed: false })
  })

  it('lida corretamente com erros 429 de Rate Limit com Retry-After', async () => {
    const headers = new Headers()
    headers.set('Retry-After', '45')
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições.' } })
    })

    try {
      await finalizeEvolutionWithQualityReview({
        patientId: 'patient-1',
        idempotencyKey: 'idemp-1',
        payload: {}
      })
      throw new Error('should-have-failed')
    } catch (error) {
      expect(error.code).toBe('RATE_LIMITED')
      expect(error.status).toBe(429)
      expect(error.retryAfter).toBe(45)
    }
  })
})
