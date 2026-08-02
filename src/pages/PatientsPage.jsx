import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import toast from 'react-hot-toast'
import EmptyState from '../components/common/EmptyState'
import SkeletonTable from '../components/common/SkeletonTable'
import PatientFormModal from '../components/patients/PatientFormModal'
import PatientTable from '../components/patients/PatientTable'
import PatientStatusDialog from '../components/patients/PatientStatusDialog'
import EvolutionModal from '../components/patients/EvolutionModal'
import { useAuth } from '../contexts/useAuth'
import { createPatient, searchPatients, updatePatient } from '../services/patientService'
import { normalizePatientPayload } from '../utils/patient'
import { onlyDigits } from '../utils/validators'

function PatientsPage() {
  const { user, userProfile } = useAuth()
  const { patients = [], loadingPatients } = useOutletContext()
  const [search, setSearch] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [loadingForm, setLoadingForm] = useState(false)
  const [indexedResults, setIndexedResults] = useState(null)

  // Estados para o modal de evoluções
  const [isEvolutionOpen, setIsEvolutionOpen] = useState(false)
  const [evolutionPatient, setEvolutionPatient] = useState(null)

  // Estado para diálogo de alteração de status
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
  const [statusPatient, setStatusPatient] = useState(null)

  const filteredPatients = useMemo(() => {
    if (indexedResults) return indexedResults
    const term = search.toLowerCase().trim()
    const termDigits = onlyDigits(search)

    return patients.filter((patient) => {
      const byName = patient.name?.toLowerCase().includes(term)
      const byPhone = onlyDigits(patient.phone || '').includes(termDigits)
      return byName || (termDigits && byPhone)
    })
  }, [patients, search, indexedResults])

  useEffect(() => {
    const term = search.trim()
    if (term.length < 2 || !user?.uid) {
      setIndexedResults(null)
      return undefined
    }
    let active = true
    const timer = setTimeout(async () => {
      try {
        const containsOnlyPhoneCharacters = term.replace(/[\d\s()+-]/g, '') === ''
        const mode = containsOnlyPhoneCharacters ? 'phone' : 'name'
        const results = await searchPatients(user.uid, term, mode)
        const normalizedTerm = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const digits = onlyDigits(term)
        const compatibleLocalResults = patients.filter((patient) => (
          mode === 'phone'
            ? onlyDigits(patient.phone || '').includes(digits)
            : patient.name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(normalizedTerm)
        ))
        const merged = new Map([...results, ...compatibleLocalResults].map((patient) => [patient.id, patient]))
        if (active) setIndexedResults([...merged.values()])
      } catch (error) {
        // Mantém a busca local como fallback enquanto o índice é implantado.
        console.warn('Indexed patient search unavailable:', error?.code || error?.name)
        if (active) setIndexedResults(null)
      }
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [patients, search, user?.uid])

  const openCreateModal = () => {
    setSelectedPatient(null)
    setIsModalOpen(true)
  }

  const openEditModal = (patient) => {
    setSelectedPatient(patient)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedPatient(null)
  }

  const openEvolutionModal = (patient) => {
    setEvolutionPatient(patient)
    setIsEvolutionOpen(true)
  }

  const closeEvolutionModal = () => {
    setIsEvolutionOpen(false)
    setEvolutionPatient(null)
  }

  const handleSavePatient = async (values) => {
    try {
      setLoadingForm(true)
      const payload = normalizePatientPayload(values, user.uid)

      if (selectedPatient) {
        await updatePatient(selectedPatient.id, payload)
        toast.success('Paciente atualizado com sucesso!')
      } else {
        if (userProfile?.plan?.toLowerCase() !== 'premium' && patients.length >= 20) {
          toast.error('Limite do plano de demonstração atingido! Você pode cadastrar até 20 pacientes. Entre em contato para ativar o plano comercial ilimitado.', { duration: 6000 })
          setLoadingForm(false)
          return
        }
        await createPatient(payload)
        toast.success('Paciente cadastrado com sucesso!')
      }

      closeModal()
    } catch (error) {
      toast.error('Ocorreu um erro ao salvar o paciente.')
      console.error(error)
    } finally {
      setLoadingForm(false)
    }
  }

  const handleDeletePatient = (patient) => {
    setStatusPatient(patient)
    setIsStatusDialogOpen(true)
  }

  const handleStatusChanged = (result) => {
    // A lista será atualizada via subscribePatients (snapshot em tempo real).
    // Não há necessidade de mutação local — o observável já reflete a mudança.
    if (result?.replayed) {
      // Operações replay não alteram estado — apenas confirmam.
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-5 shadow-card md:flex-row md:items-center md:justify-between transition-colors duration-200">
        <div>
          <h2 className="text-2xl font-bold text-noble-800 dark:text-noble-100">Pacientes</h2>
          <p className="text-sm text-noble-500 dark:text-noble-400">Cadastro completo, controle de sessões e evolução clínica.</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-xl bg-plum-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-plum-700"
        >
          + Novo paciente
        </button>
      </div>

      <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-4 shadow-card transition-colors duration-200">
        <label className="text-xs uppercase tracking-wide text-noble-500 dark:text-noble-400">Pesquisar por nome ou telefone</label>
        <input
          type="text"
          placeholder="Ex.: Maria ou (11) 99999-9999"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-2 w-full rounded-xl border border-noble-200 dark:border-noble-700 bg-white dark:bg-noble-800 text-noble-800 dark:text-noble-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-plum-300 transition-colors duration-200"
        />
      </div>

      {loadingPatients ? (
        <SkeletonTable />
      ) : filteredPatients.length > 0 ? (
        <PatientTable
          patients={filteredPatients}
          onEdit={openEditModal}
          onDelete={handleDeletePatient}
          onEvolution={openEvolutionModal}
        />
      ) : (
        <EmptyState
          title={patients.length === 0 ? 'Nenhum paciente cadastrado' : 'Nenhum resultado encontrado'}
          description={
            patients.length === 0
              ? 'Cadastre o primeiro paciente para iniciar o controle de tratamento.'
              : 'Ajuste os termos da busca para encontrar seus pacientes.'
          }
        />
      )}

      <PatientFormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={handleSavePatient}
        loading={loadingForm}
        patient={selectedPatient}
      />

      <EvolutionModal
        isOpen={isEvolutionOpen}
        onClose={closeEvolutionModal}
        patient={evolutionPatient}
      />

      <PatientStatusDialog
        isOpen={isStatusDialogOpen}
        onClose={() => {
          setIsStatusDialogOpen(false)
          setStatusPatient(null)
        }}
        patient={statusPatient}
        onStatusChanged={handleStatusChanged}
      />
    </div>
  )
}

export default PatientsPage
