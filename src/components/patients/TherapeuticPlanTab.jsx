import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import InputField from '../common/InputField'
import { objectiveAreas, objectiveStatuses, saveTherapeuticPlan } from '../../services/therapeuticPlanService'

const emptyPlan = {
  generalObjective: '',
  strategies: '',
  frequency: '',
  startDate: '',
  reviewDate: '',
  notes: '',
  status: 'Ativo',
  objectives: [],
}

function newObjective() {
  return {
    id: crypto.randomUUID(),
    description: '',
    area: 'Linguagem',
    successCriterion: '',
    initialResult: '',
    target: '',
    deadline: '',
    status: 'Não iniciado',
  }
}

function TherapeuticPlanTab({ patient, plan, loading }) {
  const [values, setValues] = useState(emptyPlan)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues(plan ? { ...emptyPlan, ...plan, objectives: plan.objectives || [] } : emptyPlan)
  }, [plan])

  const updateObjective = (id, field, value) => {
    setValues((current) => ({
      ...current,
      objectives: current.objectives.map((objective) => objective.id === id ? { ...objective, [field]: value } : objective),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!values.generalObjective.trim()) {
      toast.error('Informe o objetivo geral do plano.')
      return
    }
    if (values.objectives.some((objective) => !objective.description.trim())) {
      toast.error('Preencha a descrição de todos os objetivos específicos.')
      return
    }
    try {
      setSaving(true)
      await saveTherapeuticPlan(patient.id, {
        ...values,
        generalObjective: values.generalObjective.trim(),
        strategies: values.strategies.trim(),
        notes: values.notes.trim(),
      })
      toast.success('Plano terapêutico salvo com sucesso.')
    } catch (error) {
      console.error(error)
      toast.error('Erro ao salvar o plano terapêutico.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-plum-200 border-t-plum-600" /></div>

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-8">
      <div className="rounded-2xl border border-plum-200 bg-plum-50/40 p-5 dark:border-plum-800 dark:bg-noble-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-bold text-noble-800 dark:text-white">Plano Terapêutico</h4>
            <p className="text-xs text-noble-500 dark:text-noble-300">Defina o direcionamento clínico e a próxima reavaliação.</p>
          </div>
          <select value={values.status} onChange={(event) => setValues((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-noble-300 bg-white px-4 py-2 text-sm text-noble-800 dark:border-noble-700 dark:bg-noble-900 dark:text-white">
            <option>Ativo</option><option>Suspenso</option><option>Concluído</option><option>Substituído</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><InputField label="Objetivo geral" type="textarea" rows={3} value={values.generalObjective} onChange={(event) => setValues((current) => ({ ...current, generalObjective: event.target.value }))} required /></div>
          <InputField label="Data de início" type="date" value={values.startDate} onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))} />
          <InputField label="Data de reavaliação" type="date" value={values.reviewDate} onChange={(event) => setValues((current) => ({ ...current, reviewDate: event.target.value }))} />
          <InputField label="Frequência recomendada" value={values.frequency} onChange={(event) => setValues((current) => ({ ...current, frequency: event.target.value }))} placeholder="Ex.: 2 sessões por semana" />
          <div className="md:col-span-2"><InputField label="Condutas e estratégias" type="textarea" rows={4} value={values.strategies} onChange={(event) => setValues((current) => ({ ...current, strategies: event.target.value }))} /></div>
          <div className="md:col-span-2"><InputField label="Observações profissionais" type="textarea" rows={3} value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} /></div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div><h4 className="text-base font-bold text-noble-800 dark:text-white">Objetivos específicos</h4><p className="text-xs text-noble-500 dark:text-noble-400">Acompanhe metas mensuráveis ao longo das sessões.</p></div>
        <button type="button" onClick={() => setValues((current) => ({ ...current, objectives: [...current.objectives, newObjective()] }))} className="rounded-xl bg-plum-600 px-4 py-2 text-sm font-bold text-white hover:bg-plum-700">+ Adicionar objetivo</button>
      </div>

      {values.objectives.length === 0 ? <p className="rounded-xl border border-dashed border-noble-300 p-6 text-center text-sm text-noble-500 dark:border-noble-700">Nenhum objetivo específico cadastrado.</p> : values.objectives.map((objective, index) => (
        <div key={objective.id} className="rounded-2xl border border-noble-200 bg-white p-5 shadow-sm dark:border-noble-700 dark:bg-noble-800">
          <div className="mb-4 flex items-center justify-between"><h5 className="font-bold text-noble-800 dark:text-white">Objetivo {index + 1}</h5><button type="button" onClick={() => setValues((current) => ({ ...current, objectives: current.objectives.filter((item) => item.id !== objective.id) }))} className="text-xs font-bold text-red-500 hover:underline">Remover</button></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><InputField label="Descrição" type="textarea" rows={2} value={objective.description} onChange={(event) => updateObjective(objective.id, 'description', event.target.value)} required /></div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-noble-700 dark:text-noble-300">Área<select value={objective.area} onChange={(event) => updateObjective(objective.id, 'area', event.target.value)} className="rounded-xl border border-noble-300 bg-white px-4 py-2.5 text-sm dark:border-noble-700 dark:bg-noble-900 dark:text-white">{objectiveAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-noble-700 dark:text-noble-300">Status<select value={objective.status} onChange={(event) => updateObjective(objective.id, 'status', event.target.value)} className="rounded-xl border border-noble-300 bg-white px-4 py-2.5 text-sm dark:border-noble-700 dark:bg-noble-900 dark:text-white">{objectiveStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <InputField label="Resultado inicial" value={objective.initialResult} onChange={(event) => updateObjective(objective.id, 'initialResult', event.target.value)} />
            <InputField label="Meta esperada" value={objective.target} onChange={(event) => updateObjective(objective.id, 'target', event.target.value)} />
            <InputField label="Critério de sucesso" value={objective.successCriterion} onChange={(event) => updateObjective(objective.id, 'successCriterion', event.target.value)} />
            <InputField label="Prazo" type="date" value={objective.deadline} onChange={(event) => updateObjective(objective.id, 'deadline', event.target.value)} />
          </div>
        </div>
      ))}

      <button type="submit" disabled={saving} className="w-full rounded-xl bg-green-600 px-5 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">{saving ? 'Salvando plano...' : 'Salvar plano terapêutico'}</button>
    </form>
  )
}

export default TherapeuticPlanTab
