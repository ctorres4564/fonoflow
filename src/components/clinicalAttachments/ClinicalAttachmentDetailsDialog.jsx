import { useEffect, useState } from 'react'
import ClinicalAttachmentCategoryBadge from './ClinicalAttachmentCategoryBadge.jsx'
import ClinicalAttachmentStatusBadge from './ClinicalAttachmentStatusBadge.jsx'
import DocumentRetentionBadge from '../documentVersions/DocumentRetentionBadge.jsx'
import DocumentVersionHistory from '../documentVersions/DocumentVersionHistory.jsx'
import LegalHoldBanner from '../documentVersions/LegalHoldBanner.jsx'

export default function ClinicalAttachmentDetailsDialog({ attachment, onClose, onArchive, archiving }) {
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setReason(''); setConfirming(false); setError('') }, [attachment])
  if (!attachment) return null
  const archive = async () => {
    if (reason.trim().length < 5) return setError('Informe um motivo com pelo menos 5 caracteres.')
    try { await onArchive(attachment, reason); onClose() }
    catch (archiveError) { setError(archiveError.message) }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="attachment-details-title">
    <div className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-noble-900">
      <div className="flex justify-between"><h3 id="attachment-details-title" className="text-xl font-bold">{attachment.title}</h3><button type="button" onClick={onClose} aria-label="Fechar">×</button></div>
      <div className="flex flex-wrap gap-2"><ClinicalAttachmentCategoryBadge category={attachment.category} /><ClinicalAttachmentStatusBadge status={attachment.status} /><DocumentRetentionBadge status={attachment.retentionStatus} /></div>
      <LegalHoldBanner active={attachment.legalHold} reason={attachment.legalHoldReason} />
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-noble-500">Arquivo</dt><dd className="break-words">{attachment.fileName}</dd></div><div><dt className="text-noble-500">Data</dt><dd>{attachment.documentDate || 'Não informada'}</dd></div><div className="col-span-2"><dt className="text-noble-500">Descrição</dt><dd>{attachment.description || 'Sem descrição'}</dd></div></dl>
      {!attachment.legacy ? <DocumentVersionHistory patientId={attachment.patientId} documentId={attachment.id} category={attachment.category} legalHold={attachment.legalHold} /> : null}
      {error ? <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {confirming ? <div className="space-y-3"><label className="block text-sm font-medium">Motivo do arquivamento<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900" /></label><p className="text-xs text-noble-500">O arquivo não será apagado e deixará de estar disponível para download.</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setConfirming(false)} className="rounded-lg border px-3 py-2">Voltar</button><button type="button" disabled={archiving} onClick={archive} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white">Confirmar arquivamento</button></div></div> : <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2">Fechar</button>{attachment.status !== 'archived' && !attachment.legacy && !attachment.legalHold ? <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700">Arquivar</button> : null}</div>}
    </div>
  </div>
}
