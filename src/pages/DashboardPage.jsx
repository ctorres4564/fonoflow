import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import StatCard from '../components/common/StatCard'
import SkeletonCard from '../components/common/SkeletonCard'
import EmptyState from '../components/common/EmptyState'
import { getDashboardStats } from '../utils/patient'

function DashboardPage() {
  const { patients = [], loadingPatients, schedules = [], loadingSchedules } = useOutletContext()

  const stats = useMemo(() => getDashboardStats(patients), [patients])

  // Estado do Banner de Onboarding Inicial
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding_completed')
  })

  // Registra visualização inicial para ocultar o onboarding em visitas subsequentes
  useEffect(() => {
    if (!localStorage.getItem('onboarding_completed')) {
      localStorage.setItem('onboarding_completed', 'true')
    }
  }, [])

  // Painel de Alertas Clínicos
  const alerts = useMemo(() => {
    if (loadingPatients) return []

    const list = []
    const today = new Date()
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0')
    const currentDay = String(today.getDate()).padStart(2, '0')
    const todayMMDD = `${currentMonth}-${currentDay}`
    const todayISO = today.toISOString().slice(0, 10)
    const reviewLimit = new Date(today)
    reviewLimit.setDate(reviewLimit.getDate() + 7)
    const reviewLimitISO = reviewLimit.toISOString().slice(0, 10)

    patients.forEach((patient) => {
      // 1. Alerta de Aniversariante
      if (patient.birthDate) {
        const parts = patient.birthDate.split('-')
        if (parts.length === 3) {
          const birthMMDD = `${parts[1]}-${parts[2]}`
          if (birthMMDD === todayMMDD) {
            list.push({
              id: `birth-${patient.id}`,
              type: 'birthday',
              message: `🎉 Hoje é aniversário de ${patient.name}! Que tal enviar os parabéns?`,
            })
          }
        }
      }

      // 2. Alerta de limite de sessões
      const completed = Number(patient.completedSessions || 0)
      const total = Number(patient.totalSessions || 0)
      if (patient.status === 'Ativo' && total > 0 && completed >= total) {
        list.push({
          id: `limit-${patient.id}`,
          type: 'sessions_limit',
          message: `⚠️ ${patient.name} atingiu o limite estimado de sessões (${completed}/${total}). Avalie a necessidade de renovação do atendimento domiciliar.`,
        })
      }

      if (patient.status === 'Ativo' && !Number(patient.therapeuticObjectivesCount || 0)) {
        list.push({
          id: `plan-${patient.id}`,
          type: 'therapeutic_plan',
          message: `📋 ${patient.name} está sem plano terapêutico com objetivos cadastrados.`,
        })
      }

      if (patient.status === 'Ativo' && patient.therapeuticReviewDate && patient.therapeuticReviewDate <= reviewLimitISO) {
        const overdue = patient.therapeuticReviewDate < todayISO
        list.push({
          id: `review-${patient.id}`,
          type: 'therapeutic_review',
          message: `${overdue ? '⚠️' : '📅'} A reavaliação do plano de ${patient.name} ${overdue ? 'está atrasada' : 'vence nos próximos 7 dias'}.`,
        })
      }
    })

    return list
  }, [patients, loadingPatients])

  // Gráfico 1: Agrupamento de Atendimentos por Dia da Semana Corrente (Segunda a Sábado)
  const weeklyAnalytics = useMemo(() => {
    const daysData = [
      { key: 1, label: 'Seg', count: 0 },
      { key: 2, label: 'Ter', count: 0 },
      { key: 3, label: 'Qua', count: 0 },
      { key: 4, label: 'Qui', count: 0 },
      { key: 5, label: 'Sex', count: 0 },
      { key: 6, label: 'Sáb', count: 0 },
    ]

    const today = new Date()
    const dayOfWeek = today.getDay()
    
    // Obter a segunda-feira desta semana
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    startOfWeek.setHours(0, 0, 0, 0)

    // Obter o sábado desta semana
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 5)
    endOfWeek.setHours(23, 59, 59, 999)

    schedules.forEach((sch) => {
      if (!sch.date) return
      // Criar data local a partir de YYYY-MM-DD
      const schDate = new Date(sch.date + 'T00:00:00')
      if (schDate >= startOfWeek && schDate <= endOfWeek) {
        const day = schDate.getDay() // 0 = Dom, 1 = Seg, ...
        if (day >= 1 && day <= 6) {
          daysData[day - 1].count++
        }
      }
    })

    return daysData
  }, [schedules])

  // Gráfico 2: Distribuição por Tipo de Atendimento
  const typeAnalytics = useMemo(() => {
    const counts = { Terapia: 0, Avaliação: 0, Retorno: 0 }
    
    schedules.forEach((sch) => {
      if (counts[sch.sessionType] !== undefined) {
        counts[sch.sessionType]++
      }
    })

    const total = counts.Terapia + counts.Avaliação + counts.Retorno
    
    return [
      { type: 'Terapia', count: counts.Terapia, pct: total > 0 ? (counts.Terapia / total) * 100 : 0 },
      { type: 'Avaliação', count: counts.Avaliação, pct: total > 0 ? (counts.Avaliação / total) * 100 : 0 },
      { type: 'Retorno', count: counts.Retorno, pct: total > 0 ? (counts.Retorno / total) * 100 : 0 },
    ]
  }, [schedules])

  const isLoading = loadingPatients || loadingSchedules

  const attendanceStats = useMemo(() => {
    const completed = schedules.filter((schedule) => schedule.status === 'Realizado').length
    const absences = schedules.filter((schedule) => schedule.status === 'Falta').length
    const cancellations = schedules.filter((schedule) => ['Cancelado pelo paciente', 'Cancelado pela profissional'].includes(schedule.status)).length
    const concluded = completed + absences
    return {
      completed,
      absences,
      cancellations,
      attendanceRate: concluded > 0 ? Math.round((completed / concluded) * 100) : 0,
    }
  }, [schedules])

  const therapeuticStats = useMemo(() => {
    const activePatients = patients.filter((patient) => patient.status === 'Ativo')
    const today = new Date().toISOString().slice(0, 10)
    const reviewLimit = new Date()
    reviewLimit.setDate(reviewLimit.getDate() + 7)
    const reviewLimitISO = reviewLimit.toISOString().slice(0, 10)

    return {
      objectives: activePatients.reduce((total, patient) => total + Number(patient.therapeuticObjectivesCount || 0), 0),
      achieved: activePatients.reduce((total, patient) => total + Number(patient.therapeuticAchievedCount || 0), 0),
      reviews: activePatients.filter((patient) => patient.therapeuticReviewDate && patient.therapeuticReviewDate >= today && patient.therapeuticReviewDate <= reviewLimitISO).length,
      withoutPlan: activePatients.filter((patient) => !Number(patient.therapeuticObjectivesCount || 0)).length,
    }
  }, [patients])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-noble-800 dark:text-noble-100">Dashboard</h2>
          <p className="text-sm text-noble-500 dark:text-noble-400">Visão geral dos indicadores do tratamento.</p>
        </div>
      </div>

      {/* Onboarding Banner Interativo do SaaS */}
      {showOnboarding && (
        <div className="rounded-2xl border border-plum-200 dark:border-noble-800/60 bg-plum-50/40 dark:bg-noble-850/20 p-5 shadow-sm transition-colors duration-200 relative">
          <button
            type="button"
            onClick={() => {
              localStorage.setItem('onboarding_completed', 'true')
              setShowOnboarding(false)
            }}
            className="absolute top-4 right-4 text-noble-400 hover:text-noble-650 dark:text-noble-400 dark:hover:text-white text-xs font-bold transition-colors"
          >
            Dispensar ✕
          </button>
          
          <h3 className="text-sm font-bold text-plum-900 dark:text-white flex items-center gap-2">
            <span>✨</span> Seja bem-vindo ao FonoFlow!
          </h3>
          <p className="text-xs text-noble-700 dark:text-noble-100 mt-1.5 leading-relaxed max-w-2xl">
            Preparamos um guia rápido para ajudar você a dar os primeiros passos e configurar seu consultório domiciliar em menos de 2 minutos. Siga as etapas sugeridas:
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-4">
            <div className="rounded-xl bg-white dark:bg-noble-800 p-4 border border-noble-100 dark:border-noble-700/60 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-plum-600 dark:text-plum-400">Etapa 1 👥</span>
                <h4 className="text-xs font-bold text-noble-800 dark:text-noble-100 mt-1">Cadastrar Paciente</h4>
                <p className="text-[10px] text-noble-500 dark:text-noble-400 mt-1 leading-relaxed">
                  Adicione seus pacientes de home care incluindo o endereço domiciliar e limite de sessões contratadas.
                </p>
              </div>
              <a
                href="/pacientes"
                className="mt-3 text-[11px] font-bold text-plum-600 dark:text-plum-400 hover:underline flex items-center gap-1"
              >
                Ir para Pacientes ➔
              </a>
            </div>

            <div className="rounded-xl bg-white dark:bg-noble-800 p-4 border border-noble-100 dark:border-noble-700/60 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-plum-600 dark:text-plum-400">Etapa 2 📅</span>
                <h4 className="text-xs font-bold text-noble-800 dark:text-noble-100 mt-1">Agendar Visita</h4>
                <p className="text-[10px] text-noble-500 dark:text-noble-400 mt-1 leading-relaxed">
                  Defina o dia e horário da consulta e envie o lembrete de confirmação diretamente no WhatsApp do paciente.
                </p>
              </div>
              <a
                href="/agenda"
                className="mt-3 text-[11px] font-bold text-plum-600 dark:text-plum-400 hover:underline flex items-center gap-1"
              >
                Ir para Agenda ➔
              </a>
            </div>

            <div className="rounded-xl bg-white dark:bg-noble-800 p-4 border border-noble-100 dark:border-noble-700/60 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-plum-600 dark:text-plum-400">Etapa 3 📖</span>
                <h4 className="text-xs font-bold text-noble-800 dark:text-noble-100 mt-1">Ver o Guia de Uso</h4>
                <p className="text-[10px] text-noble-500 dark:text-noble-400 mt-1 leading-relaxed">
                  Entenda como usar o microfone para ditar prontuários por voz e como a IA do DeepSeek melhora suas notas clínicas.
                </p>
              </div>
              <a
                href="/guia"
                className="mt-3 text-[11px] font-bold text-plum-600 dark:text-plum-400 hover:underline flex items-center gap-1"
              >
                Ler Guia de Uso ➔
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Painel de Alertas */}
      {alerts.length > 0 && (
        <div className="rounded-2xl border border-gold-300 dark:border-gold-800 bg-gold-50 dark:bg-gold-950/15 p-4 space-y-2 transition-colors duration-200">
          <h4 className="text-xs font-bold text-gold-600 dark:text-gold-400 uppercase tracking-wider">Alertas Clínicos</h4>
          <div className="space-y-1.5">
            {alerts.map((alert) => (
              <p key={alert.id} className="text-sm text-noble-800 dark:text-noble-200 font-medium">
                {alert.message}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard title="Total de pacientes" value={stats.totalPatients} accent="plum" />
            <StatCard title="Sessões da semana" value={stats.sessionsThisWeek} accent="gold" />
            <StatCard title="Pacientes ativos" value={stats.activePatients} accent="emerald" />
            <StatCard title="Tratamentos finalizados" value={stats.finishedPatients} accent="noble" />
          </>
        )}
      </div>

      {!isLoading && schedules.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-noble-600 dark:text-noble-300">Indicadores de comparecimento</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Atendimentos realizados" value={attendanceStats.completed} accent="emerald" />
            <StatCard title="Faltas" value={attendanceStats.absences} accent="gold" />
            <StatCard title="Cancelamentos" value={attendanceStats.cancellations} accent="noble" />
            <StatCard title="Taxa de presença" value={`${attendanceStats.attendanceRate}%`} helper="Realizados entre atendimentos concluídos e faltas" accent="plum" />
          </div>
        </div>
      )}

      {!isLoading && stats.activePatients > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-noble-600 dark:text-noble-300">Acompanhamento terapêutico</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Objetivos cadastrados" value={therapeuticStats.objectives} accent="plum" />
            <StatCard title="Objetivos atingidos" value={therapeuticStats.achieved} accent="emerald" />
            <StatCard title="Reavaliações em 7 dias" value={therapeuticStats.reviews} accent="gold" />
            <StatCard title="Pacientes sem plano" value={therapeuticStats.withoutPlan} accent="noble" />
          </div>
        </div>
      )}

      {/* Seção de Gráficos e Distribuição */}
      {!isLoading && stats.totalPatients > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Gráfico 1: Atendimentos Semanais (SVG Native) */}
          <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card transition-colors duration-200">
            <h3 className="text-base font-bold text-noble-800 dark:text-noble-100">Agendamentos da Semana</h3>
            <p className="text-xs text-noble-500 dark:text-noble-400 mt-1">Volume de atendimentos agendados de Segunda a Sábado.</p>
            
            <div className="mt-6 flex h-48 items-end justify-between px-2">
              {weeklyAnalytics.map((day) => {
                const maxCount = Math.max(...weeklyAnalytics.map((d) => d.count), 1)
                const heightPercent = (day.count / maxCount) * 100
                
                return (
                  <div key={day.key} className="flex flex-col items-center gap-2 flex-1 group">
                    {/* Tooltip com a quantidade */}
                    <span className="text-[10px] font-bold text-plum-600 dark:text-plum-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      {day.count}
                    </span>
                    
                    {/* Barra SVG/CSS */}
                    <div className="w-8 sm:w-10 bg-noble-100 dark:bg-noble-800 rounded-t-lg overflow-hidden h-32 flex items-end">
                      <div 
                        style={{ height: `${heightPercent}%` }}
                        className="w-full bg-plum-600 dark:bg-plum-500 rounded-t-lg transition-all duration-500 ease-out"
                      />
                    </div>
                    
                    {/* Dia da semana */}
                    <span className="text-xs font-semibold text-noble-550 dark:text-noble-400">
                      {day.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Gráfico 2: Distribuição por Tipo (Progress Bars) */}
          <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card transition-colors duration-200">
            <h3 className="text-base font-bold text-noble-800 dark:text-noble-100">Distribuição de Consultas</h3>
            <p className="text-xs text-noble-500 dark:text-noble-400 mt-1">Porcentagem das sessões marcadas divididas por categoria.</p>
            
            <div className="mt-6 space-y-5">
              {typeAnalytics.map((item) => {
                const accentColor = {
                  Terapia: 'bg-plum-600 dark:bg-plum-500',
                  Avaliação: 'bg-emerald-600 dark:bg-emerald-500',
                  Retorno: 'bg-gold-500',
                }[item.type]

                return (
                  <div key={item.type} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-noble-700 dark:text-noble-300">
                      <span>{item.type}</span>
                      <span>{item.count} ({item.pct.toFixed(0)}%)</span>
                    </div>
                    
                    {/* Barra de progresso */}
                    <div className="h-3 w-full rounded-full bg-noble-100 dark:bg-noble-800 overflow-hidden">
                      <div
                        style={{ width: `${item.pct}%` }}
                        className={`h-full rounded-full transition-all duration-500 ease-out ${accentColor}`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Estado Vazio de Dashboard */}
      {!isLoading && stats.totalPatients === 0 && (
        <div className="mt-6">
          <EmptyState
            title="Seu consultório está vazio"
            description="Cadastre seu primeiro paciente de atendimento domiciliar e faça agendamentos para ver estatísticas e análises completas aqui."
          />
        </div>
      )}
    </div>
  )
}

export default DashboardPage
