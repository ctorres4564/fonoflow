export default function ClinicalAttachmentEmptyState({ archived = false }) {
  return <div className="rounded-2xl border border-dashed border-noble-300 p-8 text-center dark:border-noble-700"><p className="font-semibold text-noble-700 dark:text-noble-200">{archived ? 'Nenhum anexo arquivado' : 'Nenhum anexo clínico'}</p><p className="mt-1 text-sm text-noble-500 dark:text-noble-400">{archived ? 'Os anexos arquivados aparecerão aqui.' : 'Adicione um documento usando o fluxo seguro.'}</p></div>
}
