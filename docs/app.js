const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SPREADSHEET_ID;

// ===================== Estado =====================
let accessToken = null;
let currentUser = null;
let tokenClient = null;

let categoriasRows = [];   // [{row, vals:[categoria, area]}]
let centrosRows = [];      // [{row, vals:[nome, tipo, area, ativo]}]
let fornecedoresRows = []; // [{row, vals:[nome, categoriaPrincipal, telefone, obs]}]

let despesasRows = [];
let despesasFiltradas = [];
let despesasGridPage = 0;
const DESPESAS_PAGE_SIZE = 20;
let editingDespesaRow = null;
let categoriaEditIndex = null;
let centroEditIndex = null;
let fornecedorEditIndex = null;

let sheetIdsCache = null;
let chartCentroRef, chartCategoriaRef, chartFornecedorRef, chartMensalRef;

// ===================== Utilitários =====================
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function formatarDataBR(isoDate) {
  if (!isoDate) return '';
  const [ano, mes, dia] = isoDate.split('-');
  return dia + '/' + mes + '/' + ano;
}

function formatarValorBR(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseValorBR(str) {
  if (str === undefined || str === null || str === '') return 0;
  if (typeof str === 'number') return str;
  const limpo = String(str).replace(/[^\d,.-]/g, '');
  const semMilhar = limpo.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(semMilhar);
  return isNaN(n) ? 0 : n;
}

function parseDataBR(str) {
  if (!str) return null;
  const partes = String(str).split('/');
  if (partes.length !== 3) return null;
  const d = Number(partes[0]), m = Number(partes[1]), a = Number(partes[2]);
  if (!d || !m || !a) return null;
  return new Date(a, m - 1, d);
}

function paraInputDate(dataBR) {
  const d = parseDataBR(dataBR);
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatarDataExibicao(d) {
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

// ===================== Autenticação Google =====================
function initGoogleAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/spreadsheets email profile openid',
    callback: onTokenReceived,
  });

  document.getElementById('googleBtn').innerHTML =
    '<button type="button" id="btnEntrar" style="background:#2f6b3f;color:#fff;border:none;padding:12px 22px;border-radius:8px;font-size:1rem;cursor:pointer;">Entrar com Google</button>';
  document.getElementById('btnEntrar').addEventListener('click', function () {
    tokenClient.requestAccessToken();
  });
}

async function onTokenReceived(response) {
  if (response.error) {
    showLoginError('Não foi possível entrar: ' + response.error);
    return;
  }
  accessToken = response.access_token;

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const userInfo = await userInfoRes.json();

  if (!CONFIG.ALLOWED_EMAILS.includes(userInfo.email)) {
    showLoginError('A conta ' + userInfo.email + ' não tem permissão para usar este site.');
    accessToken = null;
    return;
  }

  currentUser = userInfo;
  onLoginSuccess();
}

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function onLoginSuccess() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userBox').classList.remove('hidden');
  document.getElementById('mainNav').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.name || currentUser.email;
  document.getElementById('fData').valueAsDate = new Date();

  await Promise.all([carregarCategorias(), carregarCentros(), carregarFornecedores()]);
  popularSelectsFormulario('f', true);
  switchView('dashboard');
}

document.getElementById('btnLogout').addEventListener('click', function () {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, function () {});
  accessToken = null;
  currentUser = null;
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('mainNav').classList.add('hidden');
  document.getElementById('userBox').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
});

window.addEventListener('load', initGoogleAuth);

// ===================== Navegação =====================
const TITULOS_VIEW = {
  dashboard: 'Dashboard',
  lancamentos: 'Nova despesa',
  despesas: 'Despesas',
  centros: 'Centros de Custo',
  fornecedores: 'Fornecedores',
};

function switchView(view) {
  document.querySelectorAll('.view').forEach(function (v) { v.classList.add('hidden'); });
  document.getElementById('view-' + view).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
  document.getElementById('pageTitle').textContent = TITULOS_VIEW[view] || '';

  if (view === 'despesas') carregarDespesasGrid();
  if (view === 'centros') carregarCentros();
  if (view === 'fornecedores') carregarFornecedores();
  if (view === 'dashboard') carregarDashboard();
}

document.querySelectorAll('.nav-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { switchView(btn.dataset.view); });
});

document.querySelectorAll('.subnav-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.subnav-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.subview').forEach(function (v) { v.classList.add('hidden'); });
    document.getElementById('sub-' + btn.dataset.sub).classList.remove('hidden');
  });
});

