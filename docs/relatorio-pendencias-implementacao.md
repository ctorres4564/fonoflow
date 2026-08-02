# Relatório consolidado do que ainda falta implementar

**Data da análise:** 1º de agosto de 2026  
**Escopo:** estado local do branch `agent/palette-indigo-clinico`, documentação técnica, regras, serviços, APIs, interface, CI e preparação para produção.

## 1. Resumo executivo

O núcleo clínico local está funcionalmente avançado: Schema V2, agenda transacional, Home Care, consentimentos/LGPD, Storage seguro, anexos clínicos e a Etapa 6C de versionamento/integridade possuem testes automatizados aprovados.

O projeto, porém, ainda não deve ser tratado como pronto para produção comercial. As principais pendências são:

1. versionar e publicar no Git as mudanças locais da Etapa 6C;
2. configurar scanner antimalware real e chave HMAC de produção;
3. cadastrar e atribuir políticas de retenção reais, aprovadas juridicamente;
4. substituir a exclusão direta de pacientes por um fluxo LGPD/documental governado;
5. concluir a homologação visual autenticada do Home Care;
6. implantar regras, índices e configurações em ambiente de homologação antes de produção;
7. implementar isolamento multi-tenant, papéis e faturamento antes da comercialização SaaS;
8. entregar as capacidades documentais adiadas para uma etapa posterior à 6C.

## 2. Estado confirmado nesta análise

### Implementado localmente

- Schema V2 de pacientes, evoluções e agenda;
- integridade transacional da contabilização de sessões;
- Home Care com operação atômica e testes de emulador;
- consentimentos versionados e revogáveis;
- infraestrutura de Storage com quarentena, URLs temporárias e acesso direto negado;
- anexos clínicos vinculados a evolução, agenda e Home Care;
- versionamento documental sequencial e idempotente;
- assinatura HMAC-SHA256 e bloqueio por divergência;
- restauração sem reescrever histórico;
- cálculo de retenção e legal hold no backend;
- regras Firestore e Storage testadas.

### Validação atual

- `npm test`: 345 testes aprovados;
- `npm run test:rules`: 62 testes aprovados;
- `npm run test:storage`: 3 testes aprovados;
- `npm run test:emulator`: 6 testes aprovados;
- total oficial: 416 testes aprovados;
- build e lint sem erros;
- três avisos de lint preexistentes e não bloqueantes.

### Situação no Git

A Etapa 6C está implementada apenas no working tree. O `HEAD` continua em `cf0ecda`, correspondente à Etapa 6B, e há arquivos modificados e novos ainda sem commit. O arquivo `.claude/settings.local.json` é alheio à implementação e deve continuar fora do commit.

## 3. Bloqueadores para concluir a Etapa 6C

| Prioridade | Pendência | Evidência atual | Critério de conclusão |
| --- | --- | --- | --- |
| P0 | Criar commit da Etapa 6C | alterações ainda não versionadas | commit revisado contendo somente arquivos do projeto, sem `.claude/settings.local.json` |
| P0 | Fazer push e atualizar/criar PR | branch remoto ainda aponta para o commit da 6B | branch remoto contendo a 6C e PR com validações verdes |
| P0 | Revisar o diff completo antes do merge | implementação extensa em backend, regras e UI | revisão técnica e de segurança sem achados críticos |
| P1 | Atualizar contratos centrais de API | `docs/backend-contracts.md` ainda documenta apenas 6A/6B | registrar endpoints de versões, integridade, retenção e legal hold |
| P1 | Corrigir documentação histórica contraditória | relatórios 6A/6B ainda listam versionamento e retenção como não implementados | marcar claramente as limitações superadas pela 6C |
| P2 | Remover três avisos antigos do lint | warnings em dois scripts e um serviço | `npm run lint` sem warnings |

## 4. Bloqueadores técnicos para homologação/produção

### 4.1 Scanner antimalware real

