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

// Constrói o patch de transição da visita — puro, sem I/O. Compartilhado entre
// cliente (transições que não afetam contabilização) e backend (conclusão
// governada), para nunca duplicar a regra em duas implementações.
export function buildVisitTransitionUpdate(current, targetStatus, details, operationId, timestamp, now = new Date()) {
  assertHomeCareVisitTransition(current.status, targetStatus)
  const travel = { ...current.travel }
  const service = { ...current.service }
  if (targetStatus === 'in_transit') { travel.departureAt = timestamp; travel.transportationMode = details.transportationMode || null; travel.estimatedDistanceKm = details.estimatedDistanceKm ?? null }
  if (targetStatus === 'arrived') { travel.arrivalAt = timestamp; travel.travelDurationMinutes = travel.departureAt ? Math.max(0, Math.round((now - (travel.departureAt.toDate?.() || travel.departureAt)) / 60000)) : null }
  if (targetStatus === 'in_service') { service.startedAt = timestamp; service.caregiverPresent = details.caregiverPresent ?? null; service.caregiverName = details.caregiverName || null }
  if (targetStatus === 'completed') { service.endedAt = timestamp; service.durationMinutes = service.startedAt ? Math.max(0, Math.round((now - (service.startedAt.toDate?.() || service.startedAt)) / 60000)) : null; travel.actualDistanceKm = details.actualDistanceKm ?? travel.actualDistanceKm }
  const occurrence = details.occurrence || (targetStatus === 'patient_absent' ? { type: 'patient_absent', description: details.reason || 'Paciente ausente.' } : current.occurrence)
  return { status: targetStatus, travel, service, occurrence, updatedAt: timestamp, updatedBy: current.userId, lastOperationId: operationId }
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
