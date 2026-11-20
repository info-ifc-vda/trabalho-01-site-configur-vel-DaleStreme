const express = require('express');
const appRecuperar = express.Router();
const db = require('../banco/database');
const { gerarHash, conferirSenha } = require('../util/senha');

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

// Gera um código de 6 dígitos
function gerarCodigo() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

// O código vale por 10 minutos
function novaValidade() {
    return Date.now() + 10 * 60 * 1000;
}

// Hora atual, ex: 10:25
function horaAtual() {
    const agora = new Date();
    const hora = String(agora.getHours()).padStart(2, '0');
    const minuto = String(agora.getMinutes()).padStart(2, '0');
    return hora + ':' + minuto;
}

// "Envia" o e-mail de forma fictícia: só guarda o código e o horário na sessão
function enviarEmailFicticio(recuperar) {
    recuperar.codigo = gerarCodigo();
    recuperar.expira = novaValidade();
    recuperar.tentativas = 0;
    recuperar.enviadoEm = horaAtual();
}

// Mostra a tela de digitar o código
function mostrarCodigo(res, recuperar, erro, aviso) {
    renderizar(res, 'recuperar/codigo', {
        email: recuperar.email,
        erro: erro,
        aviso: aviso
    });
}

// ================== TELA 1: E-MAIL ================== //
appRecuperar.get('/', (req, res) => {
    renderizar(res, 'recuperar/email', { erro: null });
});

appRecuperar.post('/enviar-codigo', (req, res) => {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';

    db.get('SELECT * FROM clientes WHERE LOWER(email) = ?', [email], function (erro, cliente) {
        if (erro) {
            console.error('Erro ao buscar cliente:', erro.message);
            return res.send('Erro interno no servidor.');
        }

        if (!cliente) {
            return renderizar(res, 'recuperar/email', { erro: 'Não encontramos uma conta com esse e-mail.' });
        }

        const recuperar = {
            id: cliente.id,
            nome: cliente.nome,
            email: cliente.email,
            verificado: false
        };

        enviarEmailFicticio(recuperar);
        req.session.recuperar = recuperar;

        res.redirect('/recuperar/codigo');
    });
});

// ================== CAIXA DE ENTRADA FICTÍCIA ================== //
appRecuperar.get('/caixa-de-entrada', (req, res) => {
    const recuperar = req.session.recuperar;

    if (!recuperar) {
        return res.redirect('/recuperar');
    }

    res.render('recuperar/caixa-email', {
        nome: recuperar.nome,
        email: recuperar.email,
        codigo: recuperar.codigo,
        enviadoEm: recuperar.enviadoEm,
        expirado: Date.now() > recuperar.expira
    });
});

// ================== TELA 2: CÓDIGO ================== //
appRecuperar.get('/codigo', (req, res) => {
    const recuperar = req.session.recuperar;

    if (!recuperar) {
        return res.redirect('/recuperar');
    }

    let aviso = null;
    if (req.query.reenviado == '1') {
        aviso = 'Enviamos um novo código para o seu e-mail.';
    }

    mostrarCodigo(res, recuperar, null, aviso);
});

appRecuperar.post('/verificar-codigo', (req, res) => {
    const recuperar = req.session.recuperar;
    const codigo = req.body.codigo ? req.body.codigo.trim() : '';

    if (!recuperar) {
        return res.redirect('/recuperar');
    }

    // Código vencido
    if (Date.now() > recuperar.expira) {
        return mostrarCodigo(res, recuperar, 'O código expirou. Clique em "Reenviar código".', null);
    }

    // Limite de 5 tentativas
    recuperar.tentativas = recuperar.tentativas + 1;
    if (recuperar.tentativas > 5) {
        req.session.recuperar = null;
        return renderizar(res, 'recuperar/email', { erro: 'Muitas tentativas. Peça um novo código.' });
    }

    if (codigo !== recuperar.codigo) {
        return mostrarCodigo(res, recuperar, 'Código inválido. Tente novamente.', null);
    }

    recuperar.verificado = true;
    res.redirect('/recuperar/nova-senha');
});

appRecuperar.post('/reenviar', (req, res) => {
    const recuperar = req.session.recuperar;

    if (!recuperar) {
        return res.redirect('/recuperar');
    }

    enviarEmailFicticio(recuperar);

    res.redirect('/recuperar/codigo?reenviado=1');
});

// ================== TELA 3: NOVA SENHA ================== //
appRecuperar.get('/nova-senha', (req, res) => {
    const recuperar = req.session.recuperar;

    if (!recuperar || !recuperar.verificado) {
        return res.redirect('/recuperar');
    }

    renderizar(res, 'recuperar/nova-senha', { erro: null });
});

appRecuperar.post('/salvar-senha', (req, res) => {
    const recuperar = req.session.recuperar;
    const senha = req.body.senha;
    const confirmar = req.body.confirmar;

    if (!recuperar || !recuperar.verificado) {
        return res.redirect('/recuperar');
    }

    if (!senha || senha.length < 8) {
        return renderizar(res, 'recuperar/nova-senha', { erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    if (senha !== confirmar) {
        return renderizar(res, 'recuperar/nova-senha', { erro: 'As senhas não coincidem.' });
    }

    db.get('SELECT senha FROM clientes WHERE id = ?', [recuperar.id], function (erro, cliente) {
        if (erro || !cliente) {
            console.error('Erro ao buscar cliente:', erro ? erro.message : 'Cliente não encontrado');
            return res.send('Erro interno no servidor.');
        }

        if (conferirSenha(senha, cliente.senha)) {
            return renderizar(res, 'recuperar/nova-senha', { erro: 'A nova senha precisa ser diferente da senha atual.' });
        }

        db.run('UPDATE clientes SET senha = ? WHERE id = ?', [gerarHash(senha), recuperar.id], function (erro) {
            if (erro) {
                console.error('Erro ao atualizar senha:', erro.message);
                return res.send('Erro ao atualizar a senha.');
            }

            req.session.recuperar = null;
            res.redirect('/recuperar/sucesso');
        });
    });
});

// ================== TELA 4: SUCESSO ================== //
appRecuperar.get('/sucesso', (req, res) => {
    renderizar(res, 'recuperar/sucesso', {});
});

module.exports = appRecuperar;