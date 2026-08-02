const styles = {
  current: 'bg-emerald-100 text-emerald-800',
  superseded: 'bg-slate-100 text-slate-700',
  draft: 'bg-amber-100 text-amber-800',
  pending_upload: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-800',
  scan_failed: 'bg-red-100 text-red-800',
  compromised: 'bg-red-100 text-red-800',
}

export default function DocumentVersionBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || 'bg-indigo-100 text-indigo-800'}`}>
    {String(status || 'desconhecido').replaceAll('_', ' ')}
  </span>
}
