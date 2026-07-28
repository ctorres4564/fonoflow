import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { vi } from 'vitest'
import { createEvolutionRepository, getEvolutionAdminApp } from './evolutionFinalizeFirebase.js'
import { finalizeEvolutionCreate } from './evolutionFinalizeWorkflow.js'

// Mock de segurança para transações locais do emulador
vi.mock('./evolutionFinalizeWorkflow.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    authorizeProfile: () => undefined
  }
})

const KEY = '550e8400-e29b-41d4-a716-446655440000'
const isSafeEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && (!process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT.startsWith('demo-')))
const emulatorDescribe = isSafeEmulator ? describe : describe.skip

function payload() {
  return {
    operation: 'create', patientId: 'patient-1', scheduleId: null,
    expectedEvolutionRevision: null, incrementSession: true,
    evolution: {
      schemaVersion: 2, sessionType: 'Terapia', date: '2026-07-20', duration: 50,
      clinicalActivity: 'Atividade estruturada.', observedResponse: 'Resposta observada.',
      nextStep: 'Manter planejamento.', notes: '', applicability: {}, objectiveProgress: [],
    },
    reviewSession: {
      initialAlerts: [], finalAlerts: [], ignoredAlerts: [], reviewPasses: 1,
      startedAt: '2026-07-20T11:59:00.000Z', completedAt: '2026-07-20T12:00:00.000Z',
    },
  }
}

emulatorDescribe('transação real no Firestore Emulator', () => {
  const app = getEvolutionAdminApp()
  const db = getFirestore(app)
  const repository = createEvolutionRepository({ rateLimit: 100 })

  beforeEach(async () => {
    for (const collectionName of ['users', 'patients', 'schedules', 'auditLogs', 'evolutionFinalizeOperations', 'evolutionFinalizeRateLimits']) {
      await db.recursiveDelete(db.collection(collectionName))
    }
    await db.doc('users/professional-1').set({ features: { evolutionQualityReview: true } })
    await db.doc('patients/patient-1').set({
      userId: 'professional-1', status: 'Ativo', completedSessions: 2, totalSessions: 10, remainingSessions: 8,
    })
  })

  afterAll(async () => deleteApp(app))

  it('mantém idempotência concorrente e contabiliza uma única sessão', async () => {
    const execute = () => finalizeEvolutionCreate({
      uid: 'professional-1', idempotencyKey: KEY, payload: payload(), repository: repository,
      now: new Date('2026-07-20T12:00:00.000Z'),
    })
    const results = await Promise.all([execute(), execute()])
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect((await db.doc('patients/patient-1').get()).data().completedSessions).toBe(3)
    expect((await db.collection('patients/patient-1/evolutions').get()).size).toBe(1)
    expect((await db.collection('auditLogs').get()).size).toBe(1)
    expect((await db.collection('evolutionFinalizeOperations').get()).size).toBe(1)
  })

  it('aborta todas as escritas quando a transação falha', async () => {
    await expect(repository.runTransaction(async (transaction) => {
      transaction.create('patients/patient-1/evolutions/partial', { schemaVersion: 2 })
      transaction.create('auditLogs/partial', { action: 'evolution.created' })
      throw new Error('forced-rollback')
    })).rejects.toThrow('forced-rollback')
    expect((await db.doc('patients/patient-1/evolutions/partial').get()).exists).toBe(false)
    expect((await db.doc('auditLogs/partial').get()).exists).toBe(false)
  })
})
