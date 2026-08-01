import ClinicalAttachmentCard from './ClinicalAttachmentCard.jsx'
import ClinicalAttachmentEmptyState from './ClinicalAttachmentEmptyState.jsx'

export default function ClinicalAttachmentList({ attachments, loading, error, showArchived, onDetails, onDownload, downloadingId }) {
  if (loading) return <div role="status" className="py-10 text-center text-sm text-noble-500">Carregando anexos…</div>
  if (error) return <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  if (!attachments.length) return <ClinicalAttachmentEmptyState archived={showArchived}/>
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{attachments.map((attachment)=><ClinicalAttachmentCard key={attachment.id} attachment={attachment} onDetails={onDetails} onDownload={onDownload} downloading={downloadingId===attachment.id}/>)}</div>
}
