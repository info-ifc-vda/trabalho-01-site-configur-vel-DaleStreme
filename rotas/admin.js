const express = require('express');
const appAdmin = express.Router();
const db = require('../banco/database');
const upload = require('../util/imagens');
const fs = require('fs');
const path = require('path');

appAdmin.get('/', (req, res) => {
    res.render('admin/login');
});

appAdmin.post('/login', (req, res) => {
    res.redirect('/admin/index');
});

appAdmin.get('/index', (req, res) => {
    res.render('admin/tela-admin');
});

// ================== ROTAS DE CATEGORIAS ================== //

appAdmin.get('/categorias', (req, res) => {
    db.all('SELECT * FROM categorias', [], function (erro, categorias) {
        if (erro) {
            console.error('Erro ao listar categorias:', erro.message);
            return res.send('Erro ao consultar categorias.');
        }
        res.render('admin/categorias/lista', { categorias });
    });
});

appAdmin.get('/categorias/form-cadastrar', (req, res) => {
    res.render('admin/categorias/cadastro');
});

appAdmin.post('/categorias/cadastrar', (req, res) => {
    const nome = req.body.nome;
    const descricao = req.body.descricao;

    db.run(
        `INSERT INTO categorias (nome, descricao) VALUES (?, ?)`,
        [nome, descricao],
        function (erro) {
            if (erro) {
                console.error('Erro ao cadastrar categoria:', erro.message);
                return res.send('Erro ao cadastrar categoria.');
            }
            res.redirect('/admin/categorias');
        }
    );
});

// Abrir formulário de edição da categoria
appAdmin.get('/categorias/form-editar/:id', (req, res) => {
    const id = req.params.id;

    db.get('SELECT * FROM categorias WHERE id = ?', [id], function (erro, categoria) {
        if (erro || !categoria) {
            console.error('Erro ao buscar categoria:', erro ? erro.message : 'Categoria não encontrada');
            return res.send('Erro ao buscar categoria.');
        }
        res.render('admin/categorias/editar', { categoria });
    });
});

// Salvar edição da categoria
appAdmin.post('/categorias/editar/:id', (req, res) => {
    const id = req.params.id;
    const nome = req.body.nome;
    const descricao = req.body.descricao;

    db.get('SELECT nome FROM categorias WHERE id = ?', [id], function (erro, categoriaAntiga) {
        if (erro || !categoriaAntiga) {
            console.error('Erro ao buscar categoria:', erro ? erro.message : 'Categoria não encontrada');
            return res.send('Erro ao editar categoria.');
        }

        db.run(
            'UPDATE categorias SET nome = ?, descricao = ? WHERE id = ?',
            [nome, descricao, id],
            function (erro) {
                if (erro) {
                    console.error('Erro ao editar categoria:', erro.message);
                    return res.send('Erro ao editar categoria.');
                }

                // Os produtos guardam o NOME da categoria, então atualiza eles também
                db.run(
                    'UPDATE produtos SET categoria = ? WHERE categoria = ?',
                    [nome, categoriaAntiga.nome],
                    function (erro) {
                        if (erro) {
                            console.error('Erro ao atualizar produtos da categoria:', erro.message);
                            return res.send('Erro ao atualizar os produtos da categoria.');
                        }
                        res.redirect('/admin/categorias');
                    }
                );
            }
        );
    });
});

appAdmin.get('/categorias/excluir/:id', (req, res) => {
    const id = req.params.id;

    db.run(
        'DELETE FROM categorias WHERE id = ?',
        [id],
        function (erro) {
            if (erro) {
                console.error('Erro ao excluir categoria:', erro.message);
                return res.send('Erro ao excluir categoria.');
            }
            res.redirect('/admin/categorias');
        }
    );
});

// ================== ROTAS DE PRODUTOS ================== //

appAdmin.get('/produtos', (req, res) => {
    db.all('SELECT * FROM produtos', [], function (erro, produtos) {
        if (erro) {
            console.error('Erro ao listar produtos:', erro.message);
            return res.send('Erro ao consultar produtos.');
        }
        res.render('admin/produtos/lista', { produtos });
    });
});

appAdmin.get('/produtos/form-cadastrar', (req, res) => {
    db.all('SELECT * FROM categorias', [], function (erro, categorias) {
        if (erro) {
            console.error('Erro ao buscar categorias:', erro.message);
            return res.send('Erro ao carregar categorias.');
        }
        res.render('admin/produtos/cadastro', { categorias });
    });
});

