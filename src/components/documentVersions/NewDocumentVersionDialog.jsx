import { useState } from 'react'
import DocumentVersionUpload from './DocumentVersionUpload.jsx'

export default function NewDocumentVersionDialog({ open, onClose, onSubmit, uploading, progress }) {
  const [file, setFile] = useState(null)
  const [reason, setReason] = useState('')
  const [justification, setJustification] = useState('')
  const [error, setError] = useState('')
  if (!open) return null
  const submit = async (event) => {
    event.preventDefault()
    if (!file || reason.trim().length < 3) return setError('Selecione um arquivo e informe o motivo da alteração.')
    setError('')
    await onSubmit({ file, changeReason: reason, duplicateJustification: justification || null })
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="new-version-title"><form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 dark:bg-noble-900"><div className="flex justify-between"><h4 id="new-version-title" className="text-lg font-bold">Nova versão</h4><button type="button" onClick={onClose} aria-label="Fechar">×</button></div><label className="block text-sm font-medium">Motivo da alteração<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900" /></label><label className="block text-sm font-medium">Justificativa para duplicidade (opcional)<textarea value={justification} onChange={(event) => setJustification(event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900" /></label><DocumentVersionUpload file={file} onFile={setFile} disabled={uploading} progress={progress} />{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2">Cancelar</button><button disabled={uploading} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">{uploading ? 'Processando…' : 'Enviar nova versão'}</button></div></form></div>
}
