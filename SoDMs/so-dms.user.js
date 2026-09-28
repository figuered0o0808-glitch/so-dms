// ==UserScript==
// @name         Só DMs
// @description  Deixa o Instagram apenas com as mensagens diretas. Bloqueia feed, explorar, reels, busca e notas.
// @version      2.0
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
  const LIBERAR_PERFIS = true;   // abrir o perfil de alguém tocando no nome/foto dentro da DM
  const LIBERAR_STORIES = true;  // abrir o story ao qual alguém respondeu (só aquele)
  const ESCONDER_NOTAS = true;   // remove a fileira de "notas" no topo do inbox

  const INBOX = "/direct/inbox/";

  const SEMPRE_OK = [
    /^\/direct\//,      // inbox, conversas, grupos, solicitações
    /^\/accounts\//,    // login, configurações da conta
    /^\/challenge\//,   // verificações de segurança
    /^\/two_factor/,
    /^\/emails?\//,
    /^\/legal\//,
  ];

  // Estado da navegação
  let contexto = null;           // "dm" | "perfil" | "conteudo" | "sistema"
  let conteudoLiberado = null;   // único reel/post/story liberado a partir da DM
  let perfilAtual = null;

  function idDoConteudo(path) {
    let m = path.match(/^\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p|tv)\/([^/?#]+)/);
    if (m) return "midia:" + m[1];
    m = path.match(/^\/stories\/([^/]+)(?:\/([^/?#]+))?/);
    if (m) return "story:" + m[1] + ":" + (m[2] || "");
    return null;
  }

  function tipoDaPagina(path) {
    if (SEMPRE_OK.some((r) => r.test(path))) return path.startsWith("/direct/") ? "dm" : "sistema";
    if (idDoConteudo(path)) return "conteudo";
    if (/^\/[A-Za-z0-9._]+\/?$/.test(path) && path !== "/") return "perfil";
    return "outro";
  }

  // Decide se o caminho pode ser aberto e atualiza o estado quando pode
  function permitido(path) {
    const tipo = tipoDaPagina(path);

    if (tipo === "dm" || tipo === "sistema") {
      contexto = tipo;
      conteudoLiberado = null;
      perfilAtual = null;
      return true;
    }

    if (path === "/" || /^\/(reels|explore)(\/|$)/.test(path) && !/^\/reels\/[^/]+/.test(path)) return false;

    if (tipo === "conteudo") {
      const id = idDoConteudo(path);
      if (id.startsWith("story:") && !LIBERAR_STORIES) return false;
      if (id === conteudoLiberado) { contexto = "conteudo"; return true; }
      if (contexto === "dm" && conteudoLiberado === null) {
        conteudoLiberado = id;
        contexto = "conteudo";
        return true;
      }
      return false; // rolar para o próximo reel/story, ou abrir posts a partir de um perfil
    }

    if (tipo === "perfil") {
      if (!LIBERAR_PERFIS) return false;
      const nome = path.replace(/\//g, "").toLowerCase();
      if (nome === perfilAtual) return true;
      // só abre perfil vindo de uma conversa ou do reel/story que te mandaram
      // (de um perfil para outro, não: evita o "passeio" por sugestões)
      if (contexto === "dm" || contexto === "conteudo") {
        perfilAtual = nome;
        contexto = "perfil";
        return true;
      }
      return false;
    }

    return false; // feed, busca, notificações, abas de perfil etc.
  }

  // ---------- Bloqueio ----------
  let voltandoAte = 0;
  let ultimoVoltar = 0;

  function marcarPagina() {
    const el = document.documentElement;
    if (el) el.setAttribute("data-so-dms", tipoDaPagina(location.pathname));
  }

  function checar(origem) {
    if (Date.now() < voltandoAte) return;
    const path = location.pathname;
    if (permitido(path)) { marcarPagina(); return; }

    // Navegação dentro do app (tocar num link, rolar reels): volta um passo,
    // para você continuar onde estava. Carregamento de página ou loop: vai para o inbox.
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

  // ---------- Visual ----------
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

    /* no perfil: só nome, foto, bio e botões. Sem grade, destaques, abas e sugestões */
    html[data-so-dms="perfil"] a[href*="/p/"],
    html[data-so-dms="perfil"] a[href*="/reel/"],
    html[data-so-dms="perfil"] a[href*="/tv/"],
    html[data-so-dms="perfil"] a[href^="/stories/"],
    html[data-so-dms="perfil"] a[href$="/reels/"],
    html[data-so-dms="perfil"] a[href$="/tagged/"],
    html[data-so-dms="perfil"] a[href$="/saved/"],
    html[data-so-dms="perfil"] a[href$="/followers/"],
    html[data-so-dms="perfil"] a[href$="/following/"],
    html[data-so-dms="perfil"] [role="tablist"],
    html[data-so-dms="perfil"] ul:has(a[href^="/stories/highlights/"]),
    html[data-so-dms="perfil"] div:has(> div > div > a[href*="/p/"]) {
      display: none !important;
    }
  `;
  function injetarCSS() {
    if (document.getElementById("so-dms-css")) return;
    const s = document.createElement("style");
    s.id = "so-dms-css";
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- Notas ----------
  const TEXTO_NOTA = /^(sua nota|your note|deixe uma nota|leave a note|compartilhe uma ideia|compartilhe um pensamento|share a thought|nota\.{0,3}|note\.{0,3}|notas|notes)$/i;

  function rolaNaHorizontal(el) {
    const cs = getComputedStyle(el);
    return (cs.overflowX === "auto" || cs.overflowX === "scroll") || el.scrollWidth > el.clientWidth + 20;
  }

  function esconderNotas() {
    if (!ESCONDER_NOTAS || !location.pathname.startsWith("/direct/inbox")) return;
    const candidatos = document.querySelectorAll("span, div, a, button");
    for (const el of candidatos) {
      if (el.childElementCount > 1) continue;
      const t = (el.innerText || el.getAttribute("aria-label") || "").trim();
      if (!TEXTO_NOTA.test(t)) continue;
      // sobe até a fileira das notas
      let alvo = null;
      let atual = el;
      for (let i = 0; i < 12 && atual.parentElement; i++) {
        atual = atual.parentElement;
        if (atual.querySelector('a[href^="/direct/t/"]')) break; // chegou na lista de conversas: para
        if (rolaNaHorizontal(atual) || atual.getAttribute("role") === "list") alvo = atual;
      }
      if (alvo) {
        // esconde o bloco inteiro da fileira (inclui o título, se houver)
        let bloco = alvo;
        const pai = alvo.parentElement;
        if (pai && !pai.querySelector('a[href^="/direct/t/"]') && pai.children.length <= 3) bloco = pai;
        bloco.style.setProperty("display", "none", "important");
      }
    }
  }

  // ---------- Avisos "abra o app" ----------
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

  let agendado = false;
  function limpar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      injetarCSS();
      marcarPagina();
      esconderNotas();
      limparAvisosDoApp();
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