appAdmin.post('/produtos/cadastrar', upload.single('imagem'), (req, res) => {
    const nome = req.body.nome;
    const categoria = req.body.categoria;
    const valor = req.body.valor;
    const marca = req.body.marca;
    const genero = req.body.genero || null;
    const descricao = req.body.descricao;
    const destaque = req.body.destaque ? 1 : 0;
    const imagem = req.file ? req.file.filename : null;

    // Tamanhos marcados no formulário, juntos em um texto: "38,39,40"
    let tamanho = req.body.tamanho || '';
    if (Array.isArray(tamanho)) {
        tamanho = tamanho.join(',');
    }

    db.run(
        `INSERT INTO produtos (nome, categoria, valor, marca, tamanho, genero, descricao, destaque, imagem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, categoria, valor, marca, tamanho, genero, descricao, destaque, imagem],
        function (erro) {
            if (erro) {
                console.error('Erro ao cadastrar produto:', erro.message);
                return res.send(`Erro ao cadastrar produto: ${erro.message}`);
            }
            res.redirect('/admin/produtos');
        }
    );
});

// Abrir formulário de edição do produto
appAdmin.get('/produtos/form-editar/:id', (req, res) => {
    const id = req.params.id;

    db.get('SELECT * FROM produtos WHERE id = ?', [id], function (erro, produto) {
        if (erro || !produto) {
            console.error('Erro ao buscar produto:', erro ? erro.message : 'Produto não encontrado');
            return res.send('Erro ao buscar produto.');
        }

        db.all('SELECT * FROM categorias', [], function (erro, categorias) {
            if (erro) {
                console.error('Erro ao buscar categorias:', erro.message);
                return res.send('Erro ao carregar categorias.');
            }
            res.render('admin/produtos/editar', { produto, categorias });
        });
    });
});

// Salvar edição do produto
appAdmin.post('/produtos/editar/:id', upload.single('imagem'), (req, res) => {
    const id = req.params.id;
    const nome = req.body.nome;
    const categoria = req.body.categoria;
    const valor = req.body.valor;
    const marca = req.body.marca;
    const descricao = req.body.descricao;
    const destaque = req.body.destaque ? 1 : 0;

    // Tamanhos marcados no formulário, juntos em um texto: "38,39,40"
    let tamanho = req.body.tamanho || '';
    if (Array.isArray(tamanho)) {
        tamanho = tamanho.join(',');
    }

    db.get('SELECT imagem FROM produtos WHERE id = ?', [id], function (erro, produtoAntigo) {
        if (erro || !produtoAntigo) {
            console.error('Erro ao buscar produto:', erro ? erro.message : 'Produto não encontrado');
            return res.send('Erro ao editar produto.');
        }

        // Se não enviou imagem nova, mantém a que já estava
        let imagem = produtoAntigo.imagem;

        if (req.file) {
            imagem = req.file.filename;

            // Apaga a imagem antiga do disco
            if (produtoAntigo.imagem) {
                const caminhoImagem = path.join(__dirname, '../public/uploads', produtoAntigo.imagem);
                fs.unlink(caminhoImagem, (erro) => {
                    if (erro) console.log('Aviso ao apagar imagem antiga:', erro.message);
                });
            }
        }

        db.run(
            `UPDATE produtos SET nome = ?, categoria = ?, valor = ?, marca = ?, tamanho = ?, descricao = ?, destaque = ?, imagem = ? WHERE id = ?`,
            [nome, categoria, valor, marca, tamanho, descricao, destaque, imagem, id],
            function (erro) {
                if (erro) {
                    console.error('Erro ao editar produto:', erro.message);
                    return res.send(`Erro ao editar produto: ${erro.message}`);
                }
                res.redirect('/admin/produtos');
            }
        );
    });
});

appAdmin.get('/produtos/excluir/:id', (req, res) => {
    const id = req.params.id;

    db.get('SELECT imagem FROM produtos WHERE id = ?', [id], (erro, produto) => {
        if (erro) {
            console.error('Erro ao consultar produto para exclusão:', erro.message);
            return res.send('Erro ao excluir produto.');
        }

        if (produto && produto.imagem) {
            const caminhoImagem = path.join(__dirname, '../public/uploads', produto.imagem);
            fs.unlink(caminhoImagem, (erro) => {
                if (erro) console.log('Aviso ao apagar imagem do disco:', erro.message);
            });
        }

        db.run('DELETE FROM produtos WHERE id = ?', [id], function (erro) {
            if (erro) {
                console.error('Erro ao deletar produto do banco:', erro.message);
                return res.send('Erro ao excluir produto.');
            }
            res.redirect('/admin/produtos');
        });
    });
});

module.exports = appAdmin;