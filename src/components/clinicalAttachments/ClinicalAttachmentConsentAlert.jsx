import { DOCUMENT_CATEGORY_CONFIG } from '../../config/documentStorage.js'

const labels = { image: 'imagem', audio: 'áudio', video: 'vídeo' }

export default function ClinicalAttachmentConsentAlert({ category, validation }) {
  const required = DOCUMENT_CATEGORY_CONFIG[category]?.requiredConsentType
  if (!required) return null
  const denied = validation?.valid === false
  return <div role={denied ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${denied ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300' : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'}`}>{denied ? `Consentimento válido para ${labels[required]} é obrigatório antes do envio.` : `Este anexo exige consentimento específico para ${labels[required]}. A confirmação será refeita pelo servidor.`}</div>
}
