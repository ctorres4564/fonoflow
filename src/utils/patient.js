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

  const clean = (value) => String(value || '').trim() || null
  const array = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
  const name = values.name.trim()
  const phone = String(values.phone || '').trim()
  const remainingSessions = calculateRemainingSessions(totalSessions, completedSessions)
  const address = { postalCode:clean(values.postalCode), street:clean(values.address), number:clean(values.addressNumber), complement:clean(values.complement), district:clean(values.district), city:clean(values.city), state:clean(values.state), referencePoint:null }
  return {
    schemaVersion: 2,
    name,
    address,
    addressLegacy: clean(values.address) || '',
    phone,
    birthDate: values.birthDate || '',
    guardian: clean(values.guardian) || '',
    diagnosis: clean(values.diagnosis) || '',
    professionalName: clean(values.professionalName) || '',
    crfa: clean(values.crfa) || '',
    complaint: values.complaint?.trim() || '',
    notes: values.notes?.trim() || '',
    sessionsPerWeek: Number(values.sessionsPerWeek),
    totalSessions,
    completedSessions,
    remainingSessions,
    status: values.status || (remainingSessions > 0 ? 'active' : 'discharged'),
    userId,
    tcleAccepted: !!values.tcleAccepted,
    tcleAcceptedAt: values.tcleAccepted ? new Date().toISOString() : null,
    personalData: { fullName:name, socialName:clean(values.socialName), birthDate:values.birthDate || null, cpf:clean(values.cpf), cns:clean(values.cns), sex:clean(values.sex), genderIdentity:clean(values.genderIdentity) },
    contact: { phone:clean(phone), secondaryPhone:clean(values.secondaryPhone), email:clean(values.email) },
    legalRepresentative: { name:clean(values.guardian), cpf:clean(values.guardianCpf), relationship:clean(values.guardianRelationship), phone:clean(values.guardianPhone), email:clean(values.guardianEmail) },
    emergencyContact: { name:clean(values.emergencyName), relationship:clean(values.emergencyRelationship), phone:clean(values.emergencyPhone) },
    clinicalProfile: { diagnosis:clean(values.diagnosis), diagnosticHypothesis:clean(values.diagnosticHypothesis), cidCodes:[], cifCodes:[], referralSource:clean(values.referralSource), mainComplaint:clean(values.complaint), generalObservations:clean(values.notes) },
    clinicalAlerts: { allergies:array(values.allergies), medications:array(values.medications), aspirationRisk:!!values.aspirationRisk, tracheostomy:!!values.tracheostomy, gastrostomy:!!values.gastrostomy, oxygenUse:!!values.oxygenUse, epilepsy:!!values.epilepsy, dietaryRestrictions:array(values.dietaryRestrictions), mobilityRestrictions:array(values.mobilityRestrictions), otherAlerts:array(values.otherAlerts) },
    homeCare: { enabled:!!values.homeCareEnabled, serviceAddressSameAsPatientAddress:values.sameServiceAddress !== false, serviceAddress: values.homeCareEnabled && !values.sameServiceAddress ? { street:clean(values.serviceAddress) } : undefined, accessInstructions:clean(values.accessInstructions), householdRisks:array(values.householdRisks), mobilityConditions:clean(values.mobilityConditions), caregiverName:clean(values.caregiverName), caregiverPhone:clean(values.caregiverPhone), preferredPeriods:array(values.preferredPeriods) },
    administrative: { serviceType:values.serviceType || 'private', insuranceName:clean(values.insuranceName), registrationNumber:clean(values.registrationNumber), sessionValue:values.sessionValue === '' ? null : Number(values.sessionValue), contractedSessions:totalSessions, completedSessions, paymentNotes:clean(values.paymentNotes) },
    search: { normalizedName: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' '), normalizedPhone: phone.replace(/\D/g, '') || null },
    createdBy: userId,
    updatedBy: userId,
  }
}
