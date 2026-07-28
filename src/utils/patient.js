export function calculateRemainingSessions(totalSessions, completedSessions) {
  const total = Number(totalSessions) || 0
  const completed = Number(completedSessions) || 0
  return Math.max(total - completed, 0)
}

export function getPatientStatus(patient) {
  const remaining = calculateRemainingSessions(patient.totalSessions, patient.completedSessions)
  return remaining > 0 ? 'Ativo' : 'Finalizado'
}

export function getDashboardStats(patients = []) {
  const totalPatients = patients.length

  const activePatients = patients.filter((patient) => getPatientStatus(patient) === 'Ativo').length
  const finishedPatients = totalPatients - activePatients

  const sessionsThisWeek = patients
    .filter((patient) => getPatientStatus(patient) === 'Ativo')
    .reduce((acc, patient) => acc + (Number(patient.sessionsPerWeek) || 0), 0)

  return {
    totalPatients,
    activePatients,
    finishedPatients,
    sessionsThisWeek,
  }
}

export function normalizePatientPayload(values, userId) {
  const totalSessions = Number(values.totalSessions)
  const completedSessions = Number(values.completedSessions)

  return {
    name: values.name.trim(),
    address: values.address.trim(),
    phone: values.phone.trim(),
    birthDate: values.birthDate,
    guardian: values.guardian.trim(),
    diagnosis: values.diagnosis?.trim() || '',
    professionalName: values.professionalName.trim(),
    crfa: values.crfa.trim(),
    complaint: values.complaint?.trim() || '',
    notes: values.notes?.trim() || '',
    sessionsPerWeek: Number(values.sessionsPerWeek),
    totalSessions,
    completedSessions,
    remainingSessions: calculateRemainingSessions(totalSessions, completedSessions),
    status: calculateRemainingSessions(totalSessions, completedSessions) > 0 ? 'Ativo' : 'Finalizado',
    userId,
    tcleAccepted: !!values.tcleAccepted,
    tcleAcceptedAt: values.tcleAccepted ? new Date().toISOString() : null,
  }
}
