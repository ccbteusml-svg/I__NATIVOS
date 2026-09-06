// ==========================================
// I__NATIVOS v4.0 — Gerenciador CTO Mobile-First
// Refatoração completa: IndexedDB, Bottom Sheets, Swipe, Wake Lock, Web Share, Speech
// ==========================================

const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';
const TOTAL_PORTS = 16;
const STORAGE_KEY = 'inativos_v4';
const DB_NAME = 'InativosDB';
const DB_VERSION = 1;
const SPECIAL_VALUES = ['Livre','Defeito','Sem ident.','Reserva','Vago'];

let portsData = new Array(TOTAL_PORTS).fill('');
let currentTheme = 'dark';
let ctoCache = [];
let lastEditedPort = null;
let focusPortIndex = 0;
let focusModeActive = false;
let diffData = null;
let deferredPrompt = null;
let wakeLock = null;
let audioInitialized = false;
let saveTimeout = null;
let snapshotInterval = null;
let syncQueue = [];
let isOnline = navigator.onLine;

// Sons (lazy load)
let sfxErro, sfxClick, sfxSucesso, sfxLixo;

// IndexedDB
let db = null;

// Promises para bottom sheets
let confirmResolve = null;
let alertResolve = null;

// ==========================================
// INDEXEDDB
// ==========================================

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { db = req.result; resolve(db); };
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('syncQueue')) {
                d.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }
            if (!d.objectStoreNames.contains('ctoCache')) {
                d.createObjectStore('ctoCache', { keyPath: 'normalizedCTO' });
            }
            if (!d.objectStoreNames.contains('snapshots')) {
                d.createObjectStore('snapshots', { keyPath: 'timestamp' });
            }
            if (!d.objectStoreNames.contains('recentCTOs')) {
                d.createObjectStore('recentCTOs', { keyPath: 'cto' });
            }
        };
    });
}

function dbPut(store, data) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        const req = st.put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbGetAll(store) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const st = tx.objectStore(store);
        const req = st.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbDelete(store, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        const req = st.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function dbClear(store) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const st = tx.objectStore(store);
        const req = st.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ==========================================
// AUDIO (LAZY)
// ==========================================

function initAudio() {
    if (audioInitialized) return;
    try {
        sfxErro = new Audio('erro_digital.mp3');
        sfxClick = new Audio('click_tec.mp3');
        sfxSucesso = new Audio('sucesso.mp3');
        sfxLixo = new Audio('trash.mp3');
        sfxErro.volume = 0.6; sfxClick.volume = 0.4;
        sfxSucesso.volume = 0.5; sfxLixo.volume = 0.5;
        audioInitialized = true;
    } catch (e) { console.warn('Audio não suportado'); }
}

function playSound(audio) {
    if (!audio) return;
    try { audio.currentTime = 0; audio.play().catch(()=>{}); } catch (e) {}
}

// ==========================================
// VIBRATION PATTERNS
// ==========================================

function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
}

function vibSuccess() { vibrate([50,30,50]); }
function vibError() { vibrate([200,80,200,80,200]); }
function vibWarn() { vibrate([100,50,100]); }
function vibClick() { vibrate(20); }
function vibLongPress() { vibrate(40); }

// ==========================================
// NORMALIZAÇÃO CTO
// ==========================================

function normalizarCTO(nome) {
    if (!nome) return '';
    let s = nome.toUpperCase().trim();
    s = s.replace(/\bCTO\b\s*/g, '').trim();
    if (s.startsWith('CTO') && s.length > 3) s = s.slice(3);
    const prefixoMatch = s.match(/^[A-Z]+/);
    const prefixo = prefixoMatch ? prefixoMatch[0] : '';
    let resto = prefixo ? s.slice(prefixo.length) : s;
    resto = resto.replace(/^[^A-Z0-9]+/i, '');
    resto = resto.replace(/-/g, '.');
    const numeros = resto.match(/\d+/g) || [];
    if (!prefixo && numeros.length === 0) return s;
    const nums = numeros.join('.');
    return prefixo ? `${prefixo} ${nums}` : nums;
}

function gerarVariacoesCTO(nome) {
    const canonico = normalizarCTO(nome);
    if (!canonico) return [nome];
    const partes = canonico.split(' ');
    const prefixo = partes[0];
    const nums = partes[1] || '';
    const numeros = nums.split('.');
    const v = new Set();
    v.add(canonico);
    v.add(`CTO${prefixo} ${nums}`);
    v.add(`CTO ${prefixo} ${nums}`);
    v.add(`${prefixo} ${numeros.join('-')}`);
    v.add(`${prefixo}${numeros.join('.')}`);
    v.add(`${prefixo}${numeros.join('-')}`);
    v.add(`CTO${prefixo}${numeros.join('.')}`);
    v.add(`CTO-${prefixo}${numeros.join('-')}`);
    return Array.from(v);
}

// ==========================================
// CACHE CTOs (IndexedDB)
// ==========================================

