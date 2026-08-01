# Segurança do versionamento documental

- autenticação Firebase Admin e propriedade validada em cada endpoint;
- IDs e caminhos derivados no backend;
- uploads isolados por paciente, documento, versão e `uploadId`;
- Storage negado a clientes; acesso somente por URLs V4 curtas;
- MIME, extensão, tamanho, magic bytes, SHA-256 e antimalware antes de ativar;
- HMAC-SHA256 versionado e falha fechada em produção;
- leitura Firestore somente pelo proprietário e nenhuma escrita de cliente;
- idempotência por fingerprint e `requestId`;
- auditoria de criação, ativação, falha, restauração, integridade, retenção e hold;
- download bloqueado para documento indisponível, scan não limpo ou integridade comprometida.

Arquivo, hash, assinatura, motivo e identidades de uma versão ativada não são reescritos. O backend registra somente transições de ciclo de vida e verificações; restauração sempre gera outra versão.

