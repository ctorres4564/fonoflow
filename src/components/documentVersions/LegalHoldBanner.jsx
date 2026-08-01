export default function LegalHoldBanner({ active, reason }) {
  if (!active) return null
  return <div role="status" className="rounded-xl border border-purple-300 bg-purple-50 p-3 text-sm text-purple-900">
    <strong>Legal hold ativo.</strong> Arquivamento e restauração estão bloqueados.
    {reason ? <span className="mt-1 block">Motivo: {reason}</span> : null}
  </div>
}