async function carregarCacheCTOs() {
    try {
        // Primeiro tenta do IndexedDB
        const cached = await dbGetAll('ctoCache');
        if (cached && cached.length > 0) {
            ctoCache = cached.map(c => ({ CTO: c.cto, RESUMO: c.resumo }));
            return ctoCache;
        }
        // Senão, busca da rede
        const res = await fetch(SHEETDB_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        ctoCache = data;
        // Salva no IndexedDB
        for (const item of data) {
            await dbPut('ctoCache', {
                normalizedCTO: normalizarCTO(item.CTO || ''),
                cto: item.CTO,
                resumo: item.RESUMO
            });
        }
        return ctoCache;
    } catch (e) {
        console.warn('Cache não carregado:', e);
        return [];
    }
}

function buscarFuzzyCTO(termo) {
    const termoNorm = normalizarCTO(termo);
    if (!termoNorm) return [];
    const termoNums = termoNorm.replace(/[^0-9.]/g, '');
    const termoPrefixo = termoNorm.match(/^[A-Z]+/)?.[0] || '';
    return ctoCache.filter(item => {
        const ctoNorm = normalizarCTO(item.CTO || '');
        if (ctoNorm === termoNorm) return true;
        const ctoNums = ctoNorm.replace(/[^0-9.]/g, '');
        const ctoPrefixo = ctoNorm.match(/^[A-Z]+/)?.[0] || '';
        if (termoPrefixo && ctoPrefixo !== termoPrefixo) return false;
        if (termoNums) {
            return ctoNums === termoNums || ctoNums.startsWith(termoNums) || termoNums.startsWith(ctoNums);
        }
        return true;
    }).sort((a, b) => {
        const aN = normalizarCTO(a.CTO);
        const bN = normalizarCTO(b.CTO);
        if (aN === termoNorm) return -1;
        if (bN === termoNorm) return 1;
        const aNums = aN.replace(/[^0-9.]/g, '');
        const bNums = bN.replace(/[^0-9.]/g, '');
        if (aNums === termoNums && bNums !== termoNums) return -1;
        if (bNums === termoNums && aNums !== termoNums) return 1;
        return a.CTO.localeCompare(b.CTO);
    });
}

// ==========================================
// RECENT CTOs
// ==========================================

async function addRecentCTO(ctoName) {
    if (!ctoName) return;
    const norm = normalizarCTO(ctoName);
    await dbPut('recentCTOs', { cto: norm, original: ctoName, timestamp: Date.now() });
    // Mantém só os últimos 5
    const all = await dbGetAll('recentCTOs');
    all.sort((a,b) => b.timestamp - a.timestamp);
    for (let i = 5; i < all.length; i++) {
        await dbDelete('recentCTOs', all[i].cto);
    }
}

async function getRecentCTOs() {
    const all = await dbGetAll('recentCTOs');
    return all.sort((a,b) => b.timestamp - a.timestamp).slice(0, 5);
}

// ==========================================
// SYNC QUEUE (IndexedDB)
// ==========================================

async function enqueueSync(data) {
    const item = { ...data, timestamp: Date.now(), attempts: 0 };
    await dbPut('syncQueue', item);
    syncQueue.push(item);
    updateSyncStatus('syncing');
    attemptSync();
}

async function attemptSync() {
    if (!navigator.onLine) {
        updateSyncStatus('offline');
        return;
    }
    const queue = await dbGetAll('syncQueue');
    if (queue.length === 0) {
        updateSyncStatus('synced');
        return;
    }
    updateSyncStatus('syncing');
    for (const item of queue) {
        try {
            if (item.type === 'save') {
                await salvarSheetDB(item.data);
            }
            await dbDelete('syncQueue', item.id);
        } catch (e) {
            console.warn('Sync failed for item', item.id, e);
            item.attempts++;
            if (item.attempts < 3) {
                await dbPut('syncQueue', item);
            } else {
                await dbDelete('syncQueue', item.id);
            }
        }
    }
    const remaining = await dbGetAll('syncQueue');
    updateSyncStatus(remaining.length > 0 ? 'failed' : 'synced');
}

function updateSyncStatus(status) {
    const pill = document.getElementById('syncPill');
    const text = document.getElementById('syncText');
    if (!pill) return;
    pill.className = 'sync-pill ' + status;
    const map = { syncing: '⏳ Sincronizando...', synced: '✓ Sincronizado', failed: '⚠️ Falha - toque', offline: '📴 Offline' };
    text.textContent = map[status] || status;
}

function retrySync() {
    if (!navigator.onLine) {
        showToast('Sem conexão. Tentando quando voltar...', 'warn');
        return;
    }
    attemptSync();
}

async function salvarSheetDB(data) {
    const payload = { data: [data] };
    const todas = await fetch(SHEETDB_URL).then(r => r.json());
    const cto = normalizarCTO(data.CTO);
    const existente = todas.find(item => normalizarCTO(item.CTO) === cto);
    if (existente) {
        await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(existente.CTO)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    } else {
        await fetch(SHEETDB_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    }
}

// ==========================================
// SNAPSHOTS
// ==========================================

async function createSnapshot() {
    const data = {
        cto: document.getElementById('ctoName').value,
        ports: [...portsData],
        theme: currentTheme,
        timestamp: Date.now()
    };
    const snaps = await dbGetAll('snapshots');
    snaps.sort((a,b) => a.timestamp - b.timestamp);
    if (snaps.length >= 3) {
        await dbDelete('snapshots', snaps[0].timestamp);
    }
    await dbPut('snapshots', data);
}

async function restoreSnapshot() {
    const snaps = await dbGetAll('snapshots');
    if (snaps.length === 0) return null;
    snaps.sort((a,b) => b.timestamp - a.timestamp);
    return snaps[0];
}

// ==========================================
// BOTTOM SHEETS
// ==========================================

function showBottomSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('show'));
    document.body.style.overflow = 'hidden';
}

function hideBottomSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => {
        el.style.display = 'none';
        document.body.style.overflow = '';
    }, 300);
}

function closeBottomSheet(e, id) {
    if (e.target === e.currentTarget) hideBottomSheet(id);
}

function showAlert(title, text) {
    return new Promise((resolve) => {
        alertResolve = resolve;
        document.getElementById('sheetAlertTitle').textContent = title;
        document.getElementById('sheetAlertText').innerHTML = text;
        showBottomSheet('sheetAlert');
    });
}

function resolveAlert() {
    hideBottomSheet('sheetAlert');
    if (alertResolve) { alertResolve(); alertResolve = null; }
}

function showConfirm(title, text) {
    return new Promise((resolve) => {
        confirmResolve = resolve;
        document.getElementById('sheetConfirmTitle').textContent = title;
        document.getElementById('sheetConfirmText').innerHTML = text;
        showBottomSheet('sheetConfirm');
    });
}

function resolveConfirm(result) {
    hideBottomSheet('sheetConfirm');
    if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
}

// ==========================================
// TOAST
// ==========================================

let toastTimeout;
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => toast.classList.add('show'));
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ==========================================
// TEMAS
// ==========================================

