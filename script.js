// ==========================================
// I__NATIVOS v2.0 — Gerenciador CTO
// ==========================================

const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';
const TOTAL_PORTS = 16;
const STORAGE_KEY = 'inativos_v2';
const SPECIAL_VALUES = ['Livre', 'Defeito', 'Sem ident.', 'Reserva', 'Vago'];

let portsData = new Array(TOTAL_PORTS).fill('');
let isLightMode = false;

// Sons (mantém compatibilidade com seus arquivos MP3)
const sfxErro = new Audio('erro_digital.mp3');
const sfxClick = new Audio('click_tec.mp3');
const sfxSucesso = new Audio('sucesso.mp3');
const sfxLixo = new Audio('trash.mp3');

sfxErro.volume = 0.5;
sfxClick.volume = 0.3;

// ==========================================
// INICIALIZAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    renderPorts();
    loadData();
    updateStats();
    updateVisualizer();
    updatePreview();
    setupKeyboardShortcuts();
    loadTheme();
    
    setTimeout(() => document.getElementById('ctoName')?.focus(), 300);
    
    // Online/Offline
    window.addEventListener('online', () => showToast('🌐 Conexão restaurada', 'success'));
    window.addEventListener('offline', () => showToast('📴 Modo offline ativado', 'warn'));
});

// ==========================================
// RENDERIZAÇÃO
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
                    <button class="port-btn" id="btn-u-${i}" onclick="setQuickAction(${i}, 'Sem ident.')" data-tooltip="Sem identificação">?</button>
                    <button class="port-btn" id="btn-d-${i}" onclick="setQuickAction(${i}, 'Defeito')" data-tooltip="Defeito">!</button>
                    <button class="port-btn" id="btn-e-${i}" onclick="setQuickAction(${i}, 'Livre')" data-tooltip="Livre">∞</button>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ==========================================
// ATUALIZAÇÃO DE DADOS
// ==========================================

function updateData(index, value) {
    portsData[index - 1] = value;
    updateButtonStyles(index, value);
    updateStats();
    updateVisualizer();
    updatePreview();
    checkDuplicates();
    autoSave();
    
    // Indicador visual de salvamento
    const indicator = document.getElementById('savedIndicator');
    indicator.style.display = 'inline-block';
    indicator.textContent = 'Salvo';
    indicator.className = 'badge badge-green';
    setTimeout(() => { indicator.style.display = 'none'; }, 1500);
}

function setQuickAction(index, text) {
    const input = document.getElementById(`input-${index}`);
    if (!input) return;
    
    // Toggle: se já tem o valor, limpa
    if (input.value === text) {
        input.value = '';
        updateData(index, '');
    } else {
        input.value = text;
        updateData(index, text);
    }
    
    sfxClick.currentTime = 0;
    sfxClick.play().catch(() => {});
    
    if (navigator.vibrate) navigator.vibrate(15);
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
// ESTATÍSTICAS
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
            label = v.length > 6 ? v.substring(0, 5) + '…' : v;
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
        showToast('⚠️ Código duplicado detectado!', 'error');
        sfxErro.currentTime = 0;
        sfxErro.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
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
        sfxSucesso.currentTime = 0;
        sfxSucesso.play().catch(() => {});
        
        if (cto) {
            const save = await showModal('Salvar no Excel?', `Deseja salvar/atualizar <b>${cto}</b> na planilha?`, true, '💾');
            if (save) {
                await salvarEmBackground();
                showToast('💾 Dados sincronizados!', 'success');
            }
        }
    } catch (e) {
        showToast('Erro ao copiar. Tente manualmente.', 'error');
    }
}

