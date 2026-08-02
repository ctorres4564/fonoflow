# Versionamento documental — Etapa 6C

Cada documento V2 possui versões em `patients/{patientId}/documents/{documentId}/versions/{versionId}`. A criação reserva `versionNumber` sequencial em transação, registra `previousVersionId` e nunca substitui o arquivo histórico.

O documento principal mantém `currentVersionId`, `currentVersionNumber`, `totalVersions`, `lastVersionCreatedAt`, retenção, legal hold e bloqueio de integridade. O campo `file` continua como projeção compatível da versão corrente para consumidores 6A/6B.

## Ciclo

1. número e motivo são reservados em `draft`;
2. uma URL curta envia um objeto novo à quarentena isolada;
3. extensão, MIME, magic bytes, tamanho e SHA-256 são validados;
4. ocorre a varredura antimalware;
5. o arquivo é promovido para o caminho imutável da versão;
6. metadados são assinados e ativados em transação;
7. a versão corrente anterior passa a `superseded`.

Falhas resultam em `blocked` ou `scan_failed` e não alteram a corrente. `requestId` impede repetição lógica, e SHA-256 identifica conteúdo repetido no mesmo documento ou em outro documento do paciente.

Versões técnicas anteriores à 6C são apresentadas em memória como legadas, com integridade `unavailable`. A leitura não migra nem reescreve dados.

