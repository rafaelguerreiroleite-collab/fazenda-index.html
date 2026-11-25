#!/usr/bin/env python3
"""
Agente editor de vídeo curto (TikTok Shop / Reels / Shorts).

Fluxo:
  1. Transcreve o vídeo com o tempo de cada palavra (faster-whisper).
  2. O Claude lê a transcrição, olha quadros do vídeo e propõe uma timeline em JSON.
  3. O ffmpeg corta, reenquadra para 9:16 e queima legendas -> prévia.
  4. O Claude revisa a prévia (folha de quadros + avisos), ajusta e finaliza.

Requisitos:
  - Python 3.10+
  - ffmpeg e ffprobe no PATH (com libass, que vem na maioria das builds)
  - pip install anthropic faster-whisper "av<16"
    (o av 19 quebra o faster-whisper 1.2.1: "unexpected keyword argument metadata_errors")
  - variável de ambiente ANTHROPIC_API_KEY com sua chave da API

Uso:
  # edição completa pelo agente
  python agente_editor.py video.mp4 --duracao 30 \
      --objetivo "Afiliado do produto X: gancho forte, mostrar o produto cedo, CTA no fim"

  # com seus exemplos de estilo (o que funcionou e o que não funcionou)
  python agente_editor.py video.mp4 --estilo estilo.txt

  # só renderizar de novo uma timeline que você editou à mão (sem gastar API)
  python agente_editor.py video.mp4 --timeline final.timeline.json --saida final_v2.mp4
"""
import argparse
import base64
import json
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

MODELO_PADRAO = "claude-sonnet-5-5"
LARGURA, ALTURA = 1080, 1920
MAX_PREVIAS = 4
MAX_RODADAS = 20


# ----------------------------------------------------------------- dados

@dataclass
class Palavra:
    texto: str
    inicio: float
    fim: float


class Contexto:
    def __init__(self, video, palavras, duracao, trabalho, saida, alvo):
        self.video = Path(video).resolve()
        self.palavras = palavras
        self.duracao = duracao
        self.trabalho = trabalho
        self.saida = Path(saida).resolve()
        self.alvo = alvo
        self.timeline = None
        self.previas = 0


# ----------------------------------------------------------------- ffmpeg

def rodar(cmd, cwd=None):
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, capture_output=True,
                       text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"Comando falhou: {' '.join(map(str, cmd))[:300]}\n{r.stderr[-1500:]}")
    return r.stdout


def sondar(video):
    out = rodar(["ffprobe", "-v", "error",
                 "-show_entries", "format=duration:stream=codec_type",
                 "-of", "json", video])
    info = json.loads(out)
    duracao = float(info["format"]["duration"])
    tem_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return duracao, tem_audio