async function clearAll() {
    const confirm = await showModal('Limpar CTO?', 'Todos os dados serão apagados.\nEsta ação não pode ser desfeita.', true, '⚠️');
    
    if (confirm) {
        sfxLixo.currentTime = 0;
        sfxLixo.play().catch(() => {});
        
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
// FERRAMENTAS DA CENTRAL
// ==========================================

async function analisarRetorno() {
    const texto = document.getElementById('textoRetorno').value.trim();
    
    if (!texto) {
        showToast('Cole a mensagem da central primeiro!', 'warn');
        return;
    }
    
    const regex = /(?<!\d)\d{4,5}(?!\d)/g;
    const codigos = texto.match(regex) || [];
    
    if (codigos.length === 0) {
        showToast('Nenhum código de 4-5 dígitos encontrado.', 'warn');
        return;
    }
    
    let encontrados = 0;
    
    // Limpar marcações anteriores
    document.querySelectorAll('.cto-slot').forEach(s => {
        s.classList.remove('marked-delete');
    });
    
    for (let i = 0; i < TOTAL_PORTS; i++) {
        const val = portsData[i]?.trim();
        if (val && codigos.includes(val)) {
            const slot = document.getElementById(`quad-vis-${i+1}`);
            if (slot) {
                slot.classList.add('marked-delete');
                slot.querySelector('.slot-label').textContent = '🗑️';
                encontrados++;
            }
        }
    }
    
    if (encontrados > 0) {
        showToast(`⚠️ ${encontrados} porta(s) marcada(s) para remoção!`, 'error');
        sfxErro.currentTime = 0;
        sfxErro.play().catch(() => {});
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    } else {
        showToast('Nenhum código bateu com as portas atuais.', 'warn');
    }
}

async function carregarCTO() {
    const texto = document.getElementById('textoRetorno').value.trim();
    
    if (!texto) {
        showToast('Cole o texto da planilha primeiro!', 'warn');
        return;
    }
    
    const matchCTO = texto.match(/📌\s*\*(.*?)\*/);
    if (matchCTO?.[1]) {
        document.getElementById('ctoName').value = matchCTO[1].trim();
    }
    
    for (let i = 1; i <= TOTAL_PORTS; i++) {
        const regex = new RegExp(`P${i}\\s*➔\\s*(.+)`);
        const match = texto.match(regex);
        let val = '';
        
        if (match?.[1]) {
            val = match[1].trim();
            if (val === '---') val = '';
        }
        
        const input = document.getElementById(`input-${i}`);
        if (input) input.value = val;
        portsData[i-1] = val;
        updateButtonStyles(i, val);
    }
    
    updateStats();
    updateVisualizer();
    updatePreview();
    checkDuplicates();
    autoSave();
    
    document.getElementById('textoRetorno').value = '';
    showToast('♻️ CTO carregada com sucesso!', 'success');
    sfxSucesso.currentTime = 0;
    sfxSucesso.play().catch(() => {});
}

// ==========================================
// EXPORTAR / IMPORTAR
// ==========================================

function exportData() {
    const data = {
        cto: document.getElementById('ctoName').value,
        ports: portsData,
        timestamp: new Date().toISOString(),
        version: '2.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cto-${data.cto || 'backup'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('💾 Backup exportado!', 'success');
    sfxSucesso.currentTime = 0;
    sfxSucesso.play().catch(() => {});
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
            if (data.ports && Array.isArray(data.ports)) {
                portsData = data.ports.slice(0, TOTAL_PORTS);
                portsData.forEach((val, i) => {
                    const input = document.getElementById(`input-${i+1}`);
                    if (input) input.value = val;
                    updateButtonStyles(i+1, val);
                });
                updateStats();
                updateVisualizer();
                updatePreview();
                checkDuplicates();
                autoSave();
            }
            
            showToast('📥 Dados importados com sucesso!', 'success');
            sfxSucesso.currentTime = 0;
            sfxSucesso.play().catch(() => {});
        } catch (err) {
            showToast('Erro ao importar arquivo.', 'error');
        }
    };
    input.click();
}

// ==========================================
// PERSISTÊNCIA
// ==========================================

function autoSave() {
    const data = {
        cto: document.getElementById('ctoName').value,
        ports: portsData,
        theme: isLightMode ? 'light' : 'dark',
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
                    updateButtonStyles(i+1, val);
                }
            });
        }
    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }
}

// ==========================================
// TEMA
// ==========================================

function toggleTheme() {
    isLightMode = !isLightMode;
    document.body.classList.toggle('light-mode', isLightMode);
    document.getElementById('themeToggle').textContent = isLightMode ? '🌙' : '☀️';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', isLightMode ? '#f8fafc' : '#0f172a');
    autoSave();
}

function loadTheme() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (data.theme === 'light') {
            isLightMode = true;
            document.body.classList.add('light-mode');
            document.getElementById('themeToggle').textContent = '🌙';
            document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f8fafc');
        }
    } catch (e) {}
}

// ==========================================
// SHEETDB (INTEGRAÇÃO EXISTENTE)
// ==========================================

async function salvarEmBackground() {
    const cto = document.getElementById('ctoName').value || 'CTO SEM NOME';
    const resumo = document.getElementById('previewArea').innerText;

    const payload = {
        data: [{
            "DATA": new Date().toLocaleString('pt-BR'),
            "CTO": cto,
            "RESUMO": resumo
        }]
    };

    try {
        const responseBusca = await fetch(`${SHEETDB_URL}/search?CTO=${encodeURIComponent(cto)}`);
        const dadosBusca = await responseBusca.json();

        if (dadosBusca && dadosBusca.length > 1) {
            await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(cto)}`, { method: 'DELETE' });
            await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else if (dadosBusca && dadosBusca.length === 1) {
            await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(cto)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
    } catch (error) {
        console.error("Erro no background save:", error);
        showToast('Erro ao sincronizar com o Excel.', 'error');
    }
}

async function buscarBancoDados() {
    const ctoNome = document.getElementById('ctoName').value.trim();
    
    if (!ctoNome) {
        showToast('Digite um nome para buscar!', 'warn');
        return;
    }

    const btn = document.querySelector('button[onclick="buscarBancoDados()"]') || document.querySelector('.input-icon');
    
    try {
        const resposta = await fetch(`${SHEETDB_URL}/search?CTO=*${encodeURIComponent(ctoNome)}*&casesensitive=false`);
        const dados = await resposta.json();

        if (dados && dados.length > 0) {
            if (dados.length === 1) {
                document.getElementById('textoRetorno').value = dados[0].RESUMO;
                carregarCTO();
            } else {
                const nomes = dados.map(item => item.CTO).join('\n- ');
                await showModal('Múltiplos resultados', `Encontrei ${dados.length} caixas:\n\n- ${nomes}\n\nDigite mais caracteres para refinar.`, false, '🔍');
            }
        } else {
            showToast(`Nenhuma caixa encontrada com "${ctoNome}"`, 'warn');
        }
    } catch (erro) {
        showToast('Erro ao conectar com o banco de dados.', 'error');
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
        
        btnCancel.style.display = isConfirm ? 'block' : 'none';
        btnOk.textContent = isConfirm ? 'Confirmar' : 'OK';
        
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
        
        const close = (result) => {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                btnOk.onclick = null;
                btnCancel.onclick = null;
                modal.onclick = null;
                resolve(result);
            }, 250);
        };
        
        btnOk.onclick = () => close(true);
        btnCancel.onclick = () => close(false);
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
    }, 3000);
}

// ==========================================
// COLLAPSE
// ==========================================

function toggleCollapse(header, id) {
    header.classList.toggle('open');
    document.getElementById(id).classList.toggle('open');
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
                sfxSucesso.currentTime = 0;
                sfxSucesso.play().catch(() => {});
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
                document.getElementById('ctoName').focus();
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