// ===================== Sheets API =====================
async function sheetsGet(range) {
  const url = SHEETS_API + '/values/' + encodeURIComponent(range);
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (!res.ok) throw new Error('Erro ao ler ' + range + ': ' + res.status);
  const data = await res.json();
  return data.values || [];
}

async function sheetsAppend(range, row) {
  const url = SHEETS_API + '/values/' + encodeURIComponent(range) +
    ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) throw new Error('Erro ao salvar: ' + await res.text());
}

async function sheetsUpdateRow(sheetName, rowNumber, values) {
  const lastCol = colLetter(values.length);
  const range = sheetName + '!A' + rowNumber + ':' + lastCol + rowNumber;
  const url = SHEETS_API + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED';
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error('Erro ao atualizar: ' + await res.text());
}

async function getSheetId(sheetName) {
  if (!sheetIdsCache) {
    const res = await fetch(SHEETS_API + '?fields=sheets.properties', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const data = await res.json();
    sheetIdsCache = {};
    data.sheets.forEach(function (s) { sheetIdsCache[s.properties.title] = s.properties.sheetId; });
  }
  return sheetIdsCache[sheetName];
}

async function sheetsDeleteRow(sheetName, rowNumber1Based) {
  const sheetId = await getSheetId(sheetName);
  const idx0 = rowNumber1Based - 1;
  const res = await fetch(SHEETS_API + ':batchUpdate', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ deleteDimension: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: idx0, endIndex: idx0 + 1 } } }],
    }),
  });
  if (!res.ok) throw new Error('Erro ao excluir: ' + await res.text());
}

// ===================== Opções compartilhadas (dropdowns) =====================
function opcoesCentros(somenteAtivos) {
  const lista = somenteAtivos ? centrosRows.filter(function (r) { return (r.vals[3] || '').trim().toLowerCase() === 'sim'; }) : centrosRows;
  return lista.map(function (r) { return '<option value="' + escapeHtml(r.vals[0]) + '">' + escapeHtml(r.vals[0]) + '</option>'; }).join('');
}

function opcoesCategorias() {
  const porArea = {};
  categoriasRows.forEach(function (r) {
    const area = r.vals[1] || 'Outras';
    porArea[area] = porArea[area] || [];
    porArea[area].push(r.vals[0]);
  });
  return Object.keys(porArea).map(function (area) {
    const opts = porArea[area].map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');
    return '<optgroup label="' + escapeHtml(area) + '">' + opts + '</optgroup>';
  }).join('');
}

function opcoesFormaPagamento() {
  return CONFIG.FORMAS_PAGAMENTO.map(function (f) { return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + '</option>'; }).join('');
}

function popularSelectsFormulario(prefixo, somenteAtivos) {
  document.getElementById(prefixo + 'CentroCusto').innerHTML = opcoesCentros(somenteAtivos);
  document.getElementById(prefixo + 'Categoria').innerHTML = opcoesCategorias();
  document.getElementById(prefixo + 'FormaPagamento').innerHTML = opcoesFormaPagamento();
}

function popularSelectComOpcoes(selectEl, opcoesHtml, textoTodos) {
  selectEl.innerHTML = '<option value="">' + textoTodos + '</option>' + opcoesHtml;
}