def renderizar(video, clipes, ass_texto, trabalho, saida, previa, audio_continuo=False):
    """Corta os clipes na ordem da lista, reenquadra para 9:16 e queima as legendas.

    audio_continuo=True (vídeo só com música): a imagem é cortada, mas a trilha
    toca do começo sem cortes e termina com fade, para a música não dar saltos.
    """
    nome_ass = "legendas_previa.ass" if previa else "legendas_final.ass"
    (trabalho / nome_ass).write_text(ass_texto, encoding="utf-8")
    w, h = (540, 960) if previa else (LARGURA, ALTURA)
    # recorte central 9:16, funciona para vídeo deitado ou em pé
    crop = r"crop=min(iw\,ih*9/16):min(ih\,iw*16/9)"
    total = sum(c["fim"] - c["inicio"] for c in clipes)

    cmd = ["ffmpeg", "-y", "-hide_banner"]
    for c in clipes:
        cmd += ["-ss", f"{c['inicio']:.3f}", "-t", f"{c['fim'] - c['inicio']:.3f}", "-i", video]
    if audio_continuo:
        cmd += ["-t", f"{total:.3f}", "-i", video]

    partes, rotulos = [], ""
    for i, c in enumerate(clipes):
        dur = c["fim"] - c["inicio"]
        partes.append(f"[{i}:v]setpts=PTS-STARTPTS,{crop},scale={w}:{h}:flags=lanczos,"
                      f"setsar=1,fps=30[v{i}]")
        if audio_continuo:
            rotulos += f"[v{i}]"
            continue
        # fade de 15 ms nas pontas de cada clipe evita o "clique" no corte do áudio
        partes.append(f"[{i}:a]asetpts=PTS-STARTPTS,"
                      f"aformat=sample_rates=48000:channel_layouts=stereo,"
                      f"afade=t=in:d=0.015,afade=t=out:st={max(0.0, dur - 0.015):.3f}:d=0.015[a{i}]")
        rotulos += f"[v{i}][a{i}]"
    if audio_continuo:
        fade = min(0.8, total / 4)
        partes.append(f"{rotulos}concat=n={len(clipes)}:v=1:a=0[vc]")
        partes.append(f"[{len(clipes)}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                      f"afade=t=out:st={total - fade:.3f}:d={fade:.3f}[ac]")
    else:
        partes.append(f"{rotulos}concat=n={len(clipes)}:v=1:a=1[vc][ac]")
    partes.append(f"[vc]subtitles=filename={nome_ass}[vout]")

    cmd += ["-filter_complex", ";".join(partes), "-map", "[vout]", "-map", "[ac]",
            "-c:v", "libx264", "-preset", "ultrafast" if previa else "veryfast",
            "-crf", "30" if previa else "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", Path(saida).resolve()]
    rodar(cmd, cwd=trabalho)


def folha_de_contato(video, destino, duracao, n=8):
    rodar(["ffmpeg", "-y", "-hide_banner", "-i", video,
           "-vf", f"fps={n / max(duracao, 0.1):.5f},scale=270:480,tile=4x2",
           "-frames:v", "1", "-q:v", "4", destino])


def folha_original(video, destino, duracao, n=40):
    """n quadros do original em grade 8 colunas; o quadro k está em k*intervalo segundos."""
    intervalo = max(duracao, 0.1) / n
    rodar(["ffmpeg", "-y", "-hide_banner", "-i", video,
           "-vf", f"fps={1 / intervalo:.5f},scale=120:-2,tile=8x{(n + 7) // 8}",
           "-frames:v", "1", "-q:v", "4", destino])
    return intervalo


def extrair_quadros(video, tempos, trabalho):
    caminhos = []
    for i, t in enumerate(tempos[:6]):
        p = trabalho / f"quadro_{i}.jpg"
        rodar(["ffmpeg", "-y", "-hide_banner", "-ss", f"{max(0.0, t):.2f}", "-i", video,
               "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", p])
        caminhos.append((t, p))
    return caminhos


def imagem_b64(caminho):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                         "data": base64.b64encode(Path(caminho).read_bytes()).decode()}}


# ----------------------------------------------------------------- transcrição

def transcrever(video, trabalho, tamanho, idioma):
    cache = trabalho / "transcricao.json"
    st = Path(video).stat()
    assinatura = f"{Path(video).resolve()}|{st.st_size}|{int(st.st_mtime)}|{tamanho}|{idioma}"
    if cache.exists():
        dados = json.loads(cache.read_text(encoding="utf-8"))
        if dados.get("assinatura") == assinatura:
            print("Transcrição reaproveitada do cache.")
            return [Palavra(**p) for p in dados["palavras"]], [tuple(f) for f in dados["frases"]]

    print(f"Transcrevendo com whisper '{tamanho}' (pode demorar na primeira vez)...")
    from faster_whisper import WhisperModel
    modelo = WhisperModel(tamanho, device="auto", compute_type="int8")
    segmentos, _ = modelo.transcribe(str(video), language=idioma,
                                     word_timestamps=True, vad_filter=True)
    palavras, frases = [], []
    for s in segmentos:
        ws = [Palavra(w.word.strip(), round(float(w.start), 3), round(float(w.end), 3))
              for w in (s.words or []) if w.word.strip()]
        if not ws:
            continue
        palavras.extend(ws)
        frases.append((ws[0].inicio, ws[-1].fim, " ".join(w.texto for w in ws)))

    cache.write_text(json.dumps({"assinatura": assinatura,
                                 "palavras": [asdict(p) for p in palavras],
                                 "frases": frases}, ensure_ascii=False), encoding="utf-8")
    return palavras, frases


# ----------------------------------------------------------------- timeline

