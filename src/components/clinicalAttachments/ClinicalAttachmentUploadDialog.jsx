import { useEffect, useState } from 'react'
import { CLINICAL_ATTACHMENT_CATEGORIES, DOCUMENT_CATEGORY_CONFIG, DOCUMENT_CATEGORY_LABELS } from '../../config/documentStorage.js'
import ClinicalAttachmentConsentAlert from './ClinicalAttachmentConsentAlert.jsx'
import ClinicalAttachmentLinkSelector from './ClinicalAttachmentLinkSelector.jsx'

const initial = { category:'exam',title:'',description:'',documentDate:'',clinicalContext:{evolutionId:null,appointmentId:null,homeCareVisitId:null,relatedProfessionalId:null} }

export default function ClinicalAttachmentUploadDialog({ open, onClose, onSubmit, options, validateConsent, uploading, progress }) {
  const [values,setValues]=useState(initial);const[file,setFile]=useState(null);const[error,setError]=useState('');const[consent,setConsent]=useState(null)
  useEffect(()=>{if(open){setValues(initial);setFile(null);setError('');setConsent(null)}},[open])
  if(!open)return null
  const config=DOCUMENT_CATEGORY_CONFIG[values.category]
  const submit=async(event)=>{event.preventDefault();setError('');if(!file){setError('Selecione um arquivo.');return}try{const validation=await validateConsent(values.category);setConsent(validation);if(!validation.valid)return;await onSubmit({...values,description:values.description||null,documentDate:values.documentDate||null},file)}catch(submitError){setError(submitError.message)}}
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="attachment-upload-title"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-noble-900"><div className="flex items-center justify-between"><h3 id="attachment-upload-title" className="text-xl font-bold">Novo anexo clínico</h3><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2">✕</button></div>
    {error&&<div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <label className="block text-sm font-medium">Categoria<select value={values.category} onChange={(event)=>{setValues({...values,category:event.target.value});setConsent(null)}} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900">{CLINICAL_ATTACHMENT_CATEGORIES.map((item)=><option key={item} value={item}>{DOCUMENT_CATEGORY_LABELS[item]}</option>)}</select></label>
    <ClinicalAttachmentConsentAlert category={values.category} validation={consent}/>
    <label className="block text-sm font-medium">Título<input required minLength="3" value={values.title} onChange={(event)=>setValues({...values,title:event.target.value})} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900"/></label>
    <label className="block text-sm font-medium">Descrição<textarea maxLength="2000" value={values.description} onChange={(event)=>setValues({...values,description:event.target.value})} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900"/></label>
    <label className="block text-sm font-medium">Data do documento{config.documentDateRequired?' *':''}<input required={config.documentDateRequired} type="date" value={values.documentDate} onChange={(event)=>setValues({...values,documentDate:event.target.value})} className="mt-1 w-full rounded-lg border p-2 dark:bg-noble-900"/></label>
    <ClinicalAttachmentLinkSelector value={values.clinicalContext} onChange={(clinicalContext)=>setValues({...values,clinicalContext})} options={options}/>
    <label className="block text-sm font-medium">Arquivo<input required type="file" accept={config.allowedMimeTypes.join(',')} onChange={(event)=>setFile(event.target.files[0]||null)} className="mt-1 block w-full rounded-lg border p-2"/><span className="mt-1 block text-xs text-noble-500">Limite da categoria: {Math.round(config.maxSize/1024/1024)} MB</span></label>
    {uploading&&<div role="status" className="text-sm">Enviando e verificando… {progress}%</div>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={uploading} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={uploading} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Enviar com segurança</button></div>
  </form></div>
}
