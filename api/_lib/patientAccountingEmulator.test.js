import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAdminApp } from './adminFirebase.js'
import { completeAppointment } from './appointmentCompletionWorkflow.js'
import { createClinicalEvolutionGoverned } from './evolutionCreateWorkflow.js'

const isSafeEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && (!process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT.startsWith('demo-')))
const emulatorDescribe = isSafeEmulator ? describe : describe.skip

const UID = 'professional-1'
const PATIENT_ID = 'patient-1'

function patientDoc({ status = 'active', contractedSessions = 3, completedSessions = 2 } = {}) {
  return {
    schemaVersion: 2, userId: UID, status,
    personalData: { fullName: 'Paciente de teste' },
    homeCare: { enabled: true },
    administrative: { serviceType: 'private', contractedSessions, completedSessions },
    completedSessions, totalSessions: contractedSessions,
  }
}

function scheduleDoc(overrides = {}) {
  return {
    userId: UID, patientId: PATIENT_ID, serviceType: 'clinic',
    status: 'Agendado', date: '2026-08-01', startTime: '09:00', endTime: '10:00', sessionType: 'Terapia',
    ...overrides,
  }
}

function evolutionPayload(overrides = {}) {
  return {
    date: '2026-08-01', duration: 50, notes: 'Sessão registrada.',
    createdBy: UID, ...overrides,
  }
}

