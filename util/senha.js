const crypto = require('crypto');

// Gera a senha criptografada no formato "sal:hash"
function gerarHash(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, sal, 64).toString('hex');
    return sal + ':' + hash;
}

// Confere a senha digitada com a senha guardada no banco
function conferirSenha(senha, guardada) {
    // Contas antigas: a senha foi guardada em texto puro
    const formatoNovo = /^[0-9a-f]{32}:[0-9a-f]{128}$/;
    if (!formatoNovo.test(guardada)) {
        return senha === guardada;
    }

    const partes = guardada.split(':');
    const hash = crypto.scryptSync(senha, partes[0], 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(partes[1]));
}

module.exports = { gerarHash, conferirSenha };