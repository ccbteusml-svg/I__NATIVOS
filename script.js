// ==========================================
// I__NATIVOS v3.2 — Gerenciador CTO
// Correção: busca fuzzy endurecida + parser robusto para planilhas
// ==========================================

const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';
const TOTAL_PORTS = 16;
const STORAGE_KEY = 'inativos_v3';
const SPECIAL_VALUES = ['Livre', 'Defeito', 'Sem ident.', 'Reserva', 'Vago'];

let portsData = new Array(TOTAL_PORTS).fill('');
let currentTheme = 'dark';
let ctoCache = []; // Cache local de todas as CTOs

// Sons com fallback seguro
let sfxErro, sfxClick, sfxSucesso, sfxLixo;

function initAudio() {
    try {
        sfxErro = new Audio('erro_digital.mp3');
        sfxClick = new Audio('click_tec.mp3');
        sfxSucesso = new Audio('sucesso.mp3');
        sfxLixo = new Audio('trash.mp3');
        sfxErro.volume = 0.6;
        sfxClick.volume = 0.4;
        sfxSucesso.volume = 0.5;
        sfxLixo.volume = 0.5;
    } catch (e) {
        console.warn('Audio não suportado');
    }
}

function playSound(audio) {
    if (!audio) return;
    try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch (e) {}
}