function setTheme(theme) {
    currentTheme = theme;
    document.body.classList.remove('sun-mode', 'neon-mode');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (theme === 'sun') {
        document.body.classList.add('sun-mode');
        if (meta) meta.setAttribute('content', '#ffffff');
    } else if (theme === 'neon') {
        document.body.classList.add('neon-mode');
        if (meta) meta.setAttribute('content', '#050508');
    } else {
        if (meta) meta.setAttribute('content', '#0a0a0f');
    }
    document.querySelectorAll('.theme-dot').forEach(btn => btn.classList.remove('active'));
    const btnId = 'theme' + theme.charAt(0).toUpperCase() + theme.slice(1);
    document.getElementById(btnId)?.classList.add('active');
    autoSave();
    initAudio(); playSound(sfxClick); vibClick();
}

function loadTheme() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (data.theme) setTheme(data.theme);
    } catch (e) {}
}

// ==========================================
// RENDERIZAÇÃO DE PORTAS
// ==========================================

function renderPorts() {
    const container = document.getElementById('portsContainer');
    let html = '';
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        html += `
            <div class="port-row" id="port-row-${i}" style="animation-delay:${i*0.02}s" data-port="${i}">
                <div class="port-num" onclick="focusPort(${i})" role="button" tabindex="0" aria-label="Porta ${i}">P${i}</div>
                <input type="text" id="input-${i}" class="port-input" placeholder="PE ou cliente..."
                    enterkeyhint="next" inputmode="text" autocapitalize="characters"
                    oninput="updateData(${i},this.value)"
                    onfocus="onPortFocus(${i})"
                    onblur="onPortBlur(${i})"
                    onkeydown="handlePortKey(event,${i})"
                    aria-label="Porta ${i}, valor atual: ${portsData[i-1] || 'vazio'}">
                <div class="port-actions">
                    <button class="port-btn" id="btn-u-${i}" onclick="setQuickAction(${i},'Sem ident.')" aria-label="Porta ${i} sem identificação" title="Sem ident.">?</button>
                    <button class="port-btn" id="btn-d-${i}" onclick="setQuickAction(${i},'Defeito')" aria-label="Porta ${i} defeito" title="Defeito">!</button>
                    <button class="port-btn" id="btn-e-${i}" onclick="setQuickAction(${i},'Livre')" aria-label="Porta ${i} livre" title="Livre">∞</button>
                </div>
                <div class="dup-badge" id="dup-${i}">DUPLICADO</div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function onPortFocus(index) {
    lastEditedPort = index;
    const row = document.getElementById(`port-row-${index}`);
    if (row) row.classList.add('last-edited');
    document.getElementById('stickyPortHeader')?.classList.add('visible');
    document.getElementById('stickyPortValue').textContent = `P${index}: ${portsData[index-1] || 'Vazio'}`;
    updateARIA(index);
    // Mostra floating nav se mobile
    if (window.innerWidth < 720) {
        document.getElementById('floatingNav')?.classList.add('show');
    }
    requestWakeLock();
}

function onPortBlur(index) {
    const row = document.getElementById(`port-row-${index}`);
    if (row) {
        setTimeout(() => row.classList.remove('last-edited'), 3000);
    }
    document.getElementById('stickyPortHeader')?.classList.remove('visible');
    document.getElementById('floatingNav')?.classList.remove('show');
    releaseWakeLock();
}

function updateARIA(index) {
    const input = document.getElementById(`input-${index}`);
    if (input) {
        const val = portsData[index-1] || 'vazio';
        const estado = getPortStateLabel(portsData[index-1]);
        input.setAttribute('aria-label', `Porta ${index}, ${estado}: ${val}`);
    }
}

function getPortStateLabel(val) {
    const v = (val || '').trim();
    if (!v || v === 'Livre' || v === 'Reserva' || v === 'Vago') return 'livre';
    if (v === 'Defeito') return 'defeito';
    if (v === 'Sem ident.') return 'sem identificação';
    return 'ocupada';
}

// ==========================================
// ATUALIZAÇÃO DE DADOS
// ==========================================

function updateData(index, value) {
    portsData[index - 1] = value;
    const input = document.getElementById(`input-${index}`);
    if (input) { input.title = value || ''; updateARIA(index); }
    updateButtonStyles(index, value);
    updatePortRowState(index, value);
    updateStats();
    updateVisualizer();
    updatePreview();
    checkDuplicates();
    debouncedAutoSave();
    document.getElementById('stickyPortValue').textContent = `P${index}: ${value || 'Vazio'}`;
}

function setQuickAction(index, text) {
    const input = document.getElementById(`input-${index}`);
    if (!input) return;
    if (input.value === text) {
        input.value = ''; updateData(index, '');
    } else {
        input.value = text; updateData(index, text);
    }
    initAudio(); playSound(sfxClick); vibClick();
}

function updateButtonStyles(index, value) {
    const btnU = document.getElementById(`btn-u-${index}`);
    const btnD = document.getElementById(`btn-d-${index}`);
    const btnE = document.getElementById(`btn-e-${index}`);
    if (btnU) btnU.className = 'port-btn' + (value === 'Sem ident.' ? ' active-warn' : '');
    if (btnD) btnD.className = 'port-btn' + (value === 'Defeito' ? ' active-danger' : '');
    if (btnE) btnE.className = 'port-btn' + (value === 'Livre' ? ' active-info' : '');
}

function updatePortRowState(index, value) {
    const row = document.getElementById(`port-row-${index}`);
    if (!row) return;
    row.classList.remove('state-free', 'state-defect', 'state-unidentified', 'state-occupied');
    const v = (value || '').trim();
    if (!v || v === 'Livre' || v === 'Reserva' || v === 'Vago') row.classList.add('state-free');
    else if (v === 'Defeito') row.classList.add('state-defect');
    else if (v === 'Sem ident.') row.classList.add('state-unidentified');
    else row.classList.add('state-occupied');
}

// ==========================================
// ESTATÍSTICAS
// ==========================================

function updateStats() {
    let free = 0, occupied = 0, defect = 0, unidentified = 0;
    portsData.forEach(val => {
        const v = (val || '').trim();
        if (!v || v === 'Livre' || v === 'Reserva' || v === 'Vago') free++;
        else if (v === 'Defeito') defect++;
        else if (v === 'Sem ident.') unidentified++;
        else occupied++;
    });
    document.getElementById('statFree').textContent = free;
    document.getElementById('statOccupied').textContent = occupied;
    document.getElementById('statDefect').textContent = defect;
    document.getElementById('statUnidentified').textContent = unidentified;
    const filled = TOTAL_PORTS - free;
    const pct = Math.round((filled / TOTAL_PORTS) * 100);
    document.getElementById('occupancyBadge').textContent = pct + '%';
    document.getElementById('portCountBadge').textContent = `${filled}/${TOTAL_PORTS}`;
    document.getElementById('progressBar').style.width = pct + '%';
    const badge = document.getElementById('occupancyBadge');
    badge.className = 'badge ' + (pct >= 90 ? 'badge-red' : pct >= 70 ? 'badge-yellow' : 'badge-blue');
}

// ==========================================
// VISUALIZADOR DA CTO
// ==========================================

function updateVisualizer() {
    const grid = document.getElementById('ctoDrawing');
    let html = '';
    portsData.forEach((val, i) => {
        const v = (val || '').trim();
        let cls = '';
        let label = '';
        if (!v || v === 'Livre' || v === 'Reserva' || v === 'Vago') { cls = v === 'Livre' ? 'free' : ''; label = v || 'Vazio'; }
        else if (v === 'Defeito') { cls = 'defect'; label = 'Defeito'; }
        else if (v === 'Sem ident.') { cls = 'unidentified'; label = 'S/ Ident.'; }
        else { cls = 'occupied'; label = v.length > 10 ? v.substring(0,9) + '…' : v; }
        const lastEdit = (lastEditedPort === i + 1) ? 'last-edited' : '';
        html += `<div class="cto-slot ${cls} ${lastEdit}" id="quad-vis-${i+1}" onclick="gridClick(${i+1})" oncontextmenu="event.preventDefault();openLongPressMenu(event,${i+1})" role="gridcell" tabindex="0" aria-label="Porta ${i+1}, ${getPortStateLabel(v)}: ${v || 'vazio'}" title="P${i+1}: ${v || 'Vazio'}" onkeydown="if(event.key==='Enter'||event.key===' ')gridClick(${i+1})"><span class="slot-num">${i+1}</span><span class="slot-label">${label}</span></div>`;
    });
    grid.innerHTML = html;
}

function gridClick(index) {
    focusPort(index);
    initAudio(); playSound(sfxClick); vibClick();
}

function focusPort(index) {
    const input = document.getElementById(`input-${index}`);
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.parentElement.style.animation = 'shake 0.3s';
        setTimeout(() => { if (input.parentElement) input.parentElement.style.animation = ''; }, 300);
        vibrate(30);
    }
}

// ==========================================
// LONG PRESS MENU
// ==========================================

let lpmTarget = null;
let longPressTimer = null;

function openLongPressMenu(e, index) {
    lpmTarget = index;
    const menu = document.getElementById('longPressMenu');
    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 250) + 'px';
    menu.classList.add('show');
    vibLongPress();
}

function closeLongPressMenu() {
    document.getElementById('longPressMenu')?.classList.remove('show');
    lpmTarget = null;
}

function lpmAction(action) {
    if (!lpmTarget) return;
    if (action === 'edit') focusPort(lpmTarget);
    else if (action === 'free') setQuickAction(lpmTarget, 'Livre');
    else if (action === 'defect') setQuickAction(lpmTarget, 'Defeito');
    else if (action === 'unidentified') setQuickAction(lpmTarget, 'Sem ident.');
    else if (action === 'focus') { focusPortIndex = lpmTarget - 1; openFocusMode(); }
    closeLongPressMenu();
}

// Touch handlers para long press no grid
function setupLongPress() {
    const grid = document.getElementById('ctoDrawing');
    if (!grid) return;
    grid.addEventListener('touchstart', (e) => {
        const slot = e.target.closest('.cto-slot');
        if (!slot) return;
        const index = parseInt(slot.querySelector('.slot-num')?.textContent);
        if (!index) return;
        longPressTimer = setTimeout(() => {
            const touch = e.touches[0];
            openLongPressMenu({ clientX: touch.clientX, clientY: touch.clientY }, index);
        }, 600);
    }, { passive: true });
    grid.addEventListener('touchend', () => clearTimeout(longPressTimer));
    grid.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#longPressMenu')) closeLongPressMenu();
    });
}

// ==========================================
// SWIPE GESTURES
// ==========================================

function setupSwipe() {
    const focusOverlay = document.getElementById('focusMode');
    if (!focusOverlay) return;
    let startX = 0, startY = 0, startTime = 0;
    focusOverlay.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; startTime = Date.now();
    }, { passive: true });
    focusOverlay.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dt = Date.now() - startTime;
        if (dt > 300 || Math.abs(dx) < 40 && Math.abs(dy) < 40) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 0) focusNav(-1);
            else focusNav(1);
        } else {
            if (dy > 0) { closeFocusMode(); }
            else { focusNav(4); }
        }
    }, { passive: true });
}

// ==========================================
// FOCUS MODE (EDIÇÃO RÁPIDA)
// ==========================================

function toggleFocusMode() {
    if (focusModeActive) closeFocusMode();
    else { focusPortIndex = lastEditedPort ? lastEditedPort - 1 : 0; openFocusMode(); }
}

function openFocusMode() {
    focusModeActive = true;
    const overlay = document.getElementById('focusMode');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    updateFocusView();
    requestWakeLock();
    initAudio(); playSound(sfxClick); vibClick();
}

function closeFocusMode() {
    focusModeActive = false;
    document.getElementById('focusMode')?.classList.remove('show');
    document.body.style.overflow = '';
    releaseWakeLock();
}

function updateFocusView() {
    const idx = focusPortIndex;
    document.getElementById('focusPortNum').textContent = 'P' + (idx + 1);
    const input = document.getElementById('focusInput');
    input.value = portsData[idx] || '';
    input.focus();
    // Atualiza botões de ação
    const val = portsData[idx] || '';
    document.getElementById('focusBtnU').classList.toggle('active', val === 'Sem ident.');
    document.getElementById('focusBtnD').classList.toggle('active', val === 'Defeito');
    document.getElementById('focusBtnE').classList.toggle('active', val === 'Livre');
}

function setFocusAction(text) {
    const input = document.getElementById('focusInput');
    if (input.value === text) { input.value = ''; }
    else { input.value = text; }
    updateData(focusPortIndex + 1, input.value);
    updateFocusView();
    initAudio(); playSound(sfxClick); vibClick();
}

function focusNav(delta) {
    const newIndex = focusPortIndex + delta;
    if (newIndex < 0 || newIndex >= TOTAL_PORTS) {
        vibWarn(); return;
    }
    focusPortIndex = newIndex;
    updateFocusView();
    vibClick();
}

// Input do focus mode
function setupFocusInput() {
    const input = document.getElementById('focusInput');
    if (!input) return;
    input.addEventListener('input', () => {
        updateData(focusPortIndex + 1, input.value);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); focusNav(1); }
    });
}

// ==========================================
// VISUAL VIEWPORT (TECLADO)
// ==========================================

function setupVisualViewport() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const app = document.getElementById('appContainer');
    const floating = document.getElementById('floatingNav');
    vv.addEventListener('resize', () => {
        const kbHeight = window.innerHeight - vv.height;
        if (app) app.style.paddingBottom = (kbHeight > 100 ? kbHeight + 20 : 120) + 'px';
        if (floating && kbHeight > 100) floating.classList.add('show');
        else if (floating) floating.classList.remove('show');
    });
    vv.addEventListener('scroll', () => {
        document.documentElement.scrollTop = 0;
    });
}

// ==========================================
// PREVIEW
// ==========================================

function updatePreview() {
    const cto = document.getElementById('ctoName').value.trim() || 'CTO SEM NOME';
    let text = `📌 *${cto}*\n\n`;
    portsData.forEach((val, i) => { text += `P${i+1} ➔ ${val || '---'}\n`; });
    document.getElementById('previewArea').textContent = text;
}

function togglePreview() {
    document.getElementById('previewArea').classList.toggle('show');
    initAudio(); playSound(sfxClick); vibClick();
}

// ==========================================
// DUPLICATAS
// ==========================================

function checkDuplicates() {
    const valueMap = {};
    let hasDuplicate = false;
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        document.getElementById(`input-${i}`)?.classList.remove('input-error');
        document.getElementById(`dup-${i}`)?.classList.remove('show');
    }
    portsData.forEach((val, index) => {
        const clean = (val || '').trim();
        if (clean && !SPECIAL_VALUES.includes(clean)) {
            if (!valueMap[clean]) valueMap[clean] = [];
            valueMap[clean].push(index + 1);
        }
    });
    Object.keys(valueMap).forEach(key => {
        if (valueMap[key].length > 1) {
            hasDuplicate = true;
            valueMap[key].forEach(port => {
                document.getElementById(`input-${port}`)?.classList.add('input-error');
                document.getElementById(`dup-${port}`)?.classList.add('show');
            });
        }
    });
    if (hasDuplicate) { showToast('⚠️ Código duplicado detectado!', 'error'); initAudio(); playSound(sfxErro); vibError(); }
}

// ==========================================
// AÇÕES PRINCIPAIS
// ==========================================

async function copyToClipboard() {
    const text = document.getElementById('previewArea').textContent;
    const cto = document.getElementById('ctoName').value.trim();
    try {
        await navigator.clipboard.writeText(text);
        showToast('✅ Resumo copiado!', 'success');
        initAudio(); playSound(sfxSucesso); vibSuccess();
        if (cto) {
            const save = await showConfirm('Salvar no Excel?', `Deseja salvar/atualizar <b>${cto}</b> na planilha?`);
            if (save) {
                await salvarEmBackground();
                showToast('💾 Dados sincronizados!', 'success');
            }
        }
    } catch (e) {
        showToast('Erro ao copiar. Tente manualmente.', 'error');
        initAudio(); playSound(sfxErro); vibError();
    }
}

async function shareContent() {
    const text = document.getElementById('previewArea').textContent;
    const cto = document.getElementById('ctoName').value.trim() || 'CTO';
    if (navigator.share) {
        try {
            await navigator.share({ title: `Resumo ${cto}`, text: text });
            vibSuccess();
        } catch (e) { /* cancelado */ }
    } else {
        await copyToClipboard();
        showToast('📋 Copiado (share não disponível)', 'success');
    }
}

async function clearAll() {
    const confirm = await showConfirm('Limpar CTO?', 'Todos os dados serão apagados.\nEsta ação não pode ser desfeita.');
    if (confirm) {
        initAudio(); playSound(sfxLixo); vibError();
        document.getElementById('ctoName').value = '';
        document.getElementById('textoRetorno').value = '';
        portsData.fill('');
        renderPorts();
        updateStats();
        updateVisualizer();
        updatePreview();
        localStorage.removeItem(STORAGE_KEY);
        await dbClear('snapshots');
        showToast('🗑️ CTO limpa com sucesso', 'success');
    }
}

// ==========================================
// NORMALIZADOR DE VALOR DE PORTA
// ==========================================

function normalizarValorPorta(val) {
    if (!val) return '';
    const v = val.toString().trim();
    const vLower = v.toLowerCase();
    if (/^[-–—\s]*$/.test(v) || v === '---' || v === '--') return '';
    if (/^\s*livre\s*$/i.test(v)) return 'Livre';
    if (/^\s*vago\s*$/i.test(v)) return 'Livre';
    if (/^\s*reserva\s*$/i.test(v)) return 'Livre';
    if (/^\s*retirado\s*$/i.test(v)) return 'Livre';
    if (/^\s*sem\s*ident\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*semident\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*id\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*semid\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*pe\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*identifica[çc][aã]o\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*idf?\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*defeito\s*$/i.test(v)) return 'Defeito';
    if (/duplicado/i.test(vLower) || /id\s*incorreto/i.test(vLower) || /idduplic/i.test(vLower)) {
        const nums = v.match(/^(\d+)/);
        if (nums) return nums[1] + ' duplicado';
        return 'Sem ident.';
    }
    const numsOnly = v.match(/^(\d+)$/);
    if (numsOnly) return numsOnly[1];
    const numsPrefix = v.match(/^(\d+)\s+/);
    if (numsPrefix) return numsPrefix[1];
    return v;
}

// ==========================================
// FERRAMENTAS DA CENTRAL — PARSER ROBUSTO
// ==========================================

async function analisarRetorno() {
    const texto = document.getElementById('textoRetorno').value.trim();
    if (!texto) { showToast('Cole a mensagem da central primeiro!', 'warn'); return; }
    const regex = /(?<!\d)\d{4,6}(?!\d)/g;
    const codigos = [...texto.matchAll(regex)].map(m => m[0]);
    if (codigos.length === 0) { showToast('Nenhum código de 4-6 dígitos encontrado.', 'warn'); return; }
    let encontrados = 0;
    document.querySelectorAll('.cto-slot').forEach(s => s.classList.remove('marked-delete'));
    for (let i = 0; i < TOTAL_PORTS; i++) {
        const val = (portsData[i] || '').trim();
        const valNorm = val?.replace(/\s+duplicado.*/i, '')?.replace(/\D/g, '') || '';
        if (valNorm && codigos.includes(valNorm)) {
            const slot = document.getElementById(`quad-vis-${i+1}`);
            if (slot) { slot.classList.add('marked-delete'); slot.querySelector('.slot-label').textContent = '🗑️'; encontrados++; }
        }
    }
    if (encontrados > 0) {
        showToast(`⚠️ ${encontrados} porta(s) marcada(s) para remoção!`, 'error');
        initAudio(); playSound(sfxErro); vibError();
        const removeAll = await showConfirm('Remover todos?', `Remover ${encontrados} portas marcadas como inativas?`);
        if (removeAll) {
            for (let i = 0; i < TOTAL_PORTS; i++) {
                const slot = document.getElementById(`quad-vis-${i+1}`);
                if (slot?.classList.contains('marked-delete')) {
                    setQuickAction(i+1, 'Livre');
                }
            }
            showToast('✅ Inativos removidos', 'success');
            vibSuccess();
        }
    } else {
        showToast('Nenhum código bateu com as portas atuais.', 'warn');
    }
}

function parseCTOText(texto) {
    let t = texto.replace(/\|/g, ' ').replace(/\n+/g, '\n');
    let ctoNome = '';
    let m = t.match(/[📌*]*\s*\*?\s*(CTO[A-Z]*\s*[0-9.\-]+|CTO\s+[A-Z]+\s*[0-9.\-]+|[A-Z]+\s+[0-9.\-]+|CTO\s+SEM\s+NOME|CTOSEMNOME)\s*\*?/i);
    if (m?.[1]) ctoNome = m[1].trim();
    if (!ctoNome) {
        m = t.match(/\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}[^\dA-Z]*([A-Z]+[0-9.\-]+)/i);
        if (m?.[1]) ctoNome = m[1].trim();
    }
    if (!ctoNome) {
        const linhas = t.split('\n');
        for (const linha of linhas) {
            const mm = linha.trim().match(/^(CTO[A-Z]*\s*[0-9.\-]+|CTO\s+[A-Z]+\s*[0-9.\-]+|[A-Z]+\s+[0-9.\-]+|CTO\s+SEM\s+NOME|CTOSEMNOME)$/i);
            if (mm) { ctoNome = mm[1].trim(); break; }
        }
    }
    if (!ctoNome) {
        m = t.match(/^\s*(CTO[^\n\r]*)/im);
        if (m?.[1]) {
            const candidato = m[1].trim().split(/\s/)[0];
            if (candidato.length > 3) ctoNome = candidato;
        }
    }
    if (ctoNome) {
        ctoNome = ctoNome.replace(/^[^\w]+/, '').replace(/[^\w.\-]+$/, '');
    }
    const portMap = {};
    const portRegex = /P\s*(\d{1,2})\s*[➔→:>\-]\s*([^\nP]*?)(?=\s*P\s*\d{1,2}\s*[➔→:>\-]|\n|$)/gi;
    let match;
    while ((match = portRegex.exec(t)) !== null) {
        const portNum = parseInt(match[1], 10);
        let val = match[2].trim();
        val = normalizarValorPorta(val);
        if (portNum >= 1 && portNum <= TOTAL_PORTS) portMap[portNum] = val;
    }
    if (Object.keys(portMap).length === 0) {
        const linhas = t.split('\n');
        for (const linha of linhas) {
            const mm = linha.match(/P\s*(\d{1,2})\s*[➔→:>\-]\s*(.+)/i);
            if (mm) {
                const portNum = parseInt(mm[1], 10);
                let val = mm[2].trim(); val = normalizarValorPorta(val);
                if (portNum >= 1 && portNum <= TOTAL_PORTS) portMap[portNum] = val;
            }
        }
    }
    if (Object.keys(portMap).length === 0) {
        const linhas = t.split('\n');
        for (const linha of linhas) {
            const mm = linha.match(/P\s*(\d{1,2})\s+([A-Za-z0-9\-]+)/i);
            if (mm) {
                const portNum = parseInt(mm[1], 10);
                let val = mm[2].trim(); val = normalizarValorPorta(val);
                if (portNum >= 1 && portNum <= TOTAL_PORTS) portMap[portNum] = val;
            }
        }
    }
    // Detecção CSV/TSV
    if (Object.keys(portMap).length === 0) {
        const delimiters = [',', '\t', ';'];
        for (const delim of delimiters) {
            const parts = t.split(delim);
            if (parts.length >= 16) {
                for (let i = 0; i < Math.min(parts.length, TOTAL_PORTS); i++) {
                    const val = normalizarValorPorta(parts[i]);
                    if (val !== undefined) portMap[i+1] = val;
                }
                break;
            }
        }
    }
    return { ctoNome, portMap };
}

async function carregarCTO() {
    let texto = document.getElementById('textoRetorno').value.trim();
    if (!texto) { showToast('Cole o texto da planilha primeiro!', 'warn'); return; }
    const parsed = parseCTOText(texto);
    if (parsed.ctoNome) document.getElementById('ctoName').value = parsed.ctoNome;
    // Gera diff
    const diffs = [];
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        const oldVal = portsData[i-1] || '';
        const newVal = parsed.portMap[i] !== undefined ? parsed.portMap[i] : '';
        if (oldVal !== newVal) {
            diffs.push({ port: i, old: oldVal || '---', new: newVal || '---' });
        }
    }
    if (diffs.length === 0) {
        showToast('Nenhuma mudança detectada.', 'warn');
        return;
    }
    // Mostra diff em bottom sheet
    diffData = parsed.portMap;
    const diffContent = document.getElementById('diffContent');
    let html = '<div class="diff-preview">';
    diffs.forEach(d => {
        html += `<div class="diff-row"><span class="diff-port">P${d.port}</span><span class="diff-old">${d.old}</span><span class="diff-arrow">→</span><span class="diff-new">${d.new}</span></div>`;
    });
    html += '</div>';
    diffContent.innerHTML = html;
    showBottomSheet('sheetDiff');
}

function applyDiff() {
    if (!diffData) return;
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        const val = diffData[i] !== undefined ? diffData[i] : '';
        const input = document.getElementById(`input-${i}`);
        if (input) { input.value = val; input.title = val || ''; }
        portsData[i-1] = val;
        updateButtonStyles(i, val);
        updatePortRowState(i, val);
    }
    updateStats(); updateVisualizer(); updatePreview(); checkDuplicates(); debouncedAutoSave();
    document.getElementById('textoRetorno').value = '';
    hideBottomSheet('sheetDiff');
    showToast(`♻️ ${Object.keys(diffData).filter(k => diffData[k]).length} porta(s) atualizada(s).`, 'success');
    initAudio(); playSound(sfxSucesso); vibSuccess();
    diffData = null;
}

// ==========================================
// BUSCA DE CTO (Bottom Sheet + Autocomplete)
// ==========================================

async function buscarBancoDados() {
    const ctoNome = document.getElementById('ctoName').value.trim();
    if (!ctoNome) { showToast('Digite um nome para buscar!', 'warn'); vibrate(60); return; }
    const icon = document.querySelector('.input-icon[title="Buscar"]');
    const original = icon?.textContent || '🔍';
    if (icon) icon.textContent = '⏳';
    try {
        if (ctoCache.length === 0) await carregarCacheCTOs();
        const resultados = buscarFuzzyCTO(ctoNome);
        if (resultados.length > 0) {
            if (resultados.length === 1) {
                document.getElementById('textoRetorno').value = resultados[0].RESUMO;
                await carregarCTO();
                showToast(`✅ CTO "${resultados[0].CTO}" carregada!`, 'success');
                initAudio(); playSound(sfxSucesso); vibSuccess();
                await addRecentCTO(resultados[0].CTO);
            } else {
                showCTOSelector(resultados, ctoNome);
            }
            if (icon) icon.textContent = original;
            return;
        }
        const termoBusca = normalizarCTO(ctoNome);
        const resposta = await fetch(`${SHEETDB_URL}/search?CTO=*${encodeURIComponent(termoBusca)}*&casesensitive=false`);
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        const dados = await resposta.json();
        if (dados && dados.length > 0) {
            if (dados.length === 1) {
                document.getElementById('textoRetorno').value = dados[0].RESUMO;
                await carregarCTO();
                showToast(`✅ CTO "${dados[0].CTO}" carregada!`, 'success');
                initAudio(); playSound(sfxSucesso); vibSuccess();
                await addRecentCTO(dados[0].CTO);
            } else {
                showCTOSelector(dados, ctoNome);
            }
        } else {
            showToast(`Nenhuma caixa encontrada com "${ctoNome}"`, 'warn');
            vibWarn();
        }
    } catch (erro) {
        console.error('Erro na busca:', erro);
        showToast('Erro ao conectar. Verifique a internet.', 'error');
        initAudio(); playSound(sfxErro); vibError();
    } finally {
        if (icon) icon.textContent = original;
    }
}

async function showCTOSelector(dados, termo) {
    const termoNorm = normalizarCTO(termo);
    const body = document.getElementById('sheetCTOBody');
    const title = document.getElementById('sheetCTOTitle');
    title.textContent = `${dados.length} CTOs encontradas`;
    // Recent CTOs
    const recents = await getRecentCTOs();
    let html = '';
    if (recents.length > 0) {
        html += '<div style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Recentes</div>';
        html += '<div class="recent-grid">';
        recents.forEach(r => {
            html += `<button class="recent-chip" onclick="selecionarCTO('${r.original.replace(/'/g, "\'")}')">${r.original}</button>`;
        });
        html += '</div>';
    }
    html += '<div style="font-size:0.8rem;font-weight:800;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Resultados</div>';
    dados.forEach((item) => {
        const ctoNorm = normalizarCTO(item.CTO || '');
        const isExact = ctoNorm === termoNorm;
        const preview = (item.RESUMO || '').split('\n').slice(0,3).join('\n').substring(0,80);
        html += `
            <div class="cto-card ${isExact ? 'cto-card-exact' : ''}" onclick="selecionarCTO('${item.CTO.replace(/'/g, "\'")}')">
                <div class="cto-card-name">${item.CTO}</div>
                <div class="cto-card-preview">${preview}...</div>
            </div>
        `;
    });
    body.innerHTML = html;
    showBottomSheet('sheetCTO');
}

