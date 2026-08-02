import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  changePatientStatus,
  getPatientCurrentStatus,
  getPatientStatusLabel,
  getValidTransitions,
} from '../../services/patientLifecycleService'

const STATUS_DESCRIPTIONS = {
  inactive: 'Paciente temporariamente inativo. Pode ser reativado.',
  discharged: 'Tratamento concluído. Pode ser arquivado.',
  archived: 'Prontuário arquivado. Sem novas transições.',
  restricted: 'Acesso restrito. Requer justificativa especial.',
}

const STATUS_LABEL_PT = {
  active: 'Ativo',
  inactive: 'Inativo',
  discharged: 'Finalizado',
  archived: 'Arquivado',
  restricted: 'Restrito',
}

/**
 * Diálogo reutilizável para alteração governada de status do paciente.
 *
 * - Exibe nome e status atual do paciente
 * - Permite selecionar apenas transições válidas
 * - Exige motivo (mín. 10 caracteres)
 * - Exige confirmação explícita
 * - Bloqueia envio duplicado (saving)
 * - Trata erros específicos (LEGAL_HOLD, INVALID_TRANSITION, etc.)
 * - Acessível por teclado (focus trap, ESC, Enter)
 * - Responsivo para celular
 */
export default function PatientStatusDialog({ isOpen, onClose, patient, onStatusChanged }) {
  const [targetStatus, setTargetStatus] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const currentStatus = useMemo(
    () => (patient ? getPatientCurrentStatus(patient) : 'active'),
    [patient],
  )

  const validTransitions = useMemo(
    () => (patient ? getValidTransitions(currentStatus) : []),
    [patient, currentStatus],
  )

  // Reset ao abrir
  useEffect(() => {
    if (isOpen && patient) {
      setTargetStatus(validTransitions[0] || '')
      setReason('')
      setError('')
      setSaving(false)
    }
  }, [isOpen, patient, validTransitions])

  // Fechar com ESC
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    },
    [onClose, saving],
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!patient || !targetStatus || saving) return

    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setError('Justificativa obrigatória (mínimo 10 caracteres).')
      return
    }

    setSaving(true)
    setError('')

    try {
      const result = await changePatientStatus(patient.id, targetStatus, trimmed)
      const label = STATUS_LABEL_PT[targetStatus] || targetStatus
      toast.success(
        result.replayed
          ? `Status já era "${label}". Operação confirmada.`
          : `Paciente alterado para "${label}".`,
      )
      if (onStatusChanged) onStatusChanged(result)
      onClose()
    } catch (err) {
      if (err.code === 'LEGAL_HOLD_ACTIVE') {
        setError('Paciente possui documentos sob legal hold. Restrição não permitida.')
      } else if (err.code === 'INVALID_TRANSITION') {
        setError('Esta transição de status não é permitida.')
      } else if (err.code === 'IDEMPOTENCY_CONFLICT') {
        setError('Operação em andamento. Aguarde e tente novamente.')
      } else if (err.code === 'PATIENT_NOT_FOUND') {
        setError('Paciente não encontrado.')
      } else if (err.code === 'FORBIDDEN') {
        setError('Acesso ao prontuário não autorizado.')
      } else {
        setError(err.message || 'Não foi possível alterar o status do paciente.')
      }
      console.error('Patient status change failed:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !patient) return null

  const currentLabel = getPatientStatusLabel(currentStatus)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-status-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-noble-900">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3
              id="patient-status-dialog-title"
              className="text-lg font-bold text-noble-800 dark:text-noble-100"
            >
              Alterar status do paciente
            </h3>
            <p className="mt-1 text-sm text-noble-500 dark:text-noble-400">
              {patient.name || patient.personalData?.fullName || 'Paciente'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-noble-400 hover:text-noble-600 dark:hover:text-noble-300"
            aria-label="Fechar diálogo"
            disabled={saving}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status atual */}
        <div className="mb-4 rounded-xl bg-noble-50 p-3 dark:bg-noble-800">
          <p className="text-xs uppercase tracking-wide text-noble-500 dark:text-noble-400">
            Status atual
          </p>
          <p className="mt-1 font-semibold text-noble-800 dark:text-noble-100">{currentLabel}</p>
        </div>

        {validTransitions.length === 0 ? (
          <p
            role="status"
            className="rounded-xl bg-gold-50 p-4 text-sm text-gold-800 dark:bg-gold-950/30 dark:text-gold-300"
          >
            Este paciente está em estado terminal e não aceita novas transições de status.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Seleção de status */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="target-status"
                className="text-sm font-medium text-noble-700 dark:text-noble-300"
              >
                Novo status
              </label>
              <select
                id="target-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="rounded-xl border border-noble-200 p-2.5 text-sm dark:border-noble-700 dark:bg-noble-800 dark:text-noble-100"
                required
                disabled={saving}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {validTransitions.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABEL_PT[status]} — {STATUS_DESCRIPTIONS[status]}
                  </option>
                ))}
              </select>
            </div>

            {/* Motivo */}
            <div className="flex flex-col gap-1">
              <label
                htmlFor="status-reason"
                className="text-sm font-medium text-noble-700 dark:text-noble-300"
              >
                Motivo <span className="text-red-500">*</span>
              </label>
              <textarea
                id="status-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  setError('')
                }}
                rows={3}
                className="rounded-xl border border-noble-200 p-2.5 text-sm dark:border-noble-700 dark:bg-noble-800 dark:text-noble-100"
                placeholder="Descreva o motivo da alteração (mín. 10 caracteres)…"
                required
                minLength={10}
                maxLength={2000}
                disabled={saving}
              />
              <p className="text-xs text-noble-400">
                {reason.trim().length}/10 caracteres mínimos
              </p>
            </div>

            {/* Erro */}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {/* Info */}
            <p className="text-xs text-noble-500 dark:text-noble-400">
              A operação será registrada com auditoria. O prontuário e todos os documentos serão preservados.
            </p>

            {/* Ações */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-noble-300 p-3 text-sm font-semibold text-noble-600 hover:bg-noble-50 dark:border-noble-700 dark:text-noble-400 dark:hover:bg-noble-800"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !targetStatus || reason.trim().length < 10}
                className="flex-1 rounded-xl bg-plum-600 p-3 text-sm font-bold text-white transition hover:bg-plum-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Salvando…' : 'Confirmar alteração'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