O código de produção possui apenas o contrato, o mock de teste e o modo `FailClosedMalwareScanner`. Sem provedor real, uploads terminam de forma segura em `scan_failed`, mas documentos não podem ser disponibilizados.

Falta:

- escolher ClamAV, Cloud Run, worker isolado ou provedor especializado;
- autenticar e validar respostas do scanner;
- definir timeout, retries, fila, SLA e tratamento de indisponibilidade;
- criar limpeza segura de objetos infectados e quarentenas expiradas;
- monitorar falhas sem registrar conteúdo clínico.

### 4.2 Segredos e rotação de integridade

Os arquivos de ambiente contêm somente marcadores rejeitados pelo backend.

Falta:

- gerar e armazenar `DOCUMENT_INTEGRITY_HMAC_KEY` em cofre de segredos;
- configurar `DOCUMENT_INTEGRITY_SIGNATURE_VERSION` em homologação e produção;
- definir procedimento de rotação de chave e convivência de versões de assinatura;
- testar recuperação quando uma chave antiga precisar verificar documentos históricos;
- criar alerta operacional para `INTEGRITY_KEY_UNAVAILABLE`.

### 4.3 Políticas de retenção reais

A 6C calcula retenção quando `retentionPolicyId` existe, mas documentos novos recebem `null` e não há administração de `retentionPolicies`.

Falta:

- definir políticas por categoria documental e evento inicial;
- aprovar prazos com jurídico/DPO e responsáveis clínicos;
- criar seed ou painel backend-only de políticas;
- permitir atribuição controlada de política ao documento;
- testar mudança de política sem reescrever histórico;
- criar fila/painel de documentos em `review_due` e `expired`;
- manter descarte automático desabilitado até existir fluxo específico e auditado.

### 4.4 Legal hold operacional

API e serviço de aplicação/remoção existem, mas a interface clínica apenas exibe o banner.

Falta:

- interface autorizada para aplicar e remover hold;
- definição de quais papéis podem executar essas ações;
- confirmação reforçada e justificativa visível na auditoria;
- consulta administrativa de todos os documentos sob hold;
- procedimento de revisão jurídica periódica.

### 4.5 Deploy seguro de infraestrutura

Nada foi implantado durante as etapas locais.

Falta:

- criar ambiente de homologação Firebase/Vercel isolado de produção;
- configurar Firebase Admin, bucket, HMAC e scanner por ambiente;
- implantar Firestore Rules, Storage Rules e índices compostos;
- validar CORS e domínios reais;
- executar smoke tests depois do deploy;
- preparar rollback de regras, backend e frontend;
- decidir se as migrações V1→V2 serão executadas e, se forem, fazer backup e dry-run primeiro.

## 5. Pendências críticas de LGPD e governança clínica

### 5.1 Exclusão direta de paciente

`src/services/patientService.js` ainda executa `deleteDoc()` diretamente no documento do paciente, e as regras permitem a exclusão pelo proprietário. Isso não remove automaticamente as subcoleções e entra em conflito com retenção, legal hold, prontuário imutável e descarte auditado. A documentação do usuário afirma incorretamente que todo o histórico é removido.

Falta substituir esse comportamento por um fluxo que:

- verifique legal hold e obrigação de retenção;
- diferencie desativação, anonimização, restrição e descarte;
- impeça órfãos em subcoleções e Storage;
- exija motivo, autorização e idempotência;
- registre auditoria sem apagar a prova da decisão;
- permita atendimento de solicitações LGPD com análise jurídica.

### 5.2 Direitos do titular

Consentimento e revogação estão implementados, mas falta um processo completo para:

- exportação/portabilidade dos dados do paciente;
- relatório de acessos e tratamentos;
- correção de dados cadastrais com trilha;
- solicitação de eliminação ou anonimização sujeita à retenção legal;
- controle de prazos e resposta ao titular;
- comprovação de execução da solicitação.

### 5.3 Validação jurídica

Falta aprovação formal de:

