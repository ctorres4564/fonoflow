import { DOCUMENT_CATEGORY_LABELS } from '../../config/documentStorage.js'

export default function ClinicalAttachmentCategoryBadge({ category }) {
  return <span className="inline-flex rounded-full border border-indigo-200 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">{DOCUMENT_CATEGORY_LABELS[category] || 'Documento legado'}</span>
}
