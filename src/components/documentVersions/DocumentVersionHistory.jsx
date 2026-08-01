import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import DocumentVersionCard from './DocumentVersionCard.jsx'
import DocumentVersionDetailsDialog from './DocumentVersionDetailsDialog.jsx'
import DocumentVersionRestoreDialog from './DocumentVersionRestoreDialog.jsx'
import NewDocumentVersionDialog from './NewDocumentVersionDialog.jsx'

export default function DocumentVersionHistory({ patientId, documentId, category, onChanged }) {
  const [data, setData] = useState({ versions: [], currentVersionId: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  const [restore, setRestore] = useState(null)
  const [newVersion, setNewVersion] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { documentVersionService } = await import('../../services/documentVersionService.js')
      setData(await documentVersionService.listVersions(patientId, documentId))
    }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [patientId, documentId])
  useEffect(() => { void load() }, [load])
  const submitVersion = async ({ file, changeReason, duplicateJustification }) => {
    setBusy(true); setProgress(0)
    try {
      const { documentVersionService } = await import('../../services/documentVersionService.js')
      const result = await documentVersionService.createAndUploadVersion({ patientId, documentId,
        category, file, changeReason, duplicateJustification, onProgress: setProgress })
      toast.success(result.duplicate?.detected ? 'Nova versão ativa; duplicidade registrada.' : 'Nova versão ativada com integridade válida.')
      setNewVersion(false); await load(); if (onChanged) onChanged()
    } catch (submitError) { toast.error(submitError.message) }
    finally { setBusy(false); setProgress(0) }
  }
  const restoreVersion = async (version, reason) => {
    setBusy(true)
    try { const { documentVersionService } = await import('../../services/documentVersionService.js'); await documentVersionService.restoreVersion({ patientId, documentId, versionId: version.id, reason }); toast.success('Versão restaurada como nova versão corrente.'); setRestore(null); await load(); if (onChanged) onChanged() }
    catch (restoreError) { toast.error(restoreError.message) }
    finally { setBusy(false) }
  }
  const verify = async (version) => {
    setBusy(true)
    try { const { documentVersionService } = await import('../../services/documentVersionService.js'); const result = await documentVersionService.verifyIntegrity({ patientId, documentId, versionId: version.id }); if (result.valid) toast.success('Integridade confirmada.'); else toast.error('Divergência detectada; download bloqueado.'); await load() }
    catch (verifyError) { toast.error(verifyError.message) }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 border-t pt-4" aria-labelledby="version-history-title"><div className="flex flex-wrap items-center justify-between gap-2"><h4 id="version-history-title" className="font-bold">Histórico de versões</h4><button type="button" onClick={() => setNewVersion(true)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700">Nova versão</button></div>{loading ? <p className="text-sm text-noble-500">Carregando versões…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : data.versions.length === 0 ? <p className="text-sm text-noble-500">Nenhuma versão disponível.</p> : <ul className="max-h-72 space-y-2 overflow-y-auto">{data.versions.map((version) => <DocumentVersionCard key={version.id} version={version} currentVersionId={data.currentVersionId} onDetails={setDetails} onRestore={setRestore} />)}</ul>}<NewDocumentVersionDialog open={newVersion} onClose={() => setNewVersion(false)} onSubmit={submitVersion} uploading={busy} progress={progress} /><DocumentVersionDetailsDialog version={details} onClose={() => setDetails(null)} onVerify={verify} verifying={busy} /><DocumentVersionRestoreDialog key={restore?.id || 'closed'} version={restore} onClose={() => setRestore(null)} onRestore={restoreVersion} restoring={busy} /></section>
}
