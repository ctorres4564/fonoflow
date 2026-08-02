import { FieldValue } from 'firebase-admin/firestore'
import { convertAppointmentV1ToV2, normalizeAppointmentDocument } from '../../src/mappers/appointment.mapper.js'
import { convertPatientV1ToV2 } from '../../src/mappers/patient.mapper.js'
import { parseAppointmentForUpdate, parsePatientForUpdate } from '../../src/schemas/persistence.parsers.js'
import { assertAppointmentTransition } from '../../src/domain/appointments/appointmentTransitions.js'
import { buildVisitTransitionUpdate } from '../../src/domain/homeCare/homeCareVisitTransitions.js'
import { buildPatientAccountingPatch } from './patientAccountingWorkflow.js'

export class AppointmentCompletionError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'AppointmentCompletionError'
    this.code = code
  }
}

function fail(code, message) {
  throw new AppointmentCompletionError(code, message)
}

/**
 * Conclusão governada de agendamento — única porta de entrada para debitar
 * sessão e decidir a auto-alta do paciente (patients/{patientId}.status).
 * Cobre tanto a conclusão direta de um atendimento (ScheduleStatusModal)
 * quanto a conclusão de uma visita Home Care (homeCareVisit opcional), na
 * MESMA transação — contador, status, histórico e auditoria não podem
 * divergir entre si.
 *
 * Espelha a lógica que antes vivia em transitionAppointmentStatus (cliente);
 * transições que não afetam contabilização (confirmar, cancelar, reagendar,
 * demais estados de visita domiciliar) continuam 100% client-side, pois
 * nunca tocam campos protegidos pelas Firestore Rules.
 */
export async function completeAppointment({
  uid, scheduleId, patientId, operationId, reason = '', homeCareVisit = null, db, now = new Date(),
}) {
  if (!uid) fail('UNAUTHENTICATED', 'Usuário não autenticado.')
  if (!scheduleId) fail('MISSING_SCHEDULE_ID', 'ID do agendamento é obrigatório.')
  if (!patientId) fail('MISSING_PATIENT_ID', 'ID do paciente é obrigatório.')
  if (!operationId) fail('MISSING_OPERATION_ID', 'Identificador da operação é obrigatório.')

  const scheduleRef = db.doc(`schedules/${scheduleId}`)
  const patientRef = db.doc(`patients/${patientId}`)
  const historyRef = db.doc(`schedules/${scheduleId}/statusHistory/${operationId}`)
  const visitRef = homeCareVisit ? db.doc(`schedules/${scheduleId}/homeCareVisit/current`) : null

  return db.runTransaction(async (transaction) => {
    const [historySnap, scheduleSnap, patientSnap, visitSnap] = await Promise.all([
      transaction.get(historyRef),
      transaction.get(scheduleRef),
      transaction.get(patientRef),
      visitRef ? transaction.get(visitRef) : Promise.resolve(null),
    ])

    if (historySnap.exists) {
      const previous = historySnap.data()
      if (previous.status !== 'completed' || previous.actorId !== uid) {
        fail('IDEMPOTENCY_CONFLICT', 'Identificador de operação reutilizado com dados diferentes.')
      }
      return { replayed: true, appointmentId: scheduleId, status: 'completed', rescheduledToId: null }
    }

    if (!scheduleSnap.exists) fail('SCHEDULE_NOT_FOUND', 'Agendamento não encontrado.')
    if (!patientSnap.exists) fail('PATIENT_NOT_FOUND', 'Paciente não encontrado.')

    const scheduleData = scheduleSnap.data()
    const patientData = patientSnap.data()
    if (scheduleData.patientId !== patientId || scheduleData.userId !== uid) {
      fail('FORBIDDEN', 'Agendamento não pertence ao usuário autenticado.')
    }
    if (patientData.userId !== uid) fail('FORBIDDEN', 'Acesso ao prontuário não autorizado.')

    const normalizedSchedule = normalizeAppointmentDocument({ id: scheduleId, ...scheduleData })
    const nextStatus = assertAppointmentTransition(normalizedSchedule.appointmentStatusV2, 'completed')

    const currentPatientV2 = convertPatientV1ToV2(patientData)
    const timestamp = FieldValue.serverTimestamp()
    const { patch: patientPatch } = buildPatientAccountingPatch(currentPatientV2, timestamp)

    let visitPatch = null
    if (homeCareVisit) {
      if (!visitSnap?.exists) fail('VISIT_NOT_FOUND', 'Visita domiciliar não encontrada.')
      const visitData = visitSnap.data()
      if (visitData.userId !== uid || visitData.patientId !== patientId) {
        fail('FORBIDDEN', 'Vínculo da visita domiciliar inválido.')
      }
      visitPatch = buildVisitTransitionUpdate(visitData, homeCareVisit.targetStatus, homeCareVisit.details || {}, operationId, timestamp, now)
    }

    transaction.update(patientRef, parsePatientForUpdate(patientPatch, currentPatientV2, uid, timestamp))
    transaction.update(scheduleRef, parseAppointmentForUpdate({
      schemaVersion: 2,
      status: nextStatus,
      statusReason: reason,
      statusUpdatedAt: timestamp,
      sessionDeducted: true,
      sessionAccounting: {
        ...(scheduleData.sessionAccounting || {}),
        deductSession: true,
        deductedAt: timestamp,
        deductionOperationId: operationId,
      },
      updatedAt: timestamp,
    }, convertAppointmentV1ToV2(scheduleData), timestamp))

    if (visitPatch) transaction.update(visitRef, visitPatch)

    transaction.set(historyRef, {
      previousStatus: normalizedSchedule.appointmentStatusV2,
      status: nextStatus,
      reason,
      actorId: uid,
      operationId,
      deductSession: true,
      linkedScheduleId: null,
      changedAt: timestamp,
    })

    transaction.set(db.collection('auditLogs').doc(), {
      actorId: uid,
      action: patientPatch.status === 'discharged' ? 'patient.discharged' : 'appointment.status_changed',
      patientId,
      resourceId: scheduleId,
      changedFields: patientPatch.status === 'discharged'
        ? ['status', 'completedSessions', 'remainingSessions']
        : ['completedSessions', 'remainingSessions'],
      metadata: { previousStatus: currentPatientV2.status, newStatus: patientPatch.status, operationId },
      occurredAt: timestamp,
      source: 'api.schedules.complete',
      schemaVersion: 1,
    })

    return { replayed: false, appointmentId: scheduleId, status: nextStatus, rescheduledToId: null }
  })
}
