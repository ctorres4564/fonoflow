import { appointmentV2Schema } from '../schemas/appointment.schema.js'
import { SchemaNormalizationError } from './patient.mapper.js'

const statusToV2 = {
  Agendado: 'scheduled',
  Confirmado: 'confirmed',
  'Em deslocamento': 'in_transit',
  Chegou: 'arrived',
  Realizado: 'completed',
  Falta: 'patient_absent',
  'Cancelado pelo paciente': 'cancelled_by_patient',
  'Cancelado pela profissional': 'cancelled_by_professional',
  Reagendado: 'rescheduled',
}

const statusToLegacy = Object.fromEntries(
  Object.entries(statusToV2).map(([legacy, current]) => [current, legacy]),
)

const serviceToV2 = { Online: 'online', 'ClÃ­nica': 'clinic', Clinica: 'clinic' }
const serviceToLabel = { home_care: 'Atendimento domiciliar', clinic: 'ClÃ­nica', online: 'Online' }

function dateValue(date, time) {
  return date && time ? new Date(`${date}T${time}:00`) : new Date(0)
}

export function convertAppointmentV1ToV2(raw) {
  return {
    ...raw,
    schemaVersion: 2,
    userId: raw.userId || '',
    patientId: raw.patientId || '',
    serviceType: raw.serviceType || serviceToV2[raw.sessionType] || 'home_care',
    scheduledStart: raw.scheduledStart || dateValue(raw.date, raw.startTime),
    scheduledEnd: raw.scheduledEnd || dateValue(raw.date, raw.endTime),
    status: statusToV2[raw.status] || raw.status || 'scheduled',
    sessionAccounting: {
      deductSession: raw.sessionDeducted === true,
      deductedAt: raw.deductedAt || null,
      deductionOperationId: raw.deductionOperationId || null,
      ...raw.sessionAccounting,
    },
    notes: raw.notes || null,
    createdAt: raw.createdAt || new Date(0),
    createdBy: raw.createdBy || raw.userId || 'legacy',
  }
}

export function normalizeAppointmentDocument(raw) {
  if (raw?.schemaVersion != null && raw.schemaVersion !== 2) {
    throw new SchemaNormalizationError('agendamento', new Error(`VersÃ£o nÃ£o suportada: ${raw.schemaVersion}`))
  }
  try {
    const candidate = raw?.schemaVersion === 2 ? { ...raw } : convertAppointmentV1ToV2(raw || {})
    const appointment = appointmentV2Schema.parse(candidate)
    const start = appointment.scheduledStart instanceof Date ? appointment.scheduledStart : null
    const end = appointment.scheduledEnd instanceof Date ? appointment.scheduledEnd : null
    return {
      ...appointment,
      appointmentStatusV2: appointment.status,
      status: statusToLegacy[appointment.status] || appointment.status,
      date: raw.date || start?.toISOString().slice(0, 10) || '',
      startTime: raw.startTime || start?.toTimeString().slice(0, 5) || '',
      endTime: raw.endTime || end?.toTimeString().slice(0, 5) || '',
      sessionType: raw.sessionType || serviceToLabel[appointment.serviceType],
      sessionDeducted: appointment.sessionAccounting.deductSession,
    }
  } catch (error) {
    throw new SchemaNormalizationError('agendamento', error)
  }
}
