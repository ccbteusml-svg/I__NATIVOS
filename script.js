// Substitua pela URL que o SheetDB te der
const SHEETDB_URL = 'https://sheetdb.io/api/v1/uzfmxhzz8a28d';

async function salvarRelatorio() {
    // 1. Pegando os dados dos seus inputs (Exemplos de IDs que você pode ter)
    const dados = {
        data: [
            {
                "DATA": new Date().toLocaleDateString(),
                "CLIENTE": document.getElementById('input_cliente').value,
                "SERVICO": document.getElementById('input_servico').value,
                "DESCRICAO": document.getElementById('input_descricao').value
            }
        ]
    };

    try {
        const response = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (response.ok) {
            // Toca o som de sucesso que já está no seu Cache do SW!
            new Audio('./sucesso.mp3').play();
            alert("Relatório salvo no Excel com sucesso!");
        } else {
            throw new Error("Erro na resposta do servidor");
        }
    } catch (error) {
        console.error("Erro:", error);
        // Toca o som de erro que está no seu Cache
        new Audio('./erro_digital.mp3').play();
        alert("Erro ao salvar. Verifique a conexão.");
    }
}

