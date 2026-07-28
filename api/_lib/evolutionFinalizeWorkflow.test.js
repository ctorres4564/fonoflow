import { describe, expect, it } from 'vitest'
import { EvolutionFinalizeError } from './evolutionFinalizeErrors.js'
import { assertAccountEnabled } from './evolutionFinalizeFirebase.js'
import { authorizeProfile, finalizeEvolutionCreate, operationDocumentId } from './evolutionFinalizeWorkflow.js'

const KEY = '550e8400-e29b-41d4-a716-446655440000'
const NOW = new Date('2026-07-20T12:00:00.000Z')

function payload(overrides = {}) {
  return {
    operation: 'create', patientId: 'patient-1', scheduleId: null,
    expectedEvolutionRevision: null, incrementSession: false,
    evolution: {
      schemaVersion: 2, sessionType: 'Terapia', date: '2026-07-20', duration: 50,
      clinicalActivity: 'Treino articulatório.', observedResponse: 'Produziu sete palavras.',
      nextStep: 'Prosseguir o treino.', notes: '', applicability: {}, objectiveProgress: [],
    },
    reviewSession: {
      initialAlerts: [], finalAlerts: [], ignoredAlerts: [], reviewPasses: 1,
      startedAt: '2026-07-20T11:58:00.000Z', completedAt: '2026-07-20T12:00:00.000Z',
    },
    ...overrides,
  }
}

