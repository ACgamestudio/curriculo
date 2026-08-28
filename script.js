
/* ---------- estado ---------- */
const S = {
  contatos: [],
  stats: {},
  sel: new Set(),
  categoria: 'Todas',
  busca: '',
  soPendentes: false,
  soNovos: false,
  curriculo: null,
  historico: [],
  maxMb: 20,
  chunk: 15,
  enviando: false,
  ultimoLote: { enviados: 0, falhas: 0 }
};

const $ = id => document.getElementById(id);

/* ---------- ponte com o Apps Script ---------- */
function call(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  return new Promise((ok, err) => {
    google.script.run
      .withSuccessHandler(ok)
      .withFailureHandler(e => err(new Error(e && e.message ? e.message : String(e))))
      [fn].apply(null, args);
  });
}

/* ---------- utilidades de UI ---------- */
function toast(msg, tipo) {
  const t = document.createElement('div');
  t.className = 'toast ' + (tipo || '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

let modalAcao = null;
function abrirModal(titulo, html, onOk, textoOk) {
  $('modalTitulo').textContent = titulo;
  $('modalCorpo').innerHTML = html;
  $('modalOk').textContent = textoOk || 'Confirmar';
  $('modalOk').classList.toggle('hidden', !onOk);
  modalAcao = onOk;
  $('overlay').classList.remove('hidden');
}
function fecharModal() { $('overlay').classList.add('hidden'); modalAcao = null; }
$('modalCancelar').onclick = fecharModal;
$('overlay').onclick = e => { if (e.target === $('overlay')) fecharModal(); };
$('modalOk').onclick = () => { const a = modalAcao; fecharModal(); if (a) a(); };

function escapar(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- tema ---------- */
function setTema(t) {
  document.body.dataset.theme = t;
  try { localStorage.setItem('cc_tema', t); } catch (e) { }
}
$('btnTheme').onclick = () => setTema(document.body.dataset.theme === 'dark' ? 'light' : 'dark');
try { setTema(localStorage.getItem('cc_tema') || 'dark'); } catch (e) { }

/* ---------- abas ---------- */
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    tab.classList.add('is-active');
    $('view-' + tab.dataset.view).classList.add('is-active');
  };
});

/* ---------- editor ---------- */
$('fCorpo').setAttribute('data-ph', 'Escreva a mensagem. Use {{nome}}, {{empresa}} e {{cargo}} para personalizar.');
document.querySelectorAll('.editor-toolbar button').forEach(b => {
  b.onmousedown = e => e.preventDefault();
  b.onclick = () => {
    if (b.dataset.cmd === 'createLink') {
      const url = prompt('Endereço do link (https://...)');
      if (url) document.execCommand('createLink', false, url);
      return;
    }
    document.execCommand(b.dataset.cmd, false, null);
    $('fCorpo').focus();
  };
});
document.querySelectorAll('.var').forEach(b => {
  b.onmousedown = e => e.preventDefault();
  b.onclick = () => {
    $('fCorpo').focus();
    document.execCommand('insertText', false, '{{' + b.dataset.var + '}}');
  };
});
$('fCorpo').addEventListener('paste', e => {
  e.preventDefault();
  document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text'));
});

/* ---------- filtros e lista ---------- */
function categorias() {
  const set = {};
  S.contatos.forEach(c => { if (c.categoria) set[c.categoria] = 1; });
  return ['Todas'].concat(Object.keys(set).sort());
}

function renderFiltros() {
  $('filtrosCategoria').innerHTML = categorias().map(c =>
    '<button class="pill' + (c === S.categoria ? ' is-active' : '') + '" data-cat="' + escapar(c) + '">' + escapar(c) + '</button>'
  ).join('');
  document.querySelectorAll('#filtrosCategoria .pill').forEach(p => {
    p.onclick = () => { S.categoria = p.dataset.cat; renderFiltros(); renderLista(); };
  });
}

