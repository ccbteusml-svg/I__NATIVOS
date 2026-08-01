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
        // 1. Pergunta para a planilha QUANTAS vezes essa CTO aparece
        const responseBusca = await fetch(`${SHEETDB_URL}/search?CTO=${encodeURIComponent(cto)}`);
        const dadosBusca = await responseBusca.json();

        // 2. AUTO-LIMPEZA: Se houver MAIS DE UMA (duplicatas antigas sujas)
        if (dadosBusca && dadosBusca.length > 1) {
            console.log(`Encontradas ${dadosBusca.length} duplicatas. Limpando...`);
            // Deleta TODAS as linhas dessa CTO para limpar o banco
            await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(cto)}`, {
                method: 'DELETE'
            });
            
            // Salva uma única linha nova e atualizada
            await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } 
        // 3. Se existir EXATAMENTE UMA linha (Atualização normal)
        else if (dadosBusca && dadosBusca.length === 1) {
            await fetch(`${SHEETDB_URL}/CTO/${encodeURIComponent(cto)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } 
        // 4. Se não existir nenhuma (CTO totalmente nova)
        else {
            await fetch(SHEETDB_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

    } catch (error) {
        console.error("Erro no background save:", error);
    }
}
