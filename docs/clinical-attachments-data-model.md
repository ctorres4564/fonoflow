# Modelo de dados dos anexos clínicos

## Documento principal

Anexos continuam em `patients/{patientId}/documents/{documentId}`. Não foi criada uma segunda coleção documental. O registro V2 da Etapa 6A recebeu campos opcionais:

```text
clinicalContext.evolutionId
clinicalContext.appointmentId
clinicalContext.homeCareVisitId
clinicalContext.relatedProfessionalId
consentContext.requiredConsentType
consentContext.consentId
consentContext.consentVersion
consentContext.validatedAt
consentContext.validationResult
attachmentFinalizedAt
archivedBy / archivedAt / archiveReason
```

Em `draft`, `file` é nulo. A partir de `pending_upload`, o metadado de arquivo 6A é obrigatório. O vínculo definitivo só é criado depois de `status=available` e `file.scanStatus=clean`.

## Referências imutáveis

- evolução: `patients/{patientId}/evolutions/{evolutionId}/attachments/{documentId}`;
- agendamento: `schedules/{appointmentId}/attachments/{documentId}`;
- Home Care: `schedules/{appointmentId}/homeCareVisit/current/attachments/{documentId}`.

As referências guardam apenas IDs, contexto mínimo, autor e data. Elas não copiam conteúdo clínico, hash, caminho, URL ou diagnóstico e não alteram o documento pai.

## Categorias

Os valores persistidos são enums em inglês. Os rótulos em português existem apenas na interface.

`exam`, `medical_report`, `audiometry`, `clinical_image`, `clinical_audio`, `clinical_video`, `referral`, `school_document`, `consent_document`, `clinical_report`, `administrative_document`, `prescription`, `therapy_plan`, `discharge_document` e `other`.

`DOCUMENT_CATEGORY_CONFIG` concentra MIME, limite, sensibilidade, acesso, consentimento, vínculos e obrigatoriedade da data. A política complementa a allowlist 6A e nunca a amplia.

## Compatibilidade

Registros sem `schemaVersion` são convertidos somente na resposta, marcados como legados, bloqueados para download e nunca gravados. Versões desconhecidas geram erro controlado. Os enums antigos da infraestrutura permanecem aceitos no schema-base para leitura de registros 6A, mas não aparecem como novas categorias clínicas.