emulatorDescribe('contabilização de sessão e auto-alta (transação real no Firestore Emulator)', () => {
  const app = getAdminApp()
  const db = getFirestore(app)

  beforeEach(async () => {
    for (const collectionName of ['patients', 'schedules', 'auditLogs', 'evolutionCreateOperations']) {
      await db.recursiveDelete(db.collection(collectionName))
    }
  })

  afterAll(async () => deleteApp(app))

  describe('conclusão de agendamento (completeAppointment)', () => {
    it('última sessão contratada: active → discharged', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      const result = await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db })
      expect(result.replayed).toBe(false)
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect(patient.remainingSessions).toBe(0)
      expect(patient.status).toBe('discharged')
    })

    it('sessão não final: paciente permanece active', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect(patient.status).toBe('active')
    })

    it('paciente inactive não vira discharged automaticamente', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'inactive', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.remainingSessions).toBe(0)
      expect(patient.status).toBe('inactive')
    })

    it('paciente restricted não vira discharged automaticamente', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'restricted', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.remainingSessions).toBe(0)
      expect(patient.status).toBe('restricted')
    })

    it('paciente archived não muda', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'archived', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.status).toBe('archived')
    })

    it('replay não duplica débito nem auditoria', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      const first = await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-replay', db })
      const second = await completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-replay', db })
      expect(first.replayed).toBe(false)
      expect(second.replayed).toBe(true)
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect((await db.collection('auditLogs').get()).size).toBe(1)
    })

    it('concorrência na última sessão: apenas uma conclusão vence, contador nunca fica negativo', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await db.doc('schedules/schedule-2').set(scheduleDoc())
      const results = await Promise.allSettled([
        completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-a', db }),
        completeAppointment({ uid: UID, scheduleId: 'schedule-2', patientId: PATIENT_ID, operationId: 'op-b', db }),
      ])
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect(rejected[0].reason.code).toBe('appointment/session-limit')
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect(patient.remainingSessions).toBe(0)
    })

    it('contador nunca fica negativo: completar além do contratado falha e não altera o paciente', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 3, completedSessions: 3 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await expect(completeAppointment({ uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-1', db }))
        .rejects.toMatchObject({ code: 'appointment/session-limit' })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect(patient.status).toBe('active')
    })

    it('rollback integral quando a visita Home Care vinculada é inválida', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc({ serviceType: 'home_care' }))
      await db.doc('schedules/schedule-1/homeCareVisit/current').set({
        schemaVersion: 1, appointmentId: 'schedule-1', patientId: PATIENT_ID, professionalId: UID, userId: UID,
        status: 'completed', travel: {}, service: {}, occurrence: { type: 'none', description: null },
      })
      await expect(completeAppointment({
        uid: UID, scheduleId: 'schedule-1', patientId: PATIENT_ID, operationId: 'op-rollback', db,
        homeCareVisit: { targetStatus: 'in_transit', details: {} },
      })).rejects.toThrow()
      const [patient, schedule, history] = await Promise.all([
        db.doc(`patients/${PATIENT_ID}`).get(), db.doc('schedules/schedule-1').get(),
        db.doc('schedules/schedule-1/statusHistory/op-rollback').get(),
      ])
      expect(patient.data().completedSessions).toBe(2)
      expect(schedule.data().status).toBe('Agendado')
      expect(history.exists).toBe(false)
    })
  })

  describe('criação governada de evolução clínica (createClinicalEvolutionGoverned)', () => {
    it('fluxo por evolução agendada: debita sessão, vincula agenda e pode dar alta', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 3, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      const result = await createClinicalEvolutionGoverned({
        uid: UID, patientId: PATIENT_ID, scheduleId: 'schedule-1', payload: evolutionPayload(), operationId: 'op-ev-1', db,
      })
      expect(result.replayed).toBe(false)
      const [patient, schedule, evolution] = await Promise.all([
        db.doc(`patients/${PATIENT_ID}`).get(), db.doc('schedules/schedule-1').get(),
        db.doc(`patients/${PATIENT_ID}/evolutions/${result.evolutionId}`).get(),
      ])
      expect(patient.data().completedSessions).toBe(3)
      expect(patient.data().status).toBe('discharged')
      expect(schedule.data().status).toBe('completed')
      expect(schedule.data().evolutionId).toBe(result.evolutionId)
      expect(evolution.exists).toBe(true)
    })

    it('fluxo por evolução manual com incremento: debita sessão sem vincular agenda', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      const result = await createClinicalEvolutionGoverned({
        uid: UID, patientId: PATIENT_ID, payload: evolutionPayload(), operationId: 'op-ev-2', db,
      })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
      expect(result.replayed).toBe(false)
    })

    it('fluxo por evolução manual sem incremento: não altera contador nem status', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      await createClinicalEvolutionGoverned({
        uid: UID, patientId: PATIENT_ID, incrementSession: false, payload: evolutionPayload(), operationId: 'op-ev-3', db,
      })
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(2)
      expect(patient.status).toBe('active')
    })

    it('replay não duplica evolução nem auditoria', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      const payload = evolutionPayload()
      const first = await createClinicalEvolutionGoverned({ uid: UID, patientId: PATIENT_ID, payload, operationId: 'op-ev-replay', db })
      const second = await createClinicalEvolutionGoverned({ uid: UID, patientId: PATIENT_ID, payload, operationId: 'op-ev-replay', db })
      expect(first.replayed).toBe(false)
      expect(second.replayed).toBe(true)
      expect(second.evolutionId).toBe(first.evolutionId)
      expect((await db.collection(`patients/${PATIENT_ID}/evolutions`).get()).size).toBe(1)
      expect((await db.collection('auditLogs').get()).size).toBe(1)
      const patient = (await db.doc(`patients/${PATIENT_ID}`).get()).data()
      expect(patient.completedSessions).toBe(3)
    })

    it('recusa reutilizar um agendamento já concluído', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 10, completedSessions: 2 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc({ status: 'completed', evolutionId: 'existing-evolution' }))
      await expect(createClinicalEvolutionGoverned({
        uid: UID, patientId: PATIENT_ID, scheduleId: 'schedule-1', payload: evolutionPayload(), operationId: 'op-ev-conflict', db,
      })).rejects.toMatchObject({ code: 'schedule/already-completed' })
    })

    it('rollback integral quando a transação falha: evolução, agenda e paciente não são gravados', async () => {
      await db.doc(`patients/${PATIENT_ID}`).set(patientDoc({ status: 'active', contractedSessions: 3, completedSessions: 3 }))
      await db.doc('schedules/schedule-1').set(scheduleDoc())
      await expect(createClinicalEvolutionGoverned({
        uid: UID, patientId: PATIENT_ID, scheduleId: 'schedule-1', payload: evolutionPayload(), operationId: 'op-ev-rollback', db,
      })).rejects.toMatchObject({ code: 'appointment/session-limit' })
      const [patient, schedule, evolutions] = await Promise.all([
        db.doc(`patients/${PATIENT_ID}`).get(), db.doc('schedules/schedule-1').get(),
        db.collection(`patients/${PATIENT_ID}/evolutions`).get(),
      ])
      expect(patient.data().completedSessions).toBe(3)
      expect(schedule.data().status).toBe('Agendado')
      expect(evolutions.size).toBe(0)
    })
  })
})
