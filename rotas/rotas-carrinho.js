const express = require('express');
const appCarrinho = express.Router();
const db = require('../banco/database');

// Função auxiliar para gerenciar a sessão do carrinho
function obterCarrinho(req) {
    if (!req.session.carrinho) {
        req.session.carrinho = [];
    }
    return req.session.carrinho;
}

// Transforma o texto de tamanhos do produto ("38, 39, 40") em uma lista
function listarTamanhos(texto) {
    if (!texto) {
        return [];
    }
    return String(texto).replace(/\s/g, '').split(',').filter(t => /^\d+$/.test(t));
}

// Busca os produtos no banco com base nos IDs salvos na sessão
function buscarProdutos(ids, callback) {
    if (ids.length === 0) {
        return callback(null, []);
    }
    const marcadores = ids.map(() => '?').join(', ');
    db.all(
        `SELECT * FROM produtos WHERE id IN (${marcadores})`,
        ids,
        callback
    );
}

// ================== EXIBIR O CARRINHO ================== //
appCarrinho.get('/', (req, res) => {
    const carrinho = obterCarrinho(req);
    const ids = carrinho.map(item => item.id);

    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.status(500).send("Erro ao consultar categorias.");
        }

        buscarProdutos(ids, function (erro, produtosBanco) {
            if (erro) {
                console.error(erro.message);
                return res.status(500).send('Erro ao consultar os produtos do carrinho.');
            }

            // Tira do carrinho os produtos que não existem mais (ex: excluídos no admin)
            const carrinhoValido = carrinho.filter(item => produtosBanco.find(p => p.id === item.id));
            req.session.carrinho = carrinhoValido;

            // Monta os itens do carrinho combinando com os dados do banco
            const itensCarrinho = [];
            let totalQtd = 0;
            let subtotal = 0;

            carrinhoValido.forEach(function (itemSessao) {
                const produto = produtosBanco.find(p => p.id === itemSessao.id);
                const qtd = itemSessao.quantidade;
                const valor = Number(produto.valor);
                totalQtd += qtd;
                subtotal += valor * qtd;

                itensCarrinho.push({
                    id: produto.id,
                    nome: produto.nome,
                    categoria: produto.categoria,
                    tamanho: itemSessao.tamanho || '-',
                    valor: valor,
                    imagem: produto.imagem,
                    qtd: qtd
                });
            });

            // Recupera dados salvos na sessão (cupom, frete, cep)
            const cupom = req.session.cupom || null;
            const valorFrete = req.session.frete !== undefined ? req.session.frete : 19.90;
            const cep = req.session.cep || '';

            // Calcula descontos e total geral
            let descontoCupom = 0;
            if (cupom) {
                descontoCupom = cupom.valor;
            }

            let totalGeral = subtotal - descontoCupom + valorFrete;
            if (totalGeral < 0) totalGeral = 0;

            res.render('carrinho', { 
                categorias, 
                itensCarrinho, 
                totalQtd,
                subtotal,
                descontoCupom,
                valorFrete,
                totalGeral,
                cupom, 
                cep 
            });
        });
    });
});

// ================== ADICIONAR PRODUTO ================== //
appCarrinho.post('/adicionar/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const tamanho = req.body.tamanho ? String(req.body.tamanho).trim() : '';

    if (isNaN(id)) {
        return res.redirect('/');
    }

    db.get('SELECT id, tamanho FROM produtos WHERE id = ?', [id], function (erro, produto) {
        if (erro) {
            console.error(erro.message);
            return res.status(500).send('Erro ao consultar o produto.');
        }

        // Produto que não existe
        if (!produto) {
            return res.redirect('/');
        }

        // O tamanho é obrigatório e precisa ser um número de 30 a 45
        const numero = parseInt(tamanho);
        if (tamanho == '' || isNaN(numero) || numero < 30 || numero > 45) {
            return res.redirect('/dados-produto/' + id);
        }

        // Se o produto tem tamanhos cadastrados, o escolhido precisa estar na lista
        const disponiveis = listarTamanhos(produto.tamanho);
        if (disponiveis.length > 0 && !disponiveis.includes(tamanho)) {
            return res.redirect('/dados-produto/' + id);
        }

        // O mesmo produto em tamanhos diferentes vira itens separados
        const carrinho = obterCarrinho(req);
        const itemExistente = carrinho.find(i => i.id === id && i.tamanho === tamanho);

        if (itemExistente) {
            itemExistente.quantidade += 1;
        } else {
            carrinho.push({ id: id, tamanho: tamanho, quantidade: 1 });
        }

        res.redirect('/carrinho');
    });
});

// ================== ATUALIZAR QUANTIDADE (+ / -) ================== //
appCarrinho.post('/atualizar', (req, res) => {
    const index = parseInt(req.body.index);
    const acao = req.body.acao;
    const carrinho = obterCarrinho(req);

    if (!isNaN(index) && carrinho[index]) {
        if (acao === 'aumentar') {
            carrinho[index].quantidade += 1;
        } else if (acao === 'diminuir') {
            carrinho[index].quantidade -= 1;
            if (carrinho[index].quantidade <= 0) {
                carrinho.splice(index, 1);
            }
        }
    }

    res.redirect('/carrinho');
});

// ================== REMOVER ITEM ESPECÍFICO ================== //
appCarrinho.post('/remover', (req, res) => {
    const index = parseInt(req.body.index);
    const carrinho = obterCarrinho(req);

    if (!isNaN(index) && carrinho[index]) {
        carrinho.splice(index, 1);
    }

    res.redirect('/carrinho');
});

// ================== APLICAR CUPOM ================== //
appCarrinho.post('/cupom', (req, res) => {
    const codigo = req.body.codigo ? req.body.codigo.trim().toUpperCase() : '';

    if (codigo === 'JOGO50') {
        req.session.cupom = { codigo: 'JOGO50', valor: 50.00 };
    }

    res.redirect('/carrinho');
});

// ================== REMOVER CUPOM ================== //
appCarrinho.post('/remover-cupom', (req, res) => {
    req.session.cupom = null;
    res.redirect('/carrinho');
});

// ================== CALCULAR FRETE ================== //
appCarrinho.post('/frete', (req, res) => {
    const cep = req.body.cep;
    req.session.cep = cep;
    req.session.frete = 19.90; // Valor padrão de frete simulado

    res.redirect('/carrinho');
});

module.exports = appCarrinho;