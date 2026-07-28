import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import InputField from '../common/InputField'
import { createSchedule, updateSchedule } from '../../services/scheduleService'

const initialValues = {
  patientId: '',
  date: new Date().toISOString().split('T')[0],
  startTime: '08:00',
  endTime: '08:50',
  sessionType: 'Terapia',
  notes: '',
}

function ScheduleModal({ isOpen, onClose, patients = [], schedule, userId }) {
  const [values, setValues] = useState(initialValues)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (schedule) {
      setValues({
        patientId: schedule.patientId || '',
        date: schedule.date || '',
        startTime: schedule.startTime || '08:00',
        endTime: schedule.endTime || '08:50',
        sessionType: schedule.sessionType || 'Terapia',
        notes: schedule.notes || '',
      })
      return
    }

    // Inicializar data para a data atual
    setValues({
      ...initialValues,
      date: new Date().toISOString().split('T')[0],
      // Se tivermos pacientes, pré-selecionar o primeiro ativo
      patientId: patients.find((p) => p.status === 'Ativo')?.id || '',
    })
  }, [schedule, isOpen, patients])

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!values.patientId) {
      toast.error('Selecione um paciente.')
      return
    }
    if (!values.date) {
      toast.error('Informe a data.')
      return
    }
    if (!values.startTime || !values.endTime) {
      toast.error('Informe o horário de início e fim.')
      return
    }

    const selectedPatient = patients.find((p) => p.id === values.patientId)
    if (!selectedPatient) {
      toast.error('Paciente selecionado inválido.')
      return
    }

    const payload = {
      patientId: values.patientId,
      patientName: selectedPatient.name,
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      sessionType: values.sessionType,
      notes: values.notes.trim(),
      status: schedule?.status || 'Agendado',
      userId,
    }

    try {
      setLoading(true)
      if (schedule) {
        await updateSchedule(schedule.id, payload)
        toast.success('Agendamento atualizado com sucesso!')
      } else {
        await createSchedule(payload)
        toast.success('Consulta agendada com sucesso!')
      }
      onClose()
    } catch (error) {
      toast.error('Erro ao salvar agendamento.')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Filtrar apenas pacientes ativos para novos agendamentos
  const activePatients = patients.filter((p) => p.status === 'Ativo')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-noble-900 p-6 shadow-2xl transition-colors duration-200">
        <div className="mb-6 flex items-center justify-between border-b border-noble-100 dark:border-noble-800 pb-3">
          <h3 className="text-xl font-bold text-noble-800 dark:text-noble-100">
            {schedule ? 'Editar Consulta' : 'Agendar Consulta'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-noble-300 dark:border-noble-700 px-3 py-1.5 text-sm font-semibold text-noble-600 dark:text-noble-400 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
          >
            Fechar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seletor de Paciente */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-noble-700 dark:text-noble-300">Paciente *</span>
            <select
              name="patientId"
              value={values.patientId}
              onChange={handleChange}
              disabled={!!schedule} // Não permite alterar o paciente de uma consulta já agendada
              className="w-full rounded-xl border border-noble-200 dark:border-noble-700 bg-white dark:bg-noble-800 text-noble-800 dark:text-noble-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-plum-300 dark:focus:ring-plum-800 disabled:opacity-60 transition"
              required
            >
              <option value="">Selecione um paciente</option>
              {schedule
                ? patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                : activePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
            </select>
          </div>

          {/* Data */}
          <InputField
            label="Data da Consulta *"
            type="date"
            name="date"
            value={values.date}
            onChange={handleChange}
            required
          />

          {/* Horários (Início / Fim) */}
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Horário de Início *"
              type="time"
              name="startTime"
              value={values.startTime}
              onChange={handleChange}
              required
            />
            <InputField
              label="Horário de Fim *"
              type="time"
              name="endTime"
              value={values.endTime}
              onChange={handleChange}
              required
            />
          </div>

          {/* Tipo de Sessão */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-noble-700 dark:text-noble-300">Tipo de Atendimento</span>
            <select
              name="sessionType"
              value={values.sessionType}
              onChange={handleChange}
              className="w-full rounded-xl border border-noble-200 dark:border-noble-700 bg-white dark:bg-noble-800 text-noble-800 dark:text-noble-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-plum-300 dark:focus:ring-plum-800 transition"
            >
              <option value="Terapia">Terapia</option>
              <option value="Avaliação">Avaliação</option>
              <option value="Retorno">Retorno</option>
            </select>
          </div>

          {/* Observações */}
          <InputField
            label="Observações"
            type="textarea"
            name="notes"
            value={values.notes}
            onChange={handleChange}
            placeholder="Anotações prévias ou detalhes para esta sessão..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-noble-300 dark:border-noble-700 px-5 py-2.5 text-sm font-semibold text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-plum-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-plum-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Salvando...' : schedule ? 'Salvar Alterações' : 'Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ScheduleModal
