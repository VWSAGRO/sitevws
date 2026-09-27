const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SPREADSHEET_ID;

let accessToken = null;
let currentUser = null;
let tokenClient = null;

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

function onLoginSuccess() {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  document.getElementById('userBox').classList.remove('hidden');
  document.getElementById('userName').textContent = currentUser.name || currentUser.email;

  document.getElementById('fData').valueAsDate = new Date();

  carregarListas();
  carregarRecentes();
}

document.getElementById('btnLogout').addEventListener('click', function () {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, function () {});
  }
  accessToken = null;
  currentUser = null;
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('userBox').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
});

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
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Erro ao salvar: ' + err);
  }
}

async function carregarListas() {
  const s = CONFIG.SHEETS;

  const formaSel = document.getElementById('fFormaPagamento');
  formaSel.innerHTML = CONFIG.FORMAS_PAGAMENTO.map(function (f) {
    return '<option value="' + f + '">' + f + '</option>';
  }).join('');

  try {
    const centros = await sheetsGet(s.centrosCusto + '!A4:D1000');
    const centroSel = document.getElementById('fCentroCusto');
    centroSel.innerHTML = centros
      .filter(function (r) { return r[0] && (r[3] || '').trim().toLowerCase() === 'sim'; })
      .map(function (r) { return '<option value="' + r[0] + '">' + r[0] + '</option>'; })
      .join('');
  } catch (e) { console.error(e); }

  try {
    const categorias = await sheetsGet(s.categorias + '!A4:B1000');
    const catSel = document.getElementById('fCategoria');
    const porArea = {};
    categorias.forEach(function (r) {
      if (!r[0]) return;
      const area = r[1] || 'Outras';
      porArea[area] = porArea[area] || [];
      porArea[area].push(r[0]);
    });
    catSel.innerHTML = Object.keys(porArea).map(function (area) {
      const opts = porArea[area].map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
      return '<optgroup label="' + area + '">' + opts + '</optgroup>';
    }).join('');
  } catch (e) { console.error(e); }

  try {
    const fornecedores = await sheetsGet(s.fornecedores + '!A4:A1000');
    const listEl = document.getElementById('listaFornecedores');
    listEl.innerHTML = fornecedores
      .filter(function (r) { return r[0]; })
      .map(function (r) { return '<option value="' + r[0] + '"></option>'; })
      .join('');
  } catch (e) { console.error(e); }
}

function formatarDataBR(isoDate) {
  if (!isoDate) return '';
  const [ano, mes, dia] = isoDate.split('-');
  return dia + '/' + mes + '/' + ano;
}

function formatarValorBR(valor) {
  return Number(valor).toFixed(2).replace('.', ',');
}

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
    ];

    await sheetsAppend(CONFIG.SHEETS.despesas + '!A4:K', row);

    msg.textContent = 'Despesa lançada com sucesso.';
    msg.className = 'success';
    msg.classList.remove('hidden');

    document.getElementById('formDespesa').reset();
    document.getElementById('fData').valueAsDate = new Date();
    carregarRecentes();
  } catch (e) {
    msg.textContent = 'Erro ao lançar despesa: ' + e.message;
    msg.className = 'error';
    msg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

async function carregarRecentes() {
  try {
    const linhas = await sheetsGet(CONFIG.SHEETS.despesas + '!A4:K5000');
    const validas = linhas.filter(function (r) { return r[0]; });
    const ultimas = validas.slice(-10).reverse();
    const tbody = document.querySelector('#tabelaRecentes tbody');
    tbody.innerHTML = ultimas.map(function (r) {
      return '<tr>' +
        ['0', '1', '2', '3', '4', '6', '7', '10'].map(function (i) {
          return '<td>' + (r[i] || '') + '</td>';
        }).join('') +
        '</tr>';
    }).join('');
  } catch (e) { console.error(e); }
}

document.getElementById('btnAtualizar').addEventListener('click', carregarRecentes);

window.addEventListener('load', initGoogleAuth);
