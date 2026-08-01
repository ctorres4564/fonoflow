# Modelo de dados do Storage documental

## Firestore

O registro principal fica em `patients/{patientId}/documents/{documentId}` e segue o schema Zod `ClinicalDocument` versão 2. Ele contém identidade, proprietário, organização preparada para uso futuro, categoria, título, classificação de acesso, estado e `DocumentFileMetadata`.

O metadado do arquivo registra nome original apenas para exibição, nome aleatório, caminho interno, MIME declarado e detectado, tamanho real, SHA-256, autor, upload, estado e `requestId`. O caminho nunca é aceito em payload nem retornado pelos endpoints.

Cada tentativa de análise cria `patients/{patientId}/documents/{documentId}/securityScans/{scanId}`. O registro contém provedor, versão do mecanismo, resultado, hash e timestamps, sem conteúdo clínico.

`patients/{patientId}/documents/{documentId}/versions/{versionId}` está preparado para integridade e evolução futura. Nesta etapa é criado somente o registro técnico da primeira versão limpa; substituição, histórico funcional e restauração pertencem à Etapa 6B.

`documentStorageOperations/{requestId}` guarda fingerprint e resposta estável das operações idempotentes. `auditLogs/{eventId}` guarda a trilha mínima e não é acessível pelo cliente.

## Estados

Documento: `draft`, `pending_upload`, `uploaded_to_quarantine`, `scanning`, `available`, `blocked`, `scan_failed`, `archived`.

Scan: `pending`, `scanning`, `clean`, `infected`, `failed`.

Somente `available` combinado com scan `clean` permite download.

## Storage

Quarentena:

```text
users/{ownerId}/patients/{patientId}/documents/{documentId}/quarantine/{uploadId}/{uuid}.{ext}
```

Disponível:

```text
users/{ownerId}/patients/{patientId}/documents/{documentId}/available/{versionId}/{uuid}.{ext}
```

O nome original não participa do caminho. IDs e nomes são gerados no backend, e a cópia para `available` usa precondição de geração zero para impedir sobrescrita.

## Política centralizada

| MIME | Extensão | Limite |
|---|---|---:|
| `application/pdf` | `pdf` | 20 MB |
| `image/jpeg` | `jpg`, `jpeg` | 10 MB |
| `image/png` | `png` | 10 MB |
| `audio/mpeg` | `mp3` | 50 MB |
| `audio/wav` | `wav` | 50 MB |
| `video/mp4` | `mp4` | 200 MB |

A fonte única é `src/config/documentStorage.js`.
