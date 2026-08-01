export default function ClinicalAttachmentDownloadButton({ attachment, onDownload, loading }) {
  if (!attachment.available || attachment.status === 'archived') return null
  return <button type="button" disabled={loading} onClick={() => onDownload(attachment)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50">{loading ? 'Preparando…' : 'Baixar'}</button>
}