function selecionarCTO(nome) {
    document.getElementById('ctoName').value = nome;
    hideBottomSheet('sheetCTO');
    buscarBancoDados();
}

// ==========================================
// WEB SPEECH API
// ==========================================

function startVoiceSearch() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Busca por voz não suportada neste dispositivo.', 'warn');
        return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => showToast('🎤 Ouvindo... fale o nome da CTO', 'success');
    rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        document.getElementById('ctoName').value = transcript.toUpperCase();
        showToast(`🎤 "${transcript}"`, 'success');
        setTimeout(() => buscarBancoDados(), 500);
    };
    rec.onerror = () => showToast('Erro no reconhecimento de voz.', 'error');
    rec.start();
}

// ==========================================
// EXPORTAR / IMPORTAR
// ==========================================

function exportData() {
    const data = { cto: document.getElementById('ctoName').value, ports: portsData, theme: currentTheme, timestamp: new Date().toISOString(), version: '4.0' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cto-${data.cto || 'backup'}-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    showToast('💾 Backup exportado!', 'success');
    initAudio(); playSound(sfxSucesso); vibSuccess();
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.cto) document.getElementById('ctoName').value = data.cto;
            if (data.theme) setTheme(data.theme);
            if (data.ports && Array.isArray(data.ports)) {
                portsData = data.ports.slice(0, TOTAL_PORTS);
                portsData.forEach((val, i) => {
                    const inp = document.getElementById(`input-${i+1}`);
                    if (inp) { inp.value = val; inp.title = val || ''; updateARIA(i+1); }
                    updateButtonStyles(i+1, val);
                    updatePortRowState(i+1, val);
                });
                updateStats(); updateVisualizer(); updatePreview(); checkDuplicates(); debouncedAutoSave();
            }
            showToast('📥 Dados importados com sucesso!', 'success');
            initAudio(); playSound(sfxSucesso); vibSuccess();
        } catch (err) {
            showToast('Erro ao importar arquivo.', 'error');
            initAudio(); playSound(sfxErro); vibError();
        }
    };
    input.click();
}

