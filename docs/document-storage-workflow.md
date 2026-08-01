# Fluxo documental seguro

## Upload

1. O cliente autenticado envia metadados a `POST /api/documents/request-upload`.
2. O backend valida o token, a propriedade do paciente e o payload Zod.
3. Nome, extensão, MIME declarado e limite são verificados; dupla extensão e path traversal são rejeitados.
4. O backend cria IDs e um caminho aleatório em `quarantine`, persiste `pending_upload` e retorna uma URL V4 de escrita por 10 minutos.
5. A URL exige `Content-Type` e `x-goog-if-generation-match: 0`, impedindo sobrescrita.
6. O cliente envia os bytes e chama `POST /api/documents/finalize-upload`.
7. O backend baixa o objeto da quarentena, confirma o tamanho, detecta magic bytes, compara MIME/extensão e calcula SHA-256.
8. O documento passa por `uploaded_to_quarantine` e `scanning` em transações, com scan e auditoria próprios.
9. Resultado limpo é copiado para `available`, tem o hash conferido novamente e o temporário é removido. Infectado fica `blocked`; erro ou timeout fica `scan_failed`.

Nenhum caminho é informado pelo cliente. Repetir o mesmo `requestId` e payload retorna a mesma resposta; reutilizá-lo com outro payload retorna conflito.

## Download

1. `POST /api/documents/request-download` valida token, paciente e documento.
2. O backend exige documento `available` e scan `clean`.
3. Uma URL V4 de leitura com validade de 5 minutos é emitida.
4. A resposta contém apenas `downloadUrl`, `expiresAt`, `documentId` e `fileName`.
5. Solicitação, concessão ou negação ficam auditadas. Quarentena, infecção e falha de scan nunca geram URL.

## Consulta técnica

## Atualização da Etapa 6C

A finalização limpa cria a versão 1 assinada. Substituições usam quarentena própria, número sequencial reservado e ativação transacional, preservando a corrente em qualquer falha. Consulte `document-versioning.md`.

`GET /api/documents/:documentId/status` retorna somente estado, estado do scan e disponibilidade. `POST /api/documents/list` fornece à interface uma lista sanitizada, sem caminhos, hashes, URLs ou detalhes do antivírus.
