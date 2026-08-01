export const HOME_CARE_VISIT_STATUSES = Object.freeze([
  'planned', 'in_transit', 'arrived', 'in_service', 'completed', 'patient_absent', 'cancelled',
])

export const allowedHomeCareVisitTransitions = Object.freeze({
  planned: Object.freeze(['in_transit', 'patient_absent', 'cancelled']),
  in_transit: Object.freeze(['arrived', 'cancelled']),
  arrived: Object.freeze(['in_service', 'patient_absent']),
  in_service: Object.freeze(['completed']),
  completed: Object.freeze([]),
  patient_absent: Object.freeze([]),
  cancelled: Object.freeze([]),
})

export const homeCareVisitToAppointmentStatus = Object.freeze({
  planned: 'scheduled',
  in_transit: 'in_transit',
  arrived: 'arrived',
  in_service: 'arrived',
  completed: 'completed',
  patient_absent: 'patient_absent',
  cancelled: 'cancelled_by_professional',
})

export function canTransitionHomeCareVisit(currentStatus, targetStatus) {
  return HOME_CARE_VISIT_STATUSES.includes(currentStatus)
    && HOME_CARE_VISIT_STATUSES.includes(targetStatus)
    && allowedHomeCareVisitTransitions[currentStatus].includes(targetStatus)
}

export function assertHomeCareVisitTransition(currentStatus, targetStatus) {
  if (!canTransitionHomeCareVisit(currentStatus, targetStatus)) {
    const error = new Error(`Transição de visita domiciliar não permitida: ${currentStatus} → ${targetStatus}`)
    error.code = 'home-care/invalid-transition'
    throw error
  }
  return targetStatus
}

export function getHomeCareNextActions(status) {
  const labels = {
    in_transit: 'Iniciar deslocamento', arrived: 'Registrar chegada', in_service: 'Iniciar atendimento',
    completed: 'Concluir atendimento', patient_absent: 'Paciente ausente', cancelled: 'Cancelar',
  }
  return (allowedHomeCareVisitTransitions[status] || []).map((targetStatus) => ({
    targetStatus, label: labels[targetStatus],
  }))
}
