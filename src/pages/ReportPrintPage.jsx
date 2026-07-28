import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getAnamnesis } from '../services/anamnesisService'
import { getEvolutionAmendments } from '../services/patientService'
import RichContentRenderer from '../components/patients/RichContentRenderer'

const anamnesisPrintFields = [
  ['interviewDate', 'Data da entrevista'], ['informant', 'Informante'],
  ['informantRelationship', 'Relação com o paciente'], ['referralSource', 'Origem do encaminhamento'],
  ['complaint', 'Queixa principal / motivo da consulta'], ['familyGoals', 'Expectativas, prioridades e objetivos'],
  ['pregnancyBirthHistory', 'Gestação, nascimento e período neonatal'], ['developmentalHistory', 'Desenvolvimento global'],
  ['healthHistory', 'Histórico de saúde e diagnósticos'], ['medicationsAllergies', 'Medicamentos e alergias'],
  ['familyHistory', 'Antecedentes familiares'], ['hearingHistory', 'Histórico auditivo e otorrinolaringológico'],
  ['speechDevelopment', 'Desenvolvimento de fala e linguagem'], ['languagesCommunication', 'Idiomas e formas de comunicação'],
  ['educationOccupation', 'Contexto escolar ou profissional'], ['feedingSwallowing', 'Alimentação e deglutição'],
  ['oralMotorHabits', 'Motricidade orofacial e hábitos orais'], ['breathingSleep', 'Respiração e sono'],
  ['voiceHistory', 'Voz e demanda vocal'], ['behavior', 'Comportamento e interação social'],
  ['functionalImpact', 'Impacto funcional e participação'], ['previousCare', 'Avaliações, terapias e exames anteriores'],
  ['warningSigns', 'Sinais de alerta e intercorrências'], ['clinicalNotes', 'Observações clínicas, condutas e encaminhamentos'],
]
import toast from 'react-hot-toast'

