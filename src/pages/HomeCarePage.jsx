import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/useAuth'
import { getHomeCareNextActions } from '../domain/homeCare/homeCareVisitTransitions'
import { ensureHomeCareVisit, recordHomeCareOccurrence, subscribeHomeCareVisit, transitionHomeCareVisit } from '../services/homeCareService'
import { getHomeCareNavigationUrls } from '../utils/homeCareNavigation'
import EvolutionModal from '../components/patients/EvolutionModal'

const statusLabels = { planned:'Planejada',in_transit:'Em deslocamento',arrived:'Chegada registrada',in_service:'Em atendimento',completed:'Concluída',patient_absent:'Paciente ausente',cancelled:'Cancelada' }
const alertLabels = { allergies:'Alergias',aspirationRisk:'Risco de aspiração',tracheostomy:'Traqueostomia',gastrostomy:'Gastrostomia',oxygenUse:'Uso de oxigênio',epilepsy:'Epilepsia',mobilityRestrictions:'Restrição de mobilidade' }
const operationId = (appointmentId, status) => `home-care-${appointmentId}-${status}-${crypto.randomUUID()}`

function VisitCard({ appointment, patient, actorId, onEvolution }) {
  const [visit, setVisit] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let unsubscribe
    ensureHomeCareVisit({ appointment, patient, actorId }).then(() => { unsubscribe = subscribeHomeCareVisit(appointment.id, setVisit, console.error) }).catch((error) => toast.error(error.message))
    return () => unsubscribe?.()
  }, [appointment, patient, actorId])
  if (!visit) return <article className="rounded-2xl border p-5">Carregando visita de {patient.name}...</article>
  const address = visit.location.addressSnapshot
  const urls = getHomeCareNavigationUrls(address)
  const alerts = Object.entries(alertLabels).filter(([key]) => Array.isArray(patient.clinicalAlerts?.[key]) ? patient.clinicalAlerts[key].length : patient.clinicalAlerts?.[key])
  const act = async (targetStatus) => {
    const details = {}
    if (targetStatus === 'in_transit') details.transportationMode = window.prompt('Meio de transporte: car, motorcycle, public_transport, walking ou other', 'car') || 'car'
    if (targetStatus === 'in_service') { details.caregiverPresent = window.confirm('Há cuidador presente?'); if (details.caregiverPresent) details.caregiverName = window.prompt('Nome do cuidador (opcional):') || null }
    if (targetStatus === 'completed') { const distance = window.prompt('Quilometragem real (opcional):'); details.actualDistanceKm = distance === '' || distance == null ? null : Number(distance) }
    if (['patient_absent','cancelled'].includes(targetStatus)) { details.reason = window.prompt('Observação/justificativa:') || (targetStatus === 'patient_absent' ? 'Paciente ausente.' : 'Visita cancelada.') }
    setBusy(true)
    try { await transitionHomeCareVisit({ appointment, patient, actorId, targetStatus, operationId: operationId(appointment.id,targetStatus), details }); toast.success('Visita atualizada.') } catch (error) { toast.error(error.message) } finally { setBusy(false) }
  }
  const occurrence = async () => {
    const type = window.prompt('Tipo: access_problem, clinical_incident, safety_risk, caregiver_absent, service_interrupted ou other', 'access_problem')
    if (!type) return
    const description = window.prompt('Descrição obrigatória:') || ''
    try { await recordHomeCareOccurrence({ appointmentId:appointment.id,patientId:patient.id,actorId,type,description }); toast.success('Ocorrência registrada.') } catch (error) { toast.error(error.message) }
  }
  return <article className="rounded-2xl border border-noble-200 bg-white p-5 shadow-card dark:border-noble-800 dark:bg-noble-900">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-noble-500">{appointment.startTime}–{appointment.endTime}</p><h3 className="text-lg font-bold text-noble-800 dark:text-white">{patient.name}</h3></div><span className="rounded-full bg-plum-100 px-3 py-1 text-xs font-semibold text-plum-700">{statusLabels[visit.status]}</span></div>
    <p className="mt-3 text-sm text-noble-700 dark:text-noble-200">{[address.street,address.number,address.district,address.city,address.state].filter(Boolean).join(', ') || 'Endereço incompleto'}</p>
    {visit.location.accessInstructionsSnapshot && <p className="mt-1 text-xs text-noble-500">Acesso: {visit.location.accessInstructionsSnapshot}</p>}
    {alerts.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Alertas clínicos essenciais">{alerts.map(([,label])=><span key={label} className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">⚠ {label}</span>)}</div>}
    <div className="mt-4 flex flex-wrap gap-2">
      {urls && <><a className="rounded-lg border px-3 py-2 text-xs font-semibold" href={urls.googleMaps} target="_blank" rel="noreferrer">Google Maps</a><a className="rounded-lg border px-3 py-2 text-xs font-semibold" href={urls.waze} target="_blank" rel="noreferrer">Waze</a></>}
      {getHomeCareNextActions(visit.status).map(({targetStatus,label})=><button disabled={busy} key={targetStatus} onClick={()=>act(targetStatus)} className="rounded-lg bg-plum-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{label}</button>)}
      {!['completed','cancelled'].includes(visit.status) && <button onClick={occurrence} className="rounded-lg border border-amber-500 px-3 py-2 text-xs font-semibold text-amber-700">Registrar ocorrência</button>}
      {['in_service','completed'].includes(visit.status) && <button onClick={()=>onEvolution(appointment)} className="rounded-lg border border-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-700">Abrir evolução</button>}
    </div>
  </article>
}

export default function HomeCarePage() {
  const { user } = useAuth(); const { patients=[], schedules=[] } = useOutletContext()
  const [date,setDate] = useState(new Date().toISOString().slice(0,10))
  const [evolutionContext,setEvolutionContext] = useState(null)
  const visits = useMemo(()=>schedules.filter((item)=>item.serviceType==='home_care'&&item.date===date).sort((a,b)=>a.startTime.localeCompare(b.startTime)),[schedules,date])
  const patientById = useMemo(()=>Object.fromEntries(patients.map((patient)=>[patient.id,patient])),[patients])
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-bold text-noble-800 dark:text-white">Agenda diária Home Care</h2><p className="text-sm text-noble-500">Fluxo operacional das visitas domiciliares vinculadas à agenda.</p></div><label className="text-sm font-semibold">Data<input aria-label="Data da agenda home care" className="ml-2 rounded-lg border px-3 py-2" type="date" value={date} onChange={(event)=>setDate(event.target.value)}/></label></header>
    {visits.length===0?<div className="rounded-2xl border border-dashed p-8 text-center text-noble-500">Nenhuma visita domiciliar para esta data.</div>:<div className="grid gap-4 lg:grid-cols-2">{visits.map((appointment)=>patientById[appointment.patientId]&&<VisitCard key={appointment.id} appointment={appointment} patient={patientById[appointment.patientId]} actorId={user.uid} onEvolution={()=>setEvolutionContext({appointment,patient:patientById[appointment.patientId]})}/>)}</div>}
    <EvolutionModal isOpen={!!evolutionContext} onClose={()=>setEvolutionContext(null)} patient={evolutionContext?.patient} linkedSchedule={evolutionContext?.appointment} onScheduleCompleted={()=>setEvolutionContext(null)}/>
  </div>
}
