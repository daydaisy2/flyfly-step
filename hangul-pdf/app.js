/* 세은 한글·PDF — 아래한글(.hwpx·.hwp) ↔ PDF 뷰어·변환 (100% 브라우저 안에서)
   외부 서버로 파일을 보내지 않습니다. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 기본 */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var GATE_SALT = 'seeun-hangul-pdf::';
  var GATE_HASH = '915f45f2776ae860ee7c3716a4c17835ce42b4f496a56706061c6d9259b3a2d7';
  var STORE_OPEN = 'seeun-hangul-pdf.open.v1';
  var STORE_MEMO = 'seeun-hangul-pdf.memo.v1';
  var TEMPLATE_B64 = window.HWPX_TEMPLATE_B64 || '';

  var PT2PX = 96 / 72;          /* 1pt = 1.333px */
  var HWPUNIT = 75;             /* 1px = 75 HWPUNIT (7200/96) */
  var A4W = 793.7, A4H = 1122.5;

  var S = {
    inited: false,
    file: null,
    kind: '',            /* hwpx | hwp | pdf */
    fileName: '',
    zoom: 1,
    fit: 1,
    pw: A4W,
    pdf: null,
    pdfLines: [],
    pdfChars: 0,
    paragraphs: 0,
    urls: []
  };

  function toast(msg, ms) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }
  function setBusy(on, text) {
    var b = $('#busy');
    if (!b) return;
    if (text) $('#busyText').textContent = text;
    b.hidden = !on;
  }
  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + 'KB';
    return (n / 1024 / 1024).toFixed(1) + 'MB';
  }
  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)\s*$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }
  function b64ToBytes(b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function sha256Hex(str) {
    if (!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest)) return Promise.resolve(null);
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      var b = new Uint8Array(buf), out = '';
      for (var i = 0; i < b.length; i++) out += ('00' + b[i].toString(16)).slice(-2);
      return out;
    });
  }

  /* ------------------------------------------------------------------ 입장 잠금 */
  var gate = { buf: '', unlocked: false };

  function installIsOpen() {
    try {
      if (/[?&]relock(=1)?(&|$)/.test(location.search)) { localStorage.removeItem(STORE_OPEN); return false; }
      return localStorage.getItem(STORE_OPEN) === '1';
    } catch (e) { return false; }
  }
  function paintDots() {
    $$('#lockDots i').forEach(function (d, i) { d.classList.toggle('on', i < gate.buf.length); });
  }
  function lockMsg(m) { $('#lockMsg').textContent = m || ''; }
  function shakeCard() {
    var c = $('#lockCard');
    c.classList.remove('shake');
    void c.offsetWidth;
    c.classList.add('shake');
  }
  function unlockApp() {
    gate.unlocked = true;
    $('#lock').classList.add('hide');
    document.body.classList.remove('locked');
    $('#app').hidden = false;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    initApp();
  }
  function gateKey(k) {
    if (k === 'del') gate.buf = gate.buf.slice(0, -1);
    else if (k === 'clear') gate.buf = '';
    else if (gate.buf.length < 6) gate.buf += k;
    lockMsg('');
    paintDots();
    if (gate.buf.length === 6) setTimeout(tryGate, 130);
  }
  function tryGate() {
    var val = gate.buf;
    if (val.length !== 6) return;
    sha256Hex(GATE_SALT + val).then(function (h) {
      if (h === GATE_HASH || (h === null && val === '261213')) {
        try { localStorage.setItem(STORE_OPEN, '1'); } catch (e) {}
        gate.buf = '';
        paintDots();
        unlockApp();
      } else {
        gate.buf = '';
        paintDots();
        lockMsg('비밀번호가 맞지 않습니다');
        shakeCard();
      }
    }).catch(function () { lockMsg('잠금을 확인할 수 없어요. 새로 고쳐 주세요.'); });
  }
  function relock() {
    try { localStorage.removeItem(STORE_OPEN); } catch (e) {}
    location.replace(location.pathname + '?relock=1');
  }

  function bindGate() {
    $('#lockPad').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-k]');
      if (b) gateKey(b.getAttribute('data-k'));
    });
    document.addEventListener('keydown', function (ev) {
      if (gate.unlocked) return;
      if (/^[0-9]$/.test(ev.key)) gateKey(ev.key);
      else if (ev.key === 'Backspace') { ev.preventDefault(); gateKey('del'); }
      else if (ev.key === 'Enter') tryGate();
    });
  }

  /* ------------------------------------------------------------------ PWA · 설치 */
  var installEvt = null;

  function bindPwa() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installEvt = e;
      $('#installBtn').hidden = false;
    });
    window.addEventListener('appinstalled', function () {
      installEvt = null;
      $('#installBtn').hidden = true;
      toast('홈 화면에 설치했어요!');
    });
    $('#installBtn').addEventListener('click', function () {
      if (!installEvt) {
        toast('브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 눌러 주세요.', 4200);
        return;
      }
      installEvt.prompt();
      installEvt.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') $('#installBtn').hidden = true;
        installEvt = null;
      }).catch(function () { installEvt = null; });
    });
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {});
      });
    }
  }

  /* ------------------------------------------------------------------ 파일 받기 */
  function initApp() {
    if (S.inited) return;
    S.inited = true;
    bindFileIntake();
    bindViewer();
    bindMemo();
    window.addEventListener('resize', function () { if (!$('#viewer').hidden) layoutSheet(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { if (!$('#viewer').hidden) layoutSheet(); }, 250); });
  }

  function bindFileIntake() {
    var drop = $('#drop'), input = $('#fileInput');

    $('#pickBtn').addEventListener('click', function (ev) { ev.stopPropagation(); input.click(); });
    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (f) openFile(f);
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
        e.preventDefault();
        drop.classList.add('drag');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (e.target === document.documentElement || !e.relatedTarget) drop.classList.remove('drag');
      });
    });
    window.addEventListener('drop', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      drop.classList.remove('drag');
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (!files.length) return;
      if (files.length > 1) toast('한 번에 한 파일씩 열 수 있어요. 첫 파일을 열게요.');
      openFile(files[0]);
    });
  }

  function openFile(file) {
    if (!file) return;
    var ext = extOf(file.name);
    if (['hwpx', 'hwp', 'pdf'].indexOf(ext) < 0) {
      toast('아래한글(.hwpx·.hwp)이나 PDF 파일만 열 수 있어요.');
      return;
    }
    if (file.size === 0) { toast('빈 파일이에요.'); return; }
    if (file.size > 60 * 1024 * 1024) { toast('60MB보다 큰 파일은 열 수 없어요.'); return; }

    resetDoc();
    S.file = file;
    S.fileName = file.name;
    S.kind = ext;
    document.body.classList.remove('kind-hwpx', 'kind-hwp', 'kind-pdf');
    document.body.classList.add('kind-' + ext);

    setBusy(true, '파일을 여는 중…');
    var job = ext === 'pdf' ? openPdf(file) : (ext === 'hwpx' ? openHwpx(file) : openHwp(file));
    job.catch(function (err) {
      console.warn('[한글·PDF]', err);
      showDocError(err);
    }).then(function () { setBusy(false); });
  }

  function resetDoc() {
    S.file = null; S.kind = ''; S.fileName = ''; S.zoom = 1; S.pdf = null;
    S.pdfLines = []; S.pdfChars = 0; S.paragraphs = 0; S.pw = A4W;
    S.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    S.urls = [];
    $('#sheet').innerHTML = '';
    $('#notice').hidden = true;
    $('#notice').innerHTML = '';
    $('#convertBtn').hidden = true;
    $('#printBtn').classList.remove('off');
  }

  function enterViewer() {
    $('#home').hidden = true;
    $('#viewer').hidden = false;
    $('#vTitle').textContent = S.fileName;
    pushDocHistory();
    $('#docScroll').scrollTop = 0;
    layoutSheet();
  }

  /* ------------------------------------------------------------------ 보기 화면 */
  var histPushed = false, selfBack = false, memoHistPushed = false, memoSelfBack = false;

  function pushDocHistory() {
    if (histPushed) return;
    try { history.pushState({ doc: 1 }, ''); histPushed = true; } catch (e) {}
  }
  function settleDocHistory() {
    if (!histPushed) return;
    histPushed = false;
    if (history.state && history.state.doc) {
      selfBack = true;
      try { history.back(); } catch (e) { selfBack = false; }
    }
  }
  function bindViewer() {
    $('#backBtn').addEventListener('click', function () { closeDoc(); });
    $('#vLock').addEventListener('click', relock);
    $('#lockNow').addEventListener('click', relock);
    $('#printBtn').addEventListener('click', printDoc);
    $('#convertBtn').addEventListener('click', convertToHwpx);
    $('#zoomIn').addEventListener('click', function () { setZoom(S.zoom * 1.15); });
    $('#zoomOut').addEventListener('click', function () { setZoom(S.zoom / 1.15); });
    $('#zoomFit').addEventListener('click', function () { S.zoom = 1; layoutSheet(); });

    window.addEventListener('popstate', function () {
      if (selfBack) { selfBack = false; return; }
      if (memoSelfBack) { memoSelfBack = false; return; }
      if (memoHistPushed) { memoHistPushed = false; closeMemo(true); return; }
      if (histPushed) { histPushed = false; closeDoc(true); }
    });
  }
  function closeDoc(fromHistory) {
    $('#viewer').hidden = true;
    $('#home').hidden = false;
    S.pdfLines = []; S.pdf = null;
    $('#sheet').innerHTML = '';
    S.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    S.urls = [];
    document.body.classList.remove('kind-hwpx', 'kind-hwp', 'kind-pdf');
    if (!fromHistory) settleDocHistory();
    try { document.title = '세은 한글·PDF'; } catch (e) {}
  }
  function setZoom(z) {
    S.zoom = Math.max(0.55, Math.min(3, z));
    layoutSheet();
  }
  function layoutSheet() {
    var scroller = $('#docScroll'), wrap = $('#sheetWrap'), sheet = $('#sheet');
    if (!scroller || !sheet) return;
    var cw = Math.max(200, scroller.clientWidth - 24);
    var pw = S.pw || A4W;
    var base = Math.min(1, cw / pw);
    var fit = Math.max(0.25, base * S.zoom);
    S.fit = fit;
    var scaledW = pw * fit;
    sheet.style.width = pw + 'px';
    sheet.style.transformOrigin = 'top left';
    sheet.style.transform = 'scale(' + fit + ')';
    sheet.style.left = Math.max(0, (cw - scaledW) / 2) + 'px';
    var h = sheet.offsetHeight || 0;
    wrap.style.height = Math.round(h * fit) + 'px';
    wrap.style.width = Math.round(Math.max(cw, scaledW)) + 'px';
  }
  function afterRender() {
    layoutSheet();
    /* 폰트·이미지 로딩 뒤 높이가 바뀌므로 한 번 더 */
    setTimeout(layoutSheet, 60);
    setTimeout(layoutSheet, 400);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutSheet).catch(function () {});
  }

  function notice(html) {
    var n = $('#notice');
    n.innerHTML = html;
    n.hidden = !html;
  }

  function showDocError(err) {
    var code = (err && err.code) || (err && err.message) || '';
    var box = '';
    if (code === 'hwp-password') {
      box = '<div class="big">🔐</div><b>암호가 걸린 한글 파일이에요</b>' +
        '한글에서 암호를 풀고 다시 저장한 뒤 열어 주세요.<br>이 앱은 암호를 풀지 않습니다.';
    } else if (code === 'no-hwp') {
      box = '<div class="big">📄</div><b>한글 문서로 읽지 못했어요</b>' +
        '한글 5.0(.hwp) 형식이 아니거나, 저장할 때 손상된 파일일 수 있어요.';
    } else if (code === 'no-hwpx') {
      box = '<div class="big">📄</div><b>아래한글(.hwpx) 문서가 아니에요</b>' +
        '파일 확장자만 .hwpx이고 내용이 다르면 열 수 없어요.';
    } else if (code === 'no-pdf') {
      box = '<div class="big">📄</div><b>PDF를 읽지 못했어요</b> 손상되었거나 암호로 잠긴 PDF일 수 있어요.';
    } else if (code === 'no-libs') {
      box = '<div class="big">📚</div><b>기능 파일을 불러오지 못했어요</b> 인터넷에 한 번 연결한 뒤 다시 열어 주세요.';
    } else {
      box = '<div class="big">😥</div><b>파일을 열지 못했어요</b>' + escXml(code || '알 수 없는 오류');
    }
    $('#vTitle').textContent = S.fileName || '문서';
    $('#vMeta').textContent = '열 수 없음';
    $('#sheet').style.width = A4W + 'px';
    $('#sheet').innerHTML = '<article class="page msg-page"><div class="msg-box">' + box + '</div></article>';
    $('#convertBtn').hidden = true;
    $('#printBtn').classList.add('off');
    enterViewer();
    layoutSheet();
  }

  /* ================================================================== .hwpx */
  function localTags(root, name) {
    var out = [], all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
    return out;
  }
  function kids(node, name) {
    var out = [];
    for (var i = 0; i < node.children.length; i++) {
      if (!name || node.children[i].localName === name) out.push(node.children[i]);
    }
    return out;
  }
  function firstDeep(root, name) {
    if (root.localName === name) return root;
    var list = localTags(root, name);
    return list.length ? list[0] : null;
  }

  function parseHwpxStyles(headerXml) {
    var st = { char: {}, para: {}, font: {} };
    if (!headerXml) return st;
    var doc;
    try { doc = new DOMParser().parseFromString(headerXml, 'text/xml'); } catch (e) { return st; }
    if (!doc || !doc.documentElement) return st;

    localTags(doc, 'fontface').forEach(function (ff) {
      var lang = ff.getAttribute('lang') || '';
      var map = st.font[lang] || (st.font[lang] = {});
      kids(ff, 'font').forEach(function (f) {
        map[f.getAttribute('id')] = f.getAttribute('face') || '';
      });
    });

    localTags(doc, 'charPr').forEach(function (cp) {
      var id = cp.getAttribute('id');
      if (id == null) return;
      var cur = {
        size: (parseInt(cp.getAttribute('height') || '1000', 10) || 1000) / 100,
        color: cp.getAttribute('textColor') || '#000000',
        bold: kids(cp, 'bold').length > 0,
        italic: kids(cp, 'italic').length > 0,
        underline: false,
        spacing: 0,
        relSz: 100,
        font: 0
      };
      var u = kids(cp, 'underline')[0];
      if (u && u.getAttribute('type') && u.getAttribute('type') !== 'NONE') cur.underline = true;
      var sp = kids(cp, 'spacing')[0];
      if (sp) cur.spacing = (parseFloat(sp.getAttribute('hangul') || '0') || 0) / 100;
      var rs = kids(cp, 'relSz')[0];
      if (rs) cur.relSz = parseFloat(rs.getAttribute('hangul') || '100') || 100;
      var fr = kids(cp, 'fontRef')[0];
      if (fr) cur.font = fr.getAttribute('hangul') || fr.getAttribute('latin') || '0';
      st.char[id] = cur;
    });

    localTags(doc, 'paraPr').forEach(function (pp) {
      var id = pp.getAttribute('id');
      if (id == null) return;
      var cur = { align: 'JUSTIFY', lineHeight: 1.6, indent: 0, left: 0, right: 0, before: 0, after: 0 };
      var al = kids(pp, 'align')[0];
      if (al) cur.align = (al.getAttribute('horizontal') || 'JUSTIFY').toUpperCase();
      var ls = kids(pp, 'lineSpacing')[0];
      if (ls) {
        var type = (ls.getAttribute('type') || 'PERCENT').toUpperCase();
        var v = parseFloat(ls.getAttribute('value') || '160') || 160;
        if (type === 'PERCENT') cur.lineHeight = Math.max(0.85, Math.min(3, v / 100));
        else if (type === 'FIXED') cur.lineHeight = Math.max(0.85, Math.min(3, (v / HWPUNIT) / 13.3));
      }
      var mgs = kids(pp, 'margin');
      var mg = null;
      mgs.forEach(function (m) { if (!mg && m.parentNode && m.parentNode.localName === 'default') mg = m; });
      if (!mg) mg = mgs[0] || null;
      if (mg) {
        var get = function (n) { var e = kids(mg, n)[0]; return e ? (parseFloat(e.getAttribute('value') || '0') || 0) / HWPUNIT : 0; };
        cur.indent = get('intent');
        cur.left = get('left');
        cur.right = get('right');
        cur.before = get('prev');
        cur.after = get('next');
      }
      st.para[id] = cur;
    });
    return st;
  }

  function styleRun(span, cs, st) {
    if (!cs) return;
    span.style.fontSize = (cs.size * PT2PX).toFixed(2) + 'px';
    if (cs.color && cs.color !== '#000000') span.style.color = cs.color;
    if (cs.bold) span.style.fontWeight = '700';
    if (cs.italic) span.style.fontStyle = 'italic';
    if (cs.underline) span.style.textDecoration = 'underline';
    if (cs.spacing) span.style.letterSpacing = cs.spacing.toFixed(2) + 'em';
    if (cs.relSz && cs.relSz !== 100) span.style.fontSize = (cs.size * PT2PX * cs.relSz / 100).toFixed(2) + 'px';
    var face = st && st.font.HANGUL && st.font.HANGUL[cs.font];
    if (face) span.style.fontFamily = '"' + face + '","Noto Serif CJK KR","Batang",serif';
  }

  function stylePara(p, ps) {
    if (!ps) return;
    var map = { JUSTIFY: 'justify', LEFT: 'left', CENTER: 'center', RIGHT: 'right', DISTRIBUTE: 'justify' };
    p.style.textAlign = map[ps.align] || 'left';
    p.style.lineHeight = String(ps.lineHeight || 1.6);
    if (ps.left) p.style.paddingLeft = ps.left.toFixed(1) + 'px';
    if (ps.right) p.style.paddingRight = ps.right.toFixed(1) + 'px';
    if (ps.indent) p.style.textIndent = ps.indent.toFixed(1) + 'px';
    if (ps.before) p.style.marginTop = ps.before.toFixed(1) + 'px';
    if (ps.after) p.style.marginBottom = ps.after.toFixed(1) + 'px';
  }

  function renderTextNode(tEl, parent, cs, st) {
    var span = document.createElement('span');
    styleRun(span, cs, st);
    var has = false;
    Array.prototype.forEach.call(tEl.childNodes, function (n) {
      if (n.nodeType === 3) {
        if (n.nodeValue) { span.appendChild(document.createTextNode(n.nodeValue)); has = true; }
      } else if (n.nodeType === 1) {
        var ln = n.localName;
        if (ln === 'tab') { span.appendChild(document.createTextNode('\t')); has = true; }
        else if (ln === 'lineBreak') { span.appendChild(document.createElement('br')); has = true; }
        else if (ln === 'nbSpace' || ln === 'fwSpace') { span.appendChild(document.createTextNode('\u00a0')); has = true; }
        else if (n.textContent) { span.appendChild(document.createTextNode(n.textContent)); has = true; }
      }
    });
    if (has) { parent.appendChild(span); return true; }
    return false;
  }

  function renderPic(pic, ctx) {
    var ref = null;
    var imgs = localTags(pic, 'img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getAttribute('binaryItemIDRef')) { ref = imgs[i].getAttribute('binaryItemIDRef'); break; }
    }
    if (!ref) return false;
    var sz = kids(pic, 'curSz')[0] || kids(pic, 'orgSz')[0];
    var w = sz ? (parseFloat(sz.getAttribute('width') || '0') / HWPUNIT) : 0;
    var h = sz ? (parseFloat(sz.getAttribute('height') || '0') / HWPUNIT) : 0;
    var img = document.createElement('img');
    img.alt = '';
    if (w) img.style.width = Math.min(w, 640) + 'px';
    if (w && h) img.style.height = 'auto';
    ctx.pending.push({ img: img, ref: ref, w: w, h: h });
    return img;
  }

  function renderTable(tbl, ctx) {
    var table = document.createElement('table');
    table.className = 't';
    var sz = kids(tbl, 'sz')[0];
    if (sz) {
      var tw = parseFloat(sz.getAttribute('width') || '0') / HWPUNIT;
      if (tw) table.style.width = Math.min(tw, 640) + 'px';
    }
    var rows = kids(tbl, 'tr');
    var cells = [], maxRow = 0, maxCol = 0;
    rows.forEach(function (tr, ri) {
      var nextCol = 0;
      kids(tr, 'tc').forEach(function (tc) {
        var addr = kids(tc, 'cellAddr')[0];
        var span = kids(tc, 'cellSpan')[0];
        var csz = kids(tc, 'cellSz')[0];
        var r = addr ? (parseInt(addr.getAttribute('rowAddr') || ri, 10) || 0) : ri;
        var c = addr ? (parseInt(addr.getAttribute('colAddr') || '0', 10) || 0) : nextCol;
        var rs = span ? (parseInt(span.getAttribute('rowSpan') || '1', 10) || 1) : 1;
        var cs = span ? (parseInt(span.getAttribute('colSpan') || '1', 10) || 1) : 1;
        nextCol = c + cs;
        cells.push({ r: r, c: c, rs: rs, cs: cs, tc: tc, csz: csz });
        maxRow = Math.max(maxRow, r + rs);
        maxCol = Math.max(maxCol, c + cs);
      });
    });
    if (!cells.length) return table;

    var used = [];
    for (var i = 0; i < maxRow; i++) { used.push([]); for (var j = 0; j < maxCol; j++) used[i].push(false); }

    for (var r = 0; r < maxRow; r++) {
      var trEl = document.createElement('tr');
      for (var c = 0; c < maxCol; c++) {
        if (used[r][c]) continue;
        var cell = null;
        for (var k = 0; k < cells.length; k++) if (cells[k].r === r && cells[k].c === c) { cell = cells[k]; break; }
        if (!cell) continue;
        var td = document.createElement('td');
        if (cell.rs > 1) td.rowSpan = cell.rs;
        if (cell.cs > 1) td.colSpan = cell.cs;
        for (var rr = r; rr < r + cell.rs; rr++) for (var cc = c; cc < c + cell.cs; cc++) if (used[rr]) used[rr][cc] = true;
        var sub = kids(cell.tc, 'subList')[0];
        var inner = sub ? kids(sub, 'p') : kids(cell.tc, 'p');
        inner.forEach(function (p) { td.appendChild(renderParagraph(p, ctx)); });
        trEl.appendChild(td);
      }
      table.appendChild(trEl);
    }
    return table;
  }

  function renderRun(run, parent, ctx, cs) {
    var any = false;
    Array.prototype.forEach.call(run.childNodes, function (n) {
      if (n.nodeType !== 1) return;
      var ln = n.localName;
      if (ln === 't') { if (renderTextNode(n, parent, cs, ctx.style)) any = true; }
      else if (ln === 'tbl') { parent.appendChild(renderTable(n, ctx)); any = true; }
      else if (ln === 'pic') { var im = renderPic(n, ctx); if (im) { parent.appendChild(im); any = true; } }
      else if (ln === 'equation' || ln === 'eq') { parent.appendChild(eqSpan(n, cs, ctx)); any = true; }
      else if (ln === 'run') { if (renderRun(n, parent, ctx, cs)) any = true; }
      else if (ln === 'lineBreak') { parent.appendChild(document.createElement('br')); any = true; }
      else if (ln === 'tab') { parent.appendChild(document.createTextNode('\t')); any = true; }
      else if (ln === 'ctrl' || ln === 'secPr' || ln === 'colPr') { /* 구역·단 설정은 건너뜀 */ }
      else if (ln === 'container' || ln === 'drawing') { /* 도형은 글자만 */ }
      else if (n.textContent && n.textContent.trim()) { /* 알 수 없는 요소는 글자만 옮김 */
        parent.appendChild(document.createTextNode(n.textContent));
        any = true;
      }
    });
    return any;
  }

  function eqSpan(eq, cs, ctx) {
    var s = document.createElement('span');
    s.className = 'eq';
    styleRun(s, cs, ctx.style);
    var script = firstDeep(eq, 'script');
    s.textContent = script ? script.textContent : '[수식]';
    return s;
  }

  function renderParagraph(pNode, ctx) {
    var p = document.createElement('p');
    var ps = ctx.style.para[pNode.getAttribute('paraPrIDRef')] || ctx.style.para['0'];
    stylePara(p, ps);
    var any = false;
    kids(pNode).forEach(function (ch) {
      if (ch.localName === 'run') {
        var cs = ctx.style.char[ch.getAttribute('charPrIDRef')] || ctx.style.char['0'];
        if (renderRun(ch, p, ctx, cs)) any = true;
      } else if (ch.localName === 'tbl') {
        p.appendChild(renderTable(ch, ctx)); any = true;
      } else if (ch.localName === 'pic') {
        var im = renderPic(ch, ctx); if (im) { p.appendChild(im); any = true; }
      } else if (ch.localName === 'ctrl' || ch.localName === 'secPr') {
        /* skip */
      }
    });
    if (!any) p.classList.add('empty');
    return p;
  }

  function parseContainerManifest(xml) {
    var map = {};
    if (!xml) return map;
    var doc;
    try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e) { return map; }
    localTags(doc, 'item').forEach(function (it) {
      var id = it.getAttribute('id');
      var href = it.getAttribute('href');
      if (id && href) map[id] = href;
    });
    return map;
  }

  function openHwpx(file) {
    if (typeof JSZip === 'undefined') return Promise.reject({ code: 'no-libs' });
    return file.arrayBuffer().then(function (buf) {
      return JSZip.loadAsync(buf);
    }).then(function (zip) {
      if (!zip.file('Contents/section0.xml')) throw { code: 'no-hwpx' };
      var headerXmlP = zip.file('Contents/header.xml') ? zip.file('Contents/header.xml').async('string') : Promise.resolve('');
      var hpfP = zip.file('Contents/content.hpf') ? zip.file('Contents/content.hpf').async('string') : Promise.resolve('');
      return Promise.all([headerXmlP, hpfP]).then(function (res) {
        var st = parseHwpxStyles(res[0]);
        var binMap = parseContainerManifest(res[1]);
        var secNames = Object.keys(zip.files).filter(function (n) { return /^Contents\/section\d+\.xml$/.test(n); });
        secNames.sort(function (a, b) {
          return (parseInt((a.match(/(\d+)\.xml$/) || [0, 0])[1], 10) || 0) - (parseInt((b.match(/(\d+)\.xml$/) || [0, 0])[1], 10) || 0);
        });
        if (!secNames.length) secNames = ['Contents/section0.xml'];

        var sheet = $('#sheet');
        sheet.innerHTML = '';
        var ctx = { style: st, binMap: binMap, zip: zip, pending: [] };
        var page = document.createElement('article');
        page.className = 'page';
        var pageSetup = null;
        var paras = 0;

        return secNames.reduce(function (chain, name) {
          return chain.then(function () {
            return zip.file(name).async('string').then(function (xml) {
              var doc;
              try { doc = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e) { return; }
              if (!doc || !doc.documentElement || doc.documentElement.localName === 'parsererror') return;
              if (!pageSetup) pageSetup = readHwpxPage(doc.documentElement);
              kids(doc.documentElement).forEach(function (ch) {
                if (ch.localName === 'p') { page.appendChild(renderParagraph(ch, ctx)); paras++; }
                else if (ch.localName === 'tbl') { page.appendChild(renderTable(ch, ctx)); }
              });
            });
          });
        }, Promise.resolve()).then(function () {
          S.paragraphs = paras;
          if (!pageSetup) pageSetup = { w: A4W, h: A4H, ml: 92, mr: 92, mt: 74, mb: 62 };
          page.style.width = pageSetup.w + 'px';
          page.style.minHeight = pageSetup.h + 'px';
          page.style.padding = pageSetup.mt + 'px ' + pageSetup.mr + 'px ' + pageSetup.mb + 'px ' + pageSetup.ml + 'px';
          S.pw = pageSetup.w;
          sheet.appendChild(page);
          $('#vMeta').textContent = '아래한글 .hwpx · 문단 ' + paras + '개';
          $('#convertBtn').hidden = true;
          enterViewer();
          afterRender();
          return resolveImages(ctx);
        });
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw { code: 'no-hwpx' };
    });
  }

  function readHwpxPage(secRoot) {
    var out = null;
    var secPr = firstDeep(secRoot, 'secPr');
    if (!secPr) return out;
    var pagePr = firstDeep(secPr, 'pagePr');
    var margin = null;
    var margins = localTags(secPr, 'margin');
    if (margins.length) margin = margins[0];
    var w = pagePr ? parseFloat(pagePr.getAttribute('width') || '0') : 0;
    var h = pagePr ? parseFloat(pagePr.getAttribute('height') || '0') : 0;
    out = {
      w: w ? w / HWPUNIT : A4W,
      h: h ? h / HWPUNIT : A4H,
      ml: margin ? (parseFloat(margin.getAttribute('left') || '0') || 0) / HWPUNIT : 92,
      mr: margin ? (parseFloat(margin.getAttribute('right') || '0') || 0) / HWPUNIT : 92,
      mt: margin ? (parseFloat(margin.getAttribute('top') || '0') || 0) / HWPUNIT : 74,
      mb: margin ? (parseFloat(margin.getAttribute('bottom') || '0') || 0) / HWPUNIT : 62
    };
    if (out.w < 200) out.w = A4W;
    if (out.h < 300) out.h = A4H;
    return out;
  }

  function resolveImages(ctx) {
    var jobs = ctx.pending.map(function (it) {
      var href = ctx.binMap[it.ref] || ('BinData/' + it.ref);
      var f = ctx.zip.file(href);
      if (!f) return Promise.resolve();
      return f.async('uint8array').then(function (bytes) {
        var ext = (href.split('.').pop() || '').toLowerCase();
        var mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp'
          : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
        var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        S.urls.push(url);
        it.img.src = url;
        return new Promise(function (res) { it.img.onload = res; it.img.onerror = res; });
      });
    });
    return Promise.all(jobs).then(afterRender).catch(function () { afterRender(); });
  }

  /* ================================================================== .hwp (구형) */
  function inflateData(bytes, compressed) {
    if (!compressed) return bytes;
    try { return pako.inflate(bytes); } catch (e) {}
    try { return pako.inflateRaw(bytes); } catch (e) {}
    return null;
  }

  function readRecords(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var out = [], i = 0, n = bytes.length;
    while (i + 4 <= n) {
      var h = dv.getUint32(i, true); i += 4;
      var tag = h & 0x3ff, level = (h >>> 10) & 0x3ff, size = (h >>> 20) & 0xfff;
      if (size === 0xfff) {
        if (i + 4 > n) break;
        size = dv.getUint32(i, true); i += 4;
      }
      if (i + size > n) size = n - i;
      out.push({ tag: tag, level: level, start: i, size: size });
      i += size;
    }
    return out;
  }

  var CTL_SMALL = { 0x00: 1, 0x0a: 1, 0x0d: 1, 0x18: 1, 0x1e: 1, 0x1f: 1 };

  function hwpParaText(bytes, start, size) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var units = Math.floor(size / 2), out = '', i = 0;
    while (i < units) {
      var c = dv.getUint16(start + i * 2, true);
      if (c < 32) {
        var step = CTL_SMALL[c] || 8;
        if (c === 9) out += '\t';
        else if (c === 10) out += '\n';
        else if (c === 13) out += '\n';
        else if (c === 30 || c === 31) out += '\u00a0';
        i += step;
      } else {
        out += String.fromCharCode(c);
        i += 1;
      }
    }
    return out;
  }

  function openHwp(file) {
    if (typeof CFB === 'undefined' || typeof pako === 'undefined') return Promise.reject({ code: 'no-libs' });
    return file.arrayBuffer().then(function (buf) {
      var cfb;
      try { cfb = CFB.read(new Uint8Array(buf), { type: 'array' }); } catch (e) { throw { code: 'no-hwp' }; }
      var fh = null;
      try { fh = CFB.find(cfb, 'FileHeader'); } catch (e) {}
      if (!fh || !fh.content) throw { code: 'no-hwp' };
      var head = new Uint8Array(fh.content);
      var flags = (head[36] | (head[37] << 8) | (head[38] << 16) | (head[39] << 24)) >>> 0;
      if (flags & 2) throw { code: 'hwp-password' };
      var compressed = !!(flags & 1);

      var entries = [];
      (cfb.FullPaths || []).forEach(function (path, i) {
        var e = cfb.FileIndex[i];
        if (e && e.type === 2 && /BodyText[\\\/]Section\d+$/i.test(path || '')) {
          e.__path = path;
          entries.push(e);
        }
      });
      if (!entries.length) throw { code: 'no-hwp' };
      entries.sort(function (a, b) {
        var na = parseInt(((a.__path || a.name || '').match(/Section(\d+)$/i) || [0, 0])[1], 10) || 0;
        var nb = parseInt(((b.__path || b.name || '').match(/Section(\d+)$/i) || [0, 0])[1], 10) || 0;
        return na - nb;
      });

      var sheet = $('#sheet');
      sheet.innerHTML = '';
      var page = document.createElement('article');
      page.className = 'page';
      page.style.width = A4W + 'px';
      page.style.minHeight = A4H + 'px';
      page.style.padding = '74px 92px 62px';
      S.pw = A4W;

      var paras = 0, current = null;
      function flush() {
        if (current == null) return;
        var p = document.createElement('p');
        var text = current.replace(/\n+$/, '');
        if (!text.trim()) { p.classList.add('empty'); }
        else {
          var parts = text.split('\n');
          parts.forEach(function (line, i) {
            if (i) p.appendChild(document.createElement('br'));
            p.appendChild(document.createTextNode(line));
          });
        }
        page.appendChild(p);
        paras++;
        current = null;
      }

      entries.forEach(function (e) {
        var data = inflateData(new Uint8Array(e.content), compressed);
        if (!data) return;
        var recs = readRecords(data);
        recs.forEach(function (r) {
          if (r.tag === 66) { flush(); current = ''; }
          else if (r.tag === 67) {
            if (current == null) current = '';
            current += hwpParaText(data, r.start, r.size);
          }
        });
      });
      flush();

      if (!paras) throw { code: 'no-hwp' };
      S.paragraphs = paras;
      sheet.appendChild(page);
      $('#vMeta').textContent = '구형 한글 .hwp · 문단 ' + paras + '개';
      $('#convertBtn').hidden = true;
      enterViewer();
      notice('<b>구형 .hwp</b>는 글자를 중심으로 보여 줘요. 표·그림 배치는 일부 다를 수 있어요. 글자만 필요하면 <b>PDF로 저장·인쇄</b>를 써 보세요.');
      afterRender();
    }).catch(function (e) {
      if (e && e.code) throw e;
      throw { code: 'no-hwp' };
    });
  }

  /* ================================================================== PDF */
  function pdfReady() {
    if (!window.pdfjsLib) throw { code: 'no-libs' };
    try {
      var base = new URL('./libs/', document.baseURI).href;
      pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
      pdfjsLib.GlobalWorkerOptions.cMapUrl = base + 'cmaps/';
      pdfjsLib.GlobalWorkerOptions.cMapPacked = true;
    } catch (e) {}
    return window.pdfjsLib;
  }

  function openPdf(file) {
    var lib = pdfReady();
    return file.arrayBuffer().then(function (buf) {
      return lib.getDocument({
        data: new Uint8Array(buf),
        isEvalSupported: false,
        cMapUrl: pdfjsLib.GlobalWorkerOptions.cMapUrl,
        cMapPacked: true
      }).promise;
    }).then(function (pdf) {
      S.pdf = pdf;
      var total = pdf.numPages;
      var sheet = $('#sheet');
      sheet.innerHTML = '';
      S.pdfLines = [];
      S.pdfChars = 0;
      S.pw = A4W;
      var maxW = A4W;
      var chain = Promise.resolve();

      for (var i = 1; i <= total; i++) {
        (function (idx) {
          chain = chain.then(function () {
            setBusy(true, 'PDF ' + idx + '/' + total + '쪽 불러오는 중…');
            return pdf.getPage(idx).then(function (page) {
              var vp = page.getViewport({ scale: 1 });
              var cssW = vp.width * PT2PX, cssH = vp.height * PT2PX;
              maxW = Math.max(maxW, cssW);
              var dpr = Math.min(2, window.devicePixelRatio || 1);
              var canvas = document.createElement('canvas');
              canvas.width = Math.max(1, Math.round(cssW * dpr));
              canvas.height = Math.max(1, Math.round(cssH * dpr));
              canvas.style.width = cssW.toFixed(1) + 'px';
              canvas.style.height = cssH.toFixed(1) + 'px';
              var pageEl = document.createElement('article');
              pageEl.className = 'page pdf-page';
              pageEl.style.width = cssW.toFixed(1) + 'px';
              pageEl.appendChild(canvas);
              sheet.appendChild(pageEl);

              return page.render({
                canvasContext: canvas.getContext('2d', { alpha: false }),
                viewport: page.getViewport({ scale: PT2PX * dpr })
              }).promise.then(function () {
                return extractLines(page).then(function (lines) {
                  S.pdfLines.push({ page: idx, lines: lines });
                  lines.forEach(function (l) { S.pdfChars += (l.text || '').length; });
                });
              });
            });
          });
        })(i);
      }

      return chain.then(function () {
        S.pw = maxW;
        $('#vMeta').textContent = 'PDF · ' + total + '쪽' + (S.pdfChars ? ' · 글자 ' + S.pdfChars.toLocaleString() + '자' : ' · 글자 없음(스캔)');
        $('#convertBtn').hidden = false;
        if (S.pdfChars < Math.max(10, total * 8)) {
          $('#convertBtn').classList.add('off');
          notice('<b>글자가 없는 PDF</b>예요(스캔한 문서). 그림은 그대로 보이지만 <b>.hwpx 변환</b>은 내용이 비어 있어 쓸 수 없어요.');
        } else {
          notice('');
        }
        enterViewer();
        afterRender();
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      if (e && e.name === 'PasswordException') throw { code: 'no-pdf' };
      throw { code: 'no-pdf' };
    });
  }

  function extractLines(page) {
    return page.getTextContent({ normalizeWhitespace: false }).then(function (tc) {
      var items = [];
      (tc.items || []).forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var tr = it.transform || [1, 0, 0, 1, 0, 0];
        var size = Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3]) || it.height || 10;
        items.push({ str: it.str, x: tr[4], y: tr[5], w: it.width || 0, size: size });
      });
      if (!items.length) return [];
      items.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
      var lines = [];
      items.forEach(function (it) {
        var line = null;
        for (var i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) {
          if (Math.abs(lines[i].y - it.y) <= Math.max(2, it.size * 0.38)) { line = lines[i]; break; }
        }
        if (!line) { line = { y: it.y, size: it.size, items: [] }; lines.push(line); }
        line.items.push(it);
        line.size = Math.max(line.size, it.size);
      });
      return lines.map(function (l) {
        l.items.sort(function (a, b) { return a.x - b.x; });
        var text = '', prev = null;
        l.items.forEach(function (it) {
          if (prev) {
            var gap = it.x - (prev.x + prev.w);
            if (gap > Math.max(1.4, it.size * 0.2)) text += ' ';
          }
          text += it.str;
          prev = it;
        });
        return { text: text.replace(/\s+$/, ''), size: l.size, x: l.items[0].x };
      }).filter(function (l) { return l.text.trim().length > 0; });
    });
  }

  /* ================================================================== PDF → .hwpx */
  function convertToHwpx() {
    if (S.kind !== 'pdf' || !S.pdfLines.length) { toast('먼저 PDF를 열어 주세요.'); return; }
    if (S.pdfChars < 10) { toast('글자가 없는 스캔 PDF라 .hwpx로 바꿀 내용이 없어요.'); return; }
    setBusy(true, '한글(.hwpx) 파일을 만드는 중…');
    buildHwpx(S.pdfLines).then(function (blob) {
      var base = S.fileName.replace(/\.pdf$/i, '');
      var name = base + '.hwpx';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      setBusy(false);
      toast('한글 파일(.hwpx)로 저장했어요 — ' + fmtBytes(blob.size), 3600);
    }).catch(function (e) {
      console.warn('[한글·PDF] 변환 실패', e);
      setBusy(false);
      toast('변환에 실패했어요. 다시 시도해 주세요.');
    });
  }

  function buildHwpx(pages) {
    if (typeof JSZip === 'undefined' || !TEMPLATE_B64) return Promise.reject(new Error('no-template'));
    var sizes = [];
    pages.forEach(function (pg) { pg.lines.forEach(function (l) { sizes.push(l.size || 10); }); });
    sizes.sort(function (a, b) { return a - b; });
    var median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;

    var paras = [];
    pages.forEach(function (pg, pi) {
      var firstOfPage = true;
      pg.lines.forEach(function (line) {
        var text = (line.text || '').replace(/\s+$/, '');
        if (!text.trim()) return;
        var heading = line.size >= median * 1.35 && text.length <= 60;
        paras.push({ text: text, heading: heading, pageBreak: false });
        firstOfPage = false;
      });
      if (paras.length && pi > 0 && !firstOfPage) {
        /* 페이지마다 쪽 나눔 — 새 쪽 첫 문단에 표시 */
        for (var i = paras.length - 1; i >= 0; i--) {
          if (paras[i].pageBreak === false && !paras[i].heading && i > 0) { paras[i].pageBreak = true; break; }
        }
      }
    });
    if (!paras.length) return Promise.reject(new Error('empty'));

    return JSZip.loadAsync(b64ToBytes(TEMPLATE_B64)).then(function (tpl) {
      var secP = tpl.file('Contents/section0.xml').async('string');
      var hpfP = tpl.file('Contents/content.hpf') ? tpl.file('Contents/content.hpf').async('string') : Promise.resolve('');
      return Promise.all([secP, hpfP]).then(function (res) {
        var secXml = res[0], hpf = res[1];
        var pStart = secXml.indexOf('<hp:p ');
        var pEnd = secXml.indexOf('</hp:p>');
        if (pStart < 0 || pEnd < 0) throw new Error('template');
        var head = secXml.slice(0, pStart);
        var firstP = secXml.slice(pStart, pEnd + '</hp:p>'.length);
        var firstEmpty = firstP.replace(/<hp:run[^>]*><hp:t>[\s\S]*?<\/hp:t><\/hp:run>/, '');

        var body = paras.map(function (para, i) {
          var attr = 'paraPrIDRef="0" styleIDRef="0" pageBreak="' + (para.pageBreak ? 1 : 0) + '" columnBreak="0" merged="0"';
          var cp = para.heading ? '7' : '0';
          return '<hp:p id="' + (i + 1) + '" ' + attr + '><hp:run charPrIDRef="' + cp + '"><hp:t>' +
            escXml(para.text) + '</hp:t></hp:run></hp:p>';
        }).join('');

        var outSec = head + firstEmpty + body + '</hs:sec>';
        var preview = paras.map(function (p) { return p.text; }).join('\n').slice(0, 1500);
        var title = S.fileName.replace(/\.pdf$/i, '');
        if (hpf && hpf.indexOf('<opf:title/>') >= 0) hpf = hpf.replace('<opf:title/>', '<opf:title>' + escXml(title) + '</opf:title>');
        if (hpf && /ModifiedDate" content="text">[^<]*</.test(hpf)) {
          var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
          hpf = hpf.replace(/(ModifiedDate" content="text">)[^<]*/, '$1' + now);
        }

        var out = new JSZip();
        out.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
        var names = Object.keys(tpl.files).filter(function (n) { return !tpl.files[n].dir && n !== 'mimetype'; });
        var chain = Promise.resolve();
        names.forEach(function (n) {
          chain = chain.then(function () {
            if (n === 'Contents/section0.xml') { out.file(n, outSec); return; }
            if (n === 'Preview/PrvText.txt') { out.file(n, preview); return; }
            if (n === 'Contents/content.hpf') { out.file(n, hpf || ''); return; }
            return tpl.file(n).async('uint8array').then(function (b) { out.file(n, b); });
          });
        });
        return chain.then(function () {
          return out.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
        });
      });
    });
  }

  /* ================================================================== 인쇄 */
  function printDoc() {
    if (!S.kind) return;
    if (S.kind === 'pdf' && !S.pdfLines.length && $("#sheet").children.length === 0) {
      toast('먼저 문서를 열어 주세요.');
      return;
    }
    layoutSheet();
    setTimeout(function () { window.print(); }, 120);
  }

  /* ================================================================== 메모장 */
  function memoLoad() {
    try {
      var raw = localStorage.getItem(STORE_MEMO);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function memoSave(list) {
    try { localStorage.setItem(STORE_MEMO, JSON.stringify(list.slice(0, 40))); } catch (e) {}
  }
  function memoRender() {
    var list = memoLoad(), ul = $('#memoList');
    ul.innerHTML = '';
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'memo-empty';
      li.textContent = '아직 남긴 메모가 없어요.';
      ul.appendChild(li);
      return;
    }
    list.forEach(function (m, i) {
      var li = document.createElement('li');
      var sp = document.createElement('span');
      sp.textContent = m.text;
      var em = document.createElement('em');
      em.textContent = m.date || '';
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '삭제';
      del.addEventListener('click', function () {
        var cur = memoLoad();
        cur.splice(i, 1);
        memoSave(cur);
        memoRender();
      });
      li.appendChild(sp); li.appendChild(em); li.appendChild(del);
      ul.appendChild(li);
    });
  }
  function openMemo() {
    memoRender();
    $('#memoBack').hidden = false;
    if (!memoHistPushed) {
      try { history.pushState({ memo: 1 }, ''); memoHistPushed = true; } catch (e) {}
    }
    setTimeout(function () { $('#memoText').focus(); }, 120);
  }
  function settleMemoHistory() {
    if (!memoHistPushed) return;
    memoHistPushed = false;
    if (history.state && history.state.memo) {
      memoSelfBack = true;
      try { history.back(); } catch (e) { memoSelfBack = false; }
    }
  }
  function closeMemo(fromHistory) {
    $('#memoBack').hidden = true;
    if (!fromHistory) settleMemoHistory();
  }
  function bindMemo() {
    $('#memoBtn').addEventListener('click', openMemo);
    $('#memoClose').addEventListener('click', closeMemo);
    $('#memoBack').addEventListener('click', function (e) { if (e.target === this) closeMemo(); });
    $('#memoSave').addEventListener('click', function () {
      var text = ($('#memoText').value || '').trim();
      if (!text) { toast('내용을 적어 주세요.'); return; }
      var list = memoLoad();
      var d = new Date();
      var date = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
      list.unshift({ text: text, date: date });
      memoSave(list);
      $('#memoText').value = '';
      memoRender();
      toast('메모를 저장했어요.');
    });
    $('#memoCopy').addEventListener('click', function () {
      var list = memoLoad();
      if (!list.length) { toast('복사할 메모가 없어요.'); return; }
      var text = list.map(function (m) { return '[' + m.date + '] ' + m.text; }).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('메모를 복사했어요.'); })
          .catch(function () { toast('복사하지 못했어요.'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); toast('메모를 복사했어요.'); } catch (e) { toast('복사하지 못했어요.'); }
        ta.remove();
      }
    });
  }

  /* ================================================================== 시작 */
  function boot() {
    bindGate();
    bindPwa();
    paintDots();
    if (installIsOpen()) unlockApp();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
