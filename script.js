// Substitua pela sua URL do SheetDB
const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';

async function salvarNoExcel() {
    // 1. Pegar o nome da CTO
    const ctoNome = document.getElementById('ctoName').value || 'CTO SEM NOME';
    
    // 2. Tentar capturar o texto da prévia (que já tem todas as portas)
    const resumoTexto = document.getElementById('previewArea').innerText;

    const dadosParaEnviar = {
        data: [
            {
                "DATA": new Date().toLocaleString('pt-BR'),
                "CTO": ctoNome,
                "RESUMO": resumoTexto
            }
        ]
    };

    // Feedback visual no botão
    const btnSalvar = document.querySelector('button[onclick="salvarNoExcel()"]');
    const textoOriginal = btnSalvar.innerText;
    btnSalvar.innerText = "⏳ Enviando...";
    btnSalvar.disabled = true;

    try {
        const response = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosParaEnviar)
        });

        if (response.ok) {
            // Tenta tocar o som de sucesso definido no HTML
            if (window.sfxSucesso) window.sfxSucesso.play().catch(()=>{});
            alert("✅ Salvo no Excel!");
        } else {
            throw new Error("Erro na resposta");
        }
    } catch (error) {
        console.error("Erro detalhado:", error);
        if (window.sfxErro) window.sfxErro.play().catch(()=>{});
        alert("❌ Erro ao salvar. Verifique se a URL da API está correta e se tem internet.");
    } finally {
        btnSalvar.innerText = textoOriginal;
        btnSalvar.disabled = false;
    }
}