// ===================== Lançamentos (novo + recentes) =====================
document.getElementById('formDespesa').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const btn = document.getElementById('btnSalvar');
  const msg = document.getElementById('formMsg');
  btn.disabled = true;
  msg.classList.add('hidden');

  try {
    const row = [
      formatarDataBR(document.getElementById('fData').value),
      document.getElementById('fCentroCusto').value,
      document.getElementById('fCategoria').value,
      document.getElementById('fDescricao').value,
      document.getElementById('fFornecedor').value,
      document.getElementById('fFormaPagamento').value,
      formatarValorBR(document.getElementById('fValor').value),
      document.getElementById('fStatus').value,
      formatarDataBR(document.getElementById('fVencimento').value),
      document.getElementById('fObservacoes').value,
      currentUser.name || currentUser.email,
      document.getElementById('fNumeroNF').value,
    ];

    await sheetsAppend(CONFIG.SHEETS.despesas + '!A4:L', row);

    msg.textContent = 'Despesa lançada com sucesso.';
    msg.className = 'success';
    msg.classList.remove('hidden');

    document.getElementById('formDespesa').reset();
    document.getElementById('fData').valueAsDate = new Date();
  } catch (e) {
    msg.textContent = 'Erro ao lançar despesa: ' + e.message;
    msg.className = 'error';
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

// ===================== Despesas: grid editável =====================
async function carregarDespesasGrid() {
  const dados = await sheetsGet(CONFIG.SHEETS.despesas + '!A4:L5000');
  despesasRows = dados.map(function (vals, i) { return { row: i + 4, vals: vals }; }).filter(function (r) { return r.vals[0]; });

  popularSelectComOpcoes(document.getElementById('filtroCentro'), opcoesCentros(false), 'Todos os Centros de Custo');
  popularSelectComOpcoes(document.getElementById('filtroCategoria'), opcoesCategorias(), 'Todas as Categorias');

  aplicarFiltrosDespesas();
}

function aplicarFiltrosDespesas() {
  const centro = document.getElementById('filtroCentro').value;
  const categoria = document.getElementById('filtroCategoria').value;
  const status = document.getElementById('filtroStatus').value;
  const busca = document.getElementById('filtroBusca').value.trim().toLowerCase();
  const soFaltaClassificar = document.getElementById('filtroFaltaClassificar').checked;

  despesasFiltradas = despesasRows.filter(function (item) {
    const v = item.vals;
    if (centro && v[1] !== centro) return false;
    if (categoria && v[2] !== categoria) return false;
    if (status && v[7] !== status) return false;
    if (soFaltaClassificar && v[1] && v[2]) return false;
    if (busca) {
      const alvo = ((v[3] || '') + ' ' + (v[4] || '')).toLowerCase();
      if (alvo.indexOf(busca) === -1) return false;
    }
    return true;
  }).slice().reverse();

  despesasGridPage = 0;
  renderDespesasGrid();
}

['filtroCentro', 'filtroCategoria', 'filtroStatus', 'filtroFaltaClassificar'].forEach(function (id) {
  document.getElementById(id).addEventListener('change', aplicarFiltrosDespesas);
});
document.getElementById('filtroBusca').addEventListener('input', aplicarFiltrosDespesas);

function renderDespesasGrid() {
  const inicio = despesasGridPage * DESPESAS_PAGE_SIZE;
  const pagina = despesasFiltradas.slice(inicio, inicio + DESPESAS_PAGE_SIZE);
  const tbody = document.querySelector('#tabelaDespesasGrid tbody');
  tbody.innerHTML = pagina.map(function (item) {
    const v = item.vals;
    const faltaClassificar = !v[1] || !v[2];
    return '<tr class="' + (faltaClassificar ? 'row-atencao' : '') + '">' +
      '<td>' + escapeHtml(v[0]) + '</td>' +
      '<td>' + escapeHtml(v[1] || '') + '</td>' +
      '<td>' + escapeHtml(v[2] || '') + '</td>' +
      '<td>' + escapeHtml(v[3] || '') + '</td>' +
      '<td>' + escapeHtml(v[4] || '') + '</td>' +
      '<td>' + escapeHtml(v[11] || '') + '</td>' +
      '<td>R$ ' + escapeHtml(v[6] || '') + '</td>' +
      '<td>' + escapeHtml(v[7] || '') + (faltaClassificar ? ' <span class="tag-classificar">Falta classificar</span>' : '') + '</td>' +
      '<td class="table-actions">' +
      '<button type="button" onclick="abrirEdicaoDespesa(' + item.row + ')">Editar</button>' +
      '<button type="button" class="danger" onclick="excluirDespesa(' + item.row + ')">Excluir</button>' +
      '</td></tr>';
  }).join('') || '<tr><td colspan="8">Nenhum lançamento encontrado.</td></tr>';

  const total = despesasFiltradas.length;
  const fim = Math.min(inicio + DESPESAS_PAGE_SIZE, total);
  document.getElementById('despesasGridInfo').textContent = total ? ('Mostrando ' + (inicio + 1) + '–' + fim + ' de ' + total) : 'Nenhum lançamento encontrado.';
  document.getElementById('btnDespesasAnterior').disabled = despesasGridPage === 0;
  document.getElementById('btnDespesasProxima').disabled = fim >= total;
}

document.getElementById('btnDespesasAnterior').addEventListener('click', function () {
  if (despesasGridPage > 0) { despesasGridPage--; renderDespesasGrid(); }
});
document.getElementById('btnDespesasProxima').addEventListener('click', function () {
  despesasGridPage++; renderDespesasGrid();
});

function abrirEdicaoDespesa(rowNumber) {
  const item = despesasRows.find(function (r) { return r.row === rowNumber; });
  if (!item) return;
  editingDespesaRow = rowNumber;
  const v = item.vals;

  popularSelectsFormulario('e', false);
  document.getElementById('eData').value = paraInputDate(v[0]);
  document.getElementById('eCentroCusto').value = v[1] || '';
  document.getElementById('eCategoria').value = v[2] || '';
  document.getElementById('eDescricao').value = v[3] || '';
  document.getElementById('eFornecedor').value = v[4] || '';
  document.getElementById('eFormaPagamento').value = v[5] || '';
  document.getElementById('eValor').value = parseValorBR(v[6]);
  document.getElementById('eStatus').value = v[7] || 'Pago';
  document.getElementById('eVencimento').value = paraInputDate(v[8]);
  document.getElementById('eObservacoes').value = v[9] || '';
  document.getElementById('eNumeroNF').value = v[11] || '';

  document.getElementById('painelEditarDespesa').classList.remove('hidden');
  document.getElementById('painelEditarDespesa').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('btnCancelarEdicao').addEventListener('click', function () {
  editingDespesaRow = null;
  document.getElementById('painelEditarDespesa').classList.add('hidden');
});

async function excluirDespesa(rowNumber) {
  const item = despesasRows.find(function (r) { return r.row === rowNumber; });
  if (!item) return;
  const descricao = item.vals[3] || '(sem descrição)';
  if (!confirm('Excluir o lançamento "' + descricao + '" no valor de R$ ' + escapeHtml(item.vals[6] || '') + '? Essa ação não pode ser desfeita pelo site (mas o histórico de versões da planilha no Google Sheets ainda guarda o registro).')) return;
  await sheetsDeleteRow(CONFIG.SHEETS.despesas, rowNumber);
  if (editingDespesaRow === rowNumber) {
    editingDespesaRow = null;
    document.getElementById('painelEditarDespesa').classList.add('hidden');
  }
  await carregarDespesasGrid();
}

document.getElementById('formEditarDespesa').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  if (!editingDespesaRow) return;
  const msg = document.getElementById('editMsg');
  try {
    const linhaOriginal = despesasRows.find(function (r) { return r.row === editingDespesaRow; }).vals;
    const values = [
      formatarDataBR(document.getElementById('eData').value),
      document.getElementById('eCentroCusto').value,
      document.getElementById('eCategoria').value,
      document.getElementById('eDescricao').value,
      document.getElementById('eFornecedor').value,
      document.getElementById('eFormaPagamento').value,
      formatarValorBR(document.getElementById('eValor').value),
      document.getElementById('eStatus').value,
      formatarDataBR(document.getElementById('eVencimento').value),
      document.getElementById('eObservacoes').value,
      linhaOriginal[10] || (currentUser.name || currentUser.email),
      document.getElementById('eNumeroNF').value,
    ];
    await sheetsUpdateRow(CONFIG.SHEETS.despesas, editingDespesaRow, values);
    editingDespesaRow = null;
    document.getElementById('painelEditarDespesa').classList.add('hidden');
    await carregarDespesasGrid();
  } catch (e) {
    msg.textContent = 'Erro ao salvar: ' + e.message;
    msg.className = 'error';
    msg.classList.remove('hidden');
  }
});

