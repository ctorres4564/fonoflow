# Fluxo dos anexos clínicos

1. A interface coleta categoria, metadados, arquivo e vínculos opcionais.
2. O serviço valida formato e política da categoria para feedback imediato.
3. O backend autentica o usuário, confirma o paciente e valida evolução, agenda, visita e profissional.
4. Consentimento aplicável é consultado no backend. Sem consentimento válido, o rascunho/upload de mídia clínica é negado e auditado.
5. O rascunho é criado no documento 6A com `file=null`.
6. A solicitação de upload revalida consentimento e vínculos e delega ao workflow 6A.
7. A URL V4 grava somente no caminho aleatório de quarentena.
8. A finalização revalida o consentimento, executa magic bytes, MIME, tamanho, SHA-256, scanner e promoção 6A.
9. Somente resultado limpo cria referências clínicas separadas e `attachmentFinalizedAt`.
10. Download chama `documentStorageService.requestDownload()`, exige disponível/limpo/não arquivado e retorna URL de cinco minutos.

Se o scanner falhar, o anexo fica `scan_failed`; se detectar infecção, fica `blocked`; se o consentimento for revogado entre upload e finalização, fica bloqueado na quarentena. Nenhum desses estados cria referência definitiva.

## Idempotência

`clinicalAttachmentOperations/{requestId}` protege rascunho, solicitação, finalização, vínculo, arquivamento e download. Mesmo payload retorna a resposta anterior; payload diferente conflita. Referências usam o próprio `documentId`, impedindo duplicidade.

## Arquivamento

Arquivamento é lógico, exige confirmação e motivo, preserva arquivo/metadados e registra autor/data. Arquivados são omitidos por padrão e não geram download. Não há exclusão ou descarte definitivo nesta etapa.
