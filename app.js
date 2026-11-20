const express = require("express");
const app = express();
const port = 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const db = require("./banco/database");
const session = require("express-session");
const { gerarHash, conferirSenha } = require("./util/senha");

app.use(session({
    secret: "minha-chave-secreta",
    resave: false,
    saveUninitialized: false
}));

// Deixa o cliente logado disponível em todas as telas
app.use((req, res, next) => {
    res.locals.cliente = req.session.cliente || null;
    next();
});

// Rota para a página inicial (Destaques com suporte a filtros de categoria, marca, ordem e ocultar)
app.get("/", (req, res) => {
    const categoriaAtual = req.query.categoria || "";
    const ordem = req.query.ordem || "";
    const ocultar = req.query.ocultar || "";
    let marca = req.query.marca || "";

    // Ao ocultar os filtros, limpa o filtro de marca
    if (ocultar == "1") {
        marca = "";
    }

    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send("Erro ao consultar categorias.");
        }

        // Busca as marcas disponíveis nos produtos em destaque (filtrando pela categoria se houver)
        let sqlMarcas = "SELECT DISTINCT marca FROM produtos WHERE (destaque = 1 OR destaque = 'true') AND marca IS NOT NULL AND marca != ''";
        const paramMarcas = [];

        if (categoriaAtual != "") {
            sqlMarcas += " AND categoria = ?";
            paramMarcas.push(categoriaAtual);
        }
        sqlMarcas += " ORDER BY marca";

        db.all(sqlMarcas, paramMarcas, function (erro, marcas) {
            if (erro) {
                console.error(erro.message);
                return res.send("Erro ao consultar marcas.");
            }

            // Consulta principal dos produtos em destaque
            let sql = "SELECT * FROM produtos WHERE (destaque = 1 OR destaque = 'true')";
            const parametros = [];

            if (categoriaAtual != "") {
                sql += " AND categoria = ?";
                parametros.push(categoriaAtual);
            }

            if (marca != "") {
                sql += " AND marca = ?";
                parametros.push(marca);
            }

            if (ordem == "menor") {
                sql += " ORDER BY valor ASC";
            } else if (ordem == "maior") {
                sql += " ORDER BY valor DESC";
            }

            db.all(sql, parametros, function (erro, produtos) {
                if (erro) {
                    console.error(erro.message);
                    return res.send("Erro ao consultar produtos em destaque.");
                }

                res.render("index", {
                    categorias,
                    produtos,
                    categoriaAtual,
                    marcas,
                    marca,
                    ordem,
                    ocultar
                });
            });
        });
    });
});

// Rota para exibir produtos por Categoria específica (marca, ordem e ocultar filtros)
app.get("/categoria/:nome", (req, res) => {
    const nomeCategoria = req.params.nome;
    const ordem = req.query.ordem || "";
    const ocultar = req.query.ocultar || "";
    let marca = req.query.marca || "";

    // Ao ocultar os filtros, volta para a visualização padrão
    if (ocultar == "1") {
        marca = "";
    }

    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send("Erro ao consultar categorias.");
        }

        // Descrição (frase) da categoria atual
        const categoriaInfo = categorias.find(c => c.nome == nomeCategoria);
        const descricao = categoriaInfo ? categoriaInfo.descricao : "";

        // Marcas cadastradas nos produtos desta categoria
        db.all("SELECT DISTINCT marca FROM produtos WHERE categoria = ? AND marca IS NOT NULL AND marca != '' ORDER BY marca", [nomeCategoria], function (erro, marcas) {
            if (erro) {
                console.error(erro.message);
                return res.send("Erro ao consultar marcas.");
            }

            let sql = "SELECT * FROM produtos WHERE categoria = ?";
            let parametros = [nomeCategoria];

            if (marca != "") {
                sql += " AND marca = ?";
                parametros.push(marca);
            }

            if (ordem == "menor") {
                sql += " ORDER BY valor ASC";
            } else if (ordem == "maior") {
                sql += " ORDER BY valor DESC";
            }

            db.all(sql, parametros, function (erro, produtos) {
                if (erro) {
                    console.error(erro.message);
                    return res.send("Erro ao consultar produtos da categoria.");
                }

                res.render("categoria", {
                    categorias,
                    produtos,
                    categoriaAtual: nomeCategoria,
                    descricao,
                    marcas,
                    marca,
                    ordem,
                    ocultar
                });
            });
        });
    });
});

// Detalhes do Produto
app.get('/dados-produto/:id', (req, res) => {
    const id = req.params.id;
    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send("Erro ao consultar categorias.");
        }
        db.all("SELECT * FROM produtos WHERE id = ?", [id], function (erro, produto) {
            if (erro || !produto || produto.length === 0) {
                console.error(erro ? erro.message : "Produto não encontrado");
                return res.send("Erro ao consultar produto.");
            }           
            res.render("dados.ejs", { categorias, produto });
        });
    });
});

