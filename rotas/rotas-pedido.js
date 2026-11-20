const express = require('express');
const appPedido = express.Router();
const db = require('../banco/database');

const formasPagamento = {
    pix: 'Pix',
    boleto: 'Boleto',
    cartao: 'Cartão'
};

// Busca as categorias (para a navbar) e renderiza a tela
function renderizar(res, view, dados) {
    db.all('SELECT * FROM categorias', [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send('Erro ao consultar categorias.');
        }
        dados.categorias = categorias;
        res.render(view, dados);
    });
}

// Monta o resumo do carrinho (itens, subtotal, cupom, frete e total)
function montarResumo(req, callback) {
    const carrinho = req.session.carrinho || [];
    const ids = carrinho.map(item => item.id);

    if (ids.length === 0) {
        return callback(null, null);
    }

    const marcadores = ids.map(() => '?').join(', ');

    db.all(`SELECT * FROM produtos WHERE id IN (${marcadores})`, ids, function (erro, produtosBanco) {
        if (erro) {
            return callback(erro);
        }

        const itens = [];
        let totalQtd = 0;
        let subtotal = 0;

        carrinho.forEach(function (itemSessao) {
            const produto = produtosBanco.find(p => p.id === itemSessao.id);
            if (produto) {
                const qtd = itemSessao.quantidade;
                const valor = Number(produto.valor);
                totalQtd += qtd;
                subtotal += valor * qtd;

                itens.push({
                    id: produto.id,
                    nome: produto.nome,
                    categoria: produto.categoria,
                    tamanho: itemSessao.tamanho || '-',
                    valor: valor,
                    imagem: produto.imagem,
                    qtd: qtd
                });
            }
        });

        if (itens.length === 0) {
            return callback(null, null);
        }

        const cupom = req.session.cupom || null;
        const desconto = cupom ? cupom.valor : 0;
        const frete = req.session.frete !== undefined ? req.session.frete : 19.90;

        let total = subtotal - desconto + frete;
        if (total < 0) total = 0;

        callback(null, {
            itens: itens,
            totalQtd: totalQtd,
            subtotal: subtotal,
            cupom: cupom,
            desconto: desconto,
            frete: frete,
            total: total
        });
    });
}

// Gera o número do pedido, ex: KO-2026-48213
function gerarNumeroPedido() {
    const numero = Math.floor(10000 + Math.random() * 90000);
    return 'KO-' + new Date().getFullYear() + '-' + numero;
}

// Data e hora atuais, ex: 16/11/2026 às 09:05
function formatarData() {
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const hora = String(agora.getHours()).padStart(2, '0');
    const minuto = String(agora.getMinutes()).padStart(2, '0');
    return dia + '/' + mes + '/' + agora.getFullYear() + ' às ' + hora + ':' + minuto;
}

// ================== TELA DE CONFIRMAÇÃO DO PEDIDO ================== //
appPedido.get('/', (req, res) => {
    // Precisa estar logado. Depois do login, volta para cá
    if (!req.session.cliente) {
        req.session.voltarPara = '/pedido';
        return res.redirect('/login');
    }

    montarResumo(req, function (erro, resumo) {
        if (erro) {
            console.error('Erro ao montar o resumo do pedido:', erro.message);
            return res.send('Erro ao consultar os produtos do carrinho.');
        }

        // Carrinho vazio: volta para o carrinho
        if (!resumo) {
            return res.redirect('/carrinho');
        }

        renderizar(res, 'pedido/finalizar', {
            cliente: req.session.cliente,
            resumo: resumo,
            dados: { cep: req.session.cep || '' },
            erro: null
        });
    });
});

// ================== CONFIRMAR O PEDIDO ================== //
appPedido.post('/confirmar', (req, res) => {
    if (!req.session.cliente) {
        req.session.voltarPara = '/pedido';
        return res.redirect('/login');
    }

    const dados = req.body;
    const endereco = {
        cep: (dados.cep || '').trim(),
        rua: (dados.rua || '').trim(),
        numero: (dados.numero || '').trim(),
        complemento: (dados.complemento || '').trim(),
        bairro: (dados.bairro || '').trim(),
        cidade: (dados.cidade || '').trim(),
        estado: (dados.estado || '').trim().toUpperCase()
    };

    montarResumo(req, function (erro, resumo) {
        if (erro) {
            console.error('Erro ao montar o resumo do pedido:', erro.message);
            return res.send('Erro ao consultar os produtos do carrinho.');
        }

        if (!resumo) {
            return res.redirect('/carrinho');
        }

        // Endereço: todos os campos, menos o complemento, são obrigatórios
        if (!endereco.cep || !endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || !endereco.estado) {
            return renderizar(res, 'pedido/finalizar', {
                cliente: req.session.cliente,
                resumo: resumo,
                dados: dados,
                erro: 'Preencha todos os campos do endereço de entrega.'
            });
        }

        // Forma de pagamento (fictícia): só precisa escolher uma
        if (dados.pagamento != 'pix' && dados.pagamento != 'boleto' && dados.pagamento != 'cartao') {
            return renderizar(res, 'pedido/finalizar', {
                cliente: req.session.cliente,
                resumo: resumo,
                dados: dados,
                erro: 'Escolha uma forma de pagamento.'
            });
        }

        // Guarda o pedido na sessão para mostrar na tela final
        req.session.pedido = {
            numero: gerarNumeroPedido(),
            data: formatarData(),
            cliente: req.session.cliente,
            endereco: endereco,
            pagamento: formasPagamento[dados.pagamento],
            itens: resumo.itens,
            totalQtd: resumo.totalQtd,
            subtotal: resumo.subtotal,
            cupom: resumo.cupom,
            desconto: resumo.desconto,
            frete: resumo.frete,
            total: resumo.total
        };

        // Esvazia o carrinho e o cupom
        req.session.carrinho = [];
        req.session.cupom = null;

        res.redirect('/pedido/finalizado');
    });
});

// ================== PEDIDO CONFIRMADO ================== //
appPedido.get('/finalizado', (req, res) => {
    const pedido = req.session.pedido;

    if (!pedido) {
        return res.redirect('/');
    }

    renderizar(res, 'pedido/finalizado', { pedido: pedido });
});

module.exports = appPedido;