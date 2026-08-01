# Relatório de implementação — Etapa 6B

## Resumo

A Etapa 6B acrescentou anexos clínicos sobre a infraestrutura 6A, sem reimplementar Storage. Foram entregues categorias, rascunhos, consentimento backend, vínculos imutáveis com evolução/agenda/Home Care, interface componentizada, download temporário e arquivamento lógico.

## Ajustes necessários no contrato 6A

- `ClinicalDocument.file` pode ser nulo exclusivamente em `draft`;
- `DocumentUploadRequest.documentId` é opcional e usado internamente para promover o mesmo rascunho;
- contexto clínico, consentimento e arquivamento foram adicionados como campos V2 estritos;
- mídia que exige consentimento é bloqueada no endpoint 6A genérico e só entra pelo modo interno 6B;
- o repository transacional ganhou `set` para referências determinísticas.

Esses ajustes preservam os endpoints, os caminhos, o scanner, a quarentena e os testes anteriores.

## Arquivos e componentes

Foram criados schemas, tipos, serviço, workflow/backend, nove endpoints, testes e os componentes `ClinicalAttachmentsTab`, `ClinicalAttachmentList`, `ClinicalAttachmentCard`, `ClinicalAttachmentUploadDialog`, `ClinicalAttachmentDetailsDialog`, `ClinicalAttachmentStatusBadge`, `ClinicalAttachmentCategoryBadge`, `ClinicalAttachmentConsentAlert`, `ClinicalAttachmentLinkSelector`, `ClinicalAttachmentDownloadButton` e `ClinicalAttachmentEmptyState`.

Foram modificados os contratos 6A, `EvolutionModal`, Firestore Rules, testes de regras e documentação central. Storage Rules permaneceram inalteradas.

## Fluxos entregues

- paciente: todo anexo pertence ao registro documental do paciente;
- evolução: referência em subcoleção, sem tocar HTML/JSON/texto finalizado;
- agendamento: referência sem alterar estado, histórico ou sessões;
- Home Care: referência sob `current`, sem alterar deslocamento, quilometragem ou contabilização;
- consentimento: imagem/áudio/vídeo revalidados no servidor em cada etapa crítica;
- arquivamento: lógico, motivado, auditado, oculto por padrão e sem download.

## Validação final

| Comando | Resultado |
|---|---|
| `npm test` | Aprovado — 32 arquivos, 331/331 testes |
| `npm run test:rules` | 59/59 aprovado |
| `npm run test:storage` | Aprovado — 3/3 testes; regras 6A preservadas |
| `npm run test:emulator` | Aprovado — 6/6 testes integrados |
| `npm run build` | Aprovado — 257 módulos transformados |
| `npm run lint` | Aprovado sem erros; 3 avisos preexistentes fora da Etapa 6B |
| `git diff --check` | Aprovado — nenhuma inconsistência de whitespace |

As suítes finais totalizam 399 verificações aprovadas: 331 principais, 59 de Firestore Rules, 3 de Storage Rules e 6 integradas em emuladores.

## Limitações e Etapa 6C

Não foram implementados versionamento completo, retenção, descarte/restauração, preview, OCR, assinatura, compartilhamento, relatórios ou IA. O profissional relacionado fica restrito ao proprietário enquanto não houver autorização organizacional granular. O download temporário não é de uso único forte.

Nenhuma implantação, migração ou gravação em produção foi realizada. A Etapa 6C não foi iniciada.
