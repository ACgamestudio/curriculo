/**
 * Central de Candidaturas — backend Apps Script
 * Planilha = banco. Gmail = disparo. Drive = anexo temporário.
 */

const CFG = {
  ABA_CONTATOS: 'Contatos',
  ABA_HISTORICO: 'Historico',
  PASTA_ANEXOS: '__anexos_candidaturas',
  MAX_ANEXO_MB: 20
};

const HEAD_CONTATOS = ['ID', 'Empresa', 'Nome', 'Email', 'Categoria', 'Cargo', 'Status', 'UltimoEnvio', 'QtdEnvios', 'Observacao'];
const HEAD_HISTORICO = ['Data', 'Hora', 'Empresa', 'Email', 'Assunto', 'Status', 'Erro'];

const COL = { ID: 1, EMPRESA: 2, NOME: 3, EMAIL: 4, CATEGORIA: 5, CARGO: 6, STATUS: 7, ULTIMO: 8, QTD: 9, OBS: 10 };

let _aliasCache = null;

/* ---------------------------------------------------------- Web app */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Central de Candidaturas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

function include(nome) {
  return HtmlService.createHtmlOutputFromFile(nome).getContent();
}

/* ---------------------------------------------------------- Setup */

/** Rode uma vez no editor para criar as abas. */
function setupPlanilha() {
  const ss = SpreadsheetApp.getActive();
  const contatos = ensureAba_(ss, CFG.ABA_CONTATOS, HEAD_CONTATOS);
  ensureAba_(ss, CFG.ABA_HISTORICO, HEAD_HISTORICO);

  if (contatos.getLastRow() < 2) {
    contatos.getRange(2, 1, 2, HEAD_CONTATOS.length).setValues([
      ['C-0001', 'ABC Tecnologia', 'RH', 'rh@abctecnologia.com', 'TI', 'Analista de Sistemas', 'Pendente', '', 0, ''],
      ['C-0002', 'Delta Offshore', 'Recrutamento', 'vagas@deltaoffshore.com', 'Offshore', 'Técnico de Automação', 'Pendente', '', 0, '']
    ]);
  }

  const regra = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pendente', 'Enviado', 'Erro'], true).build();
  contatos.getRange(2, COL.STATUS, Math.max(contatos.getMaxRows() - 1, 1)).setDataValidation(regra);

  SpreadsheetApp.getUi().alert('Abas criadas. Publique o app em Implantar > Nova implantação.');
}

function ensureAba_(ss, nome, cabecalho) {
  let sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight('bold').setBackground('#14161a').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, cabecalho.length);
  return sh;
}

function aba_(nome) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não existe. Rode setupPlanilha() no editor.');
  return sh;
}

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Sao_Paulo'; }

/* ---------------------------------------------------------- Leitura */

/** Payload único do carregamento inicial: 1 round-trip. */
function carregarApp() {
  return {
    contatos: lerContatos_(),
    historico: lerHistorico_(15),
    quota: MailApp.getRemainingDailyQuota(),
    contaAtiva: Session.getActiveUser().getEmail(),
    aliases: aliases_()
  };
}

function lerContatos_() {
  const sh = aba_(CFG.ABA_CONTATOS);
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const vals = sh.getRange(2, 1, ultima - 1, HEAD_CONTATOS.length).getValues();
  const tz = tz_();

  return vals.map(function (r, i) {
    return {
      linha: i + 2,
      id: String(r[0] || ''),
      empresa: String(r[1] || ''),
      nome: String(r[2] || ''),
      email: String(r[3] || '').trim(),
      categoria: String(r[4] || ''),
      cargo: String(r[5] || ''),
      status: String(r[6] || 'Pendente'),
      ultimoEnvio: fmtData_(r[7], tz),
      qtd: Number(r[8]) || 0,
      obs: String(r[9] || '')
    };
  }).filter(function (c) { return c.email; });
}

function lerHistorico_(limite) {
  const sh = aba_(CFG.ABA_HISTORICO);
  const ultima = sh.getLastRow();
  if (ultima < 2) return [];
  const n = Math.min(limite || 15, ultima - 1);
  const vals = sh.getRange(ultima - n + 1, 1, n, HEAD_HISTORICO.length).getValues();
  const tz = tz_();
  return vals.reverse().map(function (r) {
    return {
      data: fmtData_(r[0], tz, 'dd/MM/yyyy'),
      hora: fmtData_(r[1], tz, 'HH:mm:ss') || String(r[1] || ''),
      empresa: String(r[2] || ''), email: String(r[3] || ''),
      assunto: String(r[4] || ''), status: String(r[5] || ''), erro: String(r[6] || '')
    };
  });
}

