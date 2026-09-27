# Controle de Despesas da Fazenda — Guia de configuração

Arquitetura: site estático (GitHub Pages) que fala direto com a sua planilha
via Google Sheets API, autenticado com "Entrar com Google". As notas fiscais
são processadas por um Google Apps Script que roda dentro da própria planilha
(sem custo, sem servidor separado) e usa a API da Claude para extrair os dados.

A segurança de quem pode gravar despesas depende do compartilhamento da
planilha — não de senha nenhuma. Por isso o passo 1 é o mais importante.

---

## 1. Restrinja o acesso à planilha

1. Abra a planilha e clique em **Compartilhar**.
2. Garanta que **não** está como "Qualquer pessoa com o link pode editar".
3. Adicione, como **Editor**, apenas as contas Google (Gmail ou Google
   Workspace) das pessoas que vão lançar despesas — inclusive a sua.

Só quem estiver nessa lista conseguirá salvar dados pelo site, mesmo que o
código do site seja público no GitHub.

## 2. Crie o Client ID do Google (login "Entrar com Google")

1. Acesse [console.cloud.google.com](https://console.cloud.google.com/) e
   crie um projeto novo (ou use um existente).
2. Vá em **APIs e Serviços > Tela de consentimento OAuth**. Escolha "Externo",
   preencha nome do app e seu e-mail. Em "Usuários de teste" (ou publique o
   app se preferir), adicione as mesmas contas do passo 1.
3. Ative a **Google Sheets API** em "APIs e Serviços > Biblioteca".
4. Vá em **Credenciais > Criar credenciais > ID do cliente OAuth**, tipo
   "Aplicativo da Web".
5. Em **Origens JavaScript autorizadas**, adicione:
   - `https://SEU-USUARIO.github.io` (a URL do seu GitHub Pages)
   - `http://localhost:5500` (ou outra porta, só para testar localmente)
6. Copie o **Client ID** gerado.

## 3. Preencha o `site/config.js`

Abra `site/config.js` e preencha:
- `GOOGLE_CLIENT_ID`: o Client ID do passo 2.
- `ALLOWED_EMAILS`: lista das contas Google autorizadas (as mesmas do passo 1).

`SPREADSHEET_ID` já está preenchido com o ID da sua planilha atual.

## 4. Publique no GitHub Pages

```bash
git init
git add .
git commit -m "Site de controle de despesas"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

No GitHub: **Settings > Pages > Branch: main**, pasta `/site` (ou mova o
conteúdo de `site/` para a raiz do repositório, como preferir). Depois de
alguns minutos o site estará em `https://SEU-USUARIO.github.io/SEU-REPO/`.

> Importante: se o repositório for público, o código-fonte fica visível —
> mas como não há senha nenhuma no código (só o Client ID, que é público por
> natureza), isso não é um problema de segurança. Não coloque chaves de API
> nesses arquivos do site.

## 5. Crie a pasta de notas fiscais no Drive

1. Crie uma pasta no Google Drive (ex: "Notas Fiscais - Fazenda"), na mesma
   conta/Drive da planilha.
2. Abra a pasta e copie o ID que aparece na URL:
   `https://drive.google.com/drive/folders/AQUI_ESTA_O_ID`

## 6. Consiga uma chave da API da Claude (Anthropic)

1. Acesse [console.anthropic.com](https://console.anthropic.com/) e crie uma
   API key.
2. Guarde essa chave — você vai colocá-la no Apps Script, nunca no site.

## 7. Configure o Apps Script

1. Abra a planilha, vá em **Extensões > Apps Script**.
2. Cole o conteúdo de `apps-script/ProcessarNotasFiscais.gs`.
3. No topo do script, preencha `PASTA_NOTAS_ID` com o ID do passo 5.
4. Vá em **Configurações do projeto** (ícone de engrenagem) > **Propriedades
   do script** > adicione a propriedade `ANTHROPIC_API_KEY` com a chave do
   passo 6.
5. Na barra de funções, selecione `processarNotasFiscais` e clique em
   **Executar** uma vez, para autorizar o acesso ao Drive e à planilha
   (o Google vai pedir para você confirmar as permissões).
6. Vá em **Gatilhos** (ícone de relógio, menu lateral) > **Adicionar
   gatilho**: função `processarNotasFiscais`, evento "Baseado em tempo",
   por exemplo "Timer de horas" a cada 1 hora.

A partir daí, qualquer PDF ou imagem (JPG/PNG/WEBP/HEIC) que você salvar
naquela pasta será lido automaticamente: o script extrai data, fornecedor,
valor e descrição, lança uma linha na aba **Despesas** com uma observação
"⚠ Falta classificar" (Centro de Custo, Categoria e Status ficam em branco
para você preencher), e move o arquivo para a subpasta **Processadas**.

## 8. Teste

1. Abra o site publicado, faça login com uma das contas autorizadas.
2. Lance uma despesa de teste e confira se apareceu na planilha.
3. Coloque um PDF ou foto de nota fiscal na pasta do Drive e, no Apps
   Script, execute `processarNotasFiscais` manualmente para testar sem
   esperar o gatilho.

---

### Por que essa arquitetura

- **GitHub Pages é hospedagem estática** — não tem banco de dados nem
  servidor, então "login com senha" não teria como ser seguro sem um backend.
  "Entrar com Google" resolve isso sem precisar de servidor.
- A extração automática das notas fiscais usa a **API da Claude** (Anthropic)
  porque ela lê tanto PDF quanto imagem e devolve os campos já estruturados;
  o Apps Script é quem chama essa API — o site nunca vê essa chave.
- Deixei Centro de Custo, Categoria e Status em branco nos lançamentos
  automáticos de propósito, para você fazer só a classificação, como pediu.