// ===================== Categorias (cadastro) =====================
async function carregarCategorias() {
  const dados = await sheetsGet(CONFIG.SHEETS.categorias + '!A4:B1000');
  categoriasRows = dados.map(function (vals, i) { return { row: i + 4, vals: vals }; }).filter(function (r) { return r.vals[0]; });
  renderCategoriasTable();
  popularDatalistAreas();
}

function renderCategoriasTable() {
  const tbody = document.querySelector('#tabelaCategorias tbody');
  tbody.innerHTML = categoriasRows.map(function (item, idx) {
    if (idx === categoriaEditIndex) {
      return '<tr>' +
        '<td><input type="text" id="editCatNome" value="' + escapeHtml(item.vals[0]) + '"></td>' +
        '<td><input type="text" id="editCatArea" value="' + escapeHtml(item.vals[1] || '') + '" list="listaAreas"></td>' +
        '<td class="table-actions">' +
        '<button type="button" onclick="salvarEdicaoCategoria(' + idx + ')">Salvar</button>' +
        '<button type="button" onclick="cancelarEdicaoCategoria()">Cancelar</button>' +
        '</td></tr>';
    }
    return '<tr>' +
      '<td>' + escapeHtml(item.vals[0]) + '</td>' +
      '<td>' + escapeHtml(item.vals[1] || '') + '</td>' +
      '<td class="table-actions">' +
      '<button type="button" onclick="editarCategoria(' + idx + ')">Editar</button>' +
      '<button type="button" class="danger" onclick="excluirCategoria(' + idx + ')">Excluir</button>' +
      '</td></tr>';
  }).join('') || '<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>';
}