function fmtData_(v, tz, mask) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz, mask || 'dd/MM/yyyy HH:mm');
  return String(v);
}

/* ---------------------------------------------------------- Anexo */

function pastaAnexos_() {
  const it = DriveApp.getFoldersByName(CFG.PASTA_ANEXOS);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CFG.PASTA_ANEXOS);
}

/** Sobe o PDF UMA vez; o id é reutilizado em todos os envios da campanha. */
function uploadAnexo(arq) {
  if (arq.mime !== 'application/pdf') throw new Error('Só PDF é aceito.');
  const bytes = Utilities.base64Decode(arq.dados);
  const mb = bytes.length / 1048576;
  if (mb > CFG.MAX_ANEXO_MB) throw new Error('Arquivo de ' + mb.toFixed(1) + ' MB. Limite: ' + CFG.MAX_ANEXO_MB + ' MB.');
  const arquivo = pastaAnexos_().createFile(Utilities.newBlob(bytes, arq.mime, arq.nome));
  return { id: arquivo.getId(), nome: arquivo.getName(), mb: Number(mb.toFixed(2)) };
}

function removerAnexo(id) {
  try { DriveApp.getFileById(id).setTrashed(true); return true; } catch (e) { return false; }
}

/* ---------------------------------------------------------- Envio */

function aliases_() {
  if (_aliasCache) return _aliasCache;
  try { _aliasCache = GmailApp.getAliases(); } catch (e) { _aliasCache = []; }
  return _aliasCache;
}

function interpolar_(txt, c) {
  return String(txt || '')
    .replace(/\{\{\s*empresa\s*\}\}/gi, c.empresa)
    .replace(/\{\{\s*nome\s*\}\}/gi, c.nome || c.empresa)
    .replace(/\{\{\s*cargo\s*\}\}/gi, c.cargo)
    .replace(/\{\{\s*categoria\s*\}\}/gi, c.categoria)
    .replace(/\{\{\s*email\s*\}\}/gi, c.email);
}

/**
 * Envia para UM destinatário. A fila roda no cliente — evita o teto de 6 min
 * por execução e dá progresso real na tela.
 */
function enviarUm(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let c = null;
  try {
    if (MailApp.getRemainingDailyQuota() <= 0) throw new Error('Cota diária do Gmail esgotada.');

    const sh = aba_(CFG.ABA_CONTATOS);
    const linha = Number(p.linha);
    const r = sh.getRange(linha, 1, 1, HEAD_CONTATOS.length).getValues()[0];
    c = {
      empresa: String(r[1] || ''), nome: String(r[2] || ''), email: String(r[3] || '').trim(),
      categoria: String(r[4] || ''), cargo: String(r[5] || ''), status: String(r[6] || 'Pendente'),
      qtd: Number(r[8]) || 0
    };

    if (!c.email || c.email.indexOf('@') < 0) throw new Error('E-mail inválido na linha ' + linha);
    if (c.status === 'Enviado' && !p.forcar) {
      return { ok: false, pulado: true, empresa: c.empresa, email: c.email, msg: 'Já enviado — reenvio não autorizado' };
    }

    const assunto = interpolar_(p.assunto, c);
    const corpoHtml = interpolar_(p.corpo, c);
    const opcoes = { htmlBody: corpoHtml };

    if (p.remetenteNome) opcoes.name = p.remetenteNome;
    if (p.remetenteEmail) {
      if (aliases_().indexOf(p.remetenteEmail) >= 0) opcoes.from = p.remetenteEmail;
      else opcoes.replyTo = p.remetenteEmail;
    }
    if (p.anexoId) opcoes.attachments = [DriveApp.getFileById(p.anexoId).getBlob()];

    GmailApp.sendEmail(c.email, assunto, htmlParaTexto_(corpoHtml), opcoes);

    const agora = new Date();
    sh.getRange(linha, COL.STATUS).setValue('Enviado');
    sh.getRange(linha, COL.ULTIMO).setValue(agora);
    sh.getRange(linha, COL.QTD).setValue(c.qtd + 1);
    logHistorico_(agora, c, assunto, 'Enviado', '');

    return { ok: true, empresa: c.empresa, email: c.email, qtd: c.qtd + 1, quota: MailApp.getRemainingDailyQuota() };

  } catch (e) {
    const agora = new Date();
    try {
      const sh = aba_(CFG.ABA_CONTATOS);
      sh.getRange(Number(p.linha), COL.STATUS).setValue('Erro');
      sh.getRange(Number(p.linha), COL.OBS).setValue(String(e.message).slice(0, 250));
    } catch (ignore) {}
    logHistorico_(agora, c || { empresa: '', email: '' }, p.assunto || '', 'Erro', String(e.message));
    return { ok: false, erro: String(e.message), empresa: (c && c.empresa) || '', email: (c && c.email) || '' };
  } finally {
    lock.releaseLock();
  }
}

