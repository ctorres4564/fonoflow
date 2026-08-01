# Relatório de homologação funcional — Módulo Home Care

**Data:** 1º de agosto de 2026
**Ambiente:** repositório local `C:\fonoflow`, Firebase Emulator Suite com projeto fictício `demo-fonoflow` e servidor Vite local.
**Resultado atualizado:** **CORREÇÕES CRÍTICAS IMPLEMENTADAS E VALIDADAS; HOMOLOGAÇÃO VISUAL AUTENTICADA AINDA PENDENTE.**

## 1. Sumário executivo

A suíte automatizada disponível está estável: 262 testes principais, 53 testes de Firestore Rules e 4 testes de backend com emuladores foram aprovados. Build, lint e integridade do diff também foram executados com sucesso.

Isso, porém, não é suficiente para homologar funcionalmente o módulo. A tentativa real de abrir `/home-care` no servidor local produziu tela vazia em desktop, tablet e celular porque o Firebase Auth é inicializado com configuração ausente/inválida. O frontend também não possui uma opção local para conectar Auth e Firestore aos emuladores. Usar a configuração remota existente contrariaria a proibição de dados de produção.

Foi identificada ainda uma inconsistência arquitetural crítica: `transitionHomeCareVisit()` atualiza primeiro a agenda por `transitionAppointmentStatus()` e somente depois atualiza `homeCareVisit/current` em outra transação. Uma falha entre essas operações pode deixar agenda/saldo concluídos e visita operacional não concluída. Portanto, a atomicidade exigida não foi comprovada.

Nenhuma funcionalidade foi alterada nesta tarefa.

## 2. Ambiente, dados e isolamento

- O Firebase Emulator Suite confirmou o uso do projeto demonstrativo `demo-fonoflow`.
- Nenhum paciente, agendamento, endereço ou evolução de produção foi lido ou gravado.
- Nenhuma implantação, publicação, migração ou escrita remota foi executada.
- O servidor visual foi iniciado somente em `http://127.0.0.1:4173`.
- A ferramenta `agent-browser` indicada pelo ambiente não estava instalada no `PATH`; como alternativa, o Chrome 150 foi executado em modo headless.
- Capturas locais: `C:\tmp\home-care-desktop.png`, `C:\tmp\home-care-tablet.png` e `C:\tmp\home-care-mobile.png`.

## 3. Matriz dos cenários obrigatórios

| Cenário | Resultado esperado | Resultado observado | Evidência técnica | Situação |
|---|---|---|---|---|
| 1. Fluxo completo | Paciente e agenda fictícios percorrem todos os estados; evolução, histórico, auditoria e um débito | Componentes isolados têm testes, mas `/home-care` não renderizou no ambiente seguro; não foi possível completar o fluxo real | Tela vazia nas três capturas; `src/firebase/config.js` inicializa Auth sem conexão a emulador | **Bloqueado crítico** |
| 2. Idempotência | Repetição não duplica saldo, status ou histórico | A agenda possui teste de idempotência e histórico por `operationId`; não existe teste ponta a ponta do serviço Home Care. Agenda e visita usam transações separadas | `scheduleService.js`, `appointmentTransitions.test.js`; inspeção de `homeCareService.js` | **Falha crítica de consistência** |
| 3. Paciente ausente | Chegada → falta, observação, auditoria e zero débito | Matriz permite `arrived → patient_absent`; cálculo central não debita e Rules protegem o estado. Interface/auditoria não foram executadas ponta a ponta | Testes de transição, schemas e Rules aprovados | **Parcial** |
| 4. Cancelamento | Cancelar antes/durante deslocamento; bloquear após conclusão | Matriz permite `planned → cancelled` e `in_transit → cancelled`; estados terminais não têm saída; Rules bloqueiam alteração de visita encerrada | `homeCareVisitTransitions.test.js`; 53/53 Rules | **Aprovado no nível automatizado** |
| 5. Endereço histórico | Visita antiga preserva snapshot e nova visita usa endereço atualizado | Teste comprova prioridade do endereço alternativo, mas alteração posterior e novo agendamento não foram exercitados com persistência real | `homeCareVisit.schema.test.js` | **Parcial** |
| 6. Navegação | URLs válidas, endereço incompleto, caracteres especiais e abertura desktop/móvel | Teste de URL cobre caracteres especiais; endereço vazio retorna `null`. Abertura externa real em Maps/Waze não foi exercitada | `HomeCarePage.test.jsx`, `homeCareNavigation.js` | **Parcial** |
| 7. Alertas clínicos | Zero, um, vários e paciente V1 legíveis, sem excesso clínico | Código limita a lista aos alertas essenciais e normalizadores aceitam V1/V2. A apresentação real não pôde ser inspecionada devido à tela vazia | `HomeCarePage.jsx`, testes V1/V2 existentes | **Parcial** |
| 8. Segurança | Proprietário permitido; demais operações rejeitadas | Rules aprovam proprietário e rejeitam outro usuário, falsificação de IDs, alteração terminal e exclusão. Auditoria técnica é backend-only | 53/53 testes de Rules, incluindo 4 casos Home Care | **Aprovado no nível automatizado** |
| 9. Responsividade/usabilidade | Página utilizável em desktop, tablet e celular | Tela vazia em 1440×1000, 768×1024 e 390×844; botões, textos, mensagens e overflow não puderam ser homologados | Capturas Chrome headless em `C:\tmp` | **Falha crítica** |

