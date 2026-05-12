let tamanho = 16;
let imagemAtual = 0;

const imagens = [
    "https://placedog.net/200",
    "https://placedog.net/201",
    "https://placedog.net/202"
];

function modoEscuro(){
    document.getElementById("corpo").className = "escuro";
}

function modoClaro(){
    document.getElementById("corpo").className = "";
}

function aumentarFonte(){
    tamanho = tamanho + 2;
    document.body.style.fontSize = tamanho + "px";
}

function diminuirFonte(){
    tamanho = tamanho - 2;
    document.body.style.fontSize = tamanho + "px";
}

function proximo(){
    imagemAtual = imagemAtual + 1;
    if(imagemAtual > 2){
        imagemAtual = 0;
    }
    document.getElementById("imagemPrincipal").src = imagens[imagemAtual];
}

function anterior(){
    imagemAtual = imagemAtual - 1;
    if(imagemAtual < 0){
        imagemAtual = 2;
    }
    document.getElementById("imagemPrincipal").src = imagens[imagemAtual];
}