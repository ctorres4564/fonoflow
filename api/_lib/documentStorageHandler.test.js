import { describe, expect, it, vi } from 'vitest'
import { createDocumentStorageHandler } from './documentStorageHandler.js'

function responseDouble() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
    end() {
      return this
    },
  }
}

describe('document storage HTTP handler', () => {
  it('rejeita requisição sem Bearer token e impede cache', async () => {
    const response = responseDouble()
    const handler = createDocumentStorageHandler({
      authenticate: vi.fn(),
      repository: {},
      operation: vi.fn(),
    })
    await handler({ method: 'POST', headers: {}, body: {} }, response)

    expect(response.statusCode).toBe(401)
    expect(response.headers['Cache-Control']).toBe('no-store')
  })

  it('usa o uid verificado e ignora identidade forjada no payload', async () => {
    const response = responseDouble()
    const operation = vi.fn().mockResolvedValue({ ok: true, replayed: false })
    const handler = createDocumentStorageHandler({
      authenticate: vi.fn().mockResolvedValue({ uid: 'verified-user' }),
      repository: {},
      operation,
      successStatus: 201,
    })
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { userId: 'forged-user', patientId: 'patient-a' },
      query: {},
    }, response)

    expect(response.statusCode).toBe(201)
    expect(operation).toHaveBeenCalledWith(expect.objectContaining({ uid: 'verified-user' }))
  })

  it('rejeita origem não permitida antes de executar a operação', async () => {
    const response = responseDouble()
    const operation = vi.fn()
    const handler = createDocumentStorageHandler({
      authenticate: vi.fn(),
      repository: {},
      operation,
    })
    await handler({
      method: 'POST',
      headers: { origin: 'https://evil.example', authorization: 'Bearer token' },
      body: {},
    }, response)

    expect(response.statusCode).toBe(403)
    expect(operation).not.toHaveBeenCalled()
  })
})
