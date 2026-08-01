export const DOCUMENT_STATUSES=Object.freeze(['draft','pending_upload','uploaded_to_quarantine','scanning','available','blocked','scan_failed','archived'])
export const MALWARE_SCAN_STATUSES=Object.freeze(['pending','scanning','clean','infected','failed'])
export const DOCUMENT_CATEGORIES=Object.freeze(['clinical_report','exam','referral','consent_term','image','audio','video','other'])
export const DOCUMENT_SENSITIVITY_LEVELS=Object.freeze(['standard','sensitive','highly_sensitive'])
export const DOCUMENT_ACCESS_LEVELS=Object.freeze(['owner_only','organization'])
export const DOCUMENT_MIME_POLICY=Object.freeze({
  'application/pdf':Object.freeze({extensions:['pdf'],maxBytes:20*1024*1024}),
  'image/jpeg':Object.freeze({extensions:['jpg','jpeg'],maxBytes:10*1024*1024}),
  'image/png':Object.freeze({extensions:['png'],maxBytes:10*1024*1024}),
  'audio/mpeg':Object.freeze({extensions:['mp3'],maxBytes:50*1024*1024}),
  'audio/wav':Object.freeze({extensions:['wav'],maxBytes:50*1024*1024}),
  'video/mp4':Object.freeze({extensions:['mp4'],maxBytes:200*1024*1024}),
})
export const DOWNLOAD_TTL_MS=5*60*1000
export const UPLOAD_TTL_MS=10*60*1000

export function extensionOf(fileName){const normalized=String(fileName||'').normalize('NFKC').toLowerCase();if(normalized.includes('/')||normalized.includes('\\')||normalized.includes('..'))throw new Error('Nome de arquivo inseguro.');const parts=normalized.split('.');if(parts.length!==2||!parts[0]||!parts[1])throw new Error('Nome deve conter uma única extensão.');return parts[1]}
export function assertDeclaredFile({fileName,declaredMimeType,size}){const policy=DOCUMENT_MIME_POLICY[declaredMimeType];if(!policy)throw new Error('MIME não permitido.');const extension=extensionOf(fileName);if(!policy.extensions.includes(extension))throw new Error('Extensão incompatível.');if(!Number.isInteger(size)||size<=0||size>policy.maxBytes)throw new Error('Tamanho de arquivo inválido.');return{extension,policy}}
