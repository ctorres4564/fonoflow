import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/common/LoadingSpinner'
import EmptyState from '../components/common/EmptyState'
import { getAuditEvents } from '../services/auditService'

const labels = {
  'patient.created': 'Paciente cadastrado', 'patient.updated': 'Paciente atualizado',
  'patient.deleted': 'Paciente excluído', 'record.viewed': 'Prontuário consultado',
  'record.exported': 'Prontuário exportado', 'evolution.created': 'Evolução registrada',
  'evolution.revised': 'Evolução retificada', 'evolution.deleted': 'Evolução excluída',
  'anamnesis.updated': 'Anamnese atualizada', 'document.uploaded': 'Documento enviado',
  'document.deleted': 'Documento excluído',
}

export default function AuditPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAuditEvents().then(setEvents).catch((error) => toast.error(error.message)).finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-plum-600">Segurança e LGPD</p>
        <h2 className="text-3xl font-bold text-noble-800">Trilha de auditoria</h2>
        <p className="mt-2 text-sm text-noble-500">Histórico imutável das ações realizadas nos prontuários.</p>
      </div>
      {!events.length ? <EmptyState title="Nenhum evento registrado" description="As próximas ações clínicas aparecerão aqui." /> : (
        <div className="overflow-hidden rounded-2xl border border-noble-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-noble-50 text-noble-600"><tr><th className="px-5 py-3">Data e hora</th><th className="px-5 py-3">Ação</th><th className="px-5 py-3">Paciente</th><th className="px-5 py-3">Campos afetados</th></tr></thead>
              <tbody className="divide-y divide-noble-100">
                {events.map((event) => <tr key={event.id}>
                  <td className="whitespace-nowrap px-5 py-4 text-noble-600">{event.occurredAt ? new Date(event.occurredAt).toLocaleString('pt-BR') : 'Processando'}</td>
                  <td className="px-5 py-4 font-medium text-noble-800">{labels[event.action] || event.action}</td>
                  <td className="px-5 py-4 font-mono text-xs text-noble-500">{event.patientId}</td>
                  <td className="px-5 py-4 text-noble-500">{event.changedFields?.join(', ') || '—'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