function vibrate(pattern) {
    if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// ==========================================
// NORMALIZACAO CTO — CANONICA & ROBUSTA
// ==========================================

/**
 * Converte qualquer formato de CTO para padrao canonico.
 * Lida com: CTOMO 1.1.1 | MO 1-1-1 | CTO-MO4-1-6 | CTOMO8-8-3 | MO8-7-2 | CTOSEMNOME
 */
function normalizarCTO(nome) {
    if (!nome) return '';
    let s = nome.toUpperCase().trim();

    // Remove "CTO" isolado (com ou sem espaco)
    s = s.replace(/\bCTO\b\s*/g, '').trim();

    // Se ainda comeca com CTO colado (ex: CTOMO, CTOSEMNOME, CTORPE)
    if (s.startsWith('CTO') && s.length > 3) {
        s = s.slice(3);
    }

    // Extrai prefixo alfabetico (MO, MZ, AB, TORPE, SEMNOME, etc.)
    const prefixoMatch = s.match(/^[A-Z]+/);
    const prefixo = prefixoMatch ? prefixoMatch[0] : '';

    // Pega tudo apos o prefixo
    let resto = prefixo ? s.slice(prefixo.length) : s;
    // Limpa lixo inicial
    resto = resto.replace(/^[^A-Z0-9]+/i, '');
    // Converte hifens em pontos
    resto = resto.replace(/-/g, '.');

    // Extrai numeros
    const numeros = resto.match(/\d+/g) || [];

    if (!prefixo && numeros.length === 0) return s;

    const nums = numeros.join('.');
    return prefixo ? `${prefixo} ${nums}` : nums;
}

/** Gera variacoes possiveis de uma CTO para busca no banco */
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

/** Carrega todas as CTOs do SheetDB para memoria local */
async function carregarCacheCTOs() {
    try {
        const res = await fetch(SHEETDB_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        ctoCache = await res.json();
        return ctoCache;
    } catch (e) {
        console.warn('Cache nao carregado:', e);
        return [];
    }
}

/** Busca fuzzy no cache local — ENDURECIDA */
function buscarFuzzyCTO(termo) {
    const termoNorm = normalizarCTO(termo);
    if (!termoNorm) return [];

    const termoNums = termoNorm.replace(/[^0-9.]/g, '');
    const termoPrefixo = termoNorm.match(/^[A-Z]+/)?.[0] || '';

    return ctoCache.filter(item => {
        const ctoNorm = normalizarCTO(item.CTO || '');

        // Match exato na normalizacao canonica
        if (ctoNorm === termoNorm) return true;

        const ctoNums = ctoNorm.replace(/[^0-9.]/g, '');
        const ctoPrefixo = ctoNorm.match(/^[A-Z]+/)?.[0] || '';

        // ENDURECIDO: se o usuario digitou um prefixo, SO aceita o MESMO prefixo
        if (termoPrefixo && ctoPrefixo !== termoPrefixo) {
            return false;
        }

        // Se nao digitou prefixo, permite qualquer um desde que os numeros batam
        if (termoNums) {
            return ctoNums === termoNums ||
                   ctoNums.startsWith(termoNums) ||
                   termoNums.startsWith(ctoNums);
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

/** Autocomplete no campo de busca */
function setupAutocomplete() {
    const input = document.getElementById('ctoName');
    let dropdown = document.getElementById('cto-suggestions');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'cto-suggestions';
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(dropdown);
    }

    let debounce;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const val = input.value.trim();
            if (val.length < 2) { dropdown.style.display = 'none'; return; }

            if (ctoCache.length === 0) {
                carregarCacheCTOs().then(() => mostrarSugestoes(val));
            } else {
                mostrarSugestoes(val);
            }
        }, 250);
    });

    function mostrarSugestoes(val) {
        const matches = buscarFuzzyCTO(val).slice(0, 6);
        if (matches.length === 0) { dropdown.style.display = 'none'; return; }

        const termoNorm = normalizarCTO(val);

        dropdown.innerHTML = matches.map(m => {
            const ctoNorm = normalizarCTO(m.CTO || '');
            const isExact = ctoNorm === termoNorm;
            const preview = (m.RESUMO || '').split('\n').slice(0,2).join(' ').substring(0,60);
            const exactStyle = isExact ? 'background:rgba(0,102,255,0.12);border-left:4px solid var(--primary);' : '';
            const exactBadge = isExact ? ' <span style="color:var(--success);font-size:0.75rem;font-weight:800;">✓ EXATO</span>' : '';
            return `<div class="sugestao-cto" onclick="selecionarCTO('${m.CTO.replace(/'/g, "\\'")}')" style="${exactStyle}">
                <strong>${m.CTO}</strong>${exactBadge}
                <small>${preview}...</small>
            </div>`;
        }).join('');
        dropdown.style.display = 'block';
    }

    document.addEventListener('click', e => {
        if (!input.parentElement.contains(e.target)) dropdown.style.display = 'none';
    });
}

function selecionarCTO(nome) {
    document.getElementById('ctoName').value = nome;
    document.getElementById('cto-suggestions').style.display = 'none';
    buscarBancoDados();
}

// ==========================================
// INICIALIZACAO
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initAudio();
    renderPorts();
    loadData();
    updateStats();
    updateVisualizer();
    updatePreview();
    setupKeyboardShortcuts();
    loadTheme();
    setupAutocomplete();

    setTimeout(() => document.getElementById('ctoName')?.focus(), 300);

    window.addEventListener('online', () => showToast('🌐 Conexao restaurada', 'success'));
    window.addEventListener('offline', () => showToast('📴 Modo offline ativado', 'warn'));
});

// ==========================================
// TEMAS
// ==========================================

function setTheme(theme) {
    currentTheme = theme;
    document.body.classList.remove('light-mode', 'sun-mode', 'neon-mode');

    if (theme === 'sun') {
        document.body.classList.add('sun-mode');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#ffffff');
    } else if (theme === 'neon') {
        document.body.classList.add('neon-mode');
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#050508');
    } else {
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0a0a0f');
    }

    document.querySelectorAll('.theme-dot').forEach(btn => btn.classList.remove('active'));
    document.getElementById('theme' + theme.charAt(0).toUpperCase() + theme.slice(1))?.classList.add('active');

    autoSave();
    playSound(sfxClick);
    vibrate(20);
}

function loadTheme() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (data.theme) {
            setTheme(data.theme);
        }
    } catch (e) {}
}

// ==========================================
// RENDERIZACAO
// ==========================================

