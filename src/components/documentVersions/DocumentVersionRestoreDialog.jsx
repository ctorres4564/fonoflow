import { useState } from 'react'

export default function DocumentVersionRestoreDialog({ version, onClose, onRestore, restoring }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  if (!version) return null
  const submit = async (event) => {
    event.preventDefault()
    if (reason.trim().length < 5) return setError('Informe um motivo com pelo menos 5 caracteres.')
    setError('')
    await onRestore(version, reason)
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="restore-version-title">
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 dark:bg-noble-900"><h4 id="restore-version-title" className="text-lg font-bold">Restaurar versão {version.versionNumber}</h4><p className="text-sm text-noble-500">Uma nova versão corrente será criada. O histórico original não será alterado.</p><label className="block text-sm font-medium">Motivo<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900" /></label>{error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2">Cancelar</button><button disabled={restoring} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">Confirmar restauração</button></div></form>
  </div>
}
