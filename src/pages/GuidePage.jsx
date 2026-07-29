import { useState } from 'react'
import { branding } from '../config/branding'

function GuidePage() {
  const [activeSection, setActiveSection] = useState('intro')

  const sections = [
    {
      id: 'intro',
      title: `1. Introdução ao ${branding.productName} 🚀`,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            O <strong>{branding.productName}</strong> é uma plataforma moderna do ecossistema {branding.suiteName}, desenvolvida especificamente para fonoaudiólogos, focada na gestão prática de atendimentos domiciliares (home care). O sistema centraliza dados de pacientes, histórico de prontuários, agendamentos semanais e conta com uma inteligência artificial assistente.
          </p>
          <div className="rounded-xl bg-plum-50/50 dark:bg-plum-950/20 p-4 border border-plum-100 dark:border-plum-900/60">
            <h4 className="text-xs font-bold text-plum-800 dark:text-plum-300 uppercase tracking-wider mb-2">Principais Diferenciais</h4>
            <ul className="space-y-2 text-xs text-noble-750 dark:text-noble-300 font-medium">
              <li className="flex items-start gap-2">
                <span>🏠</span>
                <span><strong>Atendimento Domiciliar:</strong> Todo o fluxo de mensagens e prontuários adaptado para profissionais que atendem em home care.</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🎙️</span>
                <span><strong>Ditado Clínico por Voz:</strong> Transcreva o andamento da sessão por voz sem precisar digitar.</span>
              </li>
              <li className="flex items-start gap-2">
                <span>✨</span>
                <span><strong>Refinamento Profissional com IA:</strong> Converta notas rápidas em relatórios clínicos formais com um clique.</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'dashboard',
      title: '2. Painel de Controle (Dashboard) 📊',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            O Dashboard fornece uma visão resumida em tempo real das suas atividades clínicas:
          </p>
          <ul className="space-y-3 text-xs text-noble-700 dark:text-noble-300">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span><strong>Cards de Métricas:</strong> Veja o total de pacientes cadastrados, pacientes ativos, tratamentos concluídos e o volume de sessões marcadas para a semana atual.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span><strong>Alertas Clínicos:</strong> Notificações inteligentes que avisam se hoje é aniversário de algum paciente ou se ele já esgotou a quantidade de sessões do pacote contratado.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">✓</span>
              <span><strong>Gráficos de Análise:</strong> Gráfico de barras semanais (Segunda a Sábado) e gráfico de barras horizontais indicando a distribuição das sessões por categoria (Terapia, Avaliação, Retorno).</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'patients',
      title: '3. Gestão de Pacientes 👥',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            Na seção de <strong>Pacientes</strong>, você pode gerenciar todos os cadastros e acessar os prontuários individuais:
          </p>
          <ul className="space-y-3 text-xs text-noble-700 dark:text-noble-300">
            <li>
              <strong>Adicionar Pacientes:</strong> Clique em <code>+ Novo Paciente</code>. Insira o nome, dados do responsável (se aplicável), endereço domiciliar para o atendimento, telefone para contato e o número de sessões estimadas para o tratamento.
            </li>
            <li>
              <strong>Prontuário Clínico:</strong> Na tabela, clique em <code>Evolução</code> para acessar o histórico clínico, ficha de anamnese e ferramentas de Inteligência Artificial do paciente.
            </li>
            <li>
              <strong>Remover:</strong> Clique no botão vermelho <code>Excluir</code> na linha do paciente desejado para deletar o registro do banco de dados de forma definitiva.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'agenda',
      title: '4. Agenda & Lembretes no WhatsApp 📅',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            A aba de <strong>Agenda</strong> ajuda a organizar as visitas domiciliares de forma cronológica e centralizada:
          </p>
          <ul className="space-y-3 text-xs text-noble-700 dark:text-noble-300">
            <li>
              <strong>Calendário Mensal:</strong> Visualize quais dias possuem consultas marcadas (indicadas por um ponto roxo) e clique em qualquer data para listar seus compromissos no painel direito.
            </li>
            <li>
              <strong>Agendar:</strong> Clique em <code>+ Novo Agendamento</code> para agendar o paciente, data, horário e categoria da sessão.
            </li>
            <li>
              <strong>Lembrete por WhatsApp 💬:</strong> Clique em <code>Lembrete 💬</code> em qualquer agendamento para abrir o WhatsApp Web ou o app móvel com o texto de confirmação de home care estruturado automaticamente.
            </li>
            <li>
              <strong>Lista Geral de Agendamentos (Histórico):</strong> Na parte inferior da tela da Agenda, consulte a tabela cronológica geral. Pesquise seus pacientes pelo nome ou tipo e use as ações de <code>Lembrete 💬</code>, <code>Editar</code> ou <code>Desmarcar</code> diretamente nas linhas do histórico.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'ai',
      title: '5. Prontuários & Inteligência Artificial (DeepSeek) 🤖',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            O Prontuário possui recursos inteligentes de IA integrados à API do OpenRouter utilizando o modelo <strong>DeepSeek</strong>:
          </p>
          <ul className="space-y-3 text-xs text-noble-700 dark:text-noble-300">
            <li>
              🎙️ <strong>Ditado Clínico (Aba Evoluções):</strong> Clique no botão <code>Ditar 🎙️</code> e fale. O navegador captará o seu microfone e transcreverá suas falas em tempo real no campo de anotações.
            </li>
            <li>
              ✨ <strong>Melhorar Notas (Aba Evoluções):</strong> Escreva anotações rápidas e desestruturadas e clique em <code>Melhorar notas ✨</code>. A IA reescreverá a evolução clínica com termos técnicos formais fonoaudiológicos.
            </li>
            <li>
              📈 <strong>Análise de Progresso (Aba Evoluções):</strong> Clique no botão <code>Análise com IA 📈</code> no topo do histórico. O DeepSeek avaliará todas as sessões anteriores e gerará um parecer clínico estruturado sobre o progresso e condutas terapêuticas recomendadas.
            </li>
            <li>
              🎯 <strong>Gerador de Exercícios (Aba Anamnese):</strong> Digite a queixa na ficha do paciente e clique em <code>Sugerir Exercícios com IA 🎯</code>. A IA sugerirá exercícios e jogos lúdicos para os pais ou paciente realizarem em ambiente doméstico.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'print',
      title: '6. Relatório e Impressão em PDF 🖨️',
      content: (
        <div className="space-y-4">
          <p className="text-sm text-noble-700 dark:text-noble-300 leading-relaxed">
            Para gerar documentos formais para encaminhamentos médicos ou arquivos físicos:
          </p>
          <ul className="space-y-3 text-xs text-noble-700 dark:text-noble-300">
            <li>
              Clique em <code>Imprimir Prontuário 🖨️</code> no cabeçalho do Prontuário do paciente.
            </li>
            <li>
              O {branding.productName} abrirá uma página limpa formatada para folha A4 contendo os dados cadastrais, a anamnese completa, o histórico detalhado de sessões ordenadas e o rodapé contendo o espaço para assinatura e carimbo do fonoaudiólogo.
            </li>
            <li>
              Para salvar em arquivo digital, utilize a funcionalidade de impressão do próprio navegador (teclas <code>Ctrl + P</code>) e escolha a opção **"Salvar como PDF"**.
            </li>
          </ul>
        </div>
      )
    }
  ]

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-noble-800 dark:text-noble-100">Guia de Uso</h2>
          <p className="text-sm text-noble-500 dark:text-noble-400">Manual interativo para consulta rápida das funcionalidades.</p>
        </div>
        <a
          href="/docs/Guia_do_Usuario_FonoFlow.pdf"
          download="Guia_do_Usuario_FonoFlow.pdf"
          className="inline-flex items-center justify-center rounded-xl bg-plum-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-plum-700"
        >
          Baixar PDF do Guia ⬇️
        </a>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {/* Menu Esquerdo do Guia */}
        <div className="flex flex-col gap-1 md:col-span-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`text-left rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                activeSection === section.id
                  ? 'bg-plum-100 text-plum-900 dark:bg-plum-950/40 dark:text-plum-300'
                  : 'text-noble-650 hover:bg-noble-100 dark:text-noble-400 dark:hover:bg-noble-800'
              }`}
            >
              {section.title.split(' ')[1] || section.title}
            </button>
          ))}
        </div>

        {/* Detalhe da Seção Ativa */}
        <div className="rounded-2xl border border-noble-200 dark:border-noble-800 bg-white dark:bg-noble-900 p-6 md:col-span-3 shadow-card transition-colors duration-200">
          <h3 className="text-base font-bold text-noble-800 dark:text-noble-100 mb-4 pb-2 border-b border-noble-100 dark:border-noble-850">
            {sections.find((s) => s.id === activeSection)?.title}
          </h3>
          {sections.find((s) => s.id === activeSection)?.content}
        </div>
      </div>
    </div>
  )
}

export default GuidePage