function filtrados() {
  const q = S.busca.trim().toLowerCase();
  return S.contatos.filter(c => {
    if (S.categoria !== 'Todas' && c.categoria !== S.categoria) return false;
    if (S.soPendentes && c.status.toLowerCase() !== 'pendente') return false;
    if (S.soNovos && c.envios > 0) return false;
    if (q && (c.empresa + ' ' + c.email + ' ' + c.nome + ' ' + c.cargo).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}

function renderLista() {
  const lista = filtrados();
  $('lista').innerHTML = lista.length ? lista.map(c => {
    const tag = c.status.toLowerCase() === 'enviado' ? 'enviado' : (c.status.toLowerCase() === 'erro' ? 'erro' : 'pendente');
    return '<label class="item' + (S.sel.has(c.id) ? ' is-sel' : '') + '" data-id="' + c.id + '">' +
      '<input type="checkbox" ' + (S.sel.has(c.id) ? 'checked' : '') + '>' +
      '<div class="item-body">' +
      '<div class="item-top"><span class="item-empresa">' + escapar(c.empresa || '(sem empresa)') + '</span>' +
      '<span class="item-tag tag-' + tag + '">' + escapar(c.status) + '</span></div>' +
      '<div class="item-sub">' + escapar(c.email) + '</div>' +
      '<div class="item-sub">' + escapar([c.nome, c.cargo, c.categoria].filter(Boolean).join(' · ')) +
      (c.envios ? ' · ' + c.envios + 'x' : '') + '</div>' +
      '</div></label>';
  }).join('') : '<div class="empty">Nenhum contato com esses filtros.</div>';

  document.querySelectorAll('#lista .item').forEach(el => {
    el.querySelector('input').onchange = ev => {
      const id = el.dataset.id;
      if (ev.target.checked) S.sel.add(id); else S.sel.delete(id);
      el.classList.toggle('is-sel', ev.target.checked);
      renderContadores();
    };
  });
  renderContadores();
}

function renderContadores() {
  $('cTotal').textContent = S.contatos.length;
  $('cSel').textContent = S.sel.size;
  $('cEnv').textContent = S.stats.enviados || 0;
  $('cFal').textContent = S.stats.erros || 0;
  $('cPen').textContent = S.stats.pendentes || 0;
}

$('fBusca').oninput = e => { S.busca = e.target.value; renderLista(); };
$('fSoPendentes').onchange = e => { S.soPendentes = e.target.checked; renderLista(); };
$('fSoNovos').onchange = e => { S.soNovos = e.target.checked; renderLista(); };
$('btnTodos').onclick = () => { filtrados().forEach(c => S.sel.add(c.id)); renderLista(); };
$('btnNenhum').onclick = () => { S.sel.clear(); renderLista(); };

/* ---------- painel ---------- */
function renderPainel() {
  const s = S.stats;
  const cards = [
    ['total', s.total, 'Contatos'], ['ok', s.enviados, 'Enviados'],
    ['warn', s.pendentes, 'Pendentes'], ['bad', s.erros, 'Com erro'],
    ['total', s.empresas, 'Empresas'], ['total', s.nuncaEnviados, 'Nunca receberam']
  ];
  $('cardsStat').innerHTML = cards.map(c =>
    '<div class="stat"><b class="' + (c[0] === 'total' ? '' : c[0]) + '">' + (c[1] || 0) + '</b><span>' + c[2] + '</span></div>'
  ).join('');

  const cat = s.porCategoria || {};
  const max = Math.max.apply(null, [1].concat(Object.keys(cat).map(k => cat[k])));
  $('bars').innerHTML = Object.keys(cat).length ? Object.keys(cat).sort((a, b) => cat[b] - cat[a]).map(k =>
    '<div class="bar-row"><span><em>' + escapar(k) + '</em><b>' + cat[k] + '</b></span>' +
    '<div class="bar-track"><div class="bar-fill" style="width:' + (cat[k] / max * 100) + '%"></div></div></div>'
  ).join('') : '<div class="empty">Sem contatos cadastrados.</div>';

  $('tabelaHist').querySelector('tbody').innerHTML = S.historico.length ? S.historico.map(h =>
    '<tr><td>' + escapar(h.data) + '</td><td>' + escapar(h.hora) + '</td><td>' + escapar(h.empresa) + '</td>' +
    '<td>' + escapar(h.email) + '</td><td class="' + (h.status === 'Enviado' ? 'ok' : 'bad') + '">' +
    escapar(h.status) + (h.erro ? ' — ' + escapar(h.erro) : '') + '</td></tr>'
  ).join('') : '<tr><td colspan="5" class="empty">Nenhum envio registrado.</td></tr>';
}

function renderTabelaContatos() {
  $('tabelaContatos').querySelector('tbody').innerHTML = S.contatos.map(c =>
    '<tr><td>' + escapar(c.id) + '</td><td>' + escapar(c.empresa) + '</td><td>' + escapar(c.nome) + '</td>' +
    '<td>' + escapar(c.email) + '</td><td>' + escapar(c.categoria) + '</td><td>' + escapar(c.cargo) + '</td>' +
    '<td>' + escapar(c.status) + '</td><td>' + escapar(c.ultimoEnvio) + '</td><td>' + c.envios + '</td></tr>'
  ).join('') || '<tr><td colspan="9" class="empty">Nenhum contato cadastrado.</td></tr>';
}

/* ---------- currículo ---------- */
function renderAnexo() {
  const tem = !!S.curriculo;
  $('anexoVazio').classList.toggle('hidden', tem);
  $('anexoInfo').classList.toggle('hidden', !tem);
  if (tem) {
    $('anexoNome').textContent = S.curriculo.nome;
    $('anexoTam').textContent = (S.curriculo.kb > 1024 ? (S.curriculo.kb / 1024).toFixed(1) + ' MB' : S.curriculo.kb + ' KB');
  }
}

$('btnEscolherPdf').onclick = () => $('fPdf').click();
$('fPdf').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.type !== 'application/pdf') { toast('Só arquivos PDF são aceitos.', 'bad'); e.target.value = ''; return; }
  if (f.size / 1048576 > S.maxMb) { toast('PDF acima de ' + S.maxMb + ' MB. Reduza o arquivo.', 'bad'); e.target.value = ''; return; }
  const r = new FileReader();
  r.onload = () => {
    toast('Enviando o PDF para o seu Drive...');
    call('uploadCurriculo', { nome: f.name, mime: f.type, base64: r.result.split(',')[1] })
      .then(info => { S.curriculo = info; renderAnexo(); toast('Currículo carregado.', 'ok'); })
      .catch(err => toast(err.message, 'bad'));
  };
  r.readAsDataURL(f);
  e.target.value = '';
};
$('btnRemoverPdf').onclick = () => call('removerCurriculo').then(() => { S.curriculo = null; renderAnexo(); });

/* ---------- pré-visualização ---------- */
$('btnPreview').onclick = () => {
  const id = S.sel.size ? Array.from(S.sel)[0] : (filtrados()[0] && filtrados()[0].id);
  if (!id) { toast('Selecione um destinatário.', 'bad'); return; }
  call('previewEmail', payload([id]), id)
    .then(p => abrirModal('Pré-visualização',
      '<div class="preview-box"><div class="preview-meta">Para: ' + escapar(p.para) + '<br>Assunto: ' + escapar(p.assunto) + '</div>' + p.corpo + '</div>', null))
    .catch(err => toast(err.message, 'bad'));
};

/* ---------- envio ---------- */
function payload(ids) {
  return {
    ids: ids,
    remetenteNome: $('fNome').value.trim(),
    remetenteEmail: $('fRemetente').value,
    replyTo: $('fReplyTo').value.trim(),
    assunto: $('fAssunto').value.trim(),
    corpo: $('fCorpo').innerHTML,
    usarCurriculo: $('fUsarCurriculo').checked,
    forcar: $('fForcar').checked
  };
}

function logLinha(texto, status) {
  const cor = status === 'enviado' ? 'ok' : (status === 'ignorado' ? 'warn' : 'bad');
  const selo = status === 'enviado' ? 'ENVIADO ✓' : (status === 'ignorado' ? 'IGNORADO' : 'FALHA ✕');
  const l = document.createElement('div');
  l.className = 'log-line';
  l.innerHTML = '<span>' + escapar(texto) + '</span><span class="log-stamp ' + cor + '">' + selo + '</span>';
  $('log').appendChild(l);
  $('log').scrollTop = $('log').scrollHeight;
}

$('btnEnviar').onclick = () => {
  if (S.enviando) return;
  const ids = Array.from(S.sel);
  if (!ids.length) { toast('Selecione pelo menos um destinatário.', 'bad'); return; }
  if (!$('fAssunto').value.trim()) { toast('Preencha o assunto.', 'bad'); return; }
  if (!$('fCorpo').innerText.trim()) { toast('Escreva o corpo do e-mail.', 'bad'); return; }
  if ($('fUsarCurriculo').checked && !S.curriculo) { toast('Carregue o currículo em PDF ou desmarque o anexo.', 'bad'); return; }

  const mapa = {};
  S.contatos.forEach(c => mapa[c.id] = c);
  const jaEnviados = ids.filter(i => mapa[i] && mapa[i].status.toLowerCase() === 'enviado');

  let aviso = '<p>Serão enviados <b>' + ids.length + '</b> e-mails individuais, um por destinatário.</p>';
  if (jaEnviados.length) {
    aviso += '<p class="hint">' + jaEnviados.length + ' contato(s) já receberam e-mail. ' +
      ($('fForcar').checked
        ? 'A opção "enviar novamente" está ativa — eles receberão outra vez.'
        : 'Eles serão ignorados. Marque "enviar novamente" se quiser reenviar.') + '</p>';
  }
  abrirModal('Confirmar disparo', aviso, () => dispararTudo(ids), 'Enviar agora');
};

async function dispararTudo(ids) {
  S.enviando = true;
  $('btnEnviar').disabled = true;
  $('progresso').classList.remove('hidden');
  $('log').innerHTML = '';
  $('barra').style.width = '0%';

  const lotes = [];
  for (let i = 0; i < ids.length; i += S.chunk) lotes.push(ids.slice(i, i + S.chunk));

  let feitos = 0, enviados = 0, falhas = 0, ignorados = 0;

  for (let i = 0; i < lotes.length; i++) {
    $('progressoTexto').textContent = 'Enviando ' + (feitos + 1) + ' a ' + Math.min(feitos + lotes[i].length, ids.length) + ' de ' + ids.length + '...';
    try {
      const r = await call('enviarLote', payload(lotes[i]));
      r.resultados.forEach(x => {
        logLinha((x.empresa || x.email || x.id) + (x.erro ? ' — ' + x.erro : ''), x.status);
        if (x.status === 'enviado') enviados++;
        else if (x.status === 'ignorado') ignorados++;
        else falhas++;
      });
      S.stats = r.stats;
      $('chipQuota').textContent = 'cota ' + r.quota;
      if (r.quota <= 0) { toast('Cota diária esgotada. O restante fica para amanhã.', 'bad'); feitos += lotes[i].length; break; }
    } catch (err) {
      lotes[i].forEach(id => { logLinha(id + ' — ' + err.message, 'falha'); falhas++; });
      toast(err.message, 'bad');
    }
    feitos += lotes[i].length;
    $('barra').style.width = (feitos / ids.length * 100) + '%';
    renderContadores();
  }

  $('progressoTexto').textContent = 'Concluído — ' + enviados + ' enviados, ' + falhas + ' falhas' +
    (ignorados ? ', ' + ignorados + ' ignorados' : '') + '.';
  toast(enviados + ' e-mail(s) enviados. ' + falhas + ' falha(s).', falhas ? 'bad' : 'ok');

  S.enviando = false;
  $('btnEnviar').disabled = false;
  S.sel.clear();
  await recarregar();
}

/* ---------- contatos: adicionar / importar ---------- */
$('btnAddContato').onclick = () => {
  const c = {
    empresa: $('nEmpresa').value.trim(), nome: $('nNome').value.trim(),
    email: $('nEmail').value.trim(), categoria: $('nCategoria').value.trim(),
    cargo: $('nCargo').value.trim(), obs: $('nObs').value.trim()
  };
  if (!c.email) { toast('Informe o e-mail.', 'bad'); return; }
  $('btnAddContato').disabled = true;
  call('addContato', c)
    .then(r => {
      aplicar(r);
      ['nEmpresa', 'nNome', 'nEmail', 'nCategoria', 'nCargo', 'nObs'].forEach(i => $(i).value = '');
      toast('Contato adicionado.', 'ok');
    })
    .catch(err => toast(err.message, 'bad'))
    .then(() => $('btnAddContato').disabled = false);
};

$('btnEscolherCsv').onclick = () => $('fCsv').click();
$('fCsv').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $('csvTexto').value = r.result; toast('CSV carregado. Confira e clique em importar.'); };
  r.readAsText(f, 'UTF-8');
  e.target.value = '';
};
$('btnImportarCsv').onclick = () => {
  const t = $('csvTexto').value.trim();
  if (!t) { toast('Cole o CSV ou escolha um arquivo.', 'bad'); return; }
  $('btnImportarCsv').disabled = true;
  call('importarCsv', t)
    .then(r => {
      aplicar(r);
      $('csvTexto').value = '';
      toast(r.inseridos + ' inseridos, ' + r.duplicados + ' duplicados, ' + r.invalidos + ' inválidos.', 'ok');
    })
    .catch(err => toast(err.message, 'bad'))
    .then(() => $('btnImportarCsv').disabled = false);
};

