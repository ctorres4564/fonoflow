import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import InputField from '../common/InputField'
import { calculateRemainingSessions } from '../../utils/patient'
import { formatPhone, validatePatientForm } from '../../utils/validators'

const initialValues = {
  name: '',
  address: '',
  phone: '',
  birthDate: '',
  guardian: '',
  diagnosis: '',
  professionalName: '',
  crfa: '',
  complaint: '',
  notes: '',
  sessionsPerWeek: 1,
  totalSessions: 1,
  completedSessions: 0,
  tcleAccepted: false,
}

function PatientFormModal({ isOpen, onClose, onSubmit, loading, patient }) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  // Web Speech API para Transcrição de Voz
  const [isListening, setIsListening] = useState(false)
  const [listeningField, setListeningField] = useState(null) // 'notes' | 'complaint' | null
  const [recognition, setRecognition] = useState(null)

  // Configurar Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = false
      rec.lang = 'pt-BR'

      rec.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript
        const currentField = rec.targetField || 'notes'
        setValues((prev) => {
          const currentValue = prev[currentField] || ''
          return {
            ...prev,
            [currentField]: currentValue ? `${currentValue.trim()} ${text.trim()}.` : `${text.trim()}.`,
          }
        })
      }

      rec.onerror = (event) => {
        console.error('Erro no reconhecimento de voz:', event.error)
        setIsListening(false)
        setListeningField(null)
      }

      rec.onend = () => {
        setIsListening(false)
        setListeningField(null)
      }

      setRecognition(rec)
    }
  }, [])

  useEffect(() => {
    if (patient) {
      setValues({
        name: patient.name ?? '',
        address: patient.address ?? '',
        phone: patient.phone ?? '',
        birthDate: patient.birthDate ?? '',
        guardian: patient.guardian ?? '',
        diagnosis: patient.diagnosis ?? '',
        professionalName: patient.professionalName ?? '',
        crfa: patient.crfa ?? '',
        complaint: patient.complaint ?? '',
        notes: patient.notes ?? '',
        sessionsPerWeek: patient.sessionsPerWeek ?? 1,
        totalSessions: patient.totalSessions ?? 1,
        completedSessions: patient.completedSessions ?? 0,
        tcleAccepted: patient.tcleAccepted ?? false,
      })
      setErrors({})
      return
    }

    setValues(initialValues)
    setErrors({})

    return () => {
      if (recognition) {
        recognition.stop()
      }
    }
  }, [patient, isOpen, recognition])

  const remainingSessions = useMemo(
    () => calculateRemainingSessions(values.totalSessions, values.completedSessions),
    [values.totalSessions, values.completedSessions],
  )

  const toggleSpeech = (field = 'notes') => {
    if (!recognition) {
      toast.error('O reconhecimento de voz não é suportado pelo seu navegador.')
      return
    }

    if (isListening) {
      recognition.stop()
      setListeningField(null)
    } else {
      try {
        recognition.targetField = field
        recognition.start()
        setIsListening(true)
        setListeningField(field)
        toast.success('Pode falar, estou ouvindo...')
      } catch (error) {
        console.error(error)
      }
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    const nextValue = name === 'phone' ? formatPhone(value) : value

    setValues((prev) => ({ ...prev, [name]: nextValue }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validatePatientForm(values)
    
    // Validação de conformidade da LGPD/TCLE
    if (!values.tcleAccepted) {
      validationErrors.tcleAccepted = 'Você deve confirmar o consentimento do paciente (TCLE) para prosseguir.'
    }

    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) return

    onSubmit(values)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white dark:bg-noble-900 p-6 shadow-2xl transition-colors duration-200">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-noble-800 dark:text-noble-100">
            {patient ? 'Editar paciente' : 'Novo paciente'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-noble-300 dark:border-noble-700 px-3 py-1.5 text-sm text-noble-600 dark:text-noble-450 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
          >
            Fechar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InputField label="Nome completo" name="name" value={values.name} onChange={handleChange} error={errors.name} required />
          <InputField label="Telefone" name="phone" value={values.phone} onChange={handleChange} error={errors.phone} placeholder="(11) 99999-9999" required />
          <InputField label="Data de nascimento" type="date" name="birthDate" value={values.birthDate} onChange={handleChange} error={errors.birthDate} required />
          <InputField label="Responsável" name="guardian" value={values.guardian} onChange={handleChange} error={errors.guardian} required />
          <div className="md:col-span-2">
            <InputField label="Endereço" name="address" value={values.address} onChange={handleChange} error={errors.address} required />
          </div>
          <div className="md:col-span-2">
            <InputField label="Diagnóstico" type="textarea" rows={3} name="diagnosis" value={values.diagnosis} onChange={handleChange} placeholder="Informe o diagnóstico clínico do paciente." />
          </div>
          <InputField label="Profissional responsável" name="professionalName" value={values.professionalName} onChange={handleChange} error={errors.professionalName} placeholder="Nome completo da fonoaudióloga" required />
          <InputField label="CRFa" name="crfa" value={values.crfa} onChange={handleChange} error={errors.crfa} placeholder="Ex.: CRFa 1-12345" required />
          <InputField label="Sessões por semana" type="number" min={1} name="sessionsPerWeek" value={values.sessionsPerWeek} onChange={handleChange} error={errors.sessionsPerWeek} required />
          <InputField label="Total contratado" type="number" min={1} name="totalSessions" value={values.totalSessions} onChange={handleChange} error={errors.totalSessions} required />
          <InputField label="Sessões realizadas" type="number" min={0} name="completedSessions" value={values.completedSessions} onChange={handleChange} error={errors.completedSessions} required />

          <div className="rounded-xl border border-gold-200 dark:border-gold-900/60 bg-gold-100/40 dark:bg-gold-950/10 p-4 transition-colors duration-200">
            <p className="text-xs uppercase tracking-wide text-gold-600 dark:text-gold-400">Sessões restantes</p>
            <p className="text-2xl font-bold text-gold-600 dark:text-gold-400">{remainingSessions}</p>
          </div>

          {/* Campo de Queixa Fonoaudiológica Customizado com Suporte à Voz */}
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-noble-700 dark:text-noble-300">
                Queixa Fonoaudiológica
              </span>
              <button
                type="button"
                onClick={() => toggleSpeech('complaint')}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 transition ${
                  isListening && listeningField === 'complaint'
                    ? 'bg-red-500 border-red-500 text-white animate-pulse'
                    : 'bg-white dark:bg-noble-800 border-noble-300 dark:border-noble-700 text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-750'
                }`}
              >
                <span>{isListening && listeningField === 'complaint' ? 'Ouvindo... 🛑' : 'Ditar 🎙️'}</span>
              </button>
            </div>
            <textarea
              name="complaint"
              value={values.complaint}
              onChange={handleChange}
              placeholder="Descreva a queixa de fala, linguagem, comportamento ou desenvolvimento trazida pelo paciente/responsável..."
              rows={3}
              className="w-full rounded-xl border border-noble-200 dark:border-noble-700 bg-white dark:bg-noble-800 px-4 py-2.5 text-sm text-noble-800 dark:text-noble-100 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-plum-300 dark:focus:ring-plum-800"
            />
          </div>

          {/* Campo de Observações Customizado com Suporte à Voz */}
          <div className="md:col-span-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-noble-700 dark:text-noble-300">
                Observações
              </span>
              <button
                type="button"
                onClick={() => toggleSpeech('notes')}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 transition ${
                  isListening && listeningField === 'notes'
                    ? 'bg-red-500 border-red-500 text-white animate-pulse'
                    : 'bg-white dark:bg-noble-800 border-noble-300 dark:border-noble-700 text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-750'
                }`}
              >
                <span>{isListening && listeningField === 'notes' ? 'Ouvindo... 🛑' : 'Ditar 🎙️'}</span>
              </button>
            </div>
            <textarea
              name="notes"
              value={values.notes}
              onChange={handleChange}
              placeholder="Observações clínicas e de evolução do paciente..."
              rows={3}
              className="w-full rounded-xl border border-noble-200 dark:border-noble-700 bg-white dark:bg-noble-800 px-4 py-2.5 text-sm text-noble-800 dark:text-noble-100 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-plum-300 dark:focus:ring-plum-800"
            />
          </div>

          {/* Checkbox de Aceite de Consentimento TCLE / LGPD */}
          <div className="md:col-span-2 mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="tcleAccepted"
                checked={values.tcleAccepted}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, tcleAccepted: e.target.checked }))
                  if (errors.tcleAccepted) {
                    setErrors((prev) => ({ ...prev, tcleAccepted: undefined }))
                  }
                }}
                className="mt-1 h-4 w-4 rounded border-noble-300 text-plum-600 focus:ring-plum-500"
              />
              <span className="text-xs text-noble-600 dark:text-noble-400 leading-relaxed font-medium">
                Confirmo que o paciente (ou seu responsável legal) deu consentimento explícito para o armazenamento e tratamento digital de seus dados pessoais sensíveis de saúde de acordo com a LGPD e o Termo de Consentimento Livre e Esclarecido (TCLE) da clínica.
              </span>
            </label>
            {errors.tcleAccepted && (
              <p className="mt-1 text-xs text-red-500 font-semibold">{errors.tcleAccepted}</p>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-noble-300 dark:border-noble-700 px-5 py-2.5 text-sm font-semibold text-noble-700 dark:text-noble-300 hover:bg-noble-50 dark:hover:bg-noble-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-plum-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-plum-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Salvando...' : patient ? 'Salvar alterações' : 'Cadastrar paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PatientFormModal