function renderPorts() {
    const container = document.getElementById('portsContainer');
    let html = '';

    for (let i = 1; i <= TOTAL_PORTS; i++) {
        html += `
            <div class="port-row" style="animation-delay: ${i * 0.02}s">
                <div class="port-num">P${i}</div>
                <input type="text" 
                       id="input-${i}" 
                       class="port-input" 
                       placeholder="PE ou cliente..."
                       oninput="updateData(${i}, this.value)"
                       onkeydown="handlePortKey(event, ${i})">
                <div class="port-actions">
                    <button class="port-btn" id="btn-u-${i}" onclick="setQuickAction(${i}, 'Sem ident.')" data-tooltip="Sem identificacao" title="Sem identificacao">?</button>
                    <button class="port-btn" id="btn-d-${i}" onclick="setQuickAction(${i}, 'Defeito')" data-tooltip="Defeito" title="Defeito">!</button>
                    <button class="port-btn" id="btn-e-${i}" onclick="setQuickAction(${i}, 'Livre')" data-tooltip="Livre" title="Livre">∞</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ==========================================
// ATUALIZACAO DE DADOS
// ==========================================

function updateData(index, value) {
    portsData[index - 1] = value;
    const input = document.getElementById(`input-${index}`);
    if (input) input.title = value || '';
    updateButtonStyles(index, value);
    updateStats();
    updateVisualizer();
    updatePreview();
    checkDuplicates();
    autoSave();

    const indicator = document.getElementById('savedIndicator');
    indicator.style.display = 'inline-block';
    indicator.textContent = 'Salvo';
    indicator.className = 'badge badge-green';
    setTimeout(() => { indicator.style.display = 'none'; }, 1500);
}

function setQuickAction(index, text) {
    const input = document.getElementById(`input-${index}`);
    if (!input) return;

    if (input.value === text) {
        input.value = '';
        updateData(index, '');
    } else {
        input.value = text;
        updateData(index, text);
    }

    playSound(sfxClick);
    vibrate(25);
}

function updateButtonStyles(index, value) {
    const btnU = document.getElementById(`btn-u-${index}`);
    const btnD = document.getElementById(`btn-d-${index}`);
    const btnE = document.getElementById(`btn-e-${index}`);

    if (btnU) btnU.className = 'port-btn' + (value === 'Sem ident.' ? ' active-warn' : '');
    if (btnD) btnD.className = 'port-btn' + (value === 'Defeito' ? ' active-danger' : '');
    if (btnE) btnE.className = 'port-btn' + (value === 'Livre' ? ' active-info' : '');
}

// ==========================================
// ESTATISTICAS
// ==========================================

function updateStats() {
    let free = 0, occupied = 0, defect = 0, unidentified = 0;

    portsData.forEach(val => {
        const v = val.trim();
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
        const v = val.trim();
        let cls = '';
        let label = '';

        if (v === 'Livre' || v === 'Reserva' || v === 'Vago' || !v) {
            cls = v === 'Livre' ? 'free' : '';
            label = v || 'Vazio';
        } else if (v === 'Defeito') {
            cls = 'defect';
            label = 'Defeito';
        } else if (v === 'Sem ident.') {
            cls = 'unidentified';
            label = 'S/ Ident.';
        } else {
            cls = 'occupied';
            label = v.length > 10 ? v.substring(0, 9) + '…' : v;
        }

        html += `
            <div class="cto-slot ${cls}" id="quad-vis-${i+1}" onclick="focusPort(${i+1})" title="P${i+1}: ${v || 'Vazio'}">
                <span class="slot-num">${i+1}</span>
                <span class="slot-label">${label}</span>
            </div>
        `;
    });

    grid.innerHTML = html;
}

function focusPort(index) {
    const input = document.getElementById(`input-${index}`);
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.parentElement.style.animation = 'shake 0.3s';
        setTimeout(() => input.parentElement.style.animation = '', 300);
        vibrate(30);
    }
}

// ==========================================
// PREVIEW DE TEXTO
// ==========================================

function updatePreview() {
    const cto = document.getElementById('ctoName').value.trim() || 'CTO SEM NOME';
    let text = `📌 *${cto}*\n\n`;

    portsData.forEach((val, i) => {
        text += `P${i+1} ➔ ${val || '---'}\n`;
    });

    document.getElementById('previewArea').textContent = text;
}

function togglePreview() {
    const preview = document.getElementById('previewArea');
    preview.classList.toggle('show');
    playSound(sfxClick);
}

// ==========================================
// DUPLICATAS
// ==========================================

function checkDuplicates() {
    const valueMap = {};
    let hasDuplicate = false;

    for (let i = 1; i <= TOTAL_PORTS; i++) {
        document.getElementById(`input-${i}`)?.classList.remove('input-error');
    }

    portsData.forEach((val, index) => {
        const clean = val.trim();
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
            });
        }
    });

    if (hasDuplicate) {
        showToast('⚠️ Codigo duplicado detectado!', 'error');
        playSound(sfxErro);
        vibrate([120, 60, 120]);
    }
}

// ==========================================
// ACOES PRINCIPAIS
// ==========================================

async function copyToClipboard() {
    const text = document.getElementById('previewArea').textContent;
    const cto = document.getElementById('ctoName').value.trim();

    try {
        await navigator.clipboard.writeText(text);
        showToast('✅ Resumo copiado!', 'success');
        playSound(sfxSucesso);
        vibrate([50, 30, 50]);

        if (cto) {
            const save = await showModal('Salvar no Excel?', `Deseja salvar/atualizar <b>${cto}</b> na planilha?`, true, '💾');
            if (save) {
                await salvarEmBackground();
                showToast('💾 Dados sincronizados!', 'success');
            }
        }
    } catch (e) {
        showToast('Erro ao copiar. Tente manualmente.', 'error');
        playSound(sfxErro);
    }
}

async function clearAll() {
    const confirm = await showModal('Limpar CTO?', 'Todos os dados serao apagados.\nEsta acao nao pode ser desfeita.', true, '⚠️');

    if (confirm) {
        playSound(sfxLixo);
        vibrate([100, 50, 100, 50, 100]);

        document.getElementById('ctoName').value = '';
        document.getElementById('textoRetorno').value = '';
        portsData.fill('');
        renderPorts();
        updateStats();
        updateVisualizer();
        updatePreview();
        localStorage.removeItem(STORAGE_KEY);
        showToast('🗑️ CTO limpa com sucesso', 'success');
    }
}

// ==========================================
// NORMALIZADOR DE VALOR DE PORTA (NOVO)
// ==========================================

function normalizarValorPorta(val) {
    if (!val) return '';

    const v = val.toString().trim();
    const vLower = v.toLowerCase();

    // Vazio / tracos / em-dash / en-dash
    if (/^[-–—\s]*$/.test(v) || v === '---' || v === '--') return '';

    // Livre / Vago / Reserva / Retirado
    if (/^\s*livre\s*$/i.test(v)) return 'Livre';
    if (/^\s*vago\s*$/i.test(v)) return 'Livre';
    if (/^\s*reserva\s*$/i.test(v)) return 'Livre';
    if (/^\s*retirado\s*$/i.test(v)) return 'Livre';

    // Sem identificacao (muitas variacoes dos tecnicos!)
    if (/^\s*sem\s*ident\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*semident\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*id\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*semid\.?\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*pe\s*$/i.test(v)) return 'Sem ident.'; // typo comum
    if (/^\s*sem\s*identifica[çc][aã]o\s*$/i.test(v)) return 'Sem ident.';
    if (/^\s*sem\s*idf?\.?\s*$/i.test(v)) return 'Sem ident.';

    // Defeito
    if (/^\s*defeito\s*$/i.test(v)) return 'Defeito';

    // Duplicado / ID incorreto — extrai o codigo numerico se existir
    if (/duplicado/i.test(vLower) || /id\s*incorreto/i.test(vLower) || /idduplic/i.test(vLower)) {
        const nums = v.match(/^(\d+)/);
        if (nums) return nums[1] + ' duplicado';
        return 'Sem ident.';
    }

    // Codigo numerico puro
    const numsOnly = v.match(/^(\d+)$/);
    if (numsOnly) return numsOnly[1];

    // Se comeca com numeros seguidos de texto, pega so os numeros
    const numsPrefix = v.match(/^(\d+)\s+/);
    if (numsPrefix) return numsPrefix[1];

    return v;
}

// ==========================================
// FERRAMENTAS DA CENTRAL — PARSER ROBUSTO
// ==========================================

async function analisarRetorno() {
    const texto = document.getElementById('textoRetorno').value.trim();

    if (!texto) {
        showToast('Cole a mensagem da central primeiro!', 'warn');
        return;
    }

    // Procura codigos de 4-6 digitos
    const regex = /(?<!\d)\d{4,6}(?!\d)/g;
    const codigos = [...texto.matchAll(regex)].map(m => m[0]);

    if (codigos.length === 0) {
        showToast('Nenhum codigo de 4-6 digitos encontrado.', 'warn');
        return;
    }

    let encontrados = 0;

    document.querySelectorAll('.cto-slot').forEach(s => {
        s.classList.remove('marked-delete');
    });

    for (let i = 0; i < TOTAL_PORTS; i++) {
        const val = portsData[i]?.trim();
        // Normaliza: remove sufixos "duplicado" e nao-numericos para comparar
        const valNorm = val?.replace(/\s+duplicado.*/i, '')?.replace(/\D/g, '') || '';
        if (valNorm && codigos.includes(valNorm)) {
            const slot = document.getElementById(`quad-vis-${i+1}`);
            if (slot) {
                slot.classList.add('marked-delete');
                slot.querySelector('.slot-label').textContent = '🗑️';
                encontrados++;
            }
        }
    }

    if (encontrados > 0) {
        showToast(`⚠️ ${encontrados} porta(s) marcada(s) para remocao!`, 'error');
        playSound(sfxErro);
        vibrate([200, 100, 200, 100, 200]);
    } else {
        showToast('Nenhum codigo bateu com as portas atuais.', 'warn');
    }
}

async function carregarCTO() {
    let texto = document.getElementById('textoRetorno').value.trim();

    if (!texto) {
        showToast('Cole o texto da planilha primeiro!', 'warn');
        return;
    }

    // Normaliza: remove pipes de tabelas, quebras excessivas
    texto = texto.replace(/\|/g, ' ').replace(/\n+/g, '\n');

    // ========== EXTRAI NOME DA CTO ==========
    let ctoNome = '';

    // Regex 1: 📌 *CTO NAME* ou *CTO NAME* (formato app)
    let m = texto.match(/[📌*]*\s*\*?\s*(CTO[A-Z]*\s*[0-9.\-]+|CTO\s+[A-Z]+\s*[0-9.\-]+|[A-Z]+\s+[0-9.\-]+|CTO\s+SEM\s+NOME|CTOSEMNOME)\s*\*?/i);
    if (m?.[1]) ctoNome = m[1].trim();

    // Regex 2: data colada com CTO (ex: 09/06/2026，10:3CTOMO8.3.1)
    if (!ctoNome) {
        m = texto.match(/\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4}[^\dA-Z]*([A-Z]+[0-9.\-]+)/i);
        if (m?.[1]) ctoNome = m[1].trim();
    }

    // Regex 3: linha isolada com nome da CTO
    if (!ctoNome) {
        const linhas = texto.split('\n');
        for (const linha of linhas) {
            const mm = linha.trim().match(/^(CTO[A-Z]*\s*[0-9.\-]+|CTO\s+[A-Z]+\s*[0-9.\-]+|[A-Z]+\s+[0-9.\-]+|CTO\s+SEM\s+NOME|CTOSEMNOME)$/i);
            if (mm) { ctoNome = mm[1].trim(); break; }
        }
    }

    // Regex 4: qualquer "CTO..." no inicio de uma linha
    if (!ctoNome) {
        m = texto.match(/^\s*(CTO[^\n\r]*)/im);
        if (m?.[1]) {
            const candidato = m[1].trim().split(/\s/)[0];
            if (candidato.length > 3) ctoNome = candidato;
        }
    }

    if (ctoNome) {
        // Limpa sujeiras
        ctoNome = ctoNome.replace(/^[^\w]+/, '').replace(/[^\w.\-]+$/, '');
        document.getElementById('ctoName').value = ctoNome;
    }

    // ========== PARSER DE PORTAS ==========
    const portMap = {};

    // Regex principal: P1→value, P1 ➔ value, P1: value, P1->value, etc.
    // Captura ate o proximo P\d+ ou fim de linha/texto
    const portRegex = /P\s*(\d{1,2})\s*[➔→:>\-]\s*([^\nP]*?)(?=\s*P\s*\d{1,2}\s*[➔→:>\-]|\n|$)/gi;

    let match;
    while ((match = portRegex.exec(texto)) !== null) {
        const portNum = parseInt(match[1], 10);
        let val = match[2].trim();
        val = normalizarValorPorta(val);
        if (portNum >= 1 && portNum <= TOTAL_PORTS) {
            portMap[portNum] = val;
        }
    }

    // Fallback: linha por linha se regex nao achou nada
    if (Object.keys(portMap).length === 0) {
        const linhas = texto.split('\n');
        for (const linha of linhas) {
            const mm = linha.match(/P\s*(\d{1,2})\s*[➔→:>\-]\s*(.+)/i);
            if (mm) {
                const portNum = parseInt(mm[1], 10);
                let val = mm[2].trim();
                val = normalizarValorPorta(val);
                if (portNum >= 1 && portNum <= TOTAL_PORTS) {
                    portMap[portNum] = val;
                }
            }
        }
    }

    // Fallback 2: procura padrao "P1 value" sem seta (planilhas mal formatadas)
    if (Object.keys(portMap).length === 0) {
        const linhas = texto.split('\n');
        for (const linha of linhas) {
            const mm = linha.match(/P\s*(\d{1,2})\s+([A-Za-z0-9\-]+)/i);
            if (mm) {
                const portNum = parseInt(mm[1], 10);
                let val = mm[2].trim();
                val = normalizarValorPorta(val);
                if (portNum >= 1 && portNum <= TOTAL_PORTS) {
                    portMap[portNum] = val;
                }
            }
        }
    }

    // Aplica os valores
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        const val = portMap[i] !== undefined ? portMap[i] : '';
        const input = document.getElementById(`input-${i}`);
        if (input) {
            input.value = val;
            input.title = val || '';
        }
        portsData[i-1] = val;
        updateButtonStyles(i, val);
    }

    updateStats();
    updateVisualizer();
    updatePreview();
    checkDuplicates();
    autoSave();

    document.getElementById('textoRetorno').value = '';
    const msg = Object.keys(portMap).length > 0
        ? `♻️ CTO carregada! ${Object.keys(portMap).length} porta(s) encontrada(s).`
        : '♻️ CTO carregada! Nenhuma porta encontrada no texto.';
    showToast(msg, 'success');
    playSound(sfxSucesso);
    vibrate([60, 40, 60]);
}

// ==========================================
// SELETOR DE CTO (LISTA DE RESULTADOS)
// ==========================================

function showCTOSelector(dados) {
    const modal = document.getElementById('customModal');
    const title = document.getElementById('modalTitle');
    const text = document.getElementById('modalText');
    const icon = document.getElementById('modalIcon');
    const btnCancel = document.getElementById('modalBtnCancel');
    const btnOk = document.getElementById('modalBtnOk');
    const btnClose = document.getElementById('modalBtnClose');

    title.textContent = `${dados.length} CTOs encontradas`;
    icon.textContent = '📋';
    icon.className = 'modal-icon info';
    btnCancel.style.display = 'none';
    btnOk.style.display = 'none';

    let html = `<div style="display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow-y:auto;padding-right:4px;">`;
    dados.forEach((item, idx) => {
        const preview = item.RESUMO ? item.RESUMO.split('\n').slice(0, 3).join('\n') : 'Sem resumo';
        html += `
            <button class="btn btn-ghost" style="text-align:left;justify-content:flex-start;flex-direction:column;align-items:flex-start;padding:14px;gap:4px;height:auto;min-height:64px;" 
                    onclick="loadSelectedCTO(${idx})">
                <div style="font-weight:900;font-size:1.05rem;color:var(--text-primary);">${item.CTO}</div>
                <div style="font-size:0.78rem;color:var(--text-muted);font-family:'JetBrains Mono',monospace;white-space:pre-wrap;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;line-height:1.3;">${preview}</div>
            </button>
        `;
    });
    html += `</div>`;
    text.innerHTML = html;

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('show'));

    window._ctoSelectorData = dados;

    const close = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            btnOk.style.display = 'block';
            text.innerHTML = '';
            window._ctoSelectorData = null;
            btnClose.onclick = null;
            modal.onclick = null;
        }, 250);
    };

    btnClose.onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
}

function loadSelectedCTO(idx) {
    const dados = window._ctoSelectorData;
    if (!dados || !dados[idx]) return;

    const item = dados[idx];
    document.getElementById('textoRetorno').value = item.RESUMO;

    const modal = document.getElementById('customModal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('modalBtnOk').style.display = 'block';
        document.getElementById('modalText').innerHTML = '';
        window._ctoSelectorData = null;
    }, 250);

    carregarCTO();
    showToast(`✅ CTO "${item.CTO}" carregada!`, 'success');
    playSound(sfxSucesso);
    vibrate([50, 30, 50]);
}

// ==========================================
// EXPORTAR / IMPORTAR
// ==========================================

function exportData() {
    const data = {
        cto: document.getElementById('ctoName').value,
        ports: portsData,
        theme: currentTheme,
        timestamp: new Date().toISOString(),
        version: '3.2'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cto-${data.cto || 'backup'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('💾 Backup exportado!', 'success');
    playSound(sfxSucesso);
    vibrate([50, 30, 50]);
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
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
                    const input = document.getElementById(`input-${i+1}`);
                    if (input) {
                        input.value = val;
                        input.title = val || '';
                    }
                    updateButtonStyles(i+1, val);
                });
                updateStats();
                updateVisualizer();
                updatePreview();
                checkDuplicates();
                autoSave();
            }

            showToast('📥 Dados importados com sucesso!', 'success');
            playSound(sfxSucesso);
            vibrate([60, 40, 60]);
        } catch (err) {
            showToast('Erro ao importar arquivo.', 'error');
            playSound(sfxErro);
        }
    };
    input.click();
}

// ==========================================
// PERSISTENCIA
// ==========================================

function autoSave() {
    const data = {
        cto: document.getElementById('ctoName').value,
        ports: portsData,
        theme: currentTheme,
        savedAt: new Date().toISOString()
    };
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
                const input = document.getElementById(`input-${i+1}`);
                if (input) {
                    input.value = val;
                    input.title = val || '';
                    updateButtonStyles(i+1, val);
                }
            });
        }
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }
}

// ==========================================
// SHEETDB — BUSCAR E SALVAR
// ==========================================

async function buscarBancoDados() {
    const ctoNome = document.getElementById('ctoName').value.trim();
    if (!ctoNome) {
        showToast('Digite um nome para buscar!', 'warn');
        vibrate(60);
        return;
    }

    const icon = document.querySelector('.input-icon');
    const original = icon?.textContent || '🔍';
    if (icon) icon.textContent = '⏳';

    try {
        // === ESTRATEGIA 1: Busca Fuzzy Local ===
        if (ctoCache.length === 0) await carregarCacheCTOs();

        const resultados = buscarFuzzyCTO(ctoNome);

        if (resultados.length > 0) {
            if (resultados.length === 1) {
                document.getElementById('textoRetorno').value = resultados[0].RESUMO;
                await carregarCTO();
                showToast(`✅ CTO "${resultados[0].CTO}" carregada!`, 'success');
                playSound(sfxSucesso);
            } else {
                showCTOSelector(resultados);
            }
            if (icon) icon.textContent = original;
            return;
        }

        // === ESTRATEGIA 2: Fallback direto no SheetDB ===
        const termoBusca = normalizarCTO(ctoNome);
        const resposta = await fetch(
            `${SHEETDB_URL}/search?CTO=*${encodeURIComponent(termoBusca)}*&casesensitive=false`
        );
        if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
        const dados = await resposta.json();

        if (dados && dados.length > 0) {
            if (dados.length === 1) {
                document.getElementById('textoRetorno').value = dados[0].RESUMO;
                await carregarCTO();
                showToast(`✅ CTO "${dados[0].CTO}" carregada!`, 'success');
                playSound(sfxSucesso);
            } else {
                showCTOSelector(dados);
            }
        } else {
            showToast(`Nenhuma caixa encontrada com "${ctoNome}"`, 'warn');
            vibrate([80, 40]);
        }
    } catch (erro) {
        console.error('Erro na busca:', erro);
        showToast('Erro ao conectar. Verifique a internet.', 'error');
        playSound(sfxErro);
        vibrate([100, 50, 100]);
    } finally {
        if (icon) icon.textContent = original;
    }
}

async function salvarEmBackground() {
    const ctoRaw = document.getElementById('ctoName').value || 'CTO SEM NOME';
    const cto = normalizarCTO(ctoRaw) || ctoRaw;
    const resumo = document.getElementById('previewArea').innerText;

    const payload = {
        data: [{
            "DATA": new Date().toLocaleString('pt-BR'),
            "CTO": cto,
            "RESUMO": resumo
        }]
    };

    try {
        const todas = await fetch(SHEETDB_URL).then(r => r.json());
        const existente = todas.find(item => normalizarCTO(item.CTO) === cto);

        if (existente) {
            await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(existente.CTO)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('🔄 CTO existente atualizada!', 'success');
        } else {
            await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('💾 Nova CTO salva!', 'success');
        }
    } catch (error) {
        console.error("Erro ao salvar:", error);
        showToast('Erro ao sincronizar com o Excel.', 'error');
        playSound(sfxErro);
    }
}

// ==========================================
// MODAL
// ==========================================

function showModal(title, text, isConfirm = false, icon = 'ℹ️') {
    return new Promise((resolve) => {
        const modal = document.getElementById('customModal');
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalText').innerHTML = text;
        document.getElementById('modalIcon').textContent = icon;

        const btnCancel = document.getElementById('modalBtnCancel');
        const btnOk = document.getElementById('modalBtnOk');
        const btnClose = document.getElementById('modalBtnClose');

        btnCancel.style.display = isConfirm ? 'block' : 'none';
        btnOk.style.display = 'block';
        btnOk.textContent = isConfirm ? 'Confirmar' : 'OK';

        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));

        const close = (result) => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                btnOk.onclick = null;
                btnCancel.onclick = null;
                btnClose.onclick = null;
                modal.onclick = null;
                resolve(result);
            }, 250);
        };

        btnOk.onclick = () => close(true);
        btnCancel.onclick = () => close(false);
        btnClose.onclick = () => close(false);
        modal.onclick = (e) => {
            if (e.target === modal && !isConfirm) close(true);
        };
    });
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

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ==========================================
// COLLAPSE
// ==========================================

function toggleCollapse(header, id) {
    header.classList.toggle('open');
    document.getElementById(id).classList.toggle('open');
    playSound(sfxClick);
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
            case 's':
                e.preventDefault();
                autoSave();
                showToast('💾 Dados salvos localmente!', 'success');
                playSound(sfxSucesso);
                vibrate([40, 20, 40]);
                break;
            case 'c':
                e.preventDefault();
                copyToClipboard();
                break;
            case 'l':
                e.preventDefault();
                clearAll();
                break;
            case 'b':
                e.preventDefault();
                buscarBancoDados();
                break;
        }
    });
}

// ==========================================
// SERVICE WORKER
// ==========================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}