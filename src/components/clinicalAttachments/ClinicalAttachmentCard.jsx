import ClinicalAttachmentCategoryBadge from './ClinicalAttachmentCategoryBadge.jsx'
import ClinicalAttachmentDownloadButton from './ClinicalAttachmentDownloadButton.jsx'
import ClinicalAttachmentStatusBadge from './ClinicalAttachmentStatusBadge.jsx'

const bytes = (value = 0) => value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 ** 2).toFixed(1)} MB`

export default function ClinicalAttachmentCard({ attachment, onDetails, onDownload, downloading }) {
  return <article className="rounded-2xl border border-noble-200 bg-white p-4 shadow-sm dark:border-noble-800 dark:bg-noble-900">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate font-bold text-noble-800 dark:text-white">{attachment.title}</h4><p className="mt-1 truncate text-sm text-noble-500 dark:text-noble-400">{attachment.fileName} · {bytes(attachment.size)}</p></div><ClinicalAttachmentStatusBadge status={attachment.status}/></div>
    <div className="mt-3 flex flex-wrap gap-2"><ClinicalAttachmentCategoryBadge category={attachment.category}/>{attachment.legacy&&<span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Legado somente leitura</span>}</div>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => onDetails(attachment)} className="rounded-lg border border-noble-300 px-3 py-2 text-sm font-semibold dark:border-noble-700">Detalhes</button><ClinicalAttachmentDownloadButton attachment={attachment} onDownload={onDownload} loading={downloading}/></div>
  </article>
}