// ==========================================
// PERSISTÊNCIA INTELIGENTE
// ==========================================

function debouncedAutoSave() {
    clearTimeout(saveTimeout);
    const indicator = document.getElementById('savedIndicator');
    if (indicator) { indicator.style.display = 'inline-block'; indicator.textContent = 'Salvando...'; indicator.className = 'badge badge-yellow'; }
    saveTimeout = setTimeout(() => {
        autoSave();
        if (indicator) { indicator.textContent = 'Salvo'; indicator.className = 'badge badge-green'; setTimeout(() => indicator.style.display = 'none', 1500); }
    }, 2000);
}

function autoSave() {
    const data = { cto: document.getElementById('ctoName').value, ports: portsData, theme: currentTheme, savedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.cto) document.getElementById('ctoName').value = data.cto;
        if (data.ports) {
            portsData = data.ports;
            portsData.forEach((val, i) => {
                const inp = document.getElementById(`input-${i+1}`);
                if (inp) { inp.value = val; inp.title = val || ''; updateARIA(i+1); }
                updateButtonStyles(i+1, val);
                updatePortRowState(i+1, val);
            });
        }
    } catch (e) { console.error('Erro ao carregar dados:', e); }
}

// ==========================================
// SALVAR EM BACKGROUND (com fila)
// ==========================================

