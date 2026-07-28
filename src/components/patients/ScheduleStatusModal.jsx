import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import InputField from '../common/InputField'
import { changeScheduleStatus, rescheduleAppointment } from '../../services/scheduleService'

const reasonRequiredStatuses = new Set(['Falta', 'Cancelado pelo paciente', 'Cancelado pela profissional', 'Reagendado'])
const deductibleStatuses = new Set(['Falta', 'Cancelado pelo paciente', 'Cancelado pela profissional'])

function ScheduleStatusModal({ isOpen, onClose, schedule }) {
  const [status, setStatus] = useState('Agendado')
  const [reason, setReason] = useState('')
  const [deductSession, setDeductSession] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schedule) return
    setStatus(schedule.status === 'Realizado' ? 'Agendado' : schedule.status || 'Agendado')
    setReason('')
    setDeductSession(schedule.sessionDeducted === true)
    setNewDate(schedule.date || '')
    setNewStartTime(schedule.startTime || '')
    setNewEndTime(schedule.endTime || '')
  }, [schedule, isOpen])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (reasonRequiredStatuses.has(status) && !reason.trim()) {
      toast.error('Informe o motivo da alteração.')
      return
    }
    if (status === 'Reagendado' && (!newDate || !newStartTime || !newEndTime)) {
      toast.error('Informe a nova data e os novos horários.')
      return
    }
    if (status === 'Reagendado' && newEndTime <= newStartTime) {
      toast.error('O horário final deve ser posterior ao inicial.')
      return
    }

    try {
      setSaving(true)
      if (status === 'Reagendado') {
        await rescheduleAppointment(schedule.id, {
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          reason: reason.trim(),
        })
        toast.success('Consulta reagendada e histórico preservado.')
      } else {
        await changeScheduleStatus(schedule.id, schedule.patientId, {
          status,
          reason: reason.trim(),
          deductSession: deductibleStatuses.has(status) && deductSession,
        })
        toast.success('Status atualizado com sucesso.')
      }
      onClose()
    } catch (error) {
      console.error(error)
      toast.error(error.message || 'Erro ao atualizar o atendimento.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !schedule) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-noble-900">
        <div className="mb-5 flex items-center justify-between border-b border-noble-200 pb-3 dark:border-noble-800">
          <div>
            <h3 className="text-lg font-bold text-noble-800 dark:text-white">Alterar status</h3>
            <p className="mt-1 text-xs text-noble-500 dark:text-noble-400">{schedule.patientName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-noble-500 hover:text-noble-800 dark:hover:text-white">Fechar</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-noble-700 dark:text-noble-300">
            Novo status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setDeductSession(false) }} className="rounded-xl border border-noble-300 bg-white px-4 py-2.5 text-sm text-noble-800 dark:border-noble-700 dark:bg-noble-800 dark:text-white">
              <option>Agendado</option>
              <option>Confirmado</option>
              <option>Falta</option>
              <option>Cancelado pelo paciente</option>
              <option>Cancelado pela profissional</option>
              <option>Reagendado</option>
            </select>
          </label>

          {reasonRequiredStatuses.has(status) && (
            <InputField label="Motivo" type="textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Registre o motivo informado." required />
          )}

          {deductibleStatuses.has(status) && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gold-300 bg-gold-100/40 p-4 dark:border-gold-600 dark:bg-noble-800">
              <input type="checkbox" checked={deductSession} onChange={(event) => setDeductSession(event.target.checked)} className="mt-0.5 h-5 w-5 rounded text-plum-600" />
              <span>
                <span className="block text-sm font-bold text-noble-800 dark:text-white">Descontar uma sessão do pacote</span>
                <span className="mt-1 block text-xs text-noble-600 dark:text-noble-300">Marque apenas quando a política de atendimento determinar a cobrança.</span>
              </span>
            </label>
          )}

          {status === 'Reagendado' && (
            <div className="space-y-3 rounded-xl border border-plum-200 bg-plum-50 p-4 dark:border-plum-800 dark:bg-noble-800">
              <InputField label="Nova data" type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="Novo início" type="time" value={newStartTime} onChange={(event) => setNewStartTime(event.target.value)} required />
                <InputField label="Novo término" type="time" value={newEndTime} onChange={(event) => setNewEndTime(event.target.value)} required />
              </div>
            </div>
          )}

          <p className="rounded-lg bg-noble-100 p-3 text-xs text-noble-600 dark:bg-noble-800 dark:text-noble-300">A data e a hora desta alteração serão registradas automaticamente.</p>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-plum-600 px-4 py-3 text-sm font-bold text-white hover:bg-plum-700 disabled:opacity-50">{saving ? 'Salvando...' : 'Confirmar alteração'}</button>
        </form>
      </div>
    </div>
  )
}

export default ScheduleStatusModal
