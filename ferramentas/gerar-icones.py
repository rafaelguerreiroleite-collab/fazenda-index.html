#!/usr/bin/env python3
"""Gera os ícones do aplicativo a partir de logo.png.

Por que existe este arquivo: ícone bom não se edita à mão. Se o desenho for
recortado no olho uma vez, ninguém consegue repetir o recorte na próxima vez
que a marca mudar, e a diferença aparece — meio pixel de descentralização é
visível num ícone de 60px na tela de início. Aqui a receita fica escrita, e
rodar de novo dá exatamente o mesmo resultado.

Decisões tomadas, e o motivo de cada uma:

1. MOEDA MAIOR. A versão anterior deixava a moeda branca com 73,8% da largura:
   sobrava verde demais e o desenho ficava tímido no meio do quadrado. Sobe
   para 84% — o ícone passa a ser a marca, não um campo verde com a marca
   dentro.

2. O DESENHO É REDIMENSIONADO UMA VEZ SÓ. A primeira tentativa ampliava o logo
   4x junto com o resto e reduzia tudo no fim. Ficou borrado, e com razão: a
   origem tem 400px, ampliar para 1720 não inventa detalhe nenhum, só espalha
   a borda, e a redução depois não traz de volta o que se perdeu. Aqui o
   bitmap sai de 400 direto para o tamanho final, num único passo. Quem é
   ampliado 4x é só a MÁSCARA redonda, que é geometria e não tem detalhe a
   perder — é dela que vem a borda lisa.

3. OS CANTOS TRANSPARENTES SÃO PREENCHIDOS ANTES. Reduzir um PNG com canto
   transparente mistura o preto de baixo da transparência na borda da moeda e
   deixa uma franja escura. Preenchendo os cantos com a própria cor de fundo
   do logo antes de redimensionar, a borda sai limpa.

4. SEM SOMBRA E SEM DEGRADÊ. A recomendação da Apple é essa, e o aplicativo
   inteiro é verde chapado: ícone com profundidade falsa destoaria da tela que
   ele abre.

5. "any" E "maskable" SEPARADOS. O Android recorta o ícone "maskable" num
   círculo e só garante os 80% centrais. Com a moeda a 84% o anel verde sumiria
   e o recorte entraria no desenho. Então o arquivo maskable é outro, com a
   moeda a 64%, e o manifesto deixa de declarar o mesmo arquivo como as duas
   coisas — que era o que estava errado antes.

Rodar:  python3 ferramentas/gerar-icones.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / 'logo.png'

VERDE = (34, 84, 55)        # #225437, o mesmo verde da marca no aplicativo
SS = 4                      # superamostragem: desenha 4x maior e reduz

# nome, lado em px, quanto da largura a moeda ocupa
SAIDAS = [
    ('icone-fazenda-js.png', 180, 0.84),   # atalho do iPhone (a squircle só come os cantos)
    ('icon-192.png',         192, 0.84),   # manifesto, purpose "any"
    ('icon-512.png',         512, 0.84),   # manifesto, purpose "any"
    ('icon-maskable-512.png', 512, 0.64),  # manifesto, purpose "maskable" (área segura do Android)
]


def cor_de_fundo_do_logo(logo):
    """A cor que preenche a moeda no arquivo de origem — não é branco puro."""
    px = logo.load()
    return px[logo.size[0] // 2, 8][:3]


def mascara_redonda(d):
    """Círculo de diâmetro d com a borda lisa, desenhado grande e reduzido.

    Só a máscara passa pela ampliação: ela é geometria pura, então reduzir
    depois devolve uma borda macia sem borrar desenho nenhum.
    """
    m = Image.new('L', (d * SS, d * SS), 0)
    ImageDraw.Draw(m).ellipse([0, 0, d * SS - 1, d * SS - 1], fill=255)
    return m.resize((d, d), Image.LANCZOS)


def gerar(logo, chapado, lado, fracao_moeda):
    tela = Image.new('RGB', (lado, lado), VERDE)
    d = int(round(lado * fracao_moeda))       # diâmetro da moeda
    canto = (lado - d) // 2
    # Um único redimensionamento do bitmap, da origem para o tamanho final.
    tela.paste(chapado.resize((d, d), Image.LANCZOS), (canto, canto), mascara_redonda(d))
    return tela


def main():
    logo = Image.open(ORIGEM).convert('RGBA')
    if logo.size[0] != logo.size[1]:
        raise SystemExit('logo.png precisa ser quadrado')
    # Cantos transparentes preenchidos com a cor de dentro da moeda, ANTES de
    # redimensionar: é o que evita a franja escura na borda.
    chapado = Image.new('RGB', logo.size, cor_de_fundo_do_logo(logo))
    chapado.paste(logo, (0, 0), logo)
    for nome, lado, fracao in SAIDAS:
        # Sem canal alpha: o iOS compõe ícone transparente sobre preto, e o
        # resultado é uma moldura preta que ninguém pediu.
        gerar(logo, chapado, lado, fracao).save(RAIZ / nome, 'PNG', optimize=True)
        print(f'{nome:24} {lado}x{lado}  moeda {fracao:.0%}')


if __name__ == '__main__':
    main()
