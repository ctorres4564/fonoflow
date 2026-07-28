import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import toast from 'react-hot-toast'
import ScheduleModal from '../components/patients/ScheduleModal'
import EvolutionModal from '../components/patients/EvolutionModal'
import ScheduleStatusModal from '../components/patients/ScheduleStatusModal'
import { useAuth } from '../contexts/useAuth'
import { getWhatsAppReminderLink } from '../utils/whatsappHelper'

// Nomes dos meses e dias da semana
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const ACTIVE_STATUSES = new Set(['Agendado', 'Confirmado'])
const STATUS_OPTIONS = ['Todos', 'Agendado', 'Confirmado', 'Realizado', 'Falta', 'Cancelado pelo paciente', 'Cancelado pela profissional', 'Reagendado']
const statusStyles = {
  Agendado: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Confirmado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Realizado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  Falta: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  'Cancelado pelo paciente': 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  'Cancelado pela profissional': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Reagendado: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
}

function AgendaPage() {
  const { user } = useAuth()
  const { patients = [], schedules = [], loadingSchedules } = useOutletContext()

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [scheduleToComplete, setScheduleToComplete] = useState(null)
  const [scheduleToChangeStatus, setScheduleToChangeStatus] = useState(null)
  const [generalSearch, setGeneralSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')

  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  // Geração dos dias do calendário para o mês ativo
  const daysInMonth = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()

    const days = []

    // Preencher dias vazios do mês anterior
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null)
    }

    // Preencher dias do mês atual
    for (let day = 1; day <= totalDays; day++) {
      // Formato YYYY-MM-DD local
      const monthStr = String(currentMonth + 1).padStart(2, '0')
      const dayStr = String(day).padStart(2, '0')
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`
      days.push({ day, dateStr })
    }

    return days
  }, [currentYear, currentMonth])

  // Agrupar os schedules por dia para marcar no calendário
  const schedulesByDate = useMemo(() => {
    const map = {}
    schedules.forEach((sch) => {
      if (!map[sch.date]) {
        map[sch.date] = []
      }
      map[sch.date].push(sch)
    })
    return map
  }, [schedules])

  // Filtrar apenas os compromissos do dia selecionado
  const selectedDaySchedules = useMemo(() => {
    return schedulesByDate[selectedDateStr] || []
  }, [schedulesByDate, selectedDateStr])

  // Filtrar e ordenar todos os compromissos gerais da lista de histórico
  const filteredGeneralSchedules = useMemo(() => {
    const term = generalSearch.toLowerCase().trim()
    
    // Filtrar por busca e ordenar cronologicamente decrescente (mais recentes primeiro)
    return schedules
      .filter((sch) => {
        const matchesSearch = sch.patientName?.toLowerCase().includes(term) || sch.sessionType?.toLowerCase().includes(term)
        const matchesStatus = statusFilter === 'Todos' || (sch.status || 'Agendado') === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => {
        const dateTimeA = `${a.date || ''}T${a.startTime || ''}`
        const dateTimeB = `${b.date || ''}T${b.startTime || ''}`
        return dateTimeB.localeCompare(dateTimeA) // Recentes primeiro
      })
  }, [schedules, generalSearch, statusFilter])

  // Navegar entre meses
  const prevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  }
  const nextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  }
  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDateStr(today.toISOString().split('T')[0])
  }

  // Modais
  const openCreateModal = () => {
    setSelectedSchedule(null)
    setIsModalOpen(true)
  }
  const openEditModal = (sch) => {
    setSelectedSchedule(sch)
    setIsModalOpen(true)
  }
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedSchedule(null)
  }

  const openEvolutionFromSchedule = (schedule) => {
    const patient = patients.find((item) => item.id === schedule.patientId)
    if (!patient) {
      toast.error('Paciente deste agendamento não foi encontrado.')
      return
    }

    if (schedule.status === 'Realizado' || schedule.evolutionId) {
      toast.error('Este atendimento já foi registrado.')
      return
    }

    setScheduleToComplete({ schedule, patient })
  }

  // Formatar data selecionada para exibição
  const formattedSelectedDate = useMemo(() => {
    const [year, month, day] = selectedDateStr.split('-')
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day))
    
    const formatted = dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    // Capitalizar primeira letra
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }, [selectedDateStr])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card md:flex-row md:items-center md:justify-between transition-colors duration-200">
        <div>
          <h2 className="text-2xl font-bold text-noble-800 dark:text-noble-100">Agenda</h2>
          <p className="text-sm text-noble-500 dark:text-noble-400">Controle integrado de datas e horários de atendimentos.</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-plum-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-plum-700"
        >
          + Novo agendamento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Lado Esquerdo: Calendário (7 Colunas) */}
        <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card md:col-span-7 flex flex-col transition-colors duration-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-noble-200 dark:border-noble-800 pb-3">
            <h3 className="text-base font-bold text-noble-800 dark:text-noble-100">
              {MONTHS[currentMonth]} de {currentYear}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={goToToday}
                className="rounded-lg border border-noble-300 dark:border-noble-700 px-3 py-1.5 text-xs font-semibold text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg border border-noble-300 dark:border-noble-700 px-3 py-1.5 text-xs text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
              >
                &lt; Anterior
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg border border-noble-300 dark:border-noble-700 px-3 py-1.5 text-xs text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
              >
                Próximo &gt;
              </button>
            </div>
          </div>

          {/* Grid do Calendário */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-noble-500 dark:text-noble-400">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 mt-1">
            {daysInMonth.map((dayInfo, idx) => {
              if (!dayInfo) {
                return <div key={`empty-${idx}`} className="h-14 bg-noble-50/50 dark:bg-noble-800/10 rounded-lg" />
              }

              const { day, dateStr } = dayInfo
              const isSelected = dateStr === selectedDateStr
              const hasSchedules = !!schedulesByDate[dateStr]
              const isToday = dateStr === new Date().toISOString().split('T')[0]

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`h-14 relative flex flex-col items-center justify-between p-1.5 rounded-lg border transition ${
                    isSelected
                      ? 'border-plum-500 bg-plum-50 dark:bg-plum-950/20 text-plum-700 dark:text-plum-300 font-bold'
                      : 'border-noble-100 dark:border-noble-800/60 bg-white dark:bg-noble-900 text-noble-800 dark:text-noble-200 hover:border-noble-300 dark:hover:border-noble-750'
                  }`}
                >
                  <span className={`text-xs rounded-full px-1.5 py-0.5 ${isToday ? 'bg-gold-400 text-noble-950 font-bold' : ''}`}>
                    {day}
                  </span>
                  
                  {/* Ponto indicador de compromisso */}
                  {hasSchedules && (
                    <span className="h-2 w-2 rounded-full bg-plum-600 dark:bg-plum-500 mb-1 animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Lado Direito: Compromissos do Dia (5 Colunas) */}
        <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card md:col-span-5 flex flex-col transition-colors duration-200">
          <div className="border-b border-noble-200 dark:border-noble-800 pb-3 mb-4">
            <h3 className="text-base font-bold text-noble-800 dark:text-noble-100">Consultas do Dia</h3>
            <p className="text-xs text-noble-500 dark:text-noble-400 mt-1 font-semibold">{formattedSelectedDate}</p>
          </div>

          {loadingSchedules ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-plum-200 border-t-plum-600" />
            </div>
          ) : selectedDaySchedules.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
              <p className="text-sm font-medium text-noble-500 dark:text-noble-400">Nenhuma consulta agendada para hoje.</p>
              <p className="text-xs text-noble-400 dark:text-noble-500 mt-1">Utilize o botão superior para marcar.</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto max-h-[350px] pr-1">
              {selectedDaySchedules.map((sch) => {
                const patientPhone = patients.find((p) => p.id === sch.patientId)?.phone || ''
                const waLink = getWhatsAppReminderLink(patientPhone, sch.patientName, sch.date, sch.startTime)
                const currentStatus = sch.status || 'Agendado'

                const badgeColor = {
                  Terapia: 'bg-plum-100 dark:bg-plum-950/40 text-plum-700 dark:text-plum-300',
                  Avaliação: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
                  Retorno: 'bg-gold-100 dark:bg-gold-950/40 text-gold-700 dark:text-gold-300',
                }[sch.sessionType] || 'bg-noble-100 dark:bg-noble-800 text-noble-700 dark:text-noble-300'

                return (
                  <div
                    key={sch.id}
                    className="group relative rounded-xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-4 shadow-sm hover:border-noble-300 dark:hover:border-noble-700 transition"
                  >
                    {/* Botões de Ação na Linha */}
                    <div className="absolute right-3 top-3 flex gap-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                      {patientPhone && ACTIVE_STATUSES.has(currentStatus) && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-0.5 font-semibold"
                        >
                          Lembrete 💬
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(sch)}
                        className="text-xs text-plum-600 dark:text-plum-400 hover:underline font-semibold"
                      >
                        Editar
                      </button>
                      {!['Realizado', 'Reagendado'].includes(currentStatus) && <button type="button" onClick={() => setScheduleToChangeStatus(sch)} className="text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400">Status</button>}
                    </div>

                    <p className="font-semibold text-noble-800 dark:text-noble-100">{sch.patientName}</p>
                    
                    <div className="flex flex-wrap gap-2 items-center mt-2">
                      <span className="text-xs font-semibold text-noble-600 dark:text-noble-300 bg-noble-100 dark:bg-noble-800 px-2 py-0.5 rounded">
                        🕒 {sch.startTime} - {sch.endTime}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeColor}`}>
                        {sch.sessionType}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${statusStyles[currentStatus] || statusStyles.Agendado}`}>
                        {currentStatus}
                      </span>
                      {sch.sessionDeducted && <span className="rounded bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-600">Sessão descontada</span>}
                    </div>

                    {ACTIVE_STATUSES.has(currentStatus) && !sch.evolutionId && (
                      <button
                        type="button"
                        onClick={() => openEvolutionFromSchedule(sch)}
                        className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-green-700"
                      >
                        Realizar atendimento e registrar evolução
                      </button>
                    )}

                    {sch.notes && (
                      <p className="mt-2 text-xs text-noble-500 dark:text-noble-400 bg-noble-50 dark:bg-noble-900/40 p-2 rounded italic">
                        {sch.notes}
                      </p>
                    )}
                    {sch.statusReason && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300"><strong>Motivo:</strong> {sch.statusReason}</p>}
                    {sch.statusUpdatedAt?.toDate && <p className="mt-1 text-[10px] text-noble-400">Status alterado em {sch.statusUpdatedAt.toDate().toLocaleString('pt-BR')}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO EXTRA: LISTA GERAL DE AGENDAMENTOS (HISTÓRICO) */}
      <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card transition-colors duration-200">
        <div className="border-b border-noble-200 dark:border-noble-800 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-noble-800 dark:text-noble-100">Lista Geral de Agendamentos</h3>
            <p className="text-xs text-noble-500 dark:text-noble-400 mt-1">Consulte o histórico e atualize o status sem excluir atendimentos.</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <input
              type="text"
              placeholder="Buscar por paciente ou tipo..."
              value={generalSearch}
              onChange={(e) => setGeneralSearch(e.target.value)}
              className="w-full rounded-xl border border-noble-300 !bg-white px-4 py-2 text-xs !text-black placeholder:!text-noble-500 focus:outline-none focus:ring-2 focus:ring-plum-300 dark:border-noble-700 dark:!bg-noble-800 dark:!text-white dark:placeholder:!text-noble-300 transition-colors"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-noble-200 bg-white px-4 py-2 text-xs text-noble-800 focus:outline-none focus:ring-2 focus:ring-plum-300 dark:border-noble-700 dark:bg-noble-800 dark:text-white">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
        </div>

        {loadingSchedules ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-plum-200 border-t-plum-600" />
          </div>
        ) : filteredGeneralSchedules.length === 0 ? (
          <p className="py-6 text-center text-xs text-noble-500 dark:text-noble-400">Nenhum agendamento encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-noble-200 dark:divide-noble-800 text-xs">
              <thead className="bg-noble-100 dark:bg-noble-800/60 text-left">
                <tr>
                  <th className="px-4 py-3 font-bold text-noble-700 dark:text-noble-300">Paciente</th>
                  <th className="px-4 py-3 font-bold text-noble-700 dark:text-noble-300">Data e Hora</th>
                  <th className="px-4 py-3 font-bold text-noble-700 dark:text-noble-300">Tipo</th>
                  <th className="px-4 py-3 font-bold text-noble-700 dark:text-noble-300">Status</th>
                  <th className="px-4 py-3 font-bold text-noble-700 dark:text-noble-300">Observações</th>
                  <th className="px-4 py-3 text-right font-bold text-noble-700 dark:text-noble-300">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-noble-100 dark:divide-noble-800">
                {filteredGeneralSchedules.map((sch) => {
                  const patientPhone = patients.find((p) => p.id === sch.patientId)?.phone || ''
                  const waLink = getWhatsAppReminderLink(patientPhone, sch.patientName, sch.date, sch.startTime)
                  const currentStatus = sch.status || 'Agendado'
                  const [year, month, day] = sch.date.split('-')
                  const formattedDate = `${day}/${month}/${year}`

                  const badgeColor = {
                    Terapia: 'bg-plum-100 dark:bg-plum-950/40 text-plum-700 dark:text-plum-300',
                    Avaliação: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
                    Retorno: 'bg-gold-100 dark:bg-gold-950/40 text-gold-700 dark:text-gold-300',
                  }[sch.sessionType] || 'bg-noble-100 dark:bg-noble-800 text-noble-700 dark:text-noble-300'

                  return (
                    <tr key={sch.id} className="hover:bg-plum-50/20 dark:hover:bg-plum-950/5">
                      <td className="px-4 py-3 font-semibold text-noble-800 dark:text-noble-100">{sch.patientName}</td>
                      <td className="px-4 py-3 text-noble-700 dark:text-noble-300 font-medium">
                        {formattedDate} às {sch.startTime} - {sch.endTime}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}>
                          {sch.sessionType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[currentStatus] || statusStyles.Agendado}`}>
                          {currentStatus}
                        </span>
                        {sch.sessionDeducted && <span className="mt-1 block text-[9px] font-bold text-gold-600">Sessão descontada</span>}
                        {sch.statusUpdatedAt?.toDate && <span className="mt-1 block text-[9px] text-noble-400">{sch.statusUpdatedAt.toDate().toLocaleString('pt-BR')}</span>}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-noble-500 dark:text-noble-400"><span className="block truncate italic">{sch.notes || '-'}</span>{sch.statusReason && <span className="mt-1 block truncate text-amber-600 dark:text-amber-300">Motivo: {sch.statusReason}</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {ACTIVE_STATUSES.has(currentStatus) && !sch.evolutionId && (
                            <button
                              type="button"
                              onClick={() => openEvolutionFromSchedule(sch)}
                              className="text-[11px] font-bold text-green-600 hover:underline dark:text-green-400"
                            >
                              Realizar
                            </button>
                          )}
                          {patientPhone && ACTIVE_STATUSES.has(currentStatus) && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-green-600 dark:text-green-400 hover:underline font-bold"
                            >
                              Lembrete 💬
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(sch)}
                            className="text-[11px] text-plum-600 dark:text-plum-400 hover:underline font-bold"
                          >
                            Editar
                          </button>
                          {!['Realizado', 'Reagendado'].includes(currentStatus) && <button type="button" onClick={() => setScheduleToChangeStatus(sch)} className="text-[11px] font-bold text-amber-600 hover:underline dark:text-amber-400">Status</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ScheduleModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        patients={patients}
        schedule={selectedSchedule}
        userId={user?.uid}
      />
      <EvolutionModal
        isOpen={!!scheduleToComplete}
        onClose={() => setScheduleToComplete(null)}
        patient={scheduleToComplete?.patient}
        linkedSchedule={scheduleToComplete?.schedule}
        onScheduleCompleted={() => setScheduleToComplete(null)}
      />
      <ScheduleStatusModal
        isOpen={!!scheduleToChangeStatus}
        onClose={() => setScheduleToChangeStatus(null)}
        schedule={scheduleToChangeStatus}
      />
    </div>
  )
}

export default AgendaPage