function popularDatalistAreas() {
  const areas = Array.from(new Set(categoriasRows.map(function (r) { return r.vals[1]; }).filter(Boolean)));
  document.getElementById('listaAreas').innerHTML = areas.map(function (a) { return '<option value="' + escapeHtml(a) + '"></option>'; }).join('');
}

function editarCategoria(idx) { categoriaEditIndex = idx; renderCategoriasTable(); }
function cancelarEdicaoCategoria() { categoriaEditIndex = null; renderCategoriasTable(); }

async function salvarEdicaoCategoria(idx) {
  const item = categoriasRows[idx];
  const novoNome = document.getElementById('editCatNome').value.trim();
  const novaArea = document.getElementById('editCatArea').value.trim();
  if (!novoNome) return;
  await sheetsUpdateRow(CONFIG.SHEETS.categorias, item.row, [novoNome, novaArea]);
  categoriaEditIndex = null;
  await carregarCategorias();
}

async function excluirCategoria(idx) {
  const item = categoriasRows[idx];
  if (!confirm('Excluir a categoria "' + item.vals[0] + '"? Isso não altera lançamentos já feitos.')) return;
  await sheetsDeleteRow(CONFIG.SHEETS.categorias, item.row);
  await carregarCategorias();
}

document.getElementById('formNovaCategoria').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const nome = document.getElementById('novaCategoriaNome').value.trim();
  const area = document.getElementById('novaCategoriaArea').value.trim();
  if (!nome) return;
  await sheetsAppend(CONFIG.SHEETS.categorias + '!A4:B', [nome, area]);
  document.getElementById('formNovaCategoria').reset();
  await carregarCategorias();
});

// ===================== Centros de Custo (cadastro) =====================
async function carregarCentros() {
  const dados = await sheetsGet(CONFIG.SHEETS.centrosCusto + '!A4:D1000');
  centrosRows = dados.map(function (vals, i) { return { row: i + 4, vals: vals }; }).filter(function (r) { return r.vals[0]; });
  renderCentrosTable();
  popularDatalistTipos();
}

function renderCentrosTable() {
  const tbody = document.querySelector('#tabelaCentros tbody');
  tbody.innerHTML = centrosRows.map(function (item, idx) {
    const ativo = (item.vals[3] || '').trim().toLowerCase() === 'sim';
    if (idx === centroEditIndex) {
      return '<tr>' +
        '<td><input type="text" id="editCentroNome" value="' + escapeHtml(item.vals[0]) + '"></td>' +
        '<td><input type="text" id="editCentroTipo" value="' + escapeHtml(item.vals[1] || '') + '" list="listaTipos"></td>' +
        '<td><input type="number" id="editCentroArea" value="' + escapeHtml(item.vals[2] || '') + '" step="0.1" min="0"></td>' +
        '<td><input type="checkbox" id="editCentroAtivo" ' + (ativo ? 'checked' : '') + '></td>' +
        '<td class="table-actions">' +
        '<button type="button" onclick="salvarEdicaoCentro(' + idx + ')">Salvar</button>' +
        '<button type="button" onclick="cancelarEdicaoCentro()">Cancelar</button>' +
        '</td></tr>';
    }
    return '<tr>' +
      '<td>' + escapeHtml(item.vals[0]) + '</td>' +
      '<td>' + escapeHtml(item.vals[1] || '') + '</td>' +
      '<td>' + escapeHtml(item.vals[2] || '') + '</td>' +
      '<td>' + (ativo ? 'Sim' : 'Não') + '</td>' +
      '<td class="table-actions">' +
      '<button type="button" onclick="editarCentro(' + idx + ')">Editar</button>' +
      '<button type="button" class="danger" onclick="excluirCentro(' + idx + ')">Excluir</button>' +
      '</td></tr>';
  }).join('') || '<tr><td colspan="5">Nenhum centro de custo cadastrado.</td></tr>';
}

function popularDatalistTipos() {
  const tipos = Array.from(new Set(centrosRows.map(function (r) { return r.vals[1]; }).filter(Boolean)));
  document.getElementById('listaTipos').innerHTML = tipos.map(function (t) { return '<option value="' + escapeHtml(t) + '"></option>'; }).join('');
}

function editarCentro(idx) { centroEditIndex = idx; renderCentrosTable(); }
function cancelarEdicaoCentro() { centroEditIndex = null; renderCentrosTable(); }