def ajustar_clipes(clipes, palavras, duracao):
    """Encaixa cortes nas bordas das palavras, dá uma folga e gera avisos."""
    avisos, ok = [], []
    for i, c in enumerate(clipes, 1):
        s = max(0.0, float(c["inicio"]))
        e = min(duracao, float(c["fim"]))
        # encaixa nas palavras tocadas pelo clipe: nunca corta palavra ao meio e
        # apara silêncio nas pontas. Reaplicar dá o mesmo resultado.
        # Clipes marcados com "visual": true (b-roll, produto na mão sem fala)
        # não são encaixados, para não perder a imagem antes/depois da fala.
        tocadas = [w for w in palavras if w.fim > s and w.inicio < e]
        if tocadas and not c.get("visual"):
            s, e = tocadas[0].inicio, tocadas[-1].fim
            antes = [w for w in palavras if w.fim <= s]
            depois = [w for w in palavras if w.inicio >= e]
            folga_ini = min(0.10, (s - antes[-1].fim) / 2) if antes else min(0.10, s)
            folga_fim = min(0.15, (depois[0].inicio - e) / 2) if depois else min(0.15, duracao - e)
            s, e = round(s - folga_ini, 3), round(e + folga_fim, 3)
        if e - s < 0.4:
            avisos.append(f"Clipe {i} curto demais ({e - s:.2f}s), descartado.")
            continue

        dentro = [w for w in palavras if w.inicio >= s and w.fim <= e]
        if not dentro and palavras and not c.get("visual"):
            avisos.append(f"Clipe {i} ({s:.2f}-{e:.2f}) não tem fala.")
        elif dentro and dentro[-1].texto[-1:] not in ".!?…":
            avisos.append(f"Clipe {i} termina em '{dentro[-1].texto}' sem ponto final: confira se a ideia ficou completa.")
        novo = {"inicio": s, "fim": e}
        if c.get("visual"):
            novo["visual"] = True
        ok.append(novo)

    for i, a in enumerate(ok):
        for j, b in enumerate(ok[i + 1:], i + 2):
            if a["inicio"] < b["fim"] and b["inicio"] < a["fim"]:
                avisos.append(f"Clipes {i + 1} e {j} se sobrepõem: o trecho vai aparecer repetido.")
    return ok, avisos


