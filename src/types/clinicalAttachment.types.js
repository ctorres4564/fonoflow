/** @typedef {typeof import('../config/documentStorage.js').CLINICAL_ATTACHMENT_CATEGORIES[number]} ClinicalAttachmentCategory */
/** @typedef {typeof import('../config/documentStorage.js').DOCUMENT_STATUSES[number]} ClinicalAttachmentStatus */
/** @typedef {{evolutionId:string|null,appointmentId:string|null,homeCareVisitId:string|null,relatedProfessionalId:string|null}} ClinicalAttachmentContext */
/** @typedef {{requiredConsentType:string|null,consentId:string|null,consentVersion:number|null,validatedAt:unknown,validationResult:'not_required'|'valid'|'denied'}} ClinicalAttachmentConsentContext */
/** @typedef {{id:string,patientId:string,category:ClinicalAttachmentCategory,title:string,description:string|null,documentDate:string|null,clinicalContext:ClinicalAttachmentContext,consentContext:ClinicalAttachmentConsentContext|null,status:ClinicalAttachmentStatus,available:boolean,fileName:string,mimeType:string|null,size:number}} ClinicalAttachment */
export {}
