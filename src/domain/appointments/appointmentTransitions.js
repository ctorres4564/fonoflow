const STATUSES = Object.freeze(['scheduled','confirmed','in_transit','arrived','completed','patient_absent','cancelled_by_patient','cancelled_by_professional','rescheduled'])

export const allowedTransitions = Object.freeze({
  scheduled: Object.freeze(['confirmed','in_transit','arrived','completed','patient_absent','cancelled_by_patient','cancelled_by_professional','rescheduled']),
  confirmed: Object.freeze(['scheduled','in_transit','arrived','completed','patient_absent','cancelled_by_patient','cancelled_by_professional','rescheduled']),
  in_transit: Object.freeze(['arrived','completed','cancelled_by_patient','cancelled_by_professional','rescheduled']),
  arrived: Object.freeze(['completed','patient_absent','cancelled_by_patient','cancelled_by_professional','rescheduled']),
  completed: Object.freeze([]),
  patient_absent: Object.freeze(['rescheduled']),
  cancelled_by_patient: Object.freeze(['rescheduled']),
  cancelled_by_professional: Object.freeze(['rescheduled']),
  rescheduled: Object.freeze([]),
})

const legacyToV2 = Object.freeze({ Agendado:'scheduled', Confirmado:'confirmed', 'Em deslocamento':'in_transit', Chegou:'arrived', Realizado:'completed', Falta:'patient_absent', 'Cancelado pelo paciente':'cancelled_by_patient', 'Cancelado pela profissional':'cancelled_by_professional', Reagendado:'rescheduled' })
export const appointmentStatusToV2 = (status) => legacyToV2[status] || status
export const isAppointmentStatus = (status) => STATUSES.includes(appointmentStatusToV2(status))

export function canTransitionAppointment(currentStatus, targetStatus) {
  const current=appointmentStatusToV2(currentStatus); const target=appointmentStatusToV2(targetStatus)
  return isAppointmentStatus(current) && isAppointmentStatus(target) && allowedTransitions[current].includes(target)
}

export function assertAppointmentTransition(currentStatus, targetStatus) {
  if (!canTransitionAppointment(currentStatus,targetStatus)) {
    const error=new Error(`TransiÃ§Ã£o de agenda nÃ£o permitida: ${appointmentStatusToV2(currentStatus)} â†’ ${appointmentStatusToV2(targetStatus)}`)
    error.code='appointment/invalid-transition'; throw error
  }
  return appointmentStatusToV2(targetStatus)
}

export function calculateSessionAccounting(patient, enteringCompleted) {
  const completed=Number(patient.administrative?.completedSessions ?? patient.completedSessions ?? 0)
  const contracted=Number(patient.administrative?.contractedSessions ?? patient.totalSessions ?? 0)
  if (!enteringCompleted) return { completedSessions:completed, remainingSessions:Math.max(contracted-completed,0), changed:false }
  if (contracted > 0 && completed >= contracted) { const error=new Error('Todas as sessÃµes contratadas jÃ¡ foram concluÃ­das.'); error.code='appointment/session-limit'; throw error }
  const next=completed+1
  return { completedSessions:next, remainingSessions:Math.max(contracted-next,0), changed:true }
}

// Único ponto de decisão da auto-alta (active -> discharged ao esgotar sessões).
// Nunca reabre discharged e nunca mexe em inactive/restricted/archived — essas
// transições de status são exclusivamente manuais, via fluxo governado.
const AUTO_DISCHARGE_SOURCE_STATUSES = Object.freeze(['active'])

export function resolvePatientStatusAfterAccounting(currentStatus, remainingSessions) {
  if (remainingSessions > 0) return currentStatus
  if (!AUTO_DISCHARGE_SOURCE_STATUSES.includes(currentStatus)) return currentStatus
  return 'discharged'
}