def tempo_ass(t):
    cs = int(round(max(0.0, t) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def limpar_ass(texto):
    return texto.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def gerar_ass(clipes, palavras, gancho):
    eventos, acc = [], 0.0
    for c in clipes:
        ws = [w for w in palavras if w.inicio >= c["inicio"] - 0.01 and w.fim <= c["fim"] + 0.01]
        bloco = []
        for w in ws:
            bloco.append(w)
            if len(bloco) == 3 or w.texto[-1:] in ".!?,…":
                eventos.append([acc + bloco[0].inicio - c["inicio"],
                                acc + bloco[-1].fim - c["inicio"],
                                " ".join(x.texto for x in bloco)])
                bloco = []
        if bloco:
            eventos.append([acc + bloco[0].inicio - c["inicio"],
                            acc + bloco[-1].fim - c["inicio"],
                            " ".join(x.texto for x in bloco)])
        acc += c["fim"] - c["inicio"]

    for a, b in zip(eventos, eventos[1:]):  # tapa buracos curtos para a legenda não piscar
        if 0 < b[0] - a[1] < 0.35:
            a[1] = b[0]

    linhas = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {LARGURA}", f"PlayResY: {ALTURA}",
        "WrapStyle: 0", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # legenda: branca, embaixo, acima da área de botões do TikTok
        "Style: Legenda,Arial,84,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,"
        "100,100,0,0,1,6,2,2,80,80,560,1",
        # gancho: amarelo, no topo
        "Style: Gancho,Arial,90,&H0000E6FF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,"
        "100,100,0,0,1,7,2,8,80,80,260,1",
        "", "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    if gancho:
        linhas.append(f"Dialogue: 1,{tempo_ass(0)},{tempo_ass(min(2.5, acc))},Gancho,,0,0,0,,"
                      f"{limpar_ass(gancho.upper())}")
    for s, e, txt in eventos:
        linhas.append(f"Dialogue: 0,{tempo_ass(s)},{tempo_ass(e)},Legenda,,0,0,0,,"
                      f"{limpar_ass(txt.upper())}")
    return "\n".join(linhas) + "\n"


# ----------------------------------------------------------------- ferramentas do agente

FERRAMENTAS = [
    {
        "name": "palavras",
        "description": "Devolve cada palavra com seu tempo exato (em segundos) entre 'inicio' e 'fim'. "
                       "Use para cortes finos: tirar 'é...', 'tipo', repetições e gaguejos.",
        "input_schema": {"type": "object",
                         "properties": {"inicio": {"type": "number"}, "fim": {"type": "number"}},
                         "required": ["inicio", "fim"]},
    },
    {
        "name": "ver_quadros",
        "description": "Mostra quadros do vídeo ORIGINAL nos tempos pedidos (no máximo 6). "
                       "Use para saber o que aparece na tela, por exemplo quando o produto aparece.",
        "input_schema": {"type": "object",
                         "properties": {"tempos": {"type": "array", "items": {"type": "number"}}},
                         "required": ["tempos"]},
    },
    {
        "name": "propor_timeline",
        "description": "Renderiza uma PRÉVIA da edição e devolve uma folha com 8 quadros, a duração e avisos. "
                       "Os clipes tocam na ordem da lista (pode reordenar o original). Os cortes são "
                       "encaixados automaticamente nas bordas das palavras, exceto em clipes com "
                       "'visual': true (use para b-roll/produto sem fala, que deve manter o tempo exato).",
        "input_schema": {
            "type": "object",
            "properties": {
                "clipes": {"type": "array", "items": {
                    "type": "object",
                    "properties": {"inicio": {"type": "number"}, "fim": {"type": "number"},
                                   "motivo": {"type": "string"},
                                   "visual": {"type": "boolean",
                                              "description": "true = não encaixar nas palavras."}},
                    "required": ["inicio", "fim"]}},
                "audio": {"type": "string", "enum": ["cortado", "continuo"],
                          "description": "'cortado': o áudio acompanha cada clipe (vídeo falado). "
                                         "'continuo': a trilha toca do início sem cortes (vídeo só "
                                         "com música). Padrão: cortado se há fala, continuo se não há."},
                "gancho": {"type": "string",
                           "description": "Texto curto (até 6 palavras) no topo nos primeiros 2,5 s. Opcional."},
            },
            "required": ["clipes"],
        },
    },
    {
        "name": "finalizar",
        "description": "Renderiza a versão final em 1080x1920 usando a ÚLTIMA timeline proposta. "
                       "Só chame depois de revisar pelo menos uma prévia.",
        "input_schema": {"type": "object",
                         "properties": {"resumo": {"type": "string",
                                                   "description": "O que foi feito e por quê, em 2 a 4 frases."}},
                         "required": ["resumo"]},
    },
]


def aplicar_timeline(ctx, timeline, saida, previa):
    clipes, avisos = ajustar_clipes(timeline["clipes"], ctx.palavras, ctx.duracao)
    if not clipes:
        raise ValueError("Nenhum clipe válido. " + " ".join(avisos))
    gancho = (timeline.get("gancho") or "").strip()
    audio = timeline.get("audio") or ("cortado" if ctx.palavras else "continuo")
    renderizar(ctx.video, clipes, gerar_ass(clipes, ctx.palavras, gancho), ctx.trabalho, saida, previa,
               audio_continuo=(audio == "continuo"))
    total = sum(c["fim"] - c["inicio"] for c in clipes)
    if ctx.alvo and abs(total - ctx.alvo) / ctx.alvo > 0.2:
        avisos.append(f"Duração {total:.1f}s está fora do alvo de {ctx.alvo}s (±20%).")
    return {"clipes": clipes, "gancho": gancho, "audio": audio}, total, avisos


def executar_ferramenta(nome, entrada, ctx):
    """Devolve (conteúdo do tool_result, caminho_final_ou_None)."""
    if nome == "palavras":
        ws = [w for w in ctx.palavras if w.fim >= entrada["inicio"] and w.inicio <= entrada["fim"]][:400]
        return "\n".join(f"{w.inicio:.2f}-{w.fim:.2f} {w.texto}" for w in ws) or "Sem fala nesse trecho.", None

    if nome == "ver_quadros":
        conteudo = []
        for t, p in extrair_quadros(ctx.video, entrada["tempos"], ctx.trabalho):
            conteudo += [{"type": "text", "text": f"Quadro em {t:.2f}s:"}, imagem_b64(p)]
        return conteudo, None

    if nome == "propor_timeline":
        if ctx.previas >= MAX_PREVIAS:
            return "Limite de prévias atingido. Chame 'finalizar' com a melhor timeline até aqui.", None
        previa = ctx.trabalho / f"previa_{ctx.previas + 1}.mp4"
        timeline, total, avisos = aplicar_timeline(ctx, entrada, previa, previa=True)
        ctx.timeline, ctx.previas = timeline, ctx.previas + 1
        folha = ctx.trabalho / f"folha_{ctx.previas}.jpg"
        folha_de_contato(previa, folha, total)
        print(f"  prévia {ctx.previas}: {total:.1f}s, {len(timeline['clipes'])} clipes -> {previa}")
        texto = (f"Prévia {ctx.previas} renderizada: {total:.1f}s, {len(timeline['clipes'])} clipes.\n"
                 f"Clipes após ajuste: {json.dumps(timeline['clipes'])}\n"
                 f"Avisos: {'; '.join(avisos) if avisos else 'nenhum'}\n"
                 "Abaixo, 8 quadros espalhados pela prévia (com legendas).")
        return [{"type": "text", "text": texto}, imagem_b64(folha)], None

    if nome == "finalizar":
        if ctx.timeline is None:
            return "Ainda não há prévia. Chame 'propor_timeline' primeiro.", None
        print("Renderizando versão final...")
        _, total, _ = aplicar_timeline(ctx, ctx.timeline, ctx.saida, previa=False)
        json_path = ctx.saida.with_suffix(".timeline.json")
        json_path.write_text(json.dumps(ctx.timeline, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nResumo do agente: {entrada.get('resumo', '')}")
        return f"Final renderizado: {ctx.saida} ({total:.1f}s).", ctx.saida

    return f"Ferramenta desconhecida: {nome}", None


# ----------------------------------------------------------------- agente

def montar_sistema(objetivo, alvo, estilo):
    s = f"""Você é um editor de vídeos curtos verticais (TikTok Shop, Reels, Shorts) para um afiliado brasileiro.
Objetivo do vídeo: {objetivo}
Duração alvo: cerca de {alvo}s (tolerância de 20%).

Regras de edição:
- Os 2 primeiros segundos decidem se a pessoa fica. Abra com a frase mais forte (benefício, problema ou resultado), mesmo que ela esteja no meio do original: reordenar é permitido.
- Corte silêncios, hesitações ("é...", "tipo", "né"), repetições e frases que não acrescentam.
- Nunca corte no meio de uma frase ou de uma ideia.
- Se houver chamada para ação (link, carrinho, cupom), mantenha no fim.
- O texto de gancho é opcional e tem no máximo 6 palavras.
- Trechos só de imagem (produto em close, demonstração sem fala) podem entrar com "visual": true.

Processo: leia a transcrição; use 'palavras' para cortes finos e 'ver_quadros' para saber o que aparece na tela; chame 'propor_timeline'; revise a folha de quadros e os avisos; ajuste se precisar (no máximo {MAX_PREVIAS} prévias); depois chame 'finalizar'."""
    if estilo:
        s += f"\n\nExemplos e preferências do dono do canal (siga isto acima das regras gerais):\n{estilo}"
    return s


def executar_agente(ctx, frases, objetivo, estilo, modelo):
    import anthropic
    cliente = anthropic.Anthropic()
    sistema = montar_sistema(objetivo, ctx.alvo, estilo)
    if frases:
        transcricao = "\n".join(f"[{s:.2f}-{e:.2f}] {t}" for s, e, t in frases)
        inicial = f"Transcrição do vídeo ({ctx.duracao:.1f}s):\n{transcricao}\n\nEdite este vídeo."
    else:
        folha = ctx.trabalho / "folha_original.jpg"
        intervalo = folha_original(ctx.video, folha, ctx.duracao)
        inicial = [
            {"type": "text", "text":
                f"Este vídeo ({ctx.duracao:.1f}s) NÃO tem fala: só música/efeitos. Edite pelas imagens. "
                f"A folha abaixo tem 40 quadros em 8 colunas, lidos da esquerda para a direita e de cima "
                f"para baixo; o quadro k (começando em 0) está em {intervalo:.2f}*k segundos. "
                "Corte entre cenas (quando um texto já sumiu), não no meio de uma animação. "
                "Se o vídeo já tem textos na tela, não use gancho por cima deles. "
                "Use audio='continuo' para a música não dar saltos. Edite este vídeo."},
            imagem_b64(folha)]
    msgs = [{"role": "user", "content": inicial}]

    for _ in range(MAX_RODADAS):
        resp = cliente.messages.create(model=modelo, max_tokens=8192, system=sistema,
                                       tools=FERRAMENTAS, messages=msgs)
        msgs.append({"role": "assistant", "content": resp.content})
        for b in resp.content:
            if b.type == "text" and b.text.strip():
                print(f"\n[agente] {b.text.strip()}")

        usos = [b for b in resp.content if b.type == "tool_use"]
        if not usos:
            msgs.append({"role": "user",
                         "content": "Continue usando as ferramentas: proponha uma timeline ou finalize."})
            continue

        resultados, final = [], None
        for u in usos:
            print(f"  -> {u.name}")
            try:
                conteudo, f = executar_ferramenta(u.name, u.input, ctx)
                final = final or f
                resultados.append({"type": "tool_result", "tool_use_id": u.id, "content": conteudo})
            except Exception as ex:  # o erro volta para o agente corrigir
                resultados.append({"type": "tool_result", "tool_use_id": u.id,
                                   "content": f"Erro: {ex}", "is_error": True})
        msgs.append({"role": "user", "content": resultados})
        if final:
            return final
    raise RuntimeError(f"O agente não finalizou em {MAX_RODADAS} rodadas.")


# ----------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Agente editor de vídeo curto")
    ap.add_argument("video")
    ap.add_argument("--objetivo", default="Vídeo de afiliado do TikTok Shop: prender nos 2 primeiros "
                                          "segundos, mostrar o produto e terminar com chamada para o carrinho.")
    ap.add_argument("--duracao", type=float, default=30, help="duração alvo em segundos")
    ap.add_argument("--saida", default=None, help="arquivo final (padrão: <video>_editado.mp4)")
    ap.add_argument("--estilo", default=None, help="arquivo .txt com exemplos e preferências")
    ap.add_argument("--timeline", default=None, help="renderiza um .timeline.json sem chamar o agente")
    ap.add_argument("--modelo", default=MODELO_PADRAO)
    ap.add_argument("--whisper", default="small", help="tiny, base, small, medium, large-v3")
    ap.add_argument("--idioma", default="pt")
    a = ap.parse_args()

    video = Path(a.video)
    if not video.exists():
        sys.exit(f"Vídeo não encontrado: {video}")
    saida = Path(a.saida) if a.saida else video.with_name(video.stem + "_editado.mp4")
    trabalho = saida.parent.resolve() / (saida.stem + "_trabalho")
    trabalho.mkdir(parents=True, exist_ok=True)

    duracao, tem_audio = sondar(video)
    if not tem_audio:
        sys.exit("O vídeo não tem trilha de áudio; este agente precisa de uma.")

    palavras, frases = transcrever(video, trabalho, a.whisper, a.idioma)
    if not palavras:
        print("Nenhuma fala detectada: editando pelas imagens, com a música contínua.")
    ctx = Contexto(video, palavras, duracao, trabalho, saida, a.duracao)

    if a.timeline:
        timeline = json.loads(Path(a.timeline).read_text(encoding="utf-8"))
        _, total, avisos = aplicar_timeline(ctx, timeline, ctx.saida, previa=False)
        for av in avisos:
            print("Aviso:", av)
        print(f"Pronto: {ctx.saida} ({total:.1f}s)")
        return

    estilo = Path(a.estilo).read_text(encoding="utf-8") if a.estilo else ""
    final = executar_agente(ctx, frases, a.objetivo, estilo, a.modelo)
    print(f"\nPronto: {final}\nPrévias e arquivos de trabalho em: {trabalho}")


if __name__ == "__main__":
    main()