function htmlParaTexto_(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function logHistorico_(data, c, assunto, status, erro) {
  try {
    aba_(CFG.ABA_HISTORICO).appendRow([
      Utilities.formatDate(data, tz_(), 'dd/MM/yyyy'),
      Utilities.formatDate(data, tz_(), 'HH:mm:ss'),
      c.empresa || '', c.email || '', assunto || '', status, erro || ''
    ]);
  } catch (e) {}
}

/* ---------------------------------------------------------- CRUD contatos */

function proximoId_(sh) {
  const n = Math.max(sh.getLastRow() - 1, 0) + 1;
  return 'C-' + Utilities.formatString('%04d', n);
}

function adicionarContato(c) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = aba_(CFG.ABA_CONTATOS);
    const email = String(c.email || '').trim();
    if (!email || email.indexOf('@') < 0) throw new Error('Informe um e-mail válido.');
    const jaExiste = lerContatos_().some(function (x) { return x.email.toLowerCase() === email.toLowerCase(); });
    if (jaExiste) throw new Error('Esse e-mail já está na lista.');
    sh.appendRow([proximoId_(sh), c.empresa || '', c.nome || '', email, c.categoria || '', c.cargo || '', 'Pendente', '', 0, c.obs || '']);
    return { ok: true, contatos: lerContatos_() };
  } finally { lock.releaseLock(); }
}

/**
 * CSV com cabeçalho. Colunas aceitas (ordem livre):
 * empresa, nome, email, categoria, cargo, observacao
 */
function importarCSV(texto) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const linhas = Utilities.parseCsv(String(texto || '').trim());
    if (linhas.length < 2) throw new Error('CSV precisa de cabeçalho + pelo menos 1 linha.');

    const cab = linhas[0].map(function (h) { return normalizar_(h); });
    const idx = {
      empresa: cab.indexOf('empresa'), nome: cab.indexOf('nome'), email: cab.indexOf('email'),
      categoria: cab.indexOf('categoria'), cargo: cab.indexOf('cargo'), obs: cab.indexOf('observacao')
    };
    if (idx.email < 0) throw new Error('CSV precisa da coluna "email".');

    const sh = aba_(CFG.ABA_CONTATOS);
    const existentes = {};
    lerContatos_().forEach(function (c) { existentes[c.email.toLowerCase()] = true; });

    const novos = [];
    let contador = Math.max(sh.getLastRow() - 1, 0);
    let duplicados = 0, invalidos = 0;

    for (let i = 1; i < linhas.length; i++) {
      const r = linhas[i];
      const email = String(idx.email >= 0 ? r[idx.email] : '').trim();
      if (!email || email.indexOf('@') < 0) { invalidos++; continue; }
      if (existentes[email.toLowerCase()]) { duplicados++; continue; }
      existentes[email.toLowerCase()] = true;
      contador++;
      novos.push([
        'C-' + Utilities.formatString('%04d', contador),
        pega_(r, idx.empresa), pega_(r, idx.nome), email,
        pega_(r, idx.categoria), pega_(r, idx.cargo),
        'Pendente', '', 0, pega_(r, idx.obs)
      ]);
    }

    if (novos.length) sh.getRange(sh.getLastRow() + 1, 1, novos.length, HEAD_CONTATOS.length).setValues(novos);
    return { ok: true, importados: novos.length, duplicados: duplicados, invalidos: invalidos, contatos: lerContatos_() };
  } finally { lock.releaseLock(); }
}

function pega_(r, i) { return i >= 0 ? String(r[i] || '').trim() : ''; }
function normalizar_(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Volta status para Pendente (útil para refazer uma campanha). */
function resetarStatus(linhas) {
  const sh = aba_(CFG.ABA_CONTATOS);
  (linhas || []).forEach(function (l) {
    sh.getRange(Number(l), COL.STATUS).setValue('Pendente');
    sh.getRange(Number(l), COL.OBS).setValue('');
  });
  return { ok: true, contatos: lerContatos_() };
}

function atualizarPainel() {
  return { contatos: lerContatos_(), historico: lerHistorico_(15), quota: MailApp.getRemainingDailyQuota() };
}