## 4. Detalhamento das falhas

### HC-ACC-001 — frontend local não renderiza sem configuração Firebase válida

**Severidade:** crítica para homologação.
**Observado:** as três larguras resultaram em tela vazia.
**Causa técnica:** `src/firebase/config.js` chama `getAuth(app)` durante a carga do módulo, mas não há configuração local válida nem `connectAuthEmulator`/`connectFirestoreEmulator`. Em execução anterior da suíte de interface, a mesma condição produziu `FirebaseError: auth/invalid-api-key`.
**Impacto:** impede autenticação fictícia, acesso a `/home-care`, interação real, mensagens, evolução e inspeção responsiva.
**Correção nesta tarefa:** nenhuma, pois o pedido proíbe implementar funcionalidades.
**Recomendação:** adicionar, em tarefa separada, configuração estritamente condicionada para emuladores locais e um comando de homologação que nunca aceite projeto de produção.

### HC-ACC-002 — agenda e visita operacional não são atualizadas atomicamente

**Severidade:** crítica para integridade.
**Observado:** `transitionHomeCareVisit()` aguarda `transitionAppointmentStatus()` e depois inicia outra `runTransaction()` para atualizar `homeCareVisit/current`.
**Impacto:** uma falha de rede, Rules, parser ou processo entre as duas transações pode concluir a agenda e debitar a sessão sem concluir o documento operacional. O `operationId` protege o débito da agenda, mas não torna as duas gravações atômicas.
**Correção nesta tarefa:** nenhuma, respeitando a proibição de alterar funcionalidade.
**Recomendação:** executar a transição da agenda, contabilização, histórico e visita na mesma transação/repositório backend e adicionar teste de falha parcial.

### HC-ACC-003 — cobertura automatizada não representa o fluxo Home Care ponta a ponta

**Severidade:** alta.
**Observado:** `npm run test:emulator` executa somente os dois arquivos de finalização de evolução e totaliza quatro testes; não executa `homeCareService.js`.
**Impacto:** os resultados de emulador não comprovam criação, transições, auditoria ou idempotência da visita domiciliar real.
**Recomendação:** criar suíte de aceitação Home Care conectada a Auth/Firestore emulados, incluindo injeção de falha entre gravações.

## 5. Segurança observada

Os testes de Rules comprovaram:

- leitura e criação pelo proprietário;
- rejeição de outro usuário;
- rejeição de `userId` forjado;
- imutabilidade de `patientId` e `appointmentId`;
- bloqueio de visita encerrada;
- proibição de exclusão;
- histórico de status não editável ou removível;
- auditoria inacessível para escrita direta pelo cliente.

Os 53 testes de Rules passaram. A autenticação e interação de navegador não puderam ser repetidas no ambiente local pela falha HC-ACC-001.

## 6. Responsividade e evidência visual

| Perfil | Dimensão | Resultado |
|---|---:|---|
| Desktop | 1440 × 1000 | Tela vazia |
| Tablet | 768 × 1024 | Tela vazia |
| Celular | 390 × 844 | Tela vazia |

Não foi possível avaliar botões, rolagem horizontal, legibilidade, coerência das ações ou mensagens. Assim, responsividade não está homologada.

## 7. Resultados dos comandos obrigatórios