class FakeRepository {
  constructor(documents = {}) {
    this.documents = new Map(Object.entries(documents).map(([path, value]) => [path, structuredClone(value)]))
    this.ids = 0
    this.rateCalls = 0
    this.failCommit = false
    this.queue = Promise.resolve()
  }
  createId() { this.ids += 1; return `generated-${this.ids}` }
  serverTimestamp() { return '__SERVER_TIMESTAMP__' }
  async consumeRateLimit() { this.rateCalls += 1 }
  async runTransaction(callback) {
    const execute = async () => {
      const staged = new Map(this.documents)
      const transaction = {
        readMany: async (paths) => paths.map((path) => path ? structuredClone(staged.get(path) ?? null) : null),
        create: (path, value) => {
          if (staged.has(path)) throw new Error('already-exists')
          staged.set(path, structuredClone(value))
        },
        update: (path, value) => {
          if (!staged.has(path)) throw new Error('not-found')
          staged.set(path, { ...staged.get(path), ...structuredClone(value) })
        },
      }
      const result = await callback(transaction)
      if (this.failCommit) throw new Error('commit-failed')
      this.documents = staged
      return result
    }
    const result = this.queue.then(execute, execute)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

function repository(extra = {}) {
  return new FakeRepository({
    'users/professional-1': { uid: 'professional-1', features: { evolutionQualityReview: true } },
    'patients/patient-1': { userId: 'professional-1', status: 'Ativo', completedSessions: 2, totalSessions: 10, remainingSessions: 8 },
    ...extra,
  })
}

function execute(repo, requestPayload = payload()) {
  return finalizeEvolutionCreate({ uid: 'professional-1', idempotencyKey: KEY, payload: requestPayload, repository: repo, now: NOW })
}

function expectCode(promise, code) {
  return expect(promise).rejects.toMatchObject({ name: 'EvolutionFinalizeError', code })
}

describe('autorização definitiva do MVP', () => {
  it.each([
    ['perfil ausente', null], ['sem features', {}], ['features vazia', { features: {} }],
    ['feature false', { features: { evolutionQualityReview: false } }],
    ['feature string', { features: { evolutionQualityReview: 'true' } }],
  ])('rejeita %s', (_label, profile) => expect(() => authorizeProfile(profile)).toThrow(EvolutionFinalizeError))

  it('aceita feature true sem exigir role', () => {
    expect(authorizeProfile({ features: { evolutionQualityReview: true } })).toBeUndefined()
  })

  it('rejeita conta Firebase desabilitada', () => {
    expect(() => assertAccountEnabled({ disabled: true })).toThrow(EvolutionFinalizeError)
  })
})

describe('paciente, agenda e sessões', () => {
  it('cria para paciente Ativo e proprietário', async () => {
    const repo = repository()
    await expect(execute(repo)).resolves.toMatchObject({ status: 'created', replayed: false })
  })

  it('rejeita paciente Finalizado', () => expectCode(execute(repository({
    'patients/patient-1': { userId: 'professional-1', status: 'Finalizado' },
  })), 'CONFLICT'))

  it('rejeita paciente de outro usuário', () => expectCode(execute(repository({
    'patients/patient-1': { userId: 'other', status: 'Ativo' },
  })), 'FORBIDDEN'))

  it('rejeita payload contendo role', () => expectCode(execute(repository(), { ...payload(), role: 'professional' }), 'INVALID_PAYLOAD'))

  it('evolução avulsa com incrementSession=false não altera contadores', async () => {
    const repo = repository()
    await execute(repo)
    expect(repo.documents.get('patients/patient-1')).toMatchObject({ completedSessions: 2, remainingSessions: 8, status: 'Ativo' })
  })

  it('evolução avulsa com incrementSession=true aplica a contabilização atual', async () => {
    const repo = repository()
    await execute(repo, payload({ incrementSession: true }))
    expect(repo.documents.get('patients/patient-1')).toMatchObject({ completedSessions: 3, remainingSessions: 7, status: 'Ativo' })
  })

  it('agendamento exige incrementSession=true', () => expectCode(execute(repository(), payload({ scheduleId: 'schedule-1', incrementSession: false })), 'INVALID_PAYLOAD'))

  it('conclui agendamento e contabiliza exatamente uma vez', async () => {
    const repo = repository({
      'schedules/schedule-1': { patientId: 'patient-1', userId: 'professional-1', status: 'Agendado', sessionType: 'Terapia' },
    })
    const scheduled = payload({ scheduleId: 'schedule-1', incrementSession: true })
    await execute(repo, scheduled)
    const replay = await execute(repo, scheduled)
    expect(replay.replayed).toBe(true)
    expect(repo.documents.get('patients/patient-1').completedSessions).toBe(3)
    expect(repo.documents.get('schedules/schedule-1')).toMatchObject({ status: 'Realizado', sessionDeducted: true })
  })

  it('rejeita agendamento já concluído com outra chave', async () => {
    const repo = repository({
      'schedules/schedule-1': { patientId: 'patient-1', userId: 'professional-1', status: 'Realizado', sessionType: 'Terapia', evolutionId: 'old' },
    })
    await expectCode(execute(repo, payload({ scheduleId: 'schedule-1', incrementSession: true })), 'CONFLICT')
  })

  it('rejeita estado de agenda que não permite conclusão', async () => {
    const repo = repository({
      'schedules/schedule-1': { patientId: 'patient-1', userId: 'professional-1', status: 'Cancelado pelo paciente', sessionType: 'Terapia' },
    })
    await expectCode(execute(repo, payload({ scheduleId: 'schedule-1', incrementSession: true })), 'CONFLICT')
  })
})

describe('objetivos, persistência e segurança', () => {
  it('reconstrói metadados do objetivo e atualiza o plano', async () => {
    const repo = repository({
      'patients/patient-1/therapeuticPlan/current': { status: 'Ativo', objectives: [{ id: 'goal-1', description: 'Produção', area: 'Fala', status: 'Em desenvolvimento' }] },
    })
    const request = payload()
    request.evolution.objectiveProgress = [{ objectiveId: 'goal-1', status: 'Atingido', performance: 'Sete acertos' }]
    await execute(repo, request)
    const evolution = repo.documents.get('patients/patient-1/evolutions/generated-1')
    expect(evolution.objectiveProgress[0]).toMatchObject({ description: 'Produção', area: 'Fala', performance: 'Sete acertos' })
    expect(repo.documents.get('patients/patient-1/therapeuticPlan/current').objectives[0].lastPerformance).toBe('Sete acertos')
    expect(repo.documents.get('patients/patient-1/therapeuticPlan/current').objectives[0].status).toBe('Atingido')
  })

  it('rejeita objetivo fora do plano atual', async () => {
    const request = payload()
    request.evolution.objectiveProgress = [{ objectiveId: 'other', performance: 'Texto' }]
    await expectCode(execute(repository(), request), 'OBJECTIVE_CONFLICT')
  })

  it('cria evolução, qualityReview, idempotência e auditLog na mesma transação', async () => {
    const repo = repository()
    await execute(repo)
    expect(repo.documents.has('patients/patient-1/evolutions/generated-1')).toBe(true)
    expect(repo.documents.has('patients/patient-1/evolutions/generated-1/qualityReviews/revision-1')).toBe(true)
    expect([...repo.documents.keys()].some((key) => key.startsWith('evolutionFinalizeOperations/'))).toBe(true)
    const audit = repo.documents.get('auditLogs/generated-2')
    expect(Object.keys(audit).sort()).toEqual(['action', 'actorId', 'changedFields', 'occurredAt', 'patientId', 'resourceId', 'schemaVersion', 'source'].sort())
    expect(JSON.stringify(audit)).not.toContain('Treino articulatório')
    expect(JSON.stringify(audit)).not.toContain('Produziu sete palavras')
  })

  it('não escreve features em nenhum documento', async () => {
    const repo = repository()
    await execute(repo)
    const written = [...repo.documents.entries()].filter(([path]) => path !== 'users/professional-1')
    expect(written.some(([, value]) => Object.hasOwn(value, 'features'))).toBe(false)
  })

  it('falha de commit não deixa documentos parciais', async () => {
    const repo = repository()
    repo.failCommit = true
    await expect(execute(repo)).rejects.toThrow('commit-failed')
    expect([...repo.documents.keys()].some((key) => key.includes('/evolutions/'))).toBe(false)
  })
})

describe('idempotência persistente', () => {
  it('usa identificador derivado e não a chave bruta', () => {
    expect(operationDocumentId('professional-1', KEY)).toMatch(/^[0-9a-f]{64}$/)
    expect(operationDocumentId('professional-1', KEY)).not.toContain(KEY)
  })

  it('replay não cria nem contabiliza novamente', async () => {
    const repo = repository()
    const first = await execute(repo, payload({ incrementSession: true }))
    const size = repo.documents.size
    const second = await execute(repo, payload({ incrementSession: true }))
    expect(first.replayed).toBe(false)
    expect(second).toMatchObject({ evolutionId: first.evolutionId, replayed: true })
    expect(repo.documents.size).toBe(size)
    expect(repo.documents.get('patients/patient-1').completedSessions).toBe(3)
  })

  it('duas solicitações concorrentes resultam em uma criação e um replay', async () => {
    const repo = repository()
    const results = await Promise.all([execute(repo, payload({ incrementSession: true })), execute(repo, payload({ incrementSession: true }))])
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(repo.documents.get('patients/patient-1').completedSessions).toBe(3)
    expect([...repo.documents.keys()].filter((key) => /\/evolutions\/generated-/.test(key) && !key.includes('/qualityReviews/'))).toHaveLength(1)
  })

  it('mesma chave com conteúdo clínico diferente retorna conflito', async () => {
    const repo = repository()
    await execute(repo)
    const changed = payload()
    changed.evolution.nextStep = 'Conduta diferente.'
    await expectCode(execute(repo, changed), 'CONFLICT')
  })
})
