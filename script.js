// Substitua o link abaixo pela sua URL do SheetDB
const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';

async function salvarNoExcel() {
    // 1. Pega os valores da tela
    const cto = document.getElementById('ctoName').value || 'CTO SEM NOME';
    const resumo = document.getElementById('previewArea').innerText;

    // 2. Prepara os dados (Os nomes aqui têm que ser iguais aos da planilha: DATA, CTO, RESUMO)
    const payload = {
        data: [
            {
                "DATA": new Date().toLocaleString('pt-BR'),
                "CTO": cto,
                "RESUMO": resumo
            }
        ]
    };

    // 3. Muda visualmente o botão para mostrar que está carregando
    const btnSalvar = document.getElementById('btnSalvarExcel');
    const textoOriginal = btnSalvar.innerText;
    btnSalvar.innerText = "⏳ Enviando...";
    btnSalvar.disabled = true;

    try {
        // 4. Envia para a API
        const response = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Tenta tocar o som de sucesso que já está no seu HTML
            if (typeof sfxSucesso !== 'undefined') sfxSucesso.play().catch(() => {});
            alert("✅ Dados salvos na planilha com sucesso!");
        } else {
            throw new Error("Falha na comunicação com o SheetDB");
        }
    } catch (error) {
        console.error("Erro ao salvar:", error);
        if (typeof sfxErro !== 'undefined') sfxErro.play().catch(() => {});
        alert("❌ Erro ao salvar. Verifique se o link da API está correto ou se tem internet.");
    } finally {
        // 5. Restaura o botão ao normal
        btnSalvar.innerText = textoOriginal;
        btnSalvar.disabled = false;
    }
}