function ObjectiveProgressPrint({ progress = [] }) {
  if (!progress.length) return null

  return (
    <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Objetivos trabalhados</p>
      <div className="mt-2 space-y-2">
        {progress.map((item) => (
          <div key={item.objectiveId || item.description}>
            <p className="text-xs font-semibold text-neutral-800">{item.description} — {item.status}</p>
            {item.performance && <p className="whitespace-pre-wrap text-xs text-neutral-600">{item.performance}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function VoidedNotice({ evolution }) {
  return (
    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-red-700">
      Evolução anulada em {evolution.voidedAt?.toDate ? evolution.voidedAt.toDate().toLocaleDateString('pt-BR') : '—'} — motivo: {evolution.voidReason}
    </p>
  )
}

function AmendmentsPrint({ amendments = [] }) {
  if (!amendments.length) return null
  return (
    <div className="mt-3 rounded border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Retificações</p>
      <div className="mt-2 space-y-2">
        {amendments.map((amendment) => (
          <div key={amendment.id}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              {amendment.createdAt?.toDate ? amendment.createdAt.toDate().toLocaleString('pt-BR') : 'Data não disponível'}
            </p>
            <RichContentRenderer content={amendment.content} plainText={amendment.plainText} className="text-xs text-neutral-700" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedEvolutionId = searchParams.get('evolucao')
  const selectedEvolutionIdsParam = searchParams.get('evolucoes') || selectedEvolutionId || ''
  const selectedEvolutionIds = useMemo(
    () => selectedEvolutionIdsParam.split(',').filter(Boolean),
    [selectedEvolutionIdsParam],
  )
  const dateFrom = searchParams.get('dataInicial') || ''
  const dateTo = searchParams.get('dataFinal') || ''
  const progressAnalysisId = searchParams.get('analise') || ''
  const evolutionDraftId = searchParams.get('rascunho') || ''
  const isStandaloneClinicalDocument = !!progressAnalysisId || !!evolutionDraftId
  const isFilteredReport = selectedEvolutionIds.length > 0 || !!dateFrom || !!dateTo
  
  const [patient, setPatient] = useState(null)
  const [anamnesis, setAnamnesis] = useState(null)
  const [evolutions, setEvolutions] = useState([])
  const [progressAnalysis, setProgressAnalysis] = useState(null)
  const [evolutionDraft, setEvolutionDraft] = useState(null)
  const [therapeuticPlan, setTherapeuticPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      try {
        setLoading(true)
        
        // 1. Buscar Paciente
        const patientDoc = await getDoc(doc(db, 'patients', id))
        if (!patientDoc.exists()) {
          toast.error('Paciente não encontrado.')
          navigate('/pacientes')
          return
        }
        setPatient({ id: patientDoc.id, ...patientDoc.data() })

        const planSnapshot = await getDoc(doc(db, 'patients', id, 'therapeuticPlan', 'current'))
        setTherapeuticPlan(planSnapshot.exists() ? { id: planSnapshot.id, ...planSnapshot.data() } : null)

        if (progressAnalysisId) {
          const analysisSnapshot = await getDoc(doc(db, 'patients', id, 'progressAnalyses', progressAnalysisId))
          if (!analysisSnapshot.exists()) {
            toast.error('Parecer não encontrado.')
            setProgressAnalysis(null)
          } else {
            setProgressAnalysis({ id: analysisSnapshot.id, ...analysisSnapshot.data() })
          }
          return
        }

        if (evolutionDraftId) {
          const draftSnapshot = await getDoc(doc(db, 'patients', id, 'evolutionDrafts', evolutionDraftId))
          if (!draftSnapshot.exists()) {
            toast.error('Rascunho de evolução não encontrado.')
            setEvolutionDraft(null)
          } else {
            setEvolutionDraft({ id: draftSnapshot.id, ...draftSnapshot.data() })
          }
          return
        }

        // 2. Buscar Anamnese
        const anamnesisData = await getAnamnesis(id)
        if (anamnesisData) {
          setAnamnesis(anamnesisData)
        }

        // 3. Buscar Evoluções Ordenadas por Data descrescente
        const evolutionsQuery = query(
          collection(db, 'patients', id, 'evolutions'),
          orderBy('date', 'desc')
        )
        const evolutionsSnap = await getDocs(evolutionsQuery)
        const evolutionsList = evolutionsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const selectedIds = new Set(selectedEvolutionIds)
        const filteredEvolutions = evolutionsList.filter((evolution) => {
          if (selectedIds.size > 0) return selectedIds.has(evolution.id)
          if (dateFrom && evolution.date < dateFrom) return false
          if (dateTo && evolution.date > dateTo) return false
          return true
        })
        const evolutionsWithAmendments = await Promise.all(filteredEvolutions.map(async (evolution) => ({
          ...evolution,
          amendments: await getEvolutionAmendments(id, evolution.id),
        })))
        setEvolutions(evolutionsWithAmendments)

      } catch (error) {
        console.error(error)
        toast.error('Erro ao carregar dados do prontuário.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id, navigate, selectedEvolutionIds, dateFrom, dateTo, progressAnalysisId, evolutionDraftId])

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-plum-200 border-t-plum-600" />
          <p className="text-sm font-medium text-noble-500">Gerando relatório clínico...</p>
        </div>
      </div>
    )
  }

  if (!patient) return null

  // Calcular data de nascimento formatada e idade aproximada
  let formattedBirth = ''
  let ageStr = ''
  if (patient.birthDate) {
    const [y, m, d] = patient.birthDate.split('-')
    formattedBirth = `${d}/${m}/${y}`
    
    // Idade aproximada
    const birth = new Date(Number(y), Number(m) - 1, Number(d))
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    ageStr = `${age} anos`
  }

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8 print:bg-white print:p-0">
      {/* Barra de Ações Superior (Invisível na impressão) */}
      <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between rounded-xl bg-white p-4 shadow-md print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-lg border border-noble-300 px-4 py-2 text-sm font-semibold text-noble-700 hover:bg-noble-50 transition"
          >
            Fechar Aba
          </button>
          <button
            type="button"
            onClick={() => navigate('/pacientes')}
            className="rounded-lg border border-noble-300 px-4 py-2 text-sm font-semibold text-noble-700 hover:bg-noble-50 transition"
          >
            Ir para Pacientes
          </button>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
        >
          Imprimir / Salvar PDF 🖨️
        </button>
      </div>

      {/* Folha A4 Simulada */}
      <article className="mx-auto max-w-3xl bg-white p-10 shadow-lg print:shadow-none print:p-0 font-serif text-neutral-900 leading-relaxed">
        {/* Cabeçalho Timbrado */}
        <div className="border-b-2 border-neutral-300 pb-5 text-center">
          <h1 className="text-2xl font-bold uppercase tracking-wider text-neutral-800">FonoFlow</h1>
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mt-1">Gestão de Atendimento Fonoaudiológico Domiciliar</p>
          <h2 className="text-lg font-bold text-neutral-700 mt-4 uppercase">
            {progressAnalysisId
              ? 'Parecer de Progresso Clínico'
              : evolutionDraftId
              ? 'Evolução Clínica'
              : isFilteredReport
              ? selectedEvolutionIds.length === 1 ? 'Prontuário de Atendimento' : 'Relatório de Evoluções Clínicas'
              : 'Relatório e Prontuário Clínico'}
          </h2>
        </div>

        {/* Dados Pessoais do Paciente */}
        <section className="mt-8">
          <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">Dados do Paciente</h3>
          <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
            <div>
              <p><strong>Nome:</strong> {patient.name}</p>
              <p><strong>Nascimento:</strong> {formattedBirth} {ageStr && `(${ageStr})`}</p>
            </div>
            <div>
              <p><strong>Responsável:</strong> {patient.guardian}</p>
              <p><strong>Telefone:</strong> {patient.phone}</p>
            </div>
            <div className="col-span-2 border-t border-neutral-200 pt-3">
              <p><strong>Diagnóstico:</strong> {patient.diagnosis || 'Não informado'}</p>
            </div>
          </div>
        </section>

        {/* Avaliação e Anamnese */}
        {progressAnalysisId && progressAnalysis && (
          <section className="mt-8">
            <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">Parecer Profissional</h3>
            <p className="mt-4 whitespace-pre-wrap text-justify text-sm leading-7 text-neutral-800">{progressAnalysis.text}</p>
            <p className="mt-6 text-xs italic text-neutral-500">Conteúdo gerado com apoio de IA e revisado pelo profissional responsável.</p>
          </section>
        )}

        {evolutionDraftId && evolutionDraft && (
          <section className="mt-8">
            <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">Registro de Evolução Clínica</h3>
            <p className="mt-3 text-sm font-bold text-neutral-800">
              Sessão de {evolutionDraft.date?.split('-').reverse().join('/')} <span className="text-xs font-normal text-neutral-500">({evolutionDraft.duration} minutos)</span>
            </p>
            <RichContentRenderer content={evolutionDraft.richContent} plainText={evolutionDraft.notes} className="mt-4 text-justify text-sm leading-7 text-neutral-800" />
            <p className="mt-6 text-xs italic text-neutral-500">Documento revisado pelo profissional responsável antes da emissão.</p>
          </section>
        )}

        {!isStandaloneClinicalDocument && !isFilteredReport && anamnesis && (
          <section className="mt-8">
            <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">Anamnese e Avaliação Inicial</h3>
            <div className="mt-3 space-y-4 text-sm text-justify">
              {anamnesisPrintFields.map(([key, label]) => anamnesis[key] && (
                <div key={key} className="page-break-inside-avoid">
                  <p className="font-semibold text-neutral-850">{label}:</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-neutral-700">{anamnesis[key]}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isStandaloneClinicalDocument && !isFilteredReport && therapeuticPlan && (
          <section className="mt-8 page-break-inside-avoid">
            <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">Plano Terapêutico</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <p><strong>Status:</strong> {therapeuticPlan.status || 'Não informado'}</p>
              <p><strong>Frequência:</strong> {therapeuticPlan.frequency || 'Não informada'}</p>
              <p><strong>Início:</strong> {therapeuticPlan.startDate?.split('-').reverse().join('/') || 'Não informado'}</p>
              <p><strong>Reavaliação:</strong> {therapeuticPlan.reviewDate?.split('-').reverse().join('/') || 'Não informada'}</p>
            </div>
            {therapeuticPlan.generalObjective && (
              <div className="mt-4 text-sm"><p className="font-semibold">Objetivo geral:</p><p className="whitespace-pre-wrap text-neutral-700">{therapeuticPlan.generalObjective}</p></div>
            )}
            {therapeuticPlan.strategies && (
              <div className="mt-3 text-sm"><p className="font-semibold">Estratégias e condutas:</p><p className="whitespace-pre-wrap text-neutral-700">{therapeuticPlan.strategies}</p></div>
            )}
            {therapeuticPlan.objectives?.length > 0 && (
              <div className="mt-5 space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-600">Objetivos específicos</p>
                {therapeuticPlan.objectives.map((objective, index) => (
                  <div key={objective.id || index} className="border-l-2 border-neutral-300 pl-3 text-sm page-break-inside-avoid">
                    <p className="font-bold text-neutral-800">{index + 1}. {objective.description}</p>
                    <p className="text-xs text-neutral-600">Área: {objective.area || 'Não informada'} | Status: {objective.status || 'Não informado'}</p>
                    {objective.successCriterion && <p><strong>Critério de sucesso:</strong> {objective.successCriterion}</p>}
                    {(objective.initialResult || objective.target) && <p><strong>Linha de base:</strong> {objective.initialResult || '—'} | <strong>Meta:</strong> {objective.target || '—'}</p>}
                    {objective.deadline && <p><strong>Prazo:</strong> {objective.deadline.split('-').reverse().join('/')}</p>}
                    {objective.lastPerformance && <p className="mt-1 whitespace-pre-wrap"><strong>Último desempenho:</strong> {objective.lastPerformance}</p>}
                  </div>
                ))}
              </div>
            )}
            {therapeuticPlan.notes && <p className="mt-4 whitespace-pre-wrap text-sm"><strong>Observações:</strong> {therapeuticPlan.notes}</p>}
          </section>
        )}

        {/* Histórico de Evoluções Clínicas */}
        {!isStandaloneClinicalDocument && <section className="mt-8 page-break-before">
          <h3 className="border-b border-neutral-300 pb-1 text-sm font-bold uppercase text-neutral-500">
            {isFilteredReport ? 'Evoluções Clínicas Selecionadas' : 'Histórico de Evoluções Clínicas'}
          </h3>
          <div className="mt-4 space-y-6 text-sm">
            {evolutions.length === 0 ? (
              <p className="text-neutral-500 italic">
                {isFilteredReport
                  ? 'Nenhum atendimento foi encontrado para a seleção informada.'
                  : 'Nenhum registro de evolução encontrado para este paciente.'}
              </p>
            ) : (
              evolutions.map((evol) => {
                if (!evol.date || typeof evol.date !== 'string') {
                  return (
                    <div key={evol.id} className="border-l-2 border-neutral-300 pl-4 py-0.5 page-break-inside-avoid">
                      <p className="font-bold text-neutral-800">
                        Sessão com data não registrada <span className="text-xs font-normal text-neutral-500">({evol.duration} minutos)</span>
                      </p>
                      {evol.voided && <VoidedNotice evolution={evol} />}
                      <RichContentRenderer content={evol.richContent} plainText={evol.notes} className="text-neutral-700 mt-1 text-justify" />
                      <ObjectiveProgressPrint progress={evol.objectiveProgress} />
                      <AmendmentsPrint amendments={evol.amendments} />
                    </div>
                  )
                }

                const [year, month, day] = evol.date.split('-')
                const formattedDate = `${day}/${month}/${year}`

                return (
                  <div key={evol.id} className="border-l-2 border-neutral-300 pl-4 py-0.5 page-break-inside-avoid">
                    <p className="font-bold text-neutral-800">
                      Sessão do dia {formattedDate} <span className="text-xs font-normal text-neutral-500">({evol.duration} minutos)</span>
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-450">
                      Origem: {evol.scheduleId ? 'Agenda' : 'Registro manual'}
                      {evol.revisionCount > 0 ? ` • Retificado ${evol.revisionCount}x (legado)` : ''}
                    </p>
                    {evol.voided && <VoidedNotice evolution={evol} />}
                    <RichContentRenderer content={evol.richContent} plainText={evol.notes} className="text-neutral-700 mt-1 text-justify" />
                    <ObjectiveProgressPrint progress={evol.objectiveProgress} />
                    <AmendmentsPrint amendments={evol.amendments} />
                  </div>
                )
              })
            )}
          </div>
        </section>}

        {/* Rodapé do Relatório */}
        <footer className="mt-16 border-t border-neutral-200 pt-8 text-center text-xs text-neutral-450 print:mt-24">
          <div className="mx-auto w-64 border-t border-neutral-400 mt-12 mb-2"></div>
          <p className="font-semibold uppercase tracking-wider text-neutral-700">{patient.professionalName || 'Profissional responsável não informado'}</p>
          <p className="mt-1 font-semibold text-neutral-600">{patient.crfa || 'CRFa não informado'}</p>
          <p className="text-neutral-450 mt-1">Carimbo e Assinatura</p>
          <p className="text-[10px] text-neutral-400 mt-12">Relatório gerado automaticamente em {new Date().toLocaleDateString('pt-BR')} via FonoFlow.</p>
        </footer>
      </article>
    </div>
  )
}

export default ReportPrintPage
