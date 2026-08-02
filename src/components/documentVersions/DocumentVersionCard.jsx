import DocumentIntegrityBadge from './DocumentIntegrityBadge.jsx'
import DocumentVersionBadge from './DocumentVersionBadge.jsx'

export default function DocumentVersionCard({ version, currentVersionId, onDetails, onRestore }) {
  const current = version.id === currentVersionId || version.status === 'current'
  return <li className="rounded-xl border border-noble-200 p-3 dark:border-noble-700">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><strong>Versão {version.versionNumber}</strong><p className="text-xs text-noble-500">{version.changeReason}</p></div>
      <div className="flex flex-wrap gap-2"><DocumentVersionBadge status={current ? 'current' : version.status} />
        <DocumentIntegrityBadge status={version.integrityStatus} /></div>
    </div>
    <div className="mt-3 flex justify-end gap-2">
      <button type="button" onClick={() => onDetails(version)} className="rounded-lg border px-3 py-1.5 text-sm">Detalhes</button>
      {!current && !version.legacy && version.integrityStatus === 'valid' ?
        <button type="button" onClick={() => onRestore(version)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700">Restaurar</button> : null}
    </div>
  </li>
}
