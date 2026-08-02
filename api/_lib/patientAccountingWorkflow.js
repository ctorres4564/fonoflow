import { calculateSessionAccounting, resolvePatientStatusAfterAccounting } from '../../src/domain/appointments/appointmentTransitions.js'

/**
 * Fonte única de verdade para o débito de sessão + auto-alta do paciente.
 * Usada por todo fluxo backend que finaliza um atendimento (agenda, evolução
 * agendada, evolução manual, finalização com revisão de qualidade) — nunca
 * duplicar esta decisão em cada workflow.
 *
 * Regra: remainingSessions > 0 mantém o status atual; remainingSessions == 0
 * só promove para 'discharged' se o status atual for 'active' — inactive,
 * restricted, archived e discharged nunca são alterados automaticamente.
 */
export function buildPatientAccountingPatch(currentPatientV2, timestamp) {
  const accounting = calculateSessionAccounting(currentPatientV2, true)
  const status = resolvePatientStatusAfterAccounting(currentPatientV2.status, accounting.remainingSessions)
  return {
    accounting,
    patch: {
      completedSessions: accounting.completedSessions,
      remainingSessions: accounting.remainingSessions,
      administrative: { ...currentPatientV2.administrative, completedSessions: accounting.completedSessions },
      status,
      updatedAt: timestamp,
    },
  }
}