async function salvarEdicaoCentro(idx) {
  const item = centrosRows[idx];
  const nome = document.getElementById('editCentroNome').value.trim();
  const tipo = document.getElementById('editCentroTipo').value.trim();
  const area = document.getElementById('editCentroArea').value.trim();
  const ativo = document.getElementById('editCentroAtivo').checked ? 'Sim' : 'Não';
  if (!nome) return;
  await sheetsUpdateRow(CONFIG.SHEETS.centrosCusto, item.row, [nome, tipo, area, ativo]);
  centroEditIndex = null;
  await carregarCentros();
}

async function excluirCentro(idx) {
  const item = centrosRows[idx];
  if (!confirm('Excluir o centro de custo "' + item.vals[0] + '"? Isso não altera lançamentos já feitos.')) return;
  await sheetsDeleteRow(CONFIG.SHEETS.centrosCusto, item.row);
  await carregarCentros();
}

document.getElementById('formNovoCentro').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const nome = document.getElementById('novoCentroNome').value.trim();
  const tipo = document.getElementById('novoCentroTipo').value.trim();
  const area = document.getElementById('novoCentroArea').value.trim();
  const ativo = document.getElementById('novoCentroAtivo').checked ? 'Sim' : 'Não';
  if (!nome) return;
  await sheetsAppend(CONFIG.SHEETS.centrosCusto + '!A4:D', [nome, tipo, area, ativo]);
  document.getElementById('formNovoCentro').reset();
  document.getElementById('novoCentroAtivo').checked = true;
  await carregarCentros();
});

// ===================== Fornecedores (cadastro) =====================
async function carregarFornecedores() {
  const dados = await sheetsGet(CONFIG.SHEETS.fornecedores + '!A4:D1000');
  fornecedoresRows = dados.map(function (vals, i) { return { row: i + 4, vals: vals }; }).filter(function (r) { return r.vals[0]; });
  renderFornecedoresTable();
}

function renderFornecedoresTable() {
  const tbody = document.querySelector('#tabelaFornecedores tbody');
  tbody.innerHTML = fornecedoresRows.map(function (item, idx) {
    if (idx === fornecedorEditIndex) {
      return '<tr>' +
        '<td><input type="text" id="editFornNome" value="' + escapeHtml(item.vals[0]) + '"></td>' +
        '<td><input type="text" id="editFornCategoria" value="' + escapeHtml(item.vals[1] || '') + '"></td>' +
        '<td><input type="text" id="editFornTelefone" value="' + escapeHtml(item.vals[2] || '') + '"></td>' +
        '<td><input type="text" id="editFornObs" value="' + escapeHtml(item.vals[3] || '') + '"></td>' +
        '<td class="table-actions">' +
        '<button type="button" onclick="salvarEdicaoFornecedor(' + idx + ')">Salvar</button>' +
        '<button type="button" onclick="cancelarEdicaoFornecedor()">Cancelar</button>' +
        '</td></tr>';
    }
    return '<tr>' +
      '<td>' + escapeHtml(item.vals[0]) + '</td>' +
      '<td>' + escapeHtml(item.vals[1] || '') + '</td>' +
      '<td>' + escapeHtml(item.vals[2] || '') + '</td>' +
      '<td>' + escapeHtml(item.vals[3] || '') + '</td>' +
      '<td class="table-actions">' +
      '<button type="button" onclick="editarFornecedor(' + idx + ')">Editar</button>' +
      '<button type="button" class="danger" onclick="excluirFornecedor(' + idx + ')">Excluir</button>' +
      '</td></tr>';
  }).join('') || '<tr><td colspan="5">Nenhum fornecedor cadastrado.</td></tr>';
}

function editarFornecedor(idx) { fornecedorEditIndex = idx; renderFornecedoresTable(); }
function cancelarEdicaoFornecedor() { fornecedorEditIndex = null; renderFornecedoresTable(); }

async function salvarEdicaoFornecedor(idx) {
  const item = fornecedoresRows[idx];
  const nome = document.getElementById('editFornNome').value.trim();
  const categoria = document.getElementById('editFornCategoria').value.trim();
  const telefone = document.getElementById('editFornTelefone').value.trim();
  const obs = document.getElementById('editFornObs').value.trim();
  if (!nome) return;
  await sheetsUpdateRow(CONFIG.SHEETS.fornecedores, item.row, [nome, categoria, telefone, obs]);
  fornecedorEditIndex = null;
  await carregarFornecedores();
}

