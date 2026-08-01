# Relatório de implementação — Etapa 6A

## Resumo

A infraestrutura antiga fazia upload direto pelo cliente, criava URL permanente e escrevia metadados no Firestore. Ela foi substituída por um fluxo backend-first autenticado: autorização curta, quarentena, inspeção binária, SHA-256, scanner desacoplado, promoção com integridade, download temporário, idempotência e auditoria.

Decisões arquiteturais:

- reutilizar Firebase Admin, autenticação Bearer, transações, Zod e `auditLogs` existentes;
- manter Firestore e Storage atuais, sem infraestrutura paralela;
- centralizar política de arquivos;
- negar todo acesso direto ao Storage;
- conservar a API antiga de documentos como fachada compatível, desativando exclusão direta;
- listar dados na interface por resposta sanitizada do backend;
- preparar `versions`, sem entregar versionamento funcional da Etapa 6B.

## Entregas

- schemas de documento, arquivo, scan, upload, download, estados e classificações;
- endpoints request-upload, finalize-upload, request-download, status e listagem sanitizada;
- serviço central `documentStorageService`;
- detecção de magic bytes e SHA-256 no backend;
- `MalwareScanner`, mock controlado e fallback fail-closed;
- regras Firestore/Storage e emulador de Storage;
- interface existente adaptada ao fluxo seguro mínimo;
- testes unitários, concorrência, idempotência e regras.

## Arquivos

Criados:

- `src/config/documentStorage.js`, `src/schemas/documentStorage.schema.js` e testes;
- `src/services/documentStorageService.js`;
- `api/_lib/documentStorageFirebase.js`, `documentStorageHandler.js`, `documentStorageWorkflow.js`, `fileInspection.js`, `malwareScanner.js` e testes;
- endpoints em `api/documents/` para solicitação/finalização de upload, download, status e listagem;
- `storage.rules` e `tests/storage.rules.test.js`;
- os cinco documentos `docs/document-storage-*.md` exigidos pela etapa.

Modificados:

- `.env.example`, `.env.homologation`, `firebase.json` e `package.json` para configuração e emulador;
- `firestore.rules` e `tests/firestore.rules.test.js`;
- `src/firebase/storage.js`;
- `src/services/documentService.js` como fachada compatível sem escrita direta;
- `src/components/patients/DocumentsTab.jsx` somente para o fluxo técnico seguro mínimo.

O arquivo local não relacionado `.claude/settings.local.json` já existia no diretório e não faz parte desta implementação.

## Estrutura e fluxos

O Firestore usa `patients/{patientId}/documents/{documentId}`, `securityScans/{scanId}`, preparação técnica de `versions/{versionId}` e `documentStorageOperations/{requestId}`. O Storage separa `quarantine/{uploadId}` de `available/{versionId}`, sempre sob proprietário, paciente e documento gerados/validados pelo backend.

O upload passa por autorização curta, quarentena, validação de tamanho/extensão/MIME real, SHA-256, scan e promoção com precondição contra sobrescrita. O download exige propriedade, estado `available` e scan `clean`, produz URL de cinco minutos e resposta `no-store`. Os detalhes completos estão em `document-storage-data-model.md`, `document-storage-workflow.md`, `document-storage-security.md` e `document-storage-antivirus.md`.

## Segurança e limites

URLs de upload duram 10 minutos e downloads 5 minutos. O backend não recebe caminho do cliente nem o devolve nos endpoints. Arquivos inválidos ficam bloqueados; falhas de scanner nunca liberam conteúdo. Nenhum dado de produção foi usado.

## Validação

Os resultados finais dos comandos são registrados ao término da implementação nesta seção:

| Comando | Resultado |
|---|---|
| `npm test` | Aprovado — 29 arquivos, 307/307 testes |
| `npm run test:rules` | Aprovado — 56/56 testes de Firestore Rules |
| `npm run test:storage` | Aprovado — 3/3 testes de Storage Rules |
| `npm run test:emulator` | Aprovado — 6/6 testes integrados |
| `npm run lint` | Aprovado sem erros; 3 avisos preexistentes fora da Etapa 6A |
| `npm run build` | Aprovado — Vite, 246 módulos transformados |
| `git diff --check` | Aprovado — nenhuma inconsistência de whitespace |

A primeira execução isolada das Firestore Rules teve um timeout de 5 segundos em um teste antigo de paciente V2. A repetição imediata, sem alteração de código, aprovou os 56 testes; portanto, foi classificado como lentidão transitória do emulador, não regressão funcional.

No total, as suítes finais registraram 372 verificações aprovadas (307 principais, 56 de Firestore Rules, 3 de Storage Rules e 6 integradas em emuladores).

## Limitações e Etapa 6B

Não foram implementados biblioteca documental completa, preview, substituição, retenção, exclusão segura agendada, compartilhamento, OCR, assinatura, relatórios ou versionamento funcional. O mock não é antivírus real e não pode operar em produção. Integração e operação de um scanner real, limpeza automática de quarentena, detecção/aviso de duplicidade por paciente e uso único forte de download permanecem pendentes.

Nenhuma implantação, migração ou gravação em produção foi realizada.
