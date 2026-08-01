import DocumentIntegrityBadge from './DocumentIntegrityBadge.jsx'
import DocumentVersionBadge from './DocumentVersionBadge.jsx'

export default function DocumentVersionDetailsDialog({ version, onClose, onVerify, verifying }) {
  if (!version) return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="version-details-title">
    <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 dark:bg-noble-900">
      <div className="flex justify-between"><h4 id="version-details-title" className="text-lg font-bold">Versão {version.versionNumber}</h4><button type="button" onClick={onClose} aria-label="Fechar">×</button></div>
      <div className="flex flex-wrap gap-2"><DocumentVersionBadge status={version.status} /><DocumentIntegrityBadge status={version.integrityStatus} /></div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-noble-500">Motivo</dt><dd>{version.changeReason}</dd></div><div><dt className="text-noble-500">SHA-256</dt><dd className="break-all font-mono text-xs">{version.fileMetadata?.sha256 || 'Indisponível'}</dd></div><div><dt className="text-noble-500">Varredura</dt><dd>{version.securityScan?.status || 'Legada'}</dd></div><div><dt className="text-noble-500">Duplicidade</dt><dd>{version.duplicate?.detected ? 'Detectada e registrada' : 'Não detectada'}</dd></div></dl>
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2">Fechar</button>{!version.legacy ? <button type="button" disabled={verifying} onClick={() => onVerify(version)} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">{verifying ? 'Verificando…' : 'Verificar integridade'}</button> : null}</div>
    </div>
  </div>
}
