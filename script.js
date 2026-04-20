// A sua URL correta do SheetDB
const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';

async function salvarEmBackground() {
    const cto = document.getElementById('ctoName').value || 'CTO SEM NOME';
    const resumo = document.getElementById('previewArea').innerText;

    const payload = {
        data: [
            {
                "DATA": new Date().toLocaleString('pt-BR'),
                "CTO": cto,
                "RESUMO": resumo
            }
        ]
    };

    try {
        // Envia para o Excel (Modo Furtivo) sem travar a tela
        await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log("Histórico atualizado no Excel com sucesso!");
    } catch (error) {
        console.error("Erro no background save:", error);
    }
}
