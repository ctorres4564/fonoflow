import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true')
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-fonoflow')
vi.mock('../../src/services/auditService.js', () => ({ recordAuditEvent: vi.fn().mockResolvedValue({ id: 'audit-test' }) }))

let auth, db, ensureHomeCareVisit, transitionHomeCareVisit, transitionAppointmentStatus
let user
const patientId = 'home-care-patient'

const appointment = (uid) => ({
  id: 'home-care-schedule', userId: uid, patientId, serviceType: 'home_care',
  scheduledStart: new Date('2026-08-01T09:00:00'), scheduledEnd: new Date('2026-08-01T10:00:00'),
  date: '2026-08-01', startTime: '09:00', endTime: '10:00', status: 'Agendado', appointmentStatusV2: 'scheduled',
})
const patient = (uid) => ({ id: patientId, userId: uid, name: 'Paciente fictício', address: { street: 'Rua Teste', number: '10', city: 'São Paulo', state: 'SP' }, homeCare: { enabled: true, serviceAddressSameAsPatientAddress: true } })

async function seed(uid, scheduleId = 'home-care-schedule') {
  await setDoc(doc(db, 'patients', patientId), { userId: uid, name: 'Paciente fictício', status: 'Ativo', totalSessions: 10, completedSessions: 0 })
  await setDoc(doc(db, 'schedules', scheduleId), { userId: uid, patientId, status: 'Agendado', date: '2026-08-01', startTime: '09:00', endTime: '10:00', sessionType: 'Terapia', serviceType: 'home_care' })
}

beforeAll(async () => {
  ;({ auth, db } = await import('../../src/firebase/config.js'))
  ;({ ensureHomeCareVisit, transitionHomeCareVisit } = await import('../../src/services/homeCareService.js'))
  ;({ transitionAppointmentStatus } = await import('../../src/services/scheduleService.js'))
  user = (await createUserWithEmailAndPassword(auth, `home-care-${Date.now()}@example.com`, 'Test123456!')).user
})

afterAll(async () => { if (user) await deleteUser(user) })

describe('Home Care integrado no emulador', () => {
  it('conclui agenda, visita, histórico e débito uma única vez', async () => {
    await seed(user.uid)
    const schedule = appointment(user.uid); const owner = patient(user.uid)
    await ensureHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid })
    await transitionHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid, targetStatus: 'in_transit', operationId: 'hc-transit', details: { transportationMode: 'car' } })
    schedule.status = 'Em deslocamento'; schedule.appointmentStatusV2 = 'in_transit'
    await transitionHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid, targetStatus: 'arrived', operationId: 'hc-arrived' })
    schedule.status = 'Chegou'; schedule.appointmentStatusV2 = 'arrived'
    await transitionHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid, targetStatus: 'in_service', operationId: 'hc-service', details: { caregiverPresent: true } })
    const completed = await transitionHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid, targetStatus: 'completed', operationId: 'hc-completed', details: { actualDistanceKm: 8 } })
    expect(completed.replayed).toBe(false)
    const replay = await transitionHomeCareVisit({ appointment: schedule, patient: owner, actorId: user.uid, targetStatus: 'completed', operationId: 'hc-completed', details: { actualDistanceKm: 8 } })
    expect(replay.replayed).toBe(true)
    const [patientSnapshot, scheduleSnapshot, visitSnapshot, history] = await Promise.all([
      getDoc(doc(db, 'patients', patientId)), getDoc(doc(db, 'schedules', schedule.id)),
      getDoc(doc(db, 'schedules', schedule.id, 'homeCareVisit', 'current')),
      getDocs(collection(db, 'schedules', schedule.id, 'statusHistory')),
    ])
    expect(patientSnapshot.data().completedSessions).toBe(1)
    expect(scheduleSnapshot.data().status).toBe('completed')
    expect(visitSnapshot.data().status).toBe('completed')
    expect(visitSnapshot.data().lastOperationId).toBe('hc-completed')
    expect(history.size).toBe(3)
  }, 30000)

  it('reverte agenda, saldo e histórico quando a mutação relacionada falha', async () => {
    const scheduleId = 'atomic-failure-schedule'; await seed(user.uid, scheduleId)
    await expect(transitionAppointmentStatus({ appointmentId: scheduleId, patientId, targetStatus: 'completed', actorId: user.uid, operationId: 'atomic-failure', transactionalMutation: async () => { throw new Error('falha injetada') } })).rejects.toThrow('falha injetada')
    const [patientSnapshot, scheduleSnapshot, historySnapshot] = await Promise.all([
      getDoc(doc(db, 'patients', patientId)), getDoc(doc(db, 'schedules', scheduleId)), getDoc(doc(db, 'schedules', scheduleId, 'statusHistory', 'atomic-failure')),
    ])
    expect(patientSnapshot.data().completedSessions).toBe(0)
    expect(scheduleSnapshot.data().status).toBe('Agendado')
    expect(historySnapshot.exists()).toBe(false)
  }, 30000)
})