/* ---------- carga inicial ---------- */
function aplicar(r) {
  if (r.contatos) S.contatos = r.contatos;
  if (r.stats) S.stats = r.stats;
  if (r.historico) S.historico = r.historico;
  renderFiltros(); renderLista(); renderTabelaContatos(); renderPainel();
}

function recarregar() {
  return call('getBootstrap').then(b => {
    S.maxMb = b.maxMb; S.chunk = b.chunk; S.curriculo = b.curriculo;
    $('hintMb').textContent = b.maxMb;
    $('chipQuota').textContent = 'cota ' + b.quota;
    $('fRemetente').innerHTML = b.remetentes.map(r => '<option>' + escapar(r) + '</option>').join('');
    aplicar(b);
    renderAnexo();
  }).catch(err => toast('Erro ao carregar: ' + err.message, 'bad'));
}

$('fCorpo').innerHTML =
  '<p>Olá, {{nome}}.</p>' +
  '<p>Meu nome é [seu nome] e envio meu currículo para avaliação em oportunidades de <b>{{cargo}}</b> na {{empresa}}.</p>' +
  '<p>Tenho experiência em [resuma sua experiência em duas linhas]. O currículo completo está anexo neste e-mail.</p>' +
  '<p>Fico à disposição para uma conversa.</p><p>Atenciosamente,<br>[seu nome] — [telefone]</p>';

recarregar();