| Comando | Resultado | Evidência |
|---|---|---|
| `npm run lint` | Aprovado com 3 warnings preexistentes | Nenhum erro |
| `npm run build` | Aprovado | 238 módulos; maior chunk 410,22 kB; HomeCarePage 13,17 kB |
| `npm test` | Aprovado | 20 arquivos, 262/262 testes |
| `npm run test:rules` | Aprovado | 53/53 testes no projeto `demo-fonoflow` |
| `npm run test:emulator` | Aprovado | 2 arquivos, 4/4 testes |
| `git diff --check` | Aprovado | Sem erros de whitespace |

Warnings de lint:

1. `scripts/generate_commercial_plan.cjs`: `bgLight` não utilizada.
2. `scripts/set-evolution-quality-review-feature.js`: parâmetro `error` não utilizado.
3. `src/services/evolutionFinalizeService.js`: parâmetro `_` não utilizado.

## 8. Correções e testes adicionados durante a homologação

- **Correções funcionais:** nenhuma.
- **Testes adicionados:** nenhum.
- **Artefato criado:** somente este relatório de homologação.

Essa decisão respeita a instrução de não implementar novas funcionalidades. As falhas foram preservadas e documentadas para tratamento posterior.

## 9. Veredito

O módulo Home Care **não está homologado** nesta execução.

Apesar de todas as suítes existentes passarem, a homologação funcional obrigatória foi bloqueada pela tela vazia no ambiente local seguro, e a inspeção encontrou risco crítico de consistência por uso de duas transações separadas na conclusão. Não há evidência suficiente para confirmar, ponta a ponta, débito de exatamente uma sessão junto com status e histórico operacionais consistentes.

## 10. Reavaliação após correções — 1º de agosto de 2026

Após autorização expressa, os dois bloqueios críticos receberam correção:

1. `src/firebase/config.js` passou a conectar Auth e Firestore aos emuladores somente quando `VITE_USE_FIREBASE_EMULATORS=true` e somente em modo de desenvolvimento. O modo `homologation` usa exclusivamente o projeto fictício `demo-fonoflow`.
2. `transitionAppointmentStatus()` passou a aceitar uma mutação relacionada dentro do mesmo `runTransaction`. `transitionHomeCareVisit()` utiliza essa extensão para gravar visita, agenda, saldo e histórico atomicamente.
3. O replay com o mesmo `operationId` retorna resultado idempotente quando a visita já se encontra no estado final correspondente.
4. Foi adicionado `api/_lib/homeCareEmulator.test.js`, com um fluxo completo e um caso de falha injetada que comprova rollback integral.

### Novas evidências

- Fluxo Home Care no emulador: visita e agenda concluídas, exatamente uma sessão debitada, três registros de histórico da agenda e replay sem duplicação.
- Falha injetada na mutação relacionada: agenda permaneceu `Agendado`, saldo permaneceu zero e histórico não foi criado.
- `npm run test:emulator`: 3 arquivos e 6/6 testes aprovados.
- A aplicação deixou de apresentar tela vazia no modo de homologação.
- Capturas atualizadas: `C:\tmp\home-care-fixed-desktop.png`, `C:\tmp\home-care-fixed-tablet.png` e `C:\tmp\home-care-fixed-mobile.png`.

A automação autenticada completa de `/home-care` permanece pendente porque `agent-browser` não está instalado no ambiente. O Chrome headless comprovou a renderização da rota protegida e seu redirecionamento correto ao login emulado, mas não executou o preenchimento interativo do cadastro/login. A captura móvel do login também sugere recorte horizontal e deve ser verificada em uma rodada específica de UI.

### Veredito atualizado

As inconsistências críticas de ambiente e atomicidade foram resolvidas e possuem evidência automatizada. O módulo não deve ainda ser declarado integralmente homologado quanto à interface autenticada e à responsividade interna de `/home-care` até que uma ferramenta de navegador interativa execute o roteiro completo.

Uma nova rodada de homologação visual deve:

1. cadastrar e autenticar o usuário fictício no ambiente emulado agora disponível;
2. repetir os nove cenários pela interface;
3. verificar o possível overflow móvel observado no login;
4. anexar capturas autenticadas de `/home-care` em desktop, tablet e celular.

**Confirmações finais:** nenhum dado de produção foi utilizado; nenhuma implantação, migração ou gravação em produção foi executada.
