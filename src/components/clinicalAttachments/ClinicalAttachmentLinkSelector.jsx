export default function ClinicalAttachmentLinkSelector({ value, onChange, options }) {
  const set = (field, next) => onChange({ ...value, [field]: next || null, ...(field === 'appointmentId' && !next ? { homeCareVisitId: null } : {}) })
  const selectedAppointment = options.appointments?.find((item) => item.id === value.appointmentId)
  return <fieldset className="space-y-3 rounded-xl border border-noble-200 p-4 dark:border-noble-700"><legend className="px-1 text-sm font-bold">Vínculos clínicos opcionais</legend>
    <label className="block text-sm">Evolução<select value={value.evolutionId||''} onChange={(event)=>set('evolutionId',event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900"><option value="">Somente paciente</option>{options.evolutions?.map((item)=><option key={item.id} value={item.id}>{item.date||'Sem data'} · {item.status}</option>)}</select></label>
    <label className="block text-sm">Agendamento<select value={value.appointmentId||''} onChange={(event)=>set('appointmentId',event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900"><option value="">Nenhum</option>{options.appointments?.map((item)=><option key={item.id} value={item.id}>{item.date||'Sem data'} {item.startTime||''} · {item.serviceType}</option>)}</select></label>
    {selectedAppointment?.homeCareAvailable&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.homeCareVisitId==='current'} onChange={(event)=>set('homeCareVisitId',event.target.checked?'current':null)}/>Vincular também ao atendimento Home Care</label>}
  </fieldset>
}
