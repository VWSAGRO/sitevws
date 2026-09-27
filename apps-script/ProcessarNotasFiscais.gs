// Cole este script em Extensões > Apps Script (aberto a partir da própria planilha).
// Preencha PASTA_NOTAS_ID abaixo e configure a propriedade ANTHROPIC_API_KEY
// em Configurações do projeto > Propriedades do script. Veja SETUP.md.

const SPREADSHEET_ID = '1IAGCDZAUUnM5dMNjMM5Iw-LwOYFDOx6JMjt0OLjG3E8';
const PASTA_NOTAS_ID = 'COLOQUE_AQUI_O_ID_DA_PASTA_DE_NOTAS_FISCAIS';
const NOME_ABA_DESPESAS = 'Despesas';
const NOME_SUBPASTA_PROCESSADAS = 'Processadas';
const ANTHROPIC_MODEL = 'claude-opus-5';

const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function processarNotasFiscais() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Configure a propriedade ANTHROPIC_API_KEY em Configurações do projeto > Propriedades do script.');
  }

  const pasta = DriveApp.getFolderById(PASTA_NOTAS_ID);
  const pastaProcessadas = obterOuCriarSubpasta(pasta, NOME_SUBPASTA_PROCESSADAS);
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const abaDespesas = planilha.getSheetByName(NOME_ABA_DESPESAS);

  const arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    const arquivo = arquivos.next();
    if (TIPOS_ACEITOS.indexOf(arquivo.getMimeType()) === -1) continue;

    try {
      const dados = extrairDadosComClaude(arquivo, apiKey);
      lancarDespesa(abaDespesas, arquivo, dados);
      arquivo.moveTo(pastaProcessadas);
      Logger.log('Processado: ' + arquivo.getName());
    } catch (erro) {
      Logger.log('Erro ao processar "' + arquivo.getName() + '": ' + erro);
    }
  }
}

function obterOuCriarSubpasta(pastaPai, nome) {
  const existentes = pastaPai.getFoldersByName(nome);
  if (existentes.hasNext()) return existentes.next();
  return pastaPai.createFolder(nome);
}

function extrairDadosComClaude(arquivo, apiKey) {
  const blob = arquivo.getBlob();
  const mimeType = blob.getContentType();
  const base64 = Utilities.base64Encode(blob.getBytes());
  const tipoBloco = mimeType === 'application/pdf' ? 'document' : 'image';

  const prompt = 'Você recebeu uma nota fiscal ou recibo de despesa de uma propriedade rural. ' +
    'Extraia os dados e responda SOMENTE com um JSON estrito (sem markdown, sem texto antes ou depois), ' +
    'no formato exato: {"data":"DD/MM/AAAA","fornecedor":"...","valor":0.00,"descricao":"...","numero_nf":"..."}. ' +
    'Use "" (string vazia) nos campos que não conseguir identificar com confiança. ' +
    'O campo "valor" deve ser o valor total pago, apenas número, com ponto como separador decimal. ' +
    'O campo "numero_nf" é o número da nota fiscal impresso no documento (ex: "12345"), sem o texto "NF" ou "Nº".';

  const payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: [
        { type: tipoBloco, source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  };

  const resposta = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const codigo = resposta.getResponseCode();
  if (codigo !== 200) {
    throw new Error('Erro da API Claude (' + codigo + '): ' + resposta.getContentText());
  }

  const corpo = JSON.parse(resposta.getContentText());
  const texto = corpo.content
    .filter(function (bloco) { return bloco.type === 'text'; })
    .map(function (bloco) { return bloco.text; })
    .join('');
  const jsonLimpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(jsonLimpo);
}

function lancarDespesa(aba, arquivo, dados) {
  aba.appendRow([
    dados.data || '',
    '',
    '',
    dados.descricao || ('Nota fiscal: ' + arquivo.getName()),
    dados.fornecedor || '',
    '',
    dados.valor || '',
    '',
    '',
    '⚠ Falta classificar (Centro de Custo, Categoria, Status). Arquivo: ' + arquivo.getUrl(),
    'Automático (Claude)',
    dados.numero_nf || '',
  ]);
}