async function excluirFornecedor(idx) {
  const item = fornecedoresRows[idx];
  if (!confirm('Excluir o fornecedor "' + item.vals[0] + '"?')) return;
  await sheetsDeleteRow(CONFIG.SHEETS.fornecedores, item.row);
  await carregarFornecedores();
}

document.getElementById('formNovoFornecedor').addEventListener('submit', async function (ev) {
  ev.preventDefault();
  const nome = document.getElementById('novoFornecedorNome').value.trim();
  const categoria = document.getElementById('novoFornecedorCategoria').value.trim();
  const telefone = document.getElementById('novoFornecedorTelefone').value.trim();
  const obs = document.getElementById('novoFornecedorObs').value.trim();
  if (!nome) return;
  await sheetsAppend(CONFIG.SHEETS.fornecedores + '!A4:D', [nome, categoria, telefone, obs]);
  document.getElementById('formNovoFornecedor').reset();
  await carregarFornecedores();
});

// ===================== Dashboard =====================
async function carregarDashboard() {
  popularSelectComOpcoes(document.getElementById('dashCentro'), opcoesCentros(false), 'Todos os Centros de Custo');

  if (!document.getElementById('dashDataInicio').value) {
    const hoje = new Date();
    const inicioAno = new Date(hoje.getFullYear(), 0, 1);
    document.getElementById('dashDataInicio').value = paraInputDateObj(inicioAno);
    document.getElementById('dashDataFim').value = paraInputDateObj(hoje);
  }

  await atualizarDashboard();
}

function paraInputDateObj(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

document.getElementById('btnAplicarFiltroDash').addEventListener('click', atualizarDashboard);

async function atualizarDashboard() {
  const dados = await sheetsGet(CONFIG.SHEETS.despesas + '!A4:L5000');
  const validas = dados.filter(function (r) { return r[0]; });

  const dataInicioStr = document.getElementById('dashDataInicio').value;
  const dataFimStr = document.getElementById('dashDataFim').value;
  const centroFiltro = document.getElementById('dashCentro').value;

  const inicio = dataInicioStr ? new Date(dataInicioStr + 'T00:00:00') : null;
  const fim = dataFimStr ? new Date(dataFimStr + 'T23:59:59') : null;

  const filtradas = validas.filter(function (r) {
    if (centroFiltro && r[1] !== centroFiltro) return false;
    const d = parseDataBR(r[0]);
    if (inicio && d && d < inicio) return false;
    if (fim && d && d > fim) return false;
    return true;
  });

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  let totalLancado = 0, totalPago = 0, totalPendente = 0, totalVencido = 0;
  const pendentes = [];

  filtradas.forEach(function (r) {
    const valor = parseValorBR(r[6]);
    totalLancado += valor;
    if (r[7] === 'Pago') totalPago += valor;
    if (r[7] === 'Pendente') {
      totalPendente += valor;
      const venc = parseDataBR(r[8]);
      if (venc && venc < hoje) totalVencido += valor;
      pendentes.push({ data: venc, descricao: r[3], fornecedor: r[4], valor: valor });
    }
  });

  document.getElementById('kpiTotalLancado').textContent = 'R$ ' + formatarValorBR(totalLancado);
  document.getElementById('kpiTotalPago').textContent = 'R$ ' + formatarValorBR(totalPago);
  document.getElementById('kpiTotalPendente').textContent = 'R$ ' + formatarValorBR(totalPendente);
  document.getElementById('kpiTotalVencido').textContent = 'R$ ' + formatarValorBR(totalVencido);

  pendentes.sort(function (a, b) { return (a.data || new Date(9999, 0, 1)) - (b.data || new Date(9999, 0, 1)); });
  renderTabelaVencimentos(pendentes.slice(0, 15), hoje);

  const porCentro = agregarTopN(filtradas, 1, 8);
  const porCategoria = agregarTopN(filtradas, 2, 8);
  const porFornecedor = agregarTopN(filtradas, 4, 8);

  chartCentroRef = renderBarChart('chartCentro', chartCentroRef, porCentro.labels, porCentro.valores, '#2f6b3f');
  chartCategoriaRef = renderBarChart('chartCategoria', chartCategoriaRef, porCategoria.labels, porCategoria.valores, '#2a78d6');
  chartFornecedorRef = renderBarChart('chartFornecedor', chartFornecedorRef, porFornecedor.labels, porFornecedor.valores, '#eb6834');

  const baseMensal = centroFiltro ? validas.filter(function (r) { return r[1] === centroFiltro; }) : validas;
  const porMes = agregarPorMes(baseMensal, 12);
  chartMensalRef = renderMonthlyChart('chartMensal', chartMensalRef, porMes.labels, porMes.valores);
}

function renderTabelaVencimentos(lista, hoje) {
  const tbody = document.querySelector('#tabelaVencimentos tbody');
  tbody.innerHTML = lista.map(function (item) {
    const atrasado = item.data && item.data < hoje;
    const dataStr = item.data ? formatarDataExibicao(item.data) : '(sem data)';
    return '<tr class="' + (atrasado ? 'row-atrasado' : '') + '">' +
      '<td>' + escapeHtml(dataStr) + '</td>' +
      '<td>' + escapeHtml(item.descricao || '') + '</td>' +
      '<td>' + escapeHtml(item.fornecedor || '') + '</td>' +
      '<td>R$ ' + formatarValorBR(item.valor) + '</td>' +
      '<td>' + (atrasado ? '<span class="tag-atrasado">Atrasado</span>' : '<span class="tag-avencer">A vencer</span>') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="5">Nenhuma pendência no período.</td></tr>';
}

function agregarTopN(rows, campoIndex, n) {
  const mapa = {};
  rows.forEach(function (r) {
    const chave = r[campoIndex] || '(não classificado)';
    mapa[chave] = (mapa[chave] || 0) + parseValorBR(r[6]);
  });
  const entradas = Object.keys(mapa).map(function (k) { return [k, mapa[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  const top = entradas.slice(0, n);
  const resto = entradas.slice(n).reduce(function (s, e) { return s + e[1]; }, 0);
  if (resto > 0) top.push(['Outros', resto]);
  return { labels: top.map(function (e) { return e[0]; }), valores: top.map(function (e) { return e[1]; }) };
}

function agregarPorMes(rows, numMeses) {
  const hoje = new Date();
  const buckets = [];
  for (let i = numMeses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    buckets.push({ ano: d.getFullYear(), mes: d.getMonth(), total: 0 });
  }
  rows.forEach(function (r) {
    const d = parseDataBR(r[0]);
    if (!d) return;
    const bucket = buckets.find(function (b) { return b.ano === d.getFullYear() && b.mes === d.getMonth(); });
    if (bucket) bucket.total += parseValorBR(r[6]);
  });
  const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return {
    labels: buckets.map(function (b) { return nomesMes[b.mes] + '/' + String(b.ano).slice(2); }),
    valores: buckets.map(function (b) { return b.total; }),
  };
}

function renderBarChart(canvasId, existingRef, labels, values, color) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (existingRef) existingRef.destroy();
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (ctx) { return 'R$ ' + formatarValorBR(ctx.raw); } } },
      },
      scales: {
        x: { grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } },
        y: { grid: { display: false }, ticks: { color: '#52514e' } },
      },
    },
  });
}

