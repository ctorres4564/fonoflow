export default function DocumentIntegrityBadge({ status }) {
  const valid = status === 'valid'
  const unavailable = status === 'unavailable'
  const style = valid ? 'bg-emerald-100 text-emerald-800' : unavailable
    ? 'bg-slate-100 text-slate-700' : 'bg-red-100 text-red-800'
  const label = valid ? 'Integridade válida' : unavailable ? 'Assinatura legada indisponível' : 'Integridade pendente ou inválida'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>
}
