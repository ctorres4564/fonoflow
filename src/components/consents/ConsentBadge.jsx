import { consentTypeLabels } from './consentLabels'
export default function ConsentBadge({ type }) { return <span className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-800">{consentTypeLabels[type]||type.replace(/^custom:/,'')}</span> }
