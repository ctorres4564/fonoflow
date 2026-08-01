# Segurança do armazenamento documental

## Fronteiras de confiança

O navegador não cria ou altera metadados documentais e não acessa o Firebase Storage pelo SDK. O backend autenticado valida propriedade, cria todos os caminhos e emite autorizações V4 curtas. React usa apenas `documentStorageService`.

As Firestore Rules permitem ao proprietário ler o registro documental, mas bloqueiam create, update e delete. Scans, versões, operações idempotentes e auditoria são backend-only. As Storage Rules negam leitura, listagem, escrita, sobrescrita e exclusão diretas para qualquer cliente; URLs assinadas pelo service account passam pelo Google Cloud Storage e não transformam o bucket em público.

## Defesas de arquivo

- allowlist única de MIME e extensão;
- limites independentes por tipo;
- normalização NFKC e uma única extensão;
- rejeição de barras, `..` e dupla extensão;
- magic bytes para PDF, JPEG, PNG, MP3, WAV e MP4;
- comparação entre MIME declarado, assinatura e extensão;
- tamanho declarado comparado ao tamanho real;
- SHA-256 calculado no backend e reconferido após promoção;
- nomes UUID e caminhos definidos exclusivamente pelo backend;
- precondição `ifGenerationMatch: 0` no upload e na promoção;
- quarentena inacessível e liberação somente após scan limpo.

## Auditoria e minimização

Eventos: `document_upload_requested`, `document_upload_completed`, `document_scan_started`, `document_scan_clean`, `document_scan_infected`, `document_scan_failed`, `document_download_requested`, `document_download_granted` e `document_download_denied`.

O log contém ator, paciente, IDs técnicos, requestId, ação, estado, MIME detectado, tamanho e somente o prefixo do SHA-256. Não contém nome do paciente, conteúdo, descrição clínica, URL assinada, caminho, token ou credencial.

## Ambientes

- desenvolvimento/teste/emulador: mock explicitamente permitido;
- homologação: scanner real ou falha fechada;
- produção: `mock` e `always_clean` interrompem a inicialização; sem integração real, o scanner retorna falha e o arquivo não é liberado.

Variáveis: `FIREBASE_STORAGE_BUCKET`, `DOCUMENT_MALWARE_SCANNER` e `DOCUMENT_SCAN_TIMEOUT_MS`. Segredos existem apenas no backend.

## Atualização da Etapa 6C

Versões novas são assinadas com HMAC-SHA256. Divergência de arquivo ou metadados define `integrityBlocked` e impede download. Legal hold prevalece sobre arquivamento. Consulte `document-versioning-security.md`.