function renderMonthlyChart(canvasId, existingRef, labels, values) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (existingRef) existingRef.destroy();
  return new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: '#2a78d6', borderRadius: 4, maxBarThickness: 36 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (ctx) { return 'R$ ' + formatarValorBR(ctx.raw); } } },
      },
      scales: {
        y: { grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } },
        x: { grid: { display: false }, ticks: { color: '#52514e' } },
      },
    },
  });
}

// ===================== Autocomplete de Fornecedor =====================
function configurarAutocompleteFornecedor(inputId, dropdownId) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  function render() {
    const termo = input.value.trim().toLowerCase();
    const nomes = fornecedoresRows
      .map(function (r) { return r.vals[0]; })
      .filter(function (nome) { return nome && (!termo || nome.toLowerCase().indexOf(termo) !== -1); });

    dropdown.innerHTML = nomes.length
      ? nomes.map(function (nome) { return '<div class="autocomplete-item">' + escapeHtml(nome) + '</div>'; }).join('')
      : '<div class="autocomplete-empty">Nenhum fornecedor cadastrado ainda — digite o nome livremente.</div>';
    dropdown.classList.remove('hidden');
  }

  input.addEventListener('focus', render);
  input.addEventListener('input', render);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') dropdown.classList.add('hidden');
  });

  dropdown.addEventListener('mousedown', function (ev) {
    const item = ev.target.closest('.autocomplete-item');
    if (!item) return;
    ev.preventDefault();
    input.value = item.textContent;
    dropdown.classList.add('hidden');
  });

  document.addEventListener('click', function (ev) {
    if (ev.target !== input && !dropdown.contains(ev.target)) dropdown.classList.add('hidden');
  });
}

configurarAutocompleteFornecedor('fFornecedor', 'fFornecedorDropdown');
configurarAutocompleteFornecedor('eFornecedor', 'eFornecedorDropdown');
