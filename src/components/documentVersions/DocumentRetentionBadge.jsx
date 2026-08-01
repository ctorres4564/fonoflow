export default function DocumentRetentionBadge({ status = 'not_applicable' }) {
  const style = status === 'legal_hold' ? 'bg-purple-100 text-purple-800'
    : status === 'expired' || status === 'review_due' ? 'bg-amber-100 text-amber-800'
      : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
    Retenção: {status.replaceAll('_', ' ')}
  </span>
}