async function salvarEmBackground() {
    const ctoRaw = document.getElementById('ctoName').value || 'CTO SEM NOME';
    const cto = normalizarCTO(ctoRaw) || ctoRaw;
    const resumo = document.getElementById('previewArea').innerText;
    const payload = {
        DATA: new Date().toLocaleString('pt-BR'),
        CTO: cto,
        RESUMO: resumo
    };
    await enqueueSync({ type: 'save', data: payload });
}

// ==========================================
// COLLAPSE
// ==========================================

function toggleCollapse(header, id) {
    header.classList.toggle('open');
    const body = document.getElementById(id);
    body.classList.toggle('open');
    header.setAttribute('aria-expanded', body.classList.contains('open'));
    initAudio(); playSound(sfxClick); vibClick();
}

// ==========================================
// TECLADO
// ==========================================

function handlePortKey(e, index) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const next = document.getElementById(`input-${index + 1}`);
        if (next) next.focus();
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey) return;
        switch(e.key.toLowerCase()) {
            case 's': e.preventDefault(); autoSave(); showToast('💾 Dados salvos localmente!', 'success'); initAudio(); playSound(sfxSucesso); vibSuccess(); break;
            case 'c': e.preventDefault(); copyToClipboard(); break;
            case 'l': e.preventDefault(); clearAll(); break;
            case 'b': e.preventDefault(); buscarBancoDados(); break;
            case 'f': e.preventDefault(); toggleFocusMode(); break;
        }
    });
}

