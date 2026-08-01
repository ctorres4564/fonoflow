const STATUS = {
  draft: ['Rascunho', 'bg-noble-100 text-noble-700 dark:bg-noble-800 dark:text-noble-200'],
  pending_upload: ['Aguardando envio', 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'],
  uploaded_to_quarantine: ['Em quarentena', 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300'],
  scanning: ['Em análise de segurança', 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'],
  available: ['Disponível', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'],
  blocked: ['Bloqueado', 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'],
  scan_failed: ['Falha na verificação', 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'],
  archived: ['Arquivado', 'bg-noble-200 text-noble-700 dark:bg-noble-800 dark:text-noble-300'],
}

export default function ClinicalAttachmentStatusBadge({ status }) {
  const [label, colors] = STATUS[status] || ['Estado indisponível', STATUS.blocked[1]]
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors}`}>{label}</span>
}
