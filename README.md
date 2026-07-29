# FonoSuite Space — Gestão clínica para fonoaudiologia (MVP - Fase 1)

O **FonoSuite Space** é uma plataforma especializada em gestão clínica de pacientes de fonoaudiologia, pertencente ao ecossistema **FonoSuite**. Esta é apenas uma mudança de marca e apresentação: repositório, projeto Firebase, banco de dados, regras de segurança e URL técnica permanecem exatamente os mesmos.

Aplicação web construída com **React + Vite + Tailwind CSS + Firebase** para gestão clínica de pacientes de fonoaudiologia.

## Funcionalidades implementadas

* ✅ Autenticação completa com Firebase Authentication

  * Login

  * Cadastro

  * Recuperação de senha

* ✅ Proteção de rotas para usuários autenticados

* ✅ Dashboard com estatísticas

  * Total de pacientes

  * Sessões previstas da semana

  * Pacientes ativos

  * Tratamentos finalizados

* ✅ CRUD completo de pacientes

* ✅ Pesquisa por **nome** e **telefone**

* ✅ Controle de tratamento

  * Sessões contratadas

  * Sessões realizadas

  * Sessões restantes (cálculo automático)

* ✅ Menu lateral responsivo

* ✅ Feedback visual de ações (loading, sucesso, erro)

* ✅ Validação de formulários

* ✅ Interface profissional com Tailwind CSS

* ✅ Paleta visual personalizada:

  * Roxo ameixa: `#6B4C7A`

  * Dourado suave: `#D4AF37`

  * Cinza escuro nobre: `#2C2C2C`

---

## Tecnologias

* React 19

* Vite

* Tailwind CSS

* Firebase Authentication

* Firebase Firestore

* React Router

* React Hot Toast

---

## Como rodar o projeto localmente

```bash
npm install
npm run dev
```

Depois abra o endereço exibido no terminal (geralmente `http://localhost:5173`).

---

## Configuração do Firebase

### 1) Criar projeto no Firebase

1. Acesse: [https://console.firebase.google.com/](https://console.firebase.google.com/)

2. Clique em **Adicionar projeto**

3. Crie um projeto (sem Analytics, se preferir)

### 2) Ativar Authentication

1. No menu do Firebase, acesse **Authentication**

2. Clique em **Começar**

3. Em **Sign-in method**, habilite **Email/senha**

### 3) Criar Firestore Database

1. Vá em **Firestore Database**

2. Clique em **Criar banco de dados**

3. Inicie em modo de produção

4. Escolha a região mais próxima

### 4) Configurar app Web

1. Em **Configurações do projeto** > **Seus apps**

2. Clique em **Web** (`</>`)

3. Registre o app

4. Copie as credenciais

### 5) Variáveis de ambiente

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env
```

1. Preencha o `.env` com as credenciais do seu Firebase:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## Regras de segurança do Firestore

O arquivo `firestore.rules` contém regras para que cada usuário autenticado só leia/escreva seus próprios pacientes.

### Publicar regras

No Firebase Console:

1. Firestore Database > **Regras**

2. Cole o conteúdo de `firestore.rules`

3. Clique em **Publicar**

---

## Estrutura principal

```text
src/
  components/
    common/
    layout/
    patients/
  contexts/
  firebase/
  pages/
  routes/
  services/
  utils/
```

---

## Deploy na Vercel

### Opção 1: via GitHub (recomendado)

1. Suba o projeto no GitHub

2. Acesse [https://vercel.com/new](https://vercel.com/new)

3. Importe o repositório

4. Configure as variáveis de ambiente da Vercel (as mesmas do `.env`)

5. Deploy

### Opção 2: via CLI

```bash
npm i -g vercel
vercel
```

Depois configure as variáveis de ambiente no painel da Vercel.

---

## Observações

* Este projeto é o MVP da Fase 1.

* Como o banco é em nuvem (Firestore), os dados persistem entre sessões.

* Recomenda-se usar HTTPS em produção e revisar continuamente regras de segurança.