// ==========================================
// CADASTRO DE CLIENTES
// ==========================================
function mostrarCadastro(res, dados) {
    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send("Erro ao carregar a página de cadastro.");
        }
        res.render("cadastro.ejs", {
            categorias,
            erro: dados.erro || null,
            nome: dados.nome || "",
            email: dados.email || ""
        });
    });
}

app.get("/cadastro", (req, res) => {
    // Quem já está logado não precisa de cadastro
    if (req.session.cliente) {
        return res.redirect("/");
    }
    mostrarCadastro(res, {});
});

app.post("/cadastro-salvo", (req, res) => {
    const nome = (req.body.nome || "").trim();
    const email = (req.body.email || "").trim().toLowerCase();
    const senha = req.body.senha || "";
    const confirmar = req.body.confirmar || "";
    const dados = { nome: nome, email: email };

    if (nome == "" || email == "") {
        dados.erro = "Preencha o nome e o e-mail.";
        return mostrarCadastro(res, dados);
    }

    if (senha.length < 8) {
        dados.erro = "A senha precisa ter pelo menos 8 caracteres.";
        return mostrarCadastro(res, dados);
    }

    if (senha !== confirmar) {
        dados.erro = "As senhas não coincidem.";
        return mostrarCadastro(res, dados);
    }

    db.get("SELECT id FROM clientes WHERE LOWER(email) = ?", [email], function (erro, existente) {
        if (erro) {
            console.error("Erro ao consultar cliente:", erro.message);
            return res.send("Erro interno no servidor.");
        }

        if (existente) {
            dados.erro = "Este e-mail já está cadastrado. Tente entrar na sua conta.";
            return mostrarCadastro(res, dados);
        }

        db.run("INSERT INTO clientes (nome, email, senha) VALUES (?, ?, ?)", [nome, email, gerarHash(senha)], function (erro) {
            if (erro) {
                console.error("Erro ao cadastrar cliente:", erro.message);
                return res.send("Erro ao realizar o cadastro.");
            }
            res.redirect("/login?cadastro=ok");
        });
    });
});

// ==========================================
// LOGIN E LOGOUT DE CLIENTES
// ==========================================
function mostrarLogin(req, res, dados) {
    db.all("SELECT * FROM categorias", [], function (erro, categorias) {
        if (erro) {
            console.error(erro.message);
            return res.send("Erro ao carregar a página de login.");
        }
        res.render("login.ejs", {
            categorias,
            erro: dados.erro || null,
            sucesso: dados.sucesso || null,
            aviso: req.session.voltarPara ? "Entre na sua conta para finalizar a compra." : null,
            email: dados.email || ""
        });
    });
}

app.get("/login", (req, res) => {
    // Quem já está logado vai para a loja
    if (req.session.cliente) {
        return res.redirect("/");
    }

    const dados = {};
    if (req.query.cadastro == "ok") {
        dados.sucesso = "Conta criada! Entre para continuar.";
    }
    mostrarLogin(req, res, dados);
});

app.post("/login", (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    const senha = req.body.senha || "";

    db.get("SELECT * FROM clientes WHERE LOWER(email) = ?", [email], function (erro, cliente) {
        if (erro) {
            console.error("Erro ao realizar login:", erro.message);
            return res.send("Erro interno no servidor.");
        }

        if (!cliente || !conferirSenha(senha, cliente.senha)) {
            return mostrarLogin(req, res, { erro: "E-mail ou senha inválidos.", email: email });
        }

        // Guarda o cliente na sessão
        req.session.cliente = { id: cliente.id, nome: cliente.nome, email: cliente.email };

        // Se o cliente veio da finalização do pedido, volta para lá
        const destino = req.session.voltarPara || "/";
        req.session.voltarPara = null;
        res.redirect(destino);
    });
});

app.get("/logout", (req, res) => {
    req.session.cliente = null;
    req.session.voltarPara = null;
    res.redirect("/");
});

// ==========================================
// IMPORTAÇÃO DAS ROTAS DO ADMIN, CARRINHO, PEDIDO E RECUPERAÇÃO DE SENHA
// ==========================================
const appAdmin = require("./rotas/admin");
app.use("/admin", appAdmin);

const appCarrinho = require("./rotas/rotas-carrinho");
app.use("/carrinho", appCarrinho);

const appPedido = require("./rotas/rotas-pedido");
app.use("/pedido", appPedido);

const appRecuperar = require("./rotas/rotas-recuperar");
app.use("/recuperar", appRecuperar);

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
