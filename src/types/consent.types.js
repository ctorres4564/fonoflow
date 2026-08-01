/** @typedef {typeof import('../schemas/consent.schema').CONSENT_TYPES[number] | `custom:${string}`} ConsentType */
/** @typedef {typeof import('../schemas/consent.schema').LEGAL_BASES[number]} LegalBasisCode */
/** @typedef {{number:number,title:string,hash:string}} ConsentVersion */
/** @typedef {{revokedAt:unknown,revokedBy:string,reason:string,requestId:string}} ConsentRevocation */
/** @typedef {{schemaVersion:2,patientId:string,organizationId:string,professionalId:string,consentType:ConsentType,legalBasis:{code:LegalBasisCode,justification:string},version:ConsentVersion,title:string,hash:string,acceptedAt:unknown,acceptedBy:string,acceptedMethod:string,acceptedEvidence:object,revoked:boolean,active:boolean,createdAt:unknown,updatedAt:unknown}} Consent */
export {}
