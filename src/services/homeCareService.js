import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { assertHomeCareVisitTransition, buildVisitTransitionUpdate, homeCareVisitToAppointmentStatus } from '../domain/homeCare/homeCareVisitTransitions'
import { createHomeCareAddressSnapshot, parseHomeCareVisitCreate } from '../schemas/homeCareVisit.schema'
import { transitionAppointmentStatus } from './scheduleService'
import { recordAuditEvent } from './auditService'

const currentVisitRef = (appointmentId) => doc(db, 'schedules', appointmentId, 'homeCareVisit', 'current')

export function subscribeHomeCareVisit(appointmentId, callback, onError) {
  return onSnapshot(currentVisitRef(appointmentId), (snapshot) => callback(snapshot.exists() ? snapshot.data() : null), onError)
}

export async function ensureHomeCareVisit({ appointment, patient, actorId }) {
  if (appointment.serviceType !== 'home_care') throw new Error('O agendamento não é domiciliar.')
  if (appointment.userId !== actorId || patient.userId !== actorId || appointment.patientId !== patient.id) throw new Error('Vínculo da visita inválido.')
  const reference = currentVisitRef(appointment.id)
  const existing = await getDoc(reference)
  if (existing.exists()) return existing.data()
  const timestamp = serverTimestamp()
  const addressSnapshot = createHomeCareAddressSnapshot(patient, appointment.location?.address ? { street: appointment.location.address } : null)
  const visit = parseHomeCareVisitCreate({
    schemaVersion: 1, appointmentId: appointment.id, patientId: patient.id, professionalId: actorId, userId: actorId,
    status: 'planned', location: { addressSnapshot, accessInstructionsSnapshot: patient.homeCare?.accessInstructions || appointment.location?.accessInstructions || null },
    schedule: { scheduledStart: appointment.scheduledStart, scheduledEnd: appointment.scheduledEnd },
    travel: { departureAt: null, arrivalAt: null, estimatedDistanceKm: null, actualDistanceKm: null, travelDurationMinutes: null, transportationMode: null },
    service: { startedAt: null, endedAt: null, durationMinutes: null, caregiverPresent: null, caregiverName: null },
    occurrence: { type: 'none', description: null }, evolutionId: null, createdAt: timestamp, createdBy: actorId, updatedAt: null, updatedBy: null,
  }, actorId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) transaction.set(reference, visit)
  })
  await recordAuditEvent({ action: 'HOME_CARE_VISIT_CREATED', patientId: patient.id, resourceId: appointment.id, changedFields: ['status'] })
  return visit
}

const eventByStatus = {
  in_transit: 'HOME_CARE_DEPARTURE_RECORDED', arrived: 'HOME_CARE_ARRIVAL_RECORDED', in_service: 'HOME_CARE_SERVICE_STARTED',
  completed: 'HOME_CARE_VISIT_COMPLETED', patient_absent: 'HOME_CARE_PATIENT_ABSENT', cancelled: 'HOME_CARE_VISIT_CANCELLED',
}

export async function transitionHomeCareVisit({ appointment, patient, actorId, targetStatus, operationId, details = {} }) {
  const reference = currentVisitRef(appointment.id)
  let current = await ensureHomeCareVisit({ appointment, patient, actorId })
  if (current.status === targetStatus && current.lastOperationId === operationId) return { replayed: true, status: targetStatus }
  if (current.lastOperationId === operationId) throw new Error('Identificador de operação reutilizado com dados diferentes.')
  assertHomeCareVisitTransition(current.status, targetStatus)
  const appointmentTarget = homeCareVisitToAppointmentStatus[targetStatus]
  if (appointmentTarget !== homeCareVisitToAppointmentStatus[current.status]) {
    await transitionAppointmentStatus({
      appointmentId: appointment.id, patientId: patient.id, targetStatus: appointmentTarget,
      actorId, operationId, reason: details.reason || '',
      homeCareVisit: { targetStatus, details },
    })
  } else {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists()) throw new Error('Visita não encontrada.')
      current = snapshot.data()
      if (current.status === targetStatus && current.lastOperationId === operationId) return
      transaction.update(reference, buildVisitTransitionUpdate(current, targetStatus, details, operationId, serverTimestamp()))
    })
  }
  await recordAuditEvent({ action: eventByStatus[targetStatus], patientId: patient.id, resourceId: appointment.id, changedFields: ['status'] })
  return { replayed: false, status: targetStatus }
}

export async function updateHomeCareTravel({ appointmentId, patientId, actorId, actualDistanceKm, transportationMode }) {
  if (Number(actualDistanceKm) < 0) throw new Error('A distância não pode ser negativa.')
  const reference = currentVisitRef(appointmentId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference); if (!snapshot.exists()) throw new Error('Visita não encontrada.')
    const visit = snapshot.data(); if (visit.userId !== actorId) throw new Error('Acesso não autorizado.'); if (['completed','cancelled','patient_absent'].includes(visit.status)) throw new Error('Visita encerrada é imutável.')
    transaction.update(reference, { travel: { ...visit.travel, actualDistanceKm: actualDistanceKm === '' ? null : Number(actualDistanceKm), transportationMode: transportationMode || visit.travel.transportationMode }, updatedAt: serverTimestamp(), updatedBy: actorId })
  })
  await recordAuditEvent({ action: 'HOME_CARE_TRAVEL_UPDATED', patientId, resourceId: appointmentId, changedFields: ['travel'] })
}

export async function recordHomeCareOccurrence({ appointmentId, patientId, actorId, type, description }) {
  if (type !== 'none' && !description?.trim()) throw new Error('Descreva a ocorrência.')
  const reference = currentVisitRef(appointmentId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference); if (!snapshot.exists()) throw new Error('Visita não encontrada.')
    const visit = snapshot.data(); if (visit.userId !== actorId) throw new Error('Acesso não autorizado.'); if (visit.status === 'completed') throw new Error('Visita concluída é imutável.')
    transaction.update(reference, { occurrence: { type, description: description.trim() }, updatedAt: serverTimestamp(), updatedBy: actorId })
  })
  await recordAuditEvent({ action: 'HOME_CARE_OCCURRENCE_RECORDED', patientId, resourceId: appointmentId, changedFields: ['occurrence'] })
}