- textos e versões dos termos;
- bases legais e finalidades por tratamento;
- prazos de retenção por classe documental;
- política de privacidade, termos de uso e contrato com operadores;
- procedimento de incidente e comunicação;
- regras para menores e representantes legais.

Aceite eletrônico simples não equivale a assinatura ICP-Brasil ou assinatura eletrônica avançada.

## 6. Homologações ainda pendentes

### 6.1 Home Care autenticado e responsivo

As falhas críticas de atomicidade e configuração de emuladores foram corrigidas e possuem testes. Ainda falta executar pela interface autenticada os nove cenários de aceitação em desktop, tablet e celular.

Pontos obrigatórios:

- criar usuário e paciente fictícios no emulador;
- realizar o fluxo completo e confirmar exatamente um débito;
- repetir conclusão e `operationId`;
- testar paciente ausente, cancelamentos e endereço histórico;
- abrir Maps e Waze em desktop e dispositivo móvel;
- validar alertas V1/V2;
- testar acesso por outro usuário e não autenticado;
- verificar possível overflow horizontal no login móvel;
- anexar capturas autenticadas de `/home-care`.

### 6.2 Gestão documental ponta a ponta

Os workflows possuem testes unitários e de regras, mas falta uma aceitação de navegador conectada aos emuladores cobrindo:

- primeira versão assinada;
- nova versão e duplicidade;
- falha de scan;
- adulteração simulada e bloqueio de download;
- restauração;
- legal hold;
- cálculo de retenção;
- compatibilidade de documento legado;
- responsividade dos novos diálogos.

### 6.3 Cobertura e CI

O pipeline executa testes unitários, emulador, regras, lint e build, mas não executa `npm run test:storage` nem `git diff --check`.

Falta:

- incluir testes de Storage no GitHub Actions;
- incluir `git diff --check`;
- adicionar cobertura percentual e limites mínimos;
- adicionar E2E de navegador, preferencialmente Playwright;
- publicar artefatos e logs sanitizados em falhas;
- incluir análise de dependências e segurança.

## 7. Próxima etapa documental, posterior à 6C

Estas capacidades foram deliberadamente adiadas e não devem ser confundidas com defeitos da 6C:

| Capacidade futura | Situação atual |
| --- | --- |
| Descarte seguro após retenção | não implementado; nenhum descarte automático existe |
| Limpeza programada de quarentena | não implementada |
| Preview seguro de PDF/imagem/mídia | não implementado |
| OCR e indexação de conteúdo | não implementados |
| Compartilhamento externo controlado | não implementado |
| Download de uso único forte | URLs expiram, mas podem ser reutilizadas durante a validade |
| Assinatura eletrônica avançada/ICP-Brasil | não implementada |
| Catálogo imutável de modelos e termos publicados | não implementado |
| Relatórios documentais e dashboards de retenção | não implementados |
| Verificação periódica de integridade em lote | apenas verificação sob demanda |
| Rotação automatizada de assinatura | não implementada |
| Gestão administrativa de políticas e holds | backend parcial; interface administrativa ausente |

## 8. Arquitetura SaaS e comercialização

### 8.1 Multi-tenant e permissões

`organizationId` existe em alguns schemas, mas o isolamento efetivo continua centrado no `userId` proprietário e frequentemente usa o próprio UID como organização.

Falta:

- entidade de organização/tenant;
- associação de usuários, pacientes e documentos ao tenant;
- convites e gestão de membros;
- papéis como proprietário, profissional, secretaria, auditor e DPO;
- autorização backend e Rules por papel e escopo;
- caminhos de Storage e auditoria com isolamento organizacional;
- testes de vazamento entre tenants.

### 8.2 Assinaturas e faturamento

Não há integração de cobrança recorrente.

Falta:

- gateway de pagamento;
- catálogo de planos e preços;
- checkout e portal de cobrança;
- webhooks idempotentes;
- inadimplência, período de tolerância e reativação;
- notas fiscais conforme a operação escolhida;
- upgrade, downgrade e cancelamento;
- trilha de eventos financeiros sem misturar dados clínicos.

