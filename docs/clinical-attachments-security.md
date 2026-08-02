# Segurança dos anexos clínicos

## Autorização e imutabilidade

Todos os endpoints verificam Firebase ID token e propriedade do paciente. Evolução, agendamento e Home Care precisam pertencer ao mesmo paciente e usuário. O profissional relacionado é limitado ao ator autenticado até existir modelo organizacional completo.

React não importa Firestore ou Storage. Componentes usam `clinicalAttachmentService`, que delega bytes e download ao `documentStorageService`. Caminhos, hashes, scans técnicos e URLs persistentes não chegam à interface.

Firestore Rules permitem ao proprietário ler documento e referências, mas negam toda escrita/exclusão direta. Scans, versões e operações idempotentes continuam backend-only. Storage Rules 6A não foram afrouxadas: toda leitura, listagem, escrita e exclusão pelo SDK cliente continua negada.

## Auditoria

São registrados eventos de rascunho, upload, scan, finalização, vínculos, download, arquivamento e negação por consentimento. O log contém apenas ator, paciente, documento, requestId, ação, estado e alvo técnico. Não contém arquivo, evolução, diagnóstico, URL, token, path ou detalhes do malware.

## Download e arquivamento

Somente `available + clean` recebe URL curta. `blocked`, `scan_failed`, quarentena, rascunho e arquivado não expõem botão nem URL. Arquivamento não apaga dados e exige motivo.
