import {
  addDoc, collection, doc, getDoc, onSnapshot, query,
  runTransaction, serverTimestamp, updateDoc, where,
} from 'firebase/firestore'
import { db, auth } from '../firebase/config'
import { convertAppointmentV1ToV2, normalizeAppointmentDocument } from '../mappers/appointment.mapper'
import {
  parseAppointmentForCreate, parseAppointmentForUpdate,
} from '../schemas/persistence.parsers'
import {
  appointmentStatusToV2, assertAppointmentTransition,
} from '../domain/appointments/appointmentTransitions'
import { buildVisitTransitionUpdate } from '../domain/homeCare/homeCareVisitTransitions'

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
  if (!snapshot.exists()) throw new Error('Agendamento não encontrado.')
  const current = convertAppointmentV1ToV2(snapshot.data())
  const candidate = convertAppointmentV1ToV2({ ...current, ...payload })
  await updateDoc(scheduleRef, parseAppointmentForUpdate(candidate, current, serverTimestamp()))
}

/**
 * Cancela um agendamento via fluxo governado.
 * Reutiliza integralmente transitionAppointmentStatus — mesma transação,
 * mesmo histórico, mesma idempotência, sem débito de sessão.
 *
 * @param {string} scheduleId
 * @param {string} patientId
 * @param {string} actorId
 * @param {string} reason
 * @returns {Promise}
 */
export async function cancelSchedule(scheduleId, patientId, actorId, reason) {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Justificativa obrigatória para cancelamento.')
  }
  return transitionAppointmentStatus({
    appointmentId: scheduleId,
    patientId,
    targetStatus: 'cancelled_by_professional',
    actorId,
    operationId: crypto.randomUUID(),
    reason: reason.trim(),
  })
}

/**
 * @deprecated Exclusão física de agendamento não é permitida.
 * Use cancelSchedule() para cancelamento governado.
 */
export function removeSchedule(_scheduleId) {
  throw new Error(
    'Exclusão física de agendamento não é permitida. ' +
    'Use cancelSchedule() para cancelamento governado.'
  )
}

function replayResult(operationSnapshot, { appointmentId, targetStatus, actorId }) {
  if (!operationSnapshot.exists()) return null
  const previous = operationSnapshot.data()
  if (previous.status !== targetStatus || previous.actorId !== actorId) {
    const error = new Error('Identificador de operação reutilizado com dados diferentes.')
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

/**
 * Conclusão de agendamento — debita sessão e decide auto-alta do paciente.
 * Campos protegidos pelas Firestore Rules (status/completedSessions/
 * remainingSessions/administrative do paciente) nunca são escritos pelo
 * cliente: a transação inteira roda no backend (api/schedules/[scheduleId]/complete.js).
 */
async function completeAppointmentGoverned({ appointmentId, patientId, operationId, reason, homeCareVisit }) {
  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) {
    const error = new Error('Usuário não autenticado.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }
  const res = await fetch(`/api/schedules/${appointmentId}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId, operationId, reason, homeCareVisit: homeCareVisit || undefined }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error?.message || 'Não foi possível concluir o atendimento.')
    error.code = data.error?.code || 'INTERNAL_ERROR'
    throw error
  }
  return data
}

export async function transitionAppointmentStatus({
  appointmentId, patientId, targetStatus, actorId, operationId, reason = '', reschedule = null,
  homeCareVisit = null,
}) {
  if (!operationId) throw new Error('Identificador da operação é obrigatório.')
  if (!actorId) throw new Error('Usuário responsável é obrigatório.')

  const normalizedTarget = appointmentStatusToV2(targetStatus)

  // Toda transição que entra em 'completed' debita sessão e pode auto-dar-alta
  // no paciente — governado exclusivamente pelo backend (nunca client-side).
  if (normalizedTarget === 'completed') {
    return completeAppointmentGoverned({ appointmentId, patientId, operationId, reason, homeCareVisit })
  }

  const scheduleRef = doc(db, 'schedules', appointmentId)
  const historyRef = doc(db, 'schedules', appointmentId, 'statusHistory', operationId)
  const visitRef = homeCareVisit ? doc(db, 'schedules', appointmentId, 'homeCareVisit', 'current') : null
  const newScheduleRef = reschedule ? doc(schedulesCollection) : null

  return runTransaction(db, async (transaction) => {
    const [operationSnapshot, scheduleSnapshot, visitSnapshot] = await Promise.all([
      transaction.get(historyRef), transaction.get(scheduleRef),
      visitRef ? transaction.get(visitRef) : Promise.resolve(null),
    ])
    const replay = replayResult(operationSnapshot, { appointmentId, targetStatus: normalizedTarget, actorId })
    if (replay) return replay
    if (!scheduleSnapshot.exists()) throw new Error('Agendamento não encontrado.')

    const schedule = scheduleSnapshot.data()
    if (schedule.patientId !== patientId || schedule.userId !== actorId) {
      throw new Error('Agendamento não pertence ao usuário autenticado.')
    }

    const normalizedSchedule = normalizeAppointmentDocument({ id: appointmentId, ...schedule })
    const nextStatus = assertAppointmentTransition(normalizedSchedule.appointmentStatusV2, normalizedTarget)
    const timestamp = serverTimestamp()

    if (homeCareVisit) {
      if (!visitSnapshot?.exists()) throw new Error('Visita não encontrada.')
      const currentVisit = visitSnapshot.data()
      if (currentVisit.userId !== actorId || currentVisit.patientId !== patientId) {
        throw new Error('Vínculo da visita inválido.')
      }
      transaction.update(visitRef, buildVisitTransitionUpdate(currentVisit, homeCareVisit.targetStatus, homeCareVisit.details || {}, operationId, timestamp))
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