### 8.3 Cotas por plano

Existe proteção de uso de IA para o plano demo, mas falta um sistema geral de entitlement para:

- pacientes ativos;
- armazenamento e tamanho total de anexos;
- chamadas/créditos de IA;
- usuários por organização;
- funcionalidades premium;
- bloqueios e mensagens coerentes em backend e frontend.

## 9. Operação, segurança e continuidade

Falta preparar:

- backups automáticos e política de retenção dos backups;
- testes periódicos de restauração e plano de disaster recovery;
- monitoramento de APIs, filas, scanner, Storage e erros de integridade;
- alertas de segurança e auditoria sem conteúdo clínico;
- inventário e rotação de segredos;
- MFA ou política de autenticação reforçada para perfis privilegiados;
- gestão de incidentes e resposta a vazamento;
- ambientes separados de desenvolvimento, homologação e produção;
- revisão de criptografia de campos clínicos além da criptografia gerenciada do provedor;
- testes de segurança e revisão independente antes do go-live.

## 10. UX, acessibilidade e operação em campo

Pendências recomendadas:

- auditoria WCAG 2.2 AA de contraste, foco, teclado e leitor de tela;
- correção do possível overflow móvel do login;
- testes reais dos diálogos de documentos em telas pequenas;
- indicador de conectividade e estratégia offline segura;
- tratamento explícito de conflitos de sincronização;
- onboarding guiado;
- mensagens de recuperação para scanner, upload e integridade;
- padronização visual das telas administrativas futuras.

Offline clínico exige modelagem de segurança e conflito; não deve ser acrescentado apenas como cache local simples.

## 11. Documentação a revisar

Alguns documentos representam fotografias históricas e estão desatualizados em relação ao código atual.

Falta atualizar:

- `docs/backend-contracts.md` com a 6C;
- `docs/user_guide.md` e os geradores do guia, especialmente a exclusão de paciente;
- `docs/upload_documentos.md`, que ainda descreve regras e limites antigos;
- relatórios 6A/6B para apontar claramente as capacidades entregues depois;
- matriz de ambientes, segredos e deploy;
- runbook de scanner, HMAC, retenção, legal hold e recuperação;
- changelog/release notes da versão que incluir a 6C.

## 12. Ordem recomendada de execução

### Fase 1 — Fechar a entrega atual

1. revisar, commitar e publicar a Etapa 6C;
2. atualizar o PR e aguardar o CI;
3. corrigir documentação central contraditória;
4. incluir Storage Rules e `diff --check` no CI.

### Fase 2 — Homologação segura

1. preparar ambiente de homologação isolado;
2. integrar scanner real e HMAC no cofre de segredos;
3. cadastrar políticas de retenção fictícias;
4. executar E2E documental e Home Care autenticado;
5. corrigir achados de responsividade e acessibilidade.

### Fase 3 — Governança e etapa documental seguinte

1. substituir exclusão direta de paciente;
2. implementar direitos do titular e fluxo de descarte;
3. concluir administração de retenção/legal hold;
4. adicionar limpeza de quarentena, integridade periódica e observabilidade;
5. implementar apenas as capacidades documentais futuras aprovadas no backlog.

### Fase 4 — Comercialização

1. multi-tenant e RBAC;
2. billing, webhooks e entitlements;
3. backup/DR e monitoramento produtivo;
4. revisão jurídica e de segurança independente;
5. piloto controlado antes da abertura comercial.

## 13. Veredito

Não há falha crítica conhecida nas suítes locais atuais da Etapa 6C. O que impede declarar o sistema pronto para produção não é a quantidade de testes unitários, mas a ausência de configuração operacional real, governança de retenção/descarte, scanner produtivo, homologação visual completa, isolamento multi-tenant e controles comerciais.

Nenhum dado de produção foi consultado ou alterado para produzir este relatório. Nenhuma implantação, migração, publicação, commit ou push foi executado nesta análise.
