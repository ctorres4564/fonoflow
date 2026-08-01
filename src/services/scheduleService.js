import {
  addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query,
  runTransaction, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { convertAppointmentV1ToV2, normalizeAppointmentDocument } from '../mappers/appointment.mapper'
import { convertPatientV1ToV2, normalizePatientDocument } from '../mappers/patient.mapper'
import {
  parseAppointmentForCreate, parseAppointmentForUpdate, parsePatientForUpdate,
} from '../schemas/persistence.parsers'
import {
  appointmentStatusToV2, assertAppointmentTransition, calculateSessionAccounting,
} from '../domain/appointments/appointmentTransitions'

const schedulesCollection = collection(db, 'schedules')

export function subscribeSchedules(userId, callback, onError) {
  const schedulesQuery = query(schedulesCollection, where('userId', '==', userId))
  return onSnapshot(schedulesQuery, (snapshot) => {
    const schedules = snapshot.docs
      .map((item) => normalizeAppointmentDocument({ id: item.id, ...item.data() }))
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    callback(schedules)
  }, onError)
}

export function createSchedule(payload) {
  const timestamp = serverTimestamp()
  const candidate = convertAppointmentV1ToV2({
    ...payload,
    serviceType: payload.serviceType || 'home_care',
    scheduledStart: new Date(`${payload.date}T${payload.startTime}:00`),
    scheduledEnd: new Date(`${payload.date}T${payload.endTime}:00`),
    sessionAccounting: { deductSession: false, deductedAt: null, deductionOperationId: null },
    createdAt: timestamp,
    createdBy: payload.userId,
  })
  return addDoc(schedulesCollection, {
    ...parseAppointmentForCreate(candidate, payload.userId, timestamp),
    updatedAt: timestamp,
  })
}

export async function updateSchedule(scheduleId, payload) {
  const scheduleRef = doc(db, 'schedules', scheduleId)
  const snapshot = await getDoc(scheduleRef)
  if (!snapshot.exists()) throw new Error('Agendamento nÃ£o encontrado.')
  const current = convertAppointmentV1ToV2(snapshot.data())
  const candidate = convertAppointmentV1ToV2({ ...current, ...payload })
  await updateDoc(scheduleRef, parseAppointmentForUpdate(candidate, current, serverTimestamp()))
}

export function removeSchedule(scheduleId) {
  return deleteDoc(doc(db, 'schedules', scheduleId))
}

function replayResult(operationSnapshot, { appointmentId, targetStatus, actorId }) {
  if (!operationSnapshot.exists()) return null
  const previous = operationSnapshot.data()
  if (previous.status !== targetStatus || previous.actorId !== actorId) {
    const error = new Error('Identificador de operaÃ§Ã£o reutilizado com dados diferentes.')
    error.code = 'appointment/idempotency-conflict'
    throw error
  }
  return {
    replayed: true,
    appointmentId,
    status: targetStatus,
    rescheduledToId: previous.linkedScheduleId || null,
  }
}

export async function transitionAppointmentStatus({
  appointmentId, patientId, targetStatus, actorId, operationId, reason = '', reschedule = null,
  transactionalMutation = null,
}) {
  if (!operationId) throw new Error('Identificador da operaÃ§Ã£o Ã© obrigatÃ³rio.')
  if (!actorId) throw new Error('UsuÃ¡rio responsÃ¡vel Ã© obrigatÃ³rio.')

  const scheduleRef = doc(db, 'schedules', appointmentId)
  const patientRef = doc(db, 'patients', patientId)
  const historyRef = doc(db, 'schedules', appointmentId, 'statusHistory', operationId)
  const newScheduleRef = reschedule ? doc(schedulesCollection) : null

  return runTransaction(db, async (transaction) => {
    const [operationSnapshot, scheduleSnapshot, patientSnapshot] = await Promise.all([
      transaction.get(historyRef), transaction.get(scheduleRef), transaction.get(patientRef),
    ])
    const normalizedTarget = appointmentStatusToV2(targetStatus)
    const replay = replayResult(operationSnapshot, { appointmentId, targetStatus: normalizedTarget, actorId })
    if (replay) return replay
    if (!scheduleSnapshot.exists()) throw new Error('Agendamento nÃ£o encontrado.')
    if (!patientSnapshot.exists()) throw new Error('Paciente nÃ£o encontrado.')

    const schedule = scheduleSnapshot.data()
    const patient = patientSnapshot.data()
    if (schedule.patientId !== patientId || schedule.userId !== actorId) {
      throw new Error('Agendamento nÃ£o pertence ao usuÃ¡rio autenticado.')
    }

    const currentPatient = convertPatientV1ToV2(patient)
    const normalizedPatient = normalizePatientDocument({ id: patientId, ...currentPatient })
    const normalizedSchedule = normalizeAppointmentDocument({ id: appointmentId, ...schedule })
    const nextStatus = assertAppointmentTransition(normalizedSchedule.appointmentStatusV2, normalizedTarget)
    const accounting = calculateSessionAccounting(normalizedPatient, nextStatus === 'completed')
    const timestamp = serverTimestamp()

    if (transactionalMutation) {
      await transactionalMutation({
        transaction, timestamp, scheduleRef, patientRef, historyRef,
        schedule, patient, normalizedSchedule, normalizedPatient, nextStatus, accounting,
      })
    }

    if (accounting.changed) {
      const patientUpdate = {
        completedSessions: accounting.completedSessions,
        remainingSessions: accounting.remainingSessions,
        administrative: { ...currentPatient.administrative, completedSessions: accounting.completedSessions },
        status: accounting.remainingSessions > 0 ? 'active' : 'discharged',
      }
      transaction.update(patientRef, parsePatientForUpdate(patientUpdate, currentPatient, actorId, timestamp))
    }

    const scheduleUpdate = {
      schemaVersion: 2,
      status: nextStatus,
      statusReason: reason,
      statusUpdatedAt: timestamp,
      sessionDeducted: nextStatus === 'completed',
      sessionAccounting: {
        ...(schedule.sessionAccounting || {}),
        deductSession: nextStatus === 'completed',
        deductedAt: nextStatus === 'completed' ? timestamp : null,
        deductionOperationId: nextStatus === 'completed' ? operationId : null,
      },
      ...(newScheduleRef ? { rescheduledToId: newScheduleRef.id } : {}),
      updatedAt: timestamp,
    }
    transaction.update(scheduleRef, parseAppointmentForUpdate(
      scheduleUpdate, convertAppointmentV1ToV2(schedule), timestamp,
    ))

    if (newScheduleRef) {
      const candidate = convertAppointmentV1ToV2({
        ...schedule,
        status: 'scheduled',
        date: reschedule.date,
        startTime: reschedule.startTime,
        endTime: reschedule.endTime,
        scheduledStart: new Date(`${reschedule.date}T${reschedule.startTime}:00`),
        scheduledEnd: new Date(`${reschedule.date}T${reschedule.endTime}:00`),
        rescheduledFromId: appointmentId,
        sessionAccounting: { deductSession: false, deductedAt: null, deductionOperationId: null },
        createdAt: timestamp,
        createdBy: actorId,
      })
      transaction.set(newScheduleRef, parseAppointmentForCreate(candidate, actorId, timestamp))
    }

    transaction.set(historyRef, {
      previousStatus: normalizedSchedule.appointmentStatusV2,
      status: nextStatus,
      reason,
      actorId,
      operationId,
      deductSession: nextStatus === 'completed',
      linkedScheduleId: newScheduleRef?.id || null,
      changedAt: timestamp,
    })
    return {
      replayed: false,
      appointmentId,
      status: nextStatus,
      rescheduledToId: newScheduleRef?.id || null,
    }
  })
}

export function changeScheduleStatus(scheduleId, patientId, options) {
  return transitionAppointmentStatus({
    appointmentId: scheduleId,
    patientId,
    targetStatus: options.status,
    ...options,
  })
}

export function rescheduleAppointment(scheduleId, options) {
  const { patientId, actorId, operationId, date, startTime, endTime, reason = '' } = options
  return transitionAppointmentStatus({
    appointmentId: scheduleId,
    patientId,
    targetStatus: 'rescheduled',
    actorId,
    operationId,
    reason,
    reschedule: { date, startTime, endTime },
  }).then((result) => result.rescheduledToId)
}
