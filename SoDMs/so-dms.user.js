// ==UserScript==
// @name         Só DMs
// @description  Deixa o Instagram apenas com as mensagens diretas. Bloqueia feed, explorar, reels, busca e notas.
// @version      3.0
// @match        *://*.instagram.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  if (!/(^|\.)instagram\.com$/.test(location.hostname)) return;
  if (window.__soDMs) return;
  window.__soDMs = true;

  // ---------- Ajustes ----------
  const LIBERAR_PERFIS = true;    // abrir o perfil de quem está na conversa (com os posts)
  const LIBERAR_STORIES = true;   // abrir o story ao qual alguém respondeu
  const ESCONDER_NOTAS = true;    // remove a fileira de "notas" do topo do inbox
  const SOM_LIGADO = true;        // vídeos já começam com som

  const INBOX = "/direct/inbox/";

  const SEMPRE_OK = [
    /^\/direct\//,
    /^\/accounts\//,
    /^\/challenge\//,
    /^\/two_factor/,
    /^\/emails?\//,
    /^\/legal\//,
  ];

  // ================== REGRAS DE NAVEGAÇÃO ==================
  // contexto: "dm" | "perfil" | "conteudo" | "sistema"
  let contexto = null;
  let conteudoLiberado = null;   // o reel/post/story aberto a partir da DM
  let perfilAtual = null;        // perfil aberto a partir da DM

  function idDoConteudo(path) {
    let m = path.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p|tv)\/([^/?#]+)/);
    if (m) return "midia:" + m[1];
    m = path.match(/^\/stories\/([^/]+)(?:\/([^/?#]+))?/);
    if (m) return "story:" + m[1] + ":" + (m[2] || "");
    return null;
  }

  function tipoDaPagina(path) {
    if (SEMPRE_OK.some((r) => r.test(path))) return path.startsWith("/direct/") ? "dm" : "sistema";
    if (path === "/" || /^\/(reels|explore)(\/|$)/.test(path) && !/^\/reels\/[^/]+/.test(path)) return "proibido";
    if (idDoConteudo(path)) return "conteudo";
    if (/^\/[A-Za-z0-9._]+\/?$/.test(path)) return "perfil";
    if (/^\/[A-Za-z0-9._]+\/(reels|tagged)\/?$/.test(path)) return "aba-perfil";
    return "outro";
  }

  function nomeDoPerfil(path) {
    const m = path.match(/^\/([A-Za-z0-9._]+)/);
    return m ? m[1].toLowerCase() : null;
  }

  function permitido(path) {
    const tipo = tipoDaPagina(path);

    if (tipo === "dm" || tipo === "sistema") {
      contexto = tipo;
      conteudoLiberado = null;
      perfilAtual = null;
      return true;
    }
    if (tipo === "proibido" || tipo === "outro") return false;

    if (tipo === "perfil" || tipo === "aba-perfil") {
      if (!LIBERAR_PERFIS) return false;
      const nome = nomeDoPerfil(path);
      if (nome === perfilAtual) { contexto = "perfil"; return true; }
      // perfil só abre vindo de uma conversa ou do conteúdo que te mandaram
      // (de um perfil para outro, não: evita o passeio por marcados e sugestões)
      if (tipo === "perfil" && (contexto === "dm" || (contexto === "conteudo" && perfilAtual === null))) {
        perfilAtual = nome;
        contexto = "perfil";
        return true;
      }
      return false;
    }

    if (tipo === "conteudo") {
      const id = idDoConteudo(path);
      if (id.startsWith("story:") && !LIBERAR_STORIES) return false;
      if (id === conteudoLiberado) return true;
      // posts e reels do perfil que você abriu
      if (perfilAtual !== null && (contexto === "perfil" || contexto === "conteudo")) {
        contexto = "conteudo";
        return true;
      }
      // o primeiro conteúdo aberto a partir da conversa
      if (contexto === "dm" && conteudoLiberado === null) {
        conteudoLiberado = id;
        contexto = "conteudo";
        return true;
      }
      return false;
    }
    return false;
  }

  let voltandoAte = 0;
  let ultimoVoltar = 0;

  function marcarPagina() {
    const el = document.documentElement;
    if (!el) return;
    const p = location.pathname;
    el.setAttribute("data-so-dms", tipoDaPagina(p));
    el.setAttribute("data-so-dms-tela", /^\/direct\/inbox\/?$/.test(p) ? "inbox" : "outra");
  }

  function checar(origem) {
    if (Date.now() < voltandoAte) return;
    const path = location.pathname;
    if (permitido(path)) { marcarPagina(); return; }

    const agora = Date.now();
    if (origem === "spa" && path !== "/" && agora - ultimoVoltar > 2000 && history.length > 1) {
      ultimoVoltar = agora;
      voltandoAte = agora + 900;
      history.back();
      setTimeout(() => {
        voltandoAte = 0;
        if (!permitido(location.pathname)) location.replace(INBOX);
        else marcarPagina();
      }, 1000);
    } else {
      location.replace(INBOX);
    }
  }

  const push = history.pushState;
  history.pushState = function () {
    const r = push.apply(this, arguments);
    checar("spa");
    return r;
  };
  const replace = history.replaceState;
  history.replaceState = function () {
    const r = replace.apply(this, arguments);
    checar("spa");
    return r;
  };
  window.addEventListener("popstate", () => checar("spa"));
  setInterval(() => checar("spa"), 400);
  checar("carga");

  // ================== TRAVA DE ROLAGEM NOS REELS ==================
  // O visualizador de reels deixa arrastar para o próximo sem mudar o endereço.
  // Aqui o arrasto vertical em cima de um vídeo em tela cheia é anulado.

  function videoGrandeEm(x, y) {
    for (const v of document.querySelectorAll("video")) {
      const r = v.getBoundingClientRect();
      if (r.height < window.innerHeight * 0.55) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return v;
    }
    return null;
  }
  // painéis por cima do vídeo (comentários, compartilhar) continuam rolando normalmente
  function dentroDeJanela(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[aria-label*="oment"]')) return true;
    const d = el.closest('[role="dialog"]');
    if (!d) return false;
    return ![...d.querySelectorAll("video")].some(ehGrande);
  }

  let toqueInicio = null;
  window.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    toqueInicio = t ? { x: t.clientX, y: t.clientY, travar: !!videoGrandeEm(t.clientX, t.clientY) && !dentroDeJanela(e.target) } : null;
  }, { capture: true, passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!toqueInicio || !toqueInicio.travar) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - toqueInicio.x);
    const dy = Math.abs(t.clientY - toqueInicio.y);
    if (dy > dx) {                // só o arrasto vertical; carrossel lateral continua
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, { capture: true, passive: false });

  window.addEventListener("wheel", (e) => {
    if (videoGrandeEm(e.clientX, e.clientY)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true, passive: false });

  // Rede de segurança: se mesmo assim um SEGUNDO vídeo de tela cheia começar a tocar
  // no mesmo visualizador, pausa e volta para o reel original.
  let videoAtivo = null;
  let caminhoDoVideo = null;
  function ehGrande(v) {
    const r = v.getBoundingClientRect();
    return r.height >= window.innerHeight * 0.55;
  }
  document.addEventListener("play", (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || !ehGrande(v)) return;
    if (caminhoDoVideo !== location.pathname) { videoAtivo = null; caminhoDoVideo = location.pathname; }
    if (videoAtivo && videoAtivo !== v && document.contains(videoAtivo) && videoAtivo.isConnected) {
      v.pause();
      v.muted = true;
      videoAtivo.scrollIntoView({ block: "center" });
      return;
    }
    videoAtivo = v;
  }, true);

  // ================== SOM ==================
  const somLigadoEm = new WeakSet();
  function ligarSom() {
    if (!SOM_LIGADO) return;
    // 1. botão de som do próprio Instagram
    document.querySelectorAll('svg[aria-label]').forEach((svg) => {
      const l = svg.getAttribute("aria-label") || "";
      if (!/(áudio está desativado|audio is muted|ativar (o )?som|ativar áudio|unmute|sem som)/i.test(l)) return;
      const btn = svg.closest('button, [role="button"]');
      if (btn && !somLigadoEm.has(btn)) { somLigadoEm.add(btn); btn.click(); }
    });
    // 2. garantia direto no vídeo (uma vez por vídeo, para você ainda poder silenciar)
    document.querySelectorAll("video").forEach((v) => {
      if (somLigadoEm.has(v)) return;
      somLigadoEm.add(v);
      v.muted = false;
      v.volume = 1;
      v.addEventListener("playing", () => { if (!v.dataset.soDmsSom) { v.dataset.soDmsSom = "1"; v.muted = false; } }, { once: true });
    });
  }

  // ================== VISUAL ==================
  const css = `
    /* navegação para fora das DMs */
    a[href="/"], a[href="/explore/"], a[href="/reels/"],
    svg[aria-label="Página inicial"], svg[aria-label="Home"],
    svg[aria-label="Explorar"], svg[aria-label="Explore"],
    svg[aria-label="Reels"], svg[aria-label="Pesquisar"], svg[aria-label="Search"],
    svg[aria-label="Nova publicação"], svg[aria-label="New post"],
    svg[aria-label="Notificações"], svg[aria-label="Notifications"],
    a:has(svg[aria-label="Página inicial"]), a:has(svg[aria-label="Home"]),
    a:has(svg[aria-label="Explorar"]), a:has(svg[aria-label="Explore"]),
    a:has(svg[aria-label="Reels"]) {
      display: none !important;
    }

    /* seta de voltar no topo do inbox (levaria ao feed) */
    html[data-so-dms-tela="inbox"] :is(a, button, [role="button"]):has(svg[aria-label="Voltar"], svg[aria-label="Back"], svg[aria-label="Anterior"]),
    html[data-so-dms-tela="inbox"] svg[aria-label="Voltar"],
    html[data-so-dms-tela="inbox"] svg[aria-label="Back"] {
      display: none !important;
    }

    /* no perfil: seguidores/seguindo e sugestões ficam de fora */
    html[data-so-dms="perfil"] a[href$="/followers/"],
    html[data-so-dms="perfil"] a[href$="/following/"],
    html[data-so-dms="perfil"] a[href$="/saved/"] {
      pointer-events: none !important;
    }
  `;
  function injetarCSS() {
    if (document.getElementById("so-dms-css")) return;
    const s = document.createElement("style");
    s.id = "so-dms-css";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // Seta de voltar sem aria-label conhecido: a primeira do cabeçalho do inbox
  function esconderSetaDoInbox() {
    if (!/^\/direct\/inbox\/?$/.test(location.pathname)) return;
    document.querySelectorAll("svg[aria-label]").forEach((svg) => {
      const l = (svg.getAttribute("aria-label") || "").toLowerCase();
      if (!/(voltar|back|anterior|seta|chevron)/.test(l)) return;
      const r = svg.getBoundingClientRect();
      if (r.top > 120 || r.left > 120) return;   // só no canto superior esquerdo
      const alvo = svg.closest('a, button, [role="button"]') || svg;
      alvo.style.setProperty("display", "none", "important");
    });
  }

  // ================== NOTAS ==================
  const TEXTO_NOTA = /^(sua nota|your note|deixe uma nota|leave a note|compartilhe uma ideia|compartilhe um pensamento|share a thought|nota\.{0,3}|note\.{0,3}|notas|notes)$/i;

  function temConversas(el) {
    return !!el.querySelector('a[href^="/direct/t/"], [role="listitem"] a[href*="/direct/"]');
  }
  function rolaNaHorizontal(el) {
    const cs = getComputedStyle(el);
    return cs.overflowX === "auto" || cs.overflowX === "scroll" || el.scrollWidth > el.clientWidth + 20;
  }
  function temConteudoVisivel(el) {
    for (const c of el.children) {
      if (c.getAttribute("data-so-dms-oculto")) continue;
      const cs = getComputedStyle(c);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return true;
    }
    return false;
  }
  function ocultar(el) {
    el.setAttribute("data-so-dms-oculto", "1");
    el.style.setProperty("display", "none", "important");
  }

  function esconderNotas() {
    if (!ESCONDER_NOTAS || !location.pathname.startsWith("/direct/inbox")) return;
    for (const el of document.querySelectorAll("span, div, a, button")) {
      if (el.childElementCount > 1 || el.closest("[data-so-dms-oculto]")) continue;
      const t = (el.innerText || el.getAttribute("aria-label") || "").trim();
      if (!TEXTO_NOTA.test(t)) continue;

      // 1. acha a fileira das notas
      let fileira = null;
      let atual = el;
      for (let i = 0; i < 12 && atual.parentElement; i++) {
        atual = atual.parentElement;
        if (temConversas(atual)) break;
        if (rolaNaHorizontal(atual) || atual.getAttribute("role") === "list") fileira = atual;
      }
      if (!fileira) continue;
      ocultar(fileira);

      // 2. recolhe os contêineres que ficaram vazios em volta dela (o espaço em branco)
      let pai = fileira.parentElement;
      while (pai && pai !== document.body && !temConversas(pai)) {
        if (temConteudoVisivel(pai)) {
          // sobrou algo (ex.: o título do cabeçalho): tira a altura fixa, mantém o resto
          pai.style.setProperty("height", "auto", "important");
          pai.style.setProperty("min-height", "0", "important");
          break;
        }
        ocultar(pai);
        pai = pai.parentElement;
      }
      // 3. se a lista de conversas guardou um espaço reservado no topo, zera
      if (pai) {
        for (const c of pai.children) {
          if (c.getAttribute("data-so-dms-oculto")) continue;
          if (temConversas(c)) {
            const cs = getComputedStyle(c);
            if (parseFloat(cs.paddingTop) > 40) c.style.setProperty("padding-top", "0", "important");
            if (parseFloat(cs.marginTop) > 40) c.style.setProperty("margin-top", "0", "important");
          }
        }
      }
    }
  }

  // ================== AVISOS "ABRA O APP" ==================
  const TEXTO_APP = /\b(app|aplicativo)\b/i;
  const BOTAO_FECHAR = /^(agora n[aã]o|n[aã]o agora|not now|fechar|close|continuar no navegador|continue on web|usar o site|cancelar)$/i;

  function limparAvisosDoApp() {
    document.querySelectorAll('[role="dialog"], [role="presentation"]').forEach((d) => {
      if (!TEXTO_APP.test(d.innerText || "")) return;
      const btn = [...d.querySelectorAll('button, [role="button"], a')].find((b) =>
        BOTAO_FECHAR.test((b.innerText || b.getAttribute("aria-label") || "").trim())
      );
      if (btn) btn.click();
      else d.style.setProperty("display", "none", "important");
    });
    document
      .querySelectorAll('a[href*="apps.apple.com"], a[href*="itunes.apple.com"], a[href^="instagram://"]')
      .forEach((a) => {
        let el = a;
        for (let i = 0; i < 6 && el.parentElement; i++) {
          const pos = getComputedStyle(el).position;
          if (pos === "fixed" || pos === "sticky") break;
          el = el.parentElement;
        }
        el.style.setProperty("display", "none", "important");
      });
    document.querySelectorAll('button, a, [role="button"]').forEach((b) => {
      const t = (b.innerText || "").trim();
      if (/^(abrir (o )?app|abrir instagram|usar o app|open app|use the app|obter o app|get the app)$/i.test(t)) {
        b.style.setProperty("display", "none", "important");
      }
    });
  }

  // ================== DIAGNÓSTICO ==================
  // Chamado pelo app quando você chacoalha o celular: gera um "raio-x" da estrutura
  // da tela (sem o texto das mensagens) para ajustar o bloqueio.
  window.__soDMsDiagnostico = function () {
    const linhas = ["caminho: " + location.pathname, "tela: " + innerWidth + "x" + innerHeight];
    const pular = new Set(["SCRIPT", "STYLE", "LINK", "META", "PATH", "G", "NOSCRIPT"]);
    function anda(el, prof) {
      if (linhas.length > 2500 || prof > 40 || pular.has(el.tagName.toUpperCase())) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0 && el.tagName !== "svg") return;
      const cs = getComputedStyle(el);
      const partes = [el.tagName.toLowerCase()];
      const role = el.getAttribute("role"); if (role) partes.push("role=" + role);
      const al = el.getAttribute("aria-label"); if (al) partes.push('aria="' + al.slice(0, 40) + '"');
      const href = el.getAttribute("href"); if (href) partes.push("href=" + href.replace(/\/direct\/t\/\d+/, "/direct/t/N").slice(0, 40));
      if (cs.position !== "static") partes.push("pos=" + cs.position);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") partes.push("ov=" + cs.overflowX + "/" + cs.overflowY);
      if (el.getAttribute("data-so-dms-oculto")) partes.push("OCULTO");
      if (el.tagName === "VIDEO") partes.push("muted=" + el.muted);
      const txt = el.childElementCount === 0 ? (el.textContent || "").trim() : "";
      if (txt && txt.length <= 20 && !/\d{3,}/.test(txt)) partes.push('txt="' + txt + '"');
      partes.push(Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height));
      linhas.push("  ".repeat(prof) + partes.join(" "));
      for (const c of el.children) anda(c, prof + 1);
    }
    if (document.body) anda(document.body, 0);
    return linhas.join("\n");
  };

  // ================== LOOP ==================
  let agendado = false;
  function limpar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      injetarCSS();
      marcarPagina();
      esconderSetaDoInbox();
      esconderNotas();
      limparAvisosDoApp();
      ligarSom();
    });
  }

  function iniciar() {
    limpar();
    new MutationObserver(limpar).observe(document.documentElement, { childList: true, subtree: true });
  }
  injetarCSS();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