// ==========================================
// WAKE LOCK
// ==========================================

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { console.warn('Wake Lock failed:', e); }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(()=>{});
        wakeLock = null;
    }
}

// ==========================================
// BEFORE INSTALL PROMPT
// ==========================================

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = document.getElementById('installBtn');
        if (btn) btn.style.display = 'inline-block';
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const btn = document.getElementById('installBtn');
        if (btn) btn.style.display = 'none';
        showToast('✅ App instalado!', 'success');
    });
}

async function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        deferredPrompt = null;
        document.getElementById('installBtn').style.display = 'none';
    }
}

// ==========================================
// SERVICE WORKER & BACKGROUND SYNC
// ==========================================

function setupServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
        console.log('SW registered');
        // Background Sync
        if ('sync' in reg) {
            reg.sync.register('sync-ctos').catch(()=>{});
        }
    }).catch(()=>{});
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data === 'sync-now') attemptSync();
    });
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    renderPorts();
    loadData();
    updateStats();
    updateVisualizer();
    updatePreview();
    setupKeyboardShortcuts();
    loadTheme();
    setupSwipe();
    setupLongPress();
    setupFocusInput();
    setupVisualViewport();
    setupInstallPrompt();
    setupServiceWorker();

    // Snapshot a cada 5 min
    snapshotInterval = setInterval(createSnapshot, 5 * 60 * 1000);

    // Online/offline
    window.addEventListener('online', () => { isOnline = true; updateSyncStatus('syncing'); attemptSync(); showToast('🌐 Conexão restaurada', 'success'); });
    window.addEventListener('offline', () => { isOnline = false; updateSyncStatus('offline'); showToast('📴 Modo offline ativado', 'warn'); });

    // Inicializa audio na primeira interação
    document.body.addEventListener('touchstart', initAudio, { once: true });
    document.body.addEventListener('click', initAudio, { once: true });

    setTimeout(() => document.getElementById('ctoName')?.focus(), 300);

    // Carrega cache de CTOs silenciosamente
    carregarCacheCTOs().catch(()=>{});

    // Tentativa de sync ao iniciar
    attemptSync().catch(()=>{});
});