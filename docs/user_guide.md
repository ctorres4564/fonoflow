# Guia do Usuário e Manual de Operação - FonoFlow 📖

O **FonoFlow** é um sistema completo e inteligente de gestão clínica de fonoaudiologia home care e consultórios. Este guia detalha todas as funcionalidades da plataforma, desde os fluxos operacionais legados até os recursos avançados de Inteligência Artificial, Prontuário, Agenda e o novo **Supervisor Seguro de Evoluções (Fase 4.1+)**.

---

## 🚀 Como acessar e navegar

Acesse o sistema pelo link homologado:
🔗 **[https://fonoflow.vercel.app](https://fonoflow.vercel.app)**

No menu lateral esquerdo, você encontrará as seções fundamentais:
*   **Dashboard**: Resumo dos seus indicadores, aniversariantes do dia, alertas e gráficos estatísticos semanais.
*   **Pacientes**: Cadastro geral dos seus clientes, anamnese e acesso à ficha de prontuário.
*   **Agenda**: Lista cronológica de sessões e disparador de confirmações rápidas via WhatsApp.

---

## 📊 1. Painel de Controle (Dashboard)

O painel inicial resume o seu volume de trabalho e fornece insights automáticos em tempo real:
*   **Cards de Estatísticas**: Exibem a quantidade de pacientes ativos, sessões estimadas para a semana e status geral de tratamentos.
*   **Alertas Clínicos**: Notificações automáticas caso algum paciente faça aniversário hoje ou se ele já atingiu/excedeu o limite estimado de sessões contratadas no prontuário.
*   **Consultas da Semana**: Um gráfico de barras dinâmico consolidando quantos atendimentos você tem marcados em cada dia da semana (de Segunda a Sábado).
*   **Distribuição de Consultas**: Proporção em tempo real de sessões agendadas divididas pelas categorias *Terapia*, *Avaliação* ou *Retorno*.

---

## 👥 2. Gestão de Pacientes

Na aba **Pacientes**, você gerencia as pessoas sob seus cuidados de forma centralizada:
*   **Cadastrar**: Clique em `+ Novo Paciente` e preencha as informações necessárias (nome, telefone, endereço de atendimento domiciliar, sessões semanais e totais estimadas/contratadas).
*   **Editar**: Atualize dados de contato, reajuste endereços clínicos ou renove pacotes de sessões contratadas.
*   **Excluir**: Remove permanentemente o paciente e todos os seus históricos clínicos associados (requer atenção).
*   **Upload de Documentos**: No perfil de cada paciente, você pode arrastar ou selecionar arquivos (PDF, imagens, laudos médicos, exames audiométricos) para armazenamento na nuvem associado de forma segura ao prontuário.

---

## 📅 3. Agenda & Lembretes no WhatsApp

A aba **Agenda** organiza a rotina de visitas domiciliares ou em consultório:
*   **Calendário Mensal**: Visualize quais dias possuem consultas com marcações visuais e clique no dia para ver os compromissos detalhados.
*   **Agendar**: Clique em `+ Novo Agendamento` para marcar o paciente, data, hora, tipo de sessão (Terapia, Avaliação, Retorno) e status inicial.
*   **Lembrete por WhatsApp 💬**: No card da consulta ou na lista geral, clique em **Lembrete 💬** para abrir o WhatsApp Web ou o app móvel com uma mensagem personalizada pré-formatada:
    > *"Olá! Confirmamos o atendimento domiciliar de [Nome do Paciente] no dia [Data] às [Hora]. Estarei aí no horário combinado!"*
*   **Lista Geral de Agendamentos**: Na parte inferior da tela, consulte todos os compromissos cadastrados de forma cronológica com campo de pesquisa por nome do paciente e botões de atalho rápido.

---

## 📝 4. Registro de Evoluções & Supervisor de Qualidade (Fase 4.1+)

Ao clicar em **Evolução** na linha de um paciente, o modal de prontuário se abre com todas as ferramentas de registro clínico:

### Fluxo Inteligente com Supervisor de Evoluções e Quality Review
Se o seu perfil clínico estiver com a funcionalidade ativada pelo administrador (`features.evolutionQualityReview === true`), a sua evolução passará por um fluxo seguro com validação estrutural no backend:

1.  **Chave de Idempotência Estável**: O FonoFlow gera uma assinatura única automática no momento da abertura do modal de registro. Isso impede que instabilidades de internet, cliques duplos ou cliques seguidos de "Registrar" dupliquem a evolução clínica ou cobrem duas sessões do paciente.
2.  **Ditado por Voz 🎙️**: Clique em **Ditar 🎙️** e fale o progresso clínico. O sistema transcreve a fala nativamente no campo de notas.
3.  **Melhorar Notas com IA ✨**: Escreva anotações informais (ex: *"sopro bom hoje, cansou na metade"*) e clique em **Melhorar notas ✨**. A IA clínico-assistente reescreverá a evolução no padrão técnico formal fonoaudiológico.
4.  **Vinculação à Agenda**: Se a evolução originou-se de um atendimento marcado na agenda, a finalização marcará a consulta correspondente como `Realizado` de forma atômica no banco de dados.
5.  **Contabilização Inteligente**: Você escolhe se deseja descontar a sessão do saldo contratado do paciente (`incrementSession = true` ou `false`). Se ativado, a sessão é debitada e a evolução é registrada. Se a flag de qualidade de revisão identificar alertas, a sessão é gravada e o relatório de qualidade correspondente é vinculado de forma imutável em `/qualityReviews` para auditoria clínica.

### Fluxo Legado (Usuários Comuns)
Se você não possui a flag de revisão ativa no perfil, as evoluções continuam sendo escritas e criadas localmente e de forma rápida no Firestore, mantendo a compatibilidade e a simplicidade.

---

## 🔬 5. Anamnese de Avaliação & Exercícios com IA

Na segunda aba do Prontuário, você acessa a ficha histórica e de anamnese:
*   **Análise de Progresso com IA 📈**: O sistema faz a leitura histórica de todas as evoluções clínicas anteriores daquele paciente e gera um parecer de evolução estruturado com as principais evoluções identificadas e as condutas clínicas sugeridas.
*   **Sugerir Exercícios com IA 🎯**: Preencha as queixas iniciais e clique no botão para que a inteligência artificial formule exercícios clínicos e lúdicos personalizados para a faixa etária do paciente, indicando atividades para treino domiciliar.

---

## 🖨️ 6. Impressão de Prontuário em PDF

No topo do Prontuário de cada paciente, há o atalho **Imprimir Prontuário 🖨️**:
1.  Clique no botão para abrir uma página limpa formatada especificamente para impressão em folha A4.
2.  A folha exibida compilará de forma elegante os dados cadastrais do paciente, a ficha de anamnese completa e o histórico cronológico de todas as evoluções clínicas acompanhadas de assinatura.
3.  Utilize o comando padrão de impressão do navegador (`Ctrl + P` ou `Cmd + P`) e marque a opção **Salvar como PDF** para gerar ou imprimir o documento.

---

## 🛡️ 7. Segurança, Limites e Idempotência

O sistema possui regras rígidas para proteger a confidencialidade e estabilidade clínica:
*   **Rate Limiting**: Há um limite de até 10 requisições de finalização por minuto por profissional para garantir a estabilidade do servidor e proteção contra ataques. Ao atingir o limite, a mensagem amigável *"Muitas solicitações de finalização. Tente novamente em X segundos."* será mostrada.
*   **Segurança de Escrita**: Profissionais têm acesso e privilégios restritos apenas aos prontuários e pacientes sob seus próprios cuidados, garantindo isolamento total de dados.
*   **Trilha de Auditoria**: Qualquer alteração, inclusão ou finalização clínica gera registros criptografados de auditoria em `/auditLogs` sob o Admin SDK.
