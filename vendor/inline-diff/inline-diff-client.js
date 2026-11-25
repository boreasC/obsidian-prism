// Obsidian Prism — Channel 6 Inline Tool-Chain Diff Client (vendor/inline-diff/inline-diff-client.js)
// Decoupled from Channel 1 static bundle: mounts its own <style id="ag-prism-inline-diff-css">,
// handles diff chip decoration, right-click menu cooperation, hover prefetch, RPC (__agPrismInlineDiffCall / Resolve),
// and GPU unfold/fold inline diff preview with full 5+1 anti-translation & lossless destroy().

(function (root) {
  'use strict';
  const G = root || (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null);
  if (!G) return;

  const INLINE_DIFF_STYLE_ID = 'ag-prism-inline-diff-css';
  const INLINE_DIFF_MAX_PENDING = 32;
  const INLINE_DIFF_TIMEOUT_MS = 5500;
  const INLINE_DIFF_CACHE_MAX = 32;
  const INLINE_DIFF_CACHE_TTL_MS = 15000;
  const INLINE_DIFF_NEG_TTL_MS = 8000;
  const MAX_CLIENT_DIFF_BYTES = 131072;
  const MAX_CLIENT_LINE_CHARS = 240;
  const DETERMINISTIC_ERR_RE = /^(?:not_found|blocked|outside_git_repo|invalid_uri|not_a_file|binary)/i;

  // Strictly pure ASCII, 0 :has(), balanced braces, zero pseudo-elements inside :is()
  const INLINE_DIFF_CSS = [
    '@keyframes ag-cs-diff-unfold{from{opacity:0;transform:translate3d(0,-5px,0) scaleY(.97);}to{opacity:1;transform:translate3d(0,0,0) scaleY(1);}}',
    '@keyframes ag-cs-diff-fold{from{opacity:1;transform:translate3d(0,0,0) scaleY(1);}to{opacity:0;transform:translate3d(0,-4px,0) scaleY(.97);}}',
    '@keyframes ag-cs-diff-pulse{0%,100%{opacity:.45;}50%{opacity:.95;}}',
    '@keyframes ag-cs-diff-in{from{opacity:0;transform:translate3d(0,-3px,0);}to{opacity:1;transform:translate3d(0,0,0);}}',
    '@keyframes ag-cs-find-sonar{0%{box-shadow:0 0 0 0 rgba(92,198,252,0);}24%{box-shadow:0 0 0 1.5px rgba(92,198,252,.58),0 0 20px -2px rgba(92,198,252,.28);}100%{box-shadow:0 0 0 1.5px transparent,0 0 24px 0 transparent;}}',
    '@keyframes ag-cs-find-sonar-light{0%{box-shadow:0 0 0 0 rgba(37,99,235,0);}24%{box-shadow:0 0 0 1.5px rgba(37,99,235,.55),0 4px 18px rgba(37,99,235,.22);}100%{box-shadow:0 0 0 1.5px transparent,0 4px 22px rgba(37,99,235,0);}}',
    ':root::highlight(ag-find-match){background-color:rgba(250,204,21,.28);color:inherit;}',
    ':root::highlight(ag-find-active){background-color:rgba(251,146,60,.68);color:#111827;}',
    'html[data-ag-cs-style]{',
    '& .ag-cs-inline-diff-body{&::-webkit-scrollbar{width:4px;height:4px;display:block;}&::-webkit-scrollbar-track{background:transparent;}&::-webkit-scrollbar-thumb{background:transparent;border-radius:999px;}&:hover::-webkit-scrollbar-thumb{background:var(--_s8,rgba(255,255,255,.18));&:hover{background:var(--_s9,rgba(255,255,255,.32));}}}',
    '& [data-testid="autoscroll-viewport"] .bleed-contain .ag-cs-inline-diff-body{margin-right:14px !important;padding-right:8px !important;overscroll-behavior-y:auto !important;}',
    '& [data-testid="autoscroll-viewport"] .bleed-contain .overflow-y-auto .ag-cs-inline-diff-body{margin-right:12px !important;overscroll-behavior-y:auto !important;}',
    '& [data-ag-diff-chip-row="1"]{overflow-y:visible !important;}',
    '& [data-ag-diff-chip="1"]{display:inline-flex !important;align-items:center !important;gap:7px !important;min-height:22px !important;padding:1px 5px !important;margin:0 -2px !important;border-radius:4px !important;background:transparent !important;border:1px solid transparent !important;box-shadow:none !important;cursor:pointer !important;overflow:visible !important;transition:background-color 130ms ease,box-shadow 130ms ease !important;&:hover{background-color:rgba(255,255,255,.048) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(255,255,255,.36) !important;}}&[data-ag-inline-diff-open="1"]{background-color:rgba(255,255,255,.065) !important;box-shadow:inset 0 -1px 0 rgba(255,255,255,.22) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:transparent !important;}}& [data-ag-diff-chip-file="1"],& [data-ag-diff-chip-file="1"] :is([data-testid="entity-pill"],.inline-pill){background:transparent !important;border-color:transparent !important;box-shadow:none !important;padding:0 !important;margin:0 !important;color:var(--foreground) !important;font-weight:500;}& [data-ag-diff-chip-file="1"]{text-decoration:underline;text-decoration-color:rgba(255,255,255,.16);text-underline-offset:3px;text-decoration-thickness:1px;transition:text-decoration-color 130ms ease;}& [data-testid="diff-line-count"]{background:transparent !important;border:0 !important;box-shadow:none !important;padding:0 !important;margin:0 !important;gap:5px !important;font-size:11.5px !important;font-weight:500;&::before{display:none !important;}}}',
    '& [data-testid="diff-line-count"]{display:inline-flex;align-items:center;gap:4px;border-radius:var(--ag-cs-r-sm) !important;border:1px solid transparent;padding:1px 5px !important;font-family:var(--ag-cs-mono-stack);font-size:11px;font-variant-numeric:tabular-nums;transition:background-color 130ms ease,border-color 130ms ease,color 130ms ease !important;& [data-ag-diff-stat="add"]{color:#5CE68B !important;text-shadow:0 0 9px rgba(74,222,128,.42);}& [data-ag-diff-stat="del"]{color:#FF857D !important;text-shadow:0 0 9px rgba(248,113,113,.40);}& [data-ag-diff-stat="zero"]{color:rgba(255,255,255,.28) !important;text-shadow:none !important;}}',
    '& .ag-cs-inline-diff-box{display:block;box-sizing:border-box;width:100%;max-width:100%;align-self:stretch;margin:0;padding:0;transform-origin:50% 0%;contain:layout style;&[data-ag-diff-anim="1"]{will-change:transform,opacity;animation:ag-cs-diff-unfold 150ms var(--ag-ease-out,cubic-bezier(.16,1,.3,1)) both;}&[data-ag-diff-state="closing"]{will-change:transform,opacity;pointer-events:none;animation:ag-cs-diff-fold 120ms cubic-bezier(.32,0,.67,0) forwards;}}',
    '& .ag-cs-inline-diff-card{position:relative;margin:6px 0 12px 0;padding:0;border-radius:10px;border:1px solid rgba(255,255,255,.082);background-color:rgba(10,11,14,.90);background-image:radial-gradient(85% 48px at 50% 0%,rgba(255,255,255,.036),transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.095),0 14px 34px -12px rgba(0,0,0,.62);overflow:hidden;}',
    '& .ag-cs-inline-diff-body{max-height:320px;overflow:auto;padding:6px 0;font-family:var(--ag-cs-mono-stack);font-size:12px;line-height:1.64;tab-size:2;}',
    '& .ag-cs-inline-diff-note{padding:4px 14px 6px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06);font-family:var(--font-sans);font-size:11px;line-height:1.45;color:var(--muted-foreground);opacity:.78;}',
    '& .ag-cs-inline-diff-wrap-tag{display:inline-flex;align-items:center;height:15px;padding:0 5px;margin:auto 12px auto 4px;border-radius:3px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:var(--muted-foreground);font-family:var(--font-sans);font-size:10px;line-height:1;flex-shrink:0;}',
    '& .ag-cs-inline-diff-more-bar{appearance:none;display:flex;align-items:center;justify-content:center;width:100%;padding:6px 12px 2px;margin-top:4px;border:0;border-top:1px solid rgba(255,255,255,.055);background:transparent;color:var(--muted-foreground);font-family:var(--font-sans);font-size:11px;cursor:pointer;transition:color 120ms ease;&:hover{color:var(--foreground);}}',
    '& .ag-cs-inline-diff-line{display:flex;align-items:stretch;min-width:100%;width:max-content;box-sizing:border-box;white-space:pre;color:color-mix(in srgb,var(--secondary-foreground) 86%,transparent);&:is(.is-add,.is-del) .ag-cs-inline-diff-sign{font-weight:600;opacity:1;&.is-cont{opacity:.42;font-weight:400;text-shadow:none !important;}}&.is-add{background:linear-gradient(90deg,rgba(46,184,92,.16) 0%,rgba(46,184,92,.09) 42%,rgba(46,184,92,.045) 100%) !important;color:var(--foreground);& .ag-cs-inline-diff-ln{background-color:rgba(18,44,28,.96);color:rgba(134,239,172,.86);box-shadow:inset 2px 0 0 #4ADE80,inset 7px 0 12px -4px rgba(74,222,128,.32);}& .ag-cs-inline-diff-sign{color:#6EE7B7 !important;text-shadow:0 0 9px rgba(74,222,128,.62),0 0 2px rgba(167,243,208,.45);}}&.is-del{background:linear-gradient(90deg,rgba(239,68,68,.15) 0%,rgba(239,68,68,.085) 42%,rgba(239,68,68,.04) 100%) !important;color:color-mix(in srgb,var(--foreground) 92%,transparent);& .ag-cs-inline-diff-ln{background-color:rgba(48,20,24,.96);color:rgba(252,165,165,.86);box-shadow:inset 2px 0 0 #F87171,inset 7px 0 12px -4px rgba(248,113,113,.30);}& .ag-cs-inline-diff-sign{color:#FCA5A5 !important;text-shadow:0 0 9px rgba(248,113,113,.60),0 0 2px rgba(254,202,202,.42);}}&.is-hunk{align-items:center;height:22px;margin:3px 0;background-color:rgba(255,255,255,.02);border-top:1px solid rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.045);& .ag-cs-inline-diff-ln{height:100%;display:inline-flex;align-items:center;justify-content:center;background-color:rgba(14,15,19,.96);color:rgba(255,255,255,.38);padding:0 8px;}}}',
    '& .ag-cs-inline-diff-gap-rule{flex:1 1 auto;height:1px;margin:0 16px;background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.02));pointer-events:none;}',
    '& .ag-cs-inline-diff-ln{position:sticky;left:0;z-index:1;flex:none;width:46px;box-sizing:border-box;padding:0 10px 0 8px;text-align:right;background-color:rgba(12,13,17,.96);border-right:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.34);user-select:none;font-variant-numeric:tabular-nums;font-size:11px;}',
    '& .ag-cs-inline-diff-sign{flex:none;width:22px;text-align:center;user-select:none;opacity:.75;}',
    '& .ag-cs-inline-diff-code{flex:1 1 auto;min-width:0;padding:0 16px 0 2px;}',
    '& .ag-cs-inline-diff-loading{display:flex;align-items:center;gap:10px;height:30px;padding:0 16px;font-family:var(--font-sans);font-size:11.5px;color:var(--muted-foreground);&::before{content:"";width:38px;height:2.5px;border-radius:999px;background:color-mix(in srgb,var(--primary) 46%,var(--ag-cs-border-2));animation:ag-cs-diff-pulse 1.2s ease-in-out infinite;}}',
    '& .ag-cs-inline-diff-empty{padding:10px 16px;font-family:var(--font-sans);font-size:12px;line-height:1.5;color:var(--muted-foreground);}',
    '& .ag-cs-diff-ctx-menu{position:fixed;z-index:9999;min-width:184px;padding:4px;border-radius:10px;background-color:rgba(14,16,22,.96);background-image:linear-gradient(rgba(164,196,255,.05) 0%,transparent 44%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(214,226,255,.12);box-shadow:inset 0 1px 0 rgba(232,240,255,.12),0 18px 40px -10px rgba(0,0,0,.64);display:flex;flex-direction:column;gap:2px;animation:ag-cs-diff-in 110ms var(--ag-ease-out,ease-out);}',
    '& .ag-cs-diff-ctx-item{appearance:none;width:100%;height:28px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:var(--secondary-foreground);font-family:var(--font-sans);font-size:12px;font-weight:450;display:flex;align-items:center;gap:8px;cursor:pointer;text-align:left;white-space:nowrap;transition:background-color 110ms ease,color 110ms ease;& svg{width:13px;height:13px;flex-shrink:0;opacity:.78;}&:hover{background-color:rgba(164,196,255,.09);color:var(--foreground);& svg{opacity:1;}}}',
    '& [data-ag-find-sonar="1"]{border-radius:var(--ag-cs-r-md,8px) !important;animation:ag-cs-find-sonar 700ms ease-out forwards;}',
    '& .ag-cs-conv-find{position:absolute;top:10px;right:16px;z-index:55;width:min(496px,calc(100% - 32px));box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:5px 7px;border-radius:var(--ag-cs-r-lg,12px);background-color:var(--ag-cs-popover-bg,rgba(14,16,22,.95));background-image:linear-gradient(rgba(164,196,255,.05) 0%,transparent 48%);backdrop-filter:blur(16px) saturate(140%);border:1px solid var(--ag-cs-border-2,rgba(214,226,255,.14));box-shadow:inset 0 1px 0 var(--ag-cs-specular,rgba(255,255,255,.1)),var(--ag-cs-surface-sh,0 16px 36px -10px rgba(0,0,0,.62));font-family:var(--font-sans,system-ui,sans-serif);color:var(--foreground,#F2F2F5);user-select:none;animation:ag-cs-diff-in 120ms var(--ag-ease-out,ease-out);&[data-ag-find-fixed="1"]{position:fixed;top:52px;right:20px;}&[hidden]{display:none !important;}}',
    '& .ag-cs-conv-find-field{flex:1 1 auto;min-width:100px;display:flex;align-items:center;gap:2px;height:28px;padding:0 4px 0 8px;border-radius:var(--ag-cs-r-sm,8px);border:1px solid var(--ag-cs-border-1,rgba(255,255,255,.1));background:color-mix(in srgb,var(--background,#0B0B0E) 65%,var(--card,#141418));transition:border-color 120ms ease;&:focus-within{border-color:color-mix(in srgb,var(--primary,#669DF6) 62%,transparent);}&[data-invalid="1"]{border-color:rgba(239,68,68,.65);}}',
    '& .ag-cs-conv-find-input{flex:1 1 auto;min-width:0;width:100%;height:100%;padding:0 4px 0 0;border:0 !important;background:transparent !important;color:var(--foreground,#F2F2F5);font:400 12.5px/1.3 var(--font-sans,system-ui,sans-serif);outline:none !important;box-shadow:none !important;&::placeholder{color:var(--placeholder,rgba(160,164,178,.72));}}',
    '& :is(.ag-cs-conv-find-opt,.ag-cs-conv-find-nav,.ag-cs-conv-find-earlier){appearance:none;flex:none;height:22px;padding:0 5px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--muted-foreground,#9CA3AF);font:500 11px/1 var(--ag-cs-mono-stack,monospace);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 110ms ease,color 110ms ease,border-color 110ms ease;&:hover{background:var(--ag-cs-hover-wash,rgba(255,255,255,.08));color:var(--foreground,#F2F2F5);}&[aria-pressed="true"]{background:color-mix(in srgb,var(--primary,#669DF6) 18%,transparent);border-color:color-mix(in srgb,var(--primary,#669DF6) 44%,transparent);color:var(--primary,#669DF6);}&:disabled{opacity:.36;cursor:default;pointer-events:none;}}',
    '& .ag-cs-conv-find-earlier{height:24px;padding:0 6px;gap:3px;font-family:var(--font-sans,system-ui,sans-serif);font-size:11px;white-space:nowrap;border-color:var(--ag-cs-border-1,rgba(255,255,255,.1));&[data-scanning="1"]{background:color-mix(in srgb,var(--primary,#669DF6) 18%,transparent);border-color:color-mix(in srgb,var(--primary,#669DF6) 46%,transparent);color:var(--primary,#669DF6);animation:ag-cs-diff-pulse 1.1s ease-in-out infinite;}&[hidden]{display:none !important;}}',
    '& .ag-cs-conv-find-nav{width:24px;height:24px;padding:0;font-family:var(--font-sans,system-ui,sans-serif);& svg{width:13px;height:13px;}}',
    '& .ag-cs-conv-find-count{flex:none;min-width:42px;padding:0 4px;text-align:center;font:500 11px/1 var(--ag-cs-mono-stack,monospace);font-variant-numeric:tabular-nums;color:var(--secondary-foreground,#C4C4CE);white-space:nowrap;&[data-empty="1"]{color:#F87171;}}',
    '}',
    'html[data-ag-cs-style][data-ag-cs-theme="light"],html[data-ag-cs-style]>body:is(.theme-light,.light-theme,.light){',
    '& [data-ag-diff-chip="1"]{background:transparent !important;border-color:transparent !important;box-shadow:none !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(15,23,42,.20);}&:hover{background-color:rgba(15,23,42,.048) !important;& [data-ag-diff-chip-file="1"]{text-decoration-color:rgba(15,23,42,.42) !important;}}&[data-ag-inline-diff-open="1"]{background-color:rgba(15,23,42,.068) !important;box-shadow:inset 0 -1px 0 rgba(15,23,42,.24) !important;}}',
    '& [data-testid="diff-line-count"]{& [data-ag-diff-stat="add"]{color:#15803D !important;text-shadow:none;}& [data-ag-diff-stat="del"]{color:#B91C1C !important;text-shadow:none;}& [data-ag-diff-stat="zero"]{color:rgba(15,23,42,.34) !important;text-shadow:none;}}',
    '& .ag-cs-inline-diff-card{background:#FAFBFD;border-color:rgba(15,23,42,.09);box-shadow:0 8px 22px -10px rgba(15,23,42,.10);}',
    '& .ag-cs-inline-diff-more-bar{border-top-color:rgba(15,23,42,.07);}',
    '& .ag-cs-inline-diff-wrap-tag{background:rgba(15,23,42,.045);border-color:rgba(15,23,42,.10);}',
    '& .ag-cs-inline-diff-ln{background-color:#F3F5F9;border-right-color:rgba(15,23,42,.08);color:rgba(71,85,105,.62);}',
    '& .ag-cs-diff-ctx-menu{background:rgba(252,253,255,.96);border-color:rgba(15,23,42,.12);box-shadow:0 12px 30px -8px rgba(15,23,42,.16),0 0 0 1px rgba(15,23,42,.06);& .ag-cs-diff-ctx-item:hover{background-color:rgba(37,99,235,.07);}}',
    '& [data-ag-find-sonar="1"]{animation-name:ag-cs-find-sonar-light;}',
    '& .ag-cs-conv-find{background:rgba(252,253,255,.96);border-color:rgba(15,23,42,.14);box-shadow:0 12px 30px -8px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.06);color:#0F172A;}',
    '& .ag-cs-conv-find-field{background:#F4F6FA;border-color:rgba(15,23,42,.12);}',
    '& .ag-cs-conv-find-input{color:#0F172A;}',
    '& .ag-cs-conv-find-count{color:#475569;&[data-empty="1"]{color:#DC2626;}}',
    '& :is(.ag-cs-conv-find-opt,.ag-cs-conv-find-nav,.ag-cs-conv-find-earlier){color:#64748B;&:hover{background:rgba(15,23,42,.06);color:#0F172A;}}',
    '& .ag-cs-conv-find-earlier{border-color:rgba(15,23,42,.12);}',
    '& .ag-cs-inline-diff-line{&:is(.is-add,.is-del) .ag-cs-inline-diff-sign{font-weight:600;opacity:1;text-shadow:none;&.is-cont{opacity:.38;font-weight:400;}}&.is-add{background:rgba(22,163,74,.09) !important;& .ag-cs-inline-diff-ln{background-color:#E7F6EC;color:#15803D;box-shadow:inset 2px 0 0 #16A34A;}& .ag-cs-inline-diff-sign{color:#15803D !important;}}&.is-del{background:rgba(220,38,38,.085) !important;& .ag-cs-inline-diff-ln{background-color:#FDECEC;color:#B91C1C;box-shadow:inset 2px 0 0 #DC2626;}& .ag-cs-inline-diff-sign{color:#B91C1C !important;}}}',
    '& .ag-cs-inline-diff-line.is-hunk{background-color:rgba(15,23,42,.025);border-color:rgba(15,23,42,.06);& .ag-cs-inline-diff-ln{background-color:#EEF1F6;color:rgba(71,85,105,.55);}}',
    '& .ag-cs-inline-diff-gap-rule{background:linear-gradient(90deg,rgba(15,23,42,.12),rgba(15,23,42,.03));}',
    '}',
    '@media (prefers-reduced-motion:reduce){.ag-cs-inline-diff-loading::before,.ag-cs-diff-ctx-menu,.ag-cs-conv-find,.ag-cs-conv-find-earlier[data-scanning="1"],[data-ag-find-sonar="1"]{animation:none !important;}.ag-cs-diff-ctx-menu,.ag-cs-conv-find{backdrop-filter:none !important;}html[data-ag-cs-style]:not([data-ag-cs-motion="ultra"]):not([data-ag-cs-motion="standard"]) .ag-cs-inline-diff-box{animation:none !important;filter:none !important;}}',
    'html[data-ag-cs-style][data-ag-cs-win-blur="1"] :is(.ag-cs-inline-diff-loading::before,.ag-cs-conv-find-earlier[data-scanning="1"]){animation-play-state:paused !important;}',
    'html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-inline-diff-box,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-inline-diff-loading::before,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-diff-ctx-menu,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-conv-find,html[data-ag-cs-style][data-ag-cs-motion="off"] .ag-cs-conv-find-earlier[data-scanning="1"],html[data-ag-cs-style][data-ag-cs-motion="off"] [data-ag-find-sonar="1"]{animation:none !important;transition:none !important;}',
    'html[data-ag-cs-style]:is([data-ag-cs-win-blur="1"],[data-ag-cs-motion="off"]) :is(.ag-cs-diff-ctx-menu,.ag-cs-conv-find){backdrop-filter:none !important;}',
  ].join('\n');

  const NO_TR_ATTRS = [
    ['translate', 'no'],
    ['data-no-translate', 'true'],
    ['data-ag-localization-skip', 'true'],
    ['data-agy-no-translate', 'true'],
    ['data-antigravity-zh-skip', '1'],
    ['data-ag-no-i18n', ''],
  ];

  function markNoTrOwned(el) {
    if (el && typeof el.setAttribute === 'function') {
      for (let i = 0; i < NO_TR_ATTRS.length; i++) {
        el.setAttribute(NO_TR_ATTRS[i][0], NO_TR_ATTRS[i][1]);
      }
      el.setAttribute('data-ag-owned', '1');
    }
    return el;
  }

  function isElementLike(n) {
    return Boolean(n && (n.nodeType === 1 || (n.nodeType === undefined && typeof n.tagName === 'string')));
  }

  const ga = (e, k) => e?.getAttribute?.(k);
  const sa = (e, k, v) => e?.setAttribute?.(k, String(v));
  const ha = (e, k) => Boolean(e?.hasAttribute?.(k));
  const ra = (e, k) => e?.removeAttribute?.(k);
  const qs = (e, s) => e?.querySelector?.(s) || null;
  const qa = (e, s) => e?.querySelectorAll?.(s) || [];
  const cl = (e, s) => e?.closest?.(s) || null;
  const tagU = (e) => String(e?.tagName || '').toUpperCase();

  function truncateDiffLine(str) {
    const s = String(str ?? '');
    return s.length > MAX_CLIENT_LINE_CHARS ? s.slice(0, MAX_CLIENT_LINE_CHARS - 1) + '…' : s;
  }

  function basenameFromUri(uri) {
    const s = String(uri || '').replace(/\\/g, '/').replace(/^file:\/\/\/?/i, '');
    const parts = s.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function parseUnifiedDiffLines(rawText, maxLines = 160) {
    const raw = String(rawText || '');
    if (raw.length > MAX_CLIENT_DIFF_BYTES) return [];
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let oldLn = 1;
    let newLn = 1;
    for (let i = 0; i < lines.length && out.length < maxLines; i++) {
      const line = lines[i];
      if (/^(?:diff --git|index |--- |\+\+\+ )/.test(line)) continue;
      const hm = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/);
      if (hm) {
        oldLn = Number(hm[1]) || 1;
        newLn = Number(hm[2]) || 1;
        out.push({ kind: 'hunk', ln: '', sign: '@@', text: truncateDiffLine(line) });
        continue;
      }
      if (line.startsWith('+')) {
        out.push({ kind: 'add', ln: String(newLn++), sign: '+', text: truncateDiffLine(line.slice(1)) });
      } else if (line.startsWith('-')) {
        out.push({ kind: 'del', ln: String(oldLn++), sign: '-', text: truncateDiffLine(line.slice(1)) });
      } else if (line.length || out.length) {
        out.push({ kind: 'ctx', ln: String(newLn++), sign: ' ', text: truncateDiffLine(line.startsWith(' ') ? line.slice(1) : line) });
        oldLn++;
      }
    }
    return out;
  }

  function buildPairDiffLines(oldText, newText, startLine = 1, maxLines = 160) {
    const sOld = String(oldText || '');
    const sNew = String(newText || '');
    if (sOld.length + sNew.length > MAX_CLIENT_DIFF_BYTES) return [];
    const a = sOld.replace(/\r\n/g, '\n').split('\n');
    const b = sNew.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let saIdx = a.length - 1;
    let sbIdx = b.length - 1;
    while (saIdx >= p && sbIdx >= p && a[saIdx] === b[sbIdx]) {
      saIdx--;
      sbIdx--;
    }
    const ctxStart = Math.max(0, p - 2);
    for (let i = ctxStart; i < p && out.length < maxLines; i++) {
      out.push({ kind: 'ctx', ln: String(startLine + i), sign: ' ', text: truncateDiffLine(a[i]) });
    }
    for (let i = p; i <= saIdx && out.length < maxLines; i++) {
      out.push({ kind: 'del', ln: String(startLine + i), sign: '-', text: truncateDiffLine(a[i]) });
    }
    for (let i = p; i <= sbIdx && out.length < maxLines; i++) {
      out.push({ kind: 'add', ln: String(startLine + i), sign: '+', text: truncateDiffLine(b[i]) });
    }
    const tailEnd = Math.min(b.length, sbIdx + 3);
    for (let i = sbIdx + 1; i < tailEnd && out.length < maxLines; i++) {
      out.push({ kind: 'ctx', ln: String(startLine + i), sign: ' ', text: truncateDiffLine(b[i]) });
    }
    return out;
  }

  function createInlineDiffClient(options = {}) {
    const doc = options.doc || options.document || (typeof document !== 'undefined' ? document : null);
    const win = options.win || options.window || (typeof window !== 'undefined' ? window : G);
    let currentConfig = options.config && typeof options.config === 'object' ? { ...options.config } : {};
    const extGetConfig = typeof options.getConfig === 'function' ? options.getConfig : null;
    const getConfig = () => {
      const ext = extGetConfig ? extGetConfig() : null;
      return ext && typeof ext === 'object' ? { ...currentConfig, ...ext } : currentConfig;
    };

    const baseGetLang = typeof options.getLang === 'function' ? options.getLang : null;
    const baseTFn = typeof options.t === 'function' ? options.t : null;
    const baseMut = typeof options.runGuardedMut === 'function' ? options.runGuardedMut : null;
    const baseSetA = typeof options.setAttrIfChanged === 'function' ? options.setAttrIfChanged : null;

    let hookGetLang = baseGetLang;
    let hookTFn = baseTFn;
    let hookMut = baseMut;
    let hookSetA = baseSetA;

    const normDiffLang = (raw) => {
      let v = String(raw || '').trim();
      if (!v || v.toLowerCase() === 'auto') {
        const navObj = win && 'navigator' in win ? win.navigator : (typeof navigator !== 'undefined' ? navigator : null);
        v = String(navObj?.language || '').trim();
      }
      const s = v.toLowerCase().replace(/_/g, '-');
      if (!s || s === 'auto') return 'en';
      if (s === 'yue' || s.startsWith('yue-') || s === 'zh-yue' || s.includes('cantonese')) return 'zh-CN';
      if (/^zh-(tw|hant|hk|mo)/.test(s) || s === 'tw' || s === 'hant') return 'zh-TW';
      if (/^zh/.test(s)) return 'zh-CN';
      if (/^(ja|jp)/.test(s) || s === 'japanese') return 'ja';
      if (/^(ko|kr)/.test(s) || s === 'korean') return 'ko';
      if (/^es/.test(s) || s === 'spanish') return 'es';
      if (/^fr/.test(s) || s === 'french') return 'fr';
      if (/^de/.test(s) || s === 'german') return 'de';
      return 'en';
    };

    const getLang = () => {
      if (typeof hookGetLang === 'function') {
        try {
          const v = String(hookGetLang() || '').trim();
          if (v && v !== 'auto') return normDiffLang(v);
        } catch {}
      }
      const cfgLang = String(currentConfig.language || currentConfig.lang || '').trim();
      if (cfgLang && cfgLang !== 'auto') return normDiffLang(cfgLang);
      const attrLang = String(doc?.documentElement?.getAttribute?.('data-ag-cs-lang') || '').trim();
      return normDiffLang(attrLang);
    };
    const mut = (fn) => (typeof hookMut === 'function' ? hookMut(fn) : fn());
    const setA = (el, name, val) => {
      if (typeof hookSetA === 'function') return hookSetA(el, name, val);
      if (el && ga(el, name) !== val) sa(el, name, val);
    };

    const extIsDestroyed = typeof options.isDestroyed === 'function' ? options.isDestroyed : () => false;

    let localDestroyed = false;
    const isDead = () => localDestroyed || extIsDestroyed();

    const inlineDiffPending = new Map();
    const inlineDiffCache = new Map();
    const inlineDiffInflight = new Map();
    const inlineDiffAnimTimers = new Set();
    let inlineDiffHoverTimer = 0;
    let chipSyncDebounceTimer = 0;
    let inlineDiffReqSeq = 1;
    let allowNativeDiffClick = false;
    let diffCtxMenuEl = null;
    let styleEl = null;
    let selfApi = null;

    const stats = {
      inlineDiffToggleCount: 0,
    };

    const mk = (t, c, x, ...ks) => {
      const e = doc.createElement(t);
      if (c) e.className = c;
      if (x != null) e.textContent = x;
      for (const k of ks) if (k) e.appendChild(k);
      return e;
    };

    const DIFF_FALLBACK = {
      inlineDiffOpenSidebar: {
        'zh-CN': '在侧栏打开完整对比',
        'zh-TW': '在側欄開啟完整對比',
        en: 'Open full diff in Sidebar',
        ja: 'サイドバーで完全な差分を開く',
        ko: '사이드바에서 전체 차이 열기',
        es: 'Abrir diff completo en la barra lateral',
        fr: 'Ouvrir le diff complet dans la barre latérale',
        de: 'Vollständigen Diff in Seitenleiste öffnen',
      },
      inlineDiffCollapse: {
        'zh-CN': '收起',
        'zh-TW': '收合',
        en: 'Collapse',
        ja: '閉じる',
        ko: '접기',
        es: 'Contraer',
        fr: 'Réduire',
        de: 'Einklappen',
      },
      inlineDiffLoading: {
        'zh-CN': '正在读取差异...',
        'zh-TW': '正在讀取差異...',
        en: 'Loading diff...',
        ja: '差分を読み込み中...',
        ko: '차이점 불러오는 중...',
        es: 'Cargando diff...',
        fr: 'Chargement du diff...',
        de: 'Diff wird geladen...',
      },
      inlineDiffBinary: {
        'zh-CN': '二进制文件暂不支持行内预览，请右键在侧栏打开。',
        'zh-TW': '二進位檔案暫不支援行內預覽，請右鍵在側欄開啟。',
        en: 'Binary file cannot be previewed inline. Right-click to open in Sidebar.',
        ja: 'バイナリファイルはインライン表示できません。右クリックでサイドバーから開けます。',
        ko: '바이너리 파일은 인라인으로 미리 볼 수 없습니다. 우클릭하여 사이드바에서 여세요.',
        es: 'Los archivos binarios no tienen vista previa en línea. Haz clic derecho para abrir en la barra lateral.',
        fr: 'Les fichiers binaires ne peuvent pas être prévisualisés en ligne. Clic droit pour ouvrir dans la barre latérale.',
        de: 'Binärdateien können nicht inline angezeigt werden. Rechtsklick zum Öffnen in der Seitenleiste.',
      },
      inlineDiffNoPreview: {
        'zh-CN': '当前步骤暂无行内差异，请右键在侧栏打开。',
        'zh-TW': '目前步驟暫無行內差異，請右鍵在側欄開啟。',
        en: 'Inline diff is unavailable for this step. Right-click to open in Sidebar.',
        ja: 'このステップには差分テキストがありません。右クリックでサイドバーから開けます。',
        ko: '이 단계에는 인라인 차이가 없습니다. 우클릭하여 사이드바에서 여세요.',
        es: 'El diff en línea no está disponible para este paso. Haz clic derecho para abrir en la barra lateral.',
        fr: 'Le diff en ligne est indisponible pour cette étape. Clic droit pour ouvrir dans la barre latérale.',
        de: 'Inline-Diff ist für diesen Schritt nicht verfügbar. Rechtsklick zum Öffnen in der Seitenleiste.',
      },
      inlineDiffSnapshotNotice: {
        'zh-CN': '未受 Git 追踪 · 预览当前文件内容（右键可在侧栏打开完整对比）',
        'zh-TW': '未受 Git 追蹤 · 預覽目前檔案內容（右鍵可在側欄開啟完整對比）',
        en: 'Not tracked by Git · previewing current file (right-click to open full diff in Sidebar)',
        ja: 'Git 未追跡 · 現在のファイルを表示中（右クリックでサイドバーで完全な差分を開く）',
        ko: 'Git 추적 안 됨 · 현재 파일 미리보기(우클릭하여 사이드바에서 전체 차이 열기)',
        es: 'No rastreado por Git · vista previa del archivo actual (clic derecho para abrir diff completo)',
        fr: 'Non suivi par Git · aperçu du fichier actuel (clic droit pour ouvrir le diff complet)',
        de: 'Nicht von Git verfolgt · Vorschau der aktuellen Datei (Rechtsklick für vollständigen Diff)',
      },
      inlineDiffLongLinesTag: {
        'zh-CN': '单行长改',
        'zh-TW': '單行長改',
        en: 'long line',
        ja: '長行',
        ko: '긴 줄',
        es: 'línea larga',
        fr: 'ligne longue',
        de: 'lange Zeile',
      },
      inlineDiffMenuExpand: {
        'zh-CN': '展开行内对比',
        'zh-TW': '展開行內對比',
        en: 'Expand inline diff',
        ja: 'インライン差分を展開',
        ko: '인라인 차이 펼치기',
        es: 'Expandir diff en línea',
        fr: 'Déplier le diff en ligne',
        de: 'Inline-Diff ausklappen',
      },
      inlineDiffMenuCollapse: {
        'zh-CN': '收起行内对比',
        'zh-TW': '收合行內對比',
        en: 'Collapse inline diff',
        ja: 'インライン差分を閉じる',
        ko: '인라인 차이 접기',
        es: 'Contraer diff en línea',
        fr: 'Replier le diff en ligne',
        de: 'Inline-Diff einklappen',
      },
      inlineDiffMenuCopyPath: {
        'zh-CN': '复制文件路径',
        'zh-TW': '複製檔案路徑',
        en: 'Copy file path',
        ja: 'ファイルパスをコピー',
        ko: '파일 경로 복사',
        es: 'Copiar ruta del archivo',
        fr: 'Copier le chemin du fichier',
        de: 'Dateipfad kopieren',
      },
      inlineDiffLargeExpandBtn: {
        'zh-CN': '⋯ 大文件仅节选关键片段 · 点击在右侧栏查看完整对比',
        'zh-TW': '⋯ 大檔案僅節選關鍵片段 · 點擊在右側欄檢視完整對比',
        en: '⋯ Showing key hunks · Click to open full diff in Sidebar',
        ja: '⋯ 大きなファイルのため一部のみ表示 · クリックしてサイドバーで全体を見る',
        ko: '⋯ 대용량 파일 주요 변경만 표시 · 클릭하여 사이드바에서 전체 보기',
        es: '⋯ Mostrando fragmentos clave · Haz clic para abrir el diff completo',
        fr: '⋯ Extraits clés affichés · Cliquer pour ouvrir le diff complet',
        de: '⋯ Wichtige Bereiche angezeigt · Klicken für vollständigen Diff',
      },
      convFindPh: {
        'zh-CN': '查找会话 (含提问气泡)...',
        'zh-TW': '搜尋會話 (含提問氣泡)...',
        en: 'Find in conversation (incl. prompts)...',
        ja: '会話を検索 (質問を含む)...',
        ko: '대화 내 검색 (질문 포함)...',
        es: 'Buscar en conversación...',
        fr: 'Rechercher (requêtes incluses)...',
        de: 'Im Chat suchen (inkl. Prompts)...',
      },
      convFindEmpty: {
        'zh-CN': '无结果',
        'zh-TW': '無結果',
        en: 'No results',
        ja: '結果なし',
        ko: '결과 없음',
        es: 'Sin resultados',
        fr: 'Aucun résultat',
        de: 'Keine Treffer',
      },
      convFindInvalid: {
        'zh-CN': '正则无效',
        'zh-TW': '正則無效',
        en: 'Invalid regex',
        ja: '無効な正規表現',
        ko: '잘못된 정규식',
        es: 'Regex inválida',
        fr: 'Regex invalide',
        de: 'Ungültige Regex',
      },
      convFindCase: {
        'zh-CN': '区分大小写 (Aa)',
        'zh-TW': '區分大小寫 (Aa)',
        en: 'Match Case (Aa)',
        ja: '大文字・小文字を区別 (Aa)',
        ko: '대소문자 구분 (Aa)',
        es: 'Coincidir mayús./minús. (Aa)',
        fr: 'Respecter la casse (Aa)',
        de: 'Groß-/Kleinschreibung (Aa)',
      },
      convFindWord: {
        'zh-CN': '全字匹配 (ab)',
        'zh-TW': '全字匹配 (ab)',
        en: 'Match Whole Word (ab)',
        ja: '単語単位で一致 (ab)',
        ko: '단어 단위로 일치 (ab)',
        es: 'Solo palabras completas (ab)',
        fr: 'Mot entier (ab)',
        de: 'Nur ganzes Wort (ab)',
      },
      convFindRegex: {
        'zh-CN': '使用正则表达式 (.*)',
        'zh-TW': '使用正則表達式 (.*)',
        en: 'Use Regular Expression (.*)',
        ja: '正規表現を使用 (.*)',
        ko: '정규식 사용 (.*)',
        es: 'Usar expresión regular (.*)',
        fr: 'Expression régulière (.*)',
        de: 'Regulärer Ausdruck (.*)',
      },
      convFindPrev: {
        'zh-CN': '上一个 (Shift+Enter)',
        'zh-TW': '上一個 (Shift+Enter)',
        en: 'Previous Match (Shift+Enter)',
        ja: '前の一致 (Shift+Enter)',
        ko: '이전 일치 (Shift+Enter)',
        es: 'Anterior (Shift+Enter)',
        fr: 'Précédent (Shift+Enter)',
        de: 'Vorheriger Treffer (Shift+Enter)',
      },
      convFindNext: {
        'zh-CN': '下一个 (Enter)',
        'zh-TW': '下一個 (Enter)',
        en: 'Next Match (Enter)',
        ja: '次の一致 (Enter)',
        ko: '다음 일치 (Enter)',
        es: 'Siguiente (Enter)',
        fr: 'Suivant (Enter)',
        de: 'Nächster Treffer (Enter)',
      },
      convFindClose: {
        'zh-CN': '关闭 (Esc)',
        'zh-TW': '關閉 (Esc)',
        en: 'Close (Esc)',
        ja: '閉じる (Esc)',
        ko: '닫기 (Esc)',
        es: 'Cerrar (Esc)',
        fr: 'Fermer (Esc)',
        de: 'Schließen (Esc)',
      },
      convFindEarlier: {
        'zh-CN': '↑更早',
        'zh-TW': '↑更早',
        en: '↑Earlier',
        ja: '↑過去',
        ko: '↑이전',
        es: '↑Antes',
        fr: '↑Plus tôt',
        de: '↑Früher',
      },
      convFindEarlierTip: {
        'zh-CN': '向上滚动加载未渲染的较早历史消息并查找',
        'zh-TW': '向上捲動載入未渲染的較早歷史訊息並搜尋',
        en: 'Scroll up to load earlier unloaded history & find',
        ja: '上にスクロールして未読込の履歴を検索',
        ko: '위로 스크롤하여 이전 대화 기록 불러와 검색',
        es: 'Desplazar arriba para cargar historial anterior',
        fr: 'Défiler en haut pour charger l’historique',
        de: 'Nach oben scrollen & früheren Verlauf laden',
      },
      convFindScanning: {
        'zh-CN': '加载历史...',
        'zh-TW': '載入歷史...',
        en: 'Loading...',
        ja: '読込中...',
        ko: '로딩 중...',
        es: 'Cargando...',
        fr: 'Chargement...',
        de: 'Laden...',
      },
    };

    function getUiText(key, fallback) {
      if (typeof hookTFn === 'function') {
        try {
          const v = hookTFn(key);
          if (typeof v === 'string' && v && v !== key) return v;
        } catch {}
      }
      const lang = getLang();
      try {
        const ui = (win?.__agCsLocales || G.__agCsLocales)?.getUiStrings?.(lang);
        if (ui && typeof ui[key] === 'string' && ui[key]) return ui[key];
      } catch {}
      const row = DIFF_FALLBACK[key];
      return (row && (row[lang] || row.en)) || fallback || key;
    }

    function mkSvgIcon(kind, size = 14) {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      if (!doc || typeof doc.createElementNS !== 'function') {
        const sp = doc.createElement('span');
        sp.setAttribute('aria-hidden', 'true');
        return sp;
      }
      const svg = doc.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const addNode = (tag, attrs) => {
        const n = doc.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        svg.appendChild(n);
      };
      if (kind === 'external') {
        addNode('path', { d: 'M15 3h6v6' });
        addNode('path', { d: 'M10 14L21 3' });
        addNode('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' });
      } else if (kind === 'close') {
        addNode('path', { d: 'M18 6L6 18' });
        addNode('path', { d: 'M6 6l12 12' });
      } else if (kind === 'chevUp') {
        addNode('polyline', { points: '18 15 12 9 6 15' });
      } else if (kind === 'chevDown') {
        addNode('polyline', { points: '6 9 12 15 18 9' });
      } else if (kind === 'moreDots') {
        addNode('circle', { cx: '6', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '12', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
        addNode('circle', { cx: '18', cy: '12', r: '1.2', fill: 'currentColor', stroke: 'none' });
      }
      return svg;
    }

    function ensureStyleMounted() {
      if (isDead() || !doc || typeof doc.createElement !== 'function') return null;
      if (styleEl && styleEl.isConnected !== false) {
        if (typeof doc.getElementById !== 'function' || doc.getElementById(INLINE_DIFF_STYLE_ID) === styleEl) {
          return styleEl;
        }
      }
      const existing = typeof doc.getElementById === 'function' ? doc.getElementById(INLINE_DIFF_STYLE_ID) : null;
      if (existing) {
        if (existing.textContent !== INLINE_DIFF_CSS) {
          mut(() => {
            existing.textContent = INLINE_DIFF_CSS;
          });
        }
        markNoTrOwned(existing);
        styleEl = existing;
        return existing;
      }
      const target = doc.head || doc.documentElement || doc.body;
      if (!target || typeof target.appendChild !== 'function') return null;
      let created = null;
      mut(() => {
        created = doc.createElement('style');
        created.id = INLINE_DIFF_STYLE_ID;
        markNoTrOwned(created);
        created.textContent = INLINE_DIFF_CSS;
        target.appendChild(created);
      });
      styleEl = created;
      return created;
    }

    function onInlineDiffResolve(reqId, resp) {
      const entry = inlineDiffPending.get(reqId);
      if (!entry) return;
      inlineDiffPending.delete(reqId);
      if (entry.timer) clearTimeout(entry.timer);
      try {
        entry.resolve(resp || null);
      } catch {}
    }

    if (win) {
      try {
        win.__agPrismInlineDiffResolve = onInlineDiffResolve;
      } catch {}
    }

    function normalizeLinesArray(arr) {
      return arr.slice(0, 160).map((it) => ({
        kind: it && (it.kind === 'add' || it.kind === 'del' || it.kind === 'hunk') ? it.kind : 'ctx',
        ln: String(it?.ln ?? ''),
        sign: String(it?.sign ?? (it?.kind === 'add' ? '+' : it?.kind === 'del' ? '-' : ' ')),
        text: truncateDiffLine(it?.text ?? ''),
      }));
    }

    function extractInlineDiffPayload(badgeEl, rowEl) {
      let uri = '',
        fileName = '',
        additions = 0,
        deletions = 0,
        lines = [];
      const uAttr = ga(badgeEl, 'data-ag-diff-uri') || ga(rowEl, 'data-ag-diff-uri');
      if (typeof uAttr === 'string' && uAttr.trim()) {
        uri = uAttr.trim();
        fileName = basenameFromUri(uri);
      }
      const rawJson = ga(badgeEl, 'data-ag-diff-json') || ga(rowEl, 'data-ag-diff-json');
      if (rawJson && rawJson.length <= MAX_CLIENT_DIFF_BYTES) {
        try {
          const p = JSON.parse(rawJson);
          if (p && typeof p === 'object') {
            if (!uri) {
              const c = p.uri || p.filePath || p.path;
              if (typeof c === 'string' && c.trim()) uri = c.trim();
            }
            if (typeof p.file === 'string') fileName = basenameFromUri(p.file);
            if (!fileName && uri) fileName = basenameFromUri(uri);
            if (typeof p.additions === 'number') additions = p.additions;
            if (typeof p.deletions === 'number') deletions = p.deletions;
            if (Array.isArray(p.lines)) {
              lines = normalizeLinesArray(p.lines);
            } else if (typeof p.unified === 'string') {
              lines = parseUnifiedDiffLines(p.unified);
            } else if (typeof p.oldText === 'string' || typeof p.newText === 'string') {
              lines = buildPairDiffLines(p.oldText || '', p.newText || '', Number(p.startLine) || 1);
            }
          }
        } catch {}
      }
      if ((!lines.length || !uri) && badgeEl) {
        try {
          const fk = Object.keys(badgeEl).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          let stepCtx = null;
          for (let d = 0, f = fk ? badgeEl[fk] : null; d < 24 && f; d++, f = f.return) {
            const p = f.memoizedProps || {},
              fd = p.fileDiff;
            if (fd && typeof fd === 'object') {
              if (!uri && typeof fd.uri === 'string' && fd.uri.trim()) uri = fd.uri.trim();
              if (!fileName && fd.uri) fileName = basenameFromUri(fd.uri);
              if (fd.diffStats && typeof fd.diffStats === 'object') {
                if (!additions && typeof fd.diffStats.additions === 'number') additions = fd.diffStats.additions;
                if (!deletions && typeof fd.diffStats.deletions === 'number') deletions = fd.diffStats.deletions;
              }
            }
            if (!uri && typeof p.uri === 'string' && p.uri.trim()) uri = p.uri.trim();
            if (p.diffContext && !stepCtx) stepCtx = p.diffContext;
            const st = p.step && (p.step.args || p.step.result) ? p.step : p.step?.step?.value;
            if (st && typeof st === 'object') {
              const args = st.args || {},
                res = st.result || {},
                uc = args.TargetFile || args.Path || args.path || args.filePath || args.uri;
              if (typeof uc === 'string' && uc.trim()) {
                if (!uri) uri = uc.trim();
                if (!fileName) fileName = basenameFromUri(uc);
              }
              const uni = res.diff || res.unifiedDiff || res.patch || st.diff;
              if (!lines.length && typeof uni === 'string' && uni.trim()) lines = parseUnifiedDiffLines(uni);
              const oldT = args.Target ?? args.TargetContent ?? args.oldText ?? args.old_string;
              const newT = args.Replacement ?? args.ReplacementContent ?? args.newText ?? args.new_string;
              if (!lines.length && (typeof oldT === 'string' || typeof newT === 'string')) {
                lines = buildPairDiffLines(oldT || '', newT || '', Number(args.StartLine) || 1);
              }
              if (!lines.length && Array.isArray(args.ReplacementChunks) && args.ReplacementChunks.length) {
                const ch = args.ReplacementChunks[0];
                if (ch && (typeof ch.TargetContent === 'string' || typeof ch.ReplacementContent === 'string')) {
                  lines = buildPairDiffLines(ch.TargetContent || '', ch.ReplacementContent || '', Number(ch.StartLine) || 1);
                }
              }
            }
          }
          if (!lines.length && typeof win?.__agPrismResolveInlineDiff === 'function') {
            const ext = win.__agPrismResolveInlineDiff({ uri, fileName, additions, deletions, diffContext: stepCtx, badgeEl, rowEl });
            if (Array.isArray(ext?.lines)) lines = normalizeLinesArray(ext.lines);
            else if (typeof ext?.unified === 'string') lines = parseUnifiedDiffLines(ext.unified);
          }
        } catch {}
      }
      if (!additions && !deletions) {
        const txt = String(badgeEl?.textContent || ''),
          am = txt.match(/\+(\d+)/),
          dm = txt.match(/-(\d+)/);
        if (am) additions = Number(am[1]) || 0;
        if (dm) deletions = Number(dm[1]) || 0;
      }
      if (!fileName && uri) fileName = basenameFromUri(uri);
      if (!fileName && rowEl) {
        const fm = String(rowEl.textContent || '')
          .trim()
          .match(/([A-Za-z0-9._-]+\.[A-Za-z0-9]{1,8})/);
        if (fm) fileName = fm[1];
      }
      return { uri, fileName: fileName || 'Diff Preview', additions, deletions, lines };
    }

    function findInlineDiffHostRow(badgeEl) {
      if (!badgeEl) return null;
      const exp = cl(badgeEl, '[data-testid="tool-call-row"], [data-ag-tool-row="1"]');
      if (exp) return exp;
      let cur = badgeEl,
        spanHost = null;
      const cands = [];
      for (let i = 0; i < 16 && cur?.parentElement; i++, cur = cur.parentElement) {
        const p = cur.parentElement;
        if (p === doc?.documentElement || cur === doc?.body || cur === doc?.documentElement) break;
        const tid = ga(cur, 'data-testid') || '';
        if (tid === 'conversation-view' || tid === 'autoscroll-viewport') break;
        if (qa(cur, '[data-testid="diff-line-count"]').length > 1) break;
        if (cur.classList?.contains?.('flex-col') && (cur.children?.length || 0) > 1) break;
        const pt = tagU(p);
        if (pt === 'SPAN' || pt === 'BUTTON' || pt === 'A') continue;
        let disp = '',
          dir = '';
        try {
          const cs = win?.getComputedStyle?.(p);
          if (cs) {
            disp = String(cs.display || cs.getPropertyValue?.('display') || '').toLowerCase();
            dir = String(cs.flexDirection || cs.getPropertyValue?.('flex-direction') || '').toLowerCase();
          }
        } catch {}
        if (!(disp ? (disp === 'flex' && dir === 'column') || disp === 'block' || disp === 'grid' : Boolean(p.classList?.contains?.('flex-col')))) {
          continue;
        }
        if (tagU(cur) === 'SPAN') {
          if (!spanHost) spanHost = cur;
          continue;
        }
        cands.push(cur);
      }
      if (cands.length) {
        let best = cands[cands.length - 1],
          bestW = -1;
        for (let i = 0; i < cands.length; i++) {
          const c = cands[i],
            w = Math.round(Number(c.getBoundingClientRect?.()?.width) || 0);
          if (w > bestW || (w === bestW && (Boolean(c.classList?.contains?.('w-full')) || i > 0))) {
            bestW = w;
            best = c;
          }
        }
        return bestW === 0 ? cands.find((c) => c.classList?.contains?.('w-full')) || best : best;
      }
      return spanHost || cl(badgeEl, 'button, [role="button"]') || badgeEl.parentElement || null;
    }

    function makeInlineDiffCacheKey(uri, hints) {
      const a = Number(hints?.additions) || 0;
      const d = Number(hints?.deletions) || 0;
      return `${uri}|${a}:${d}`;
    }

    function getCachedInlineDiff(cacheKey) {
      const hit = inlineDiffCache.get(cacheKey);
      if (!hit) return null;
      const ttl = hit.ttl || INLINE_DIFF_CACHE_TTL_MS;
      if (Date.now() - hit.at > ttl) {
        inlineDiffCache.delete(cacheKey);
        return null;
      }
      return hit.resp;
    }

    function putCachedInlineDiff(cacheKey, resp) {
      if (!resp || typeof resp !== 'object') return;
      const errCode = String(resp.error || resp.reason || '');
      const isDeterministicNeg =
        (!resp.ok && DETERMINISTIC_ERR_RE.test(errCode)) || (resp.ok && resp.mode === 'binary');
      if (!resp.ok && !isDeterministicNeg) return;
      const ttl = isDeterministicNeg ? INLINE_DIFF_NEG_TTL_MS : INLINE_DIFF_CACHE_TTL_MS;
      while (inlineDiffCache.size >= INLINE_DIFF_CACHE_MAX) {
        const oldest = inlineDiffCache.keys().next().value;
        if (oldest === undefined) break;
        inlineDiffCache.delete(oldest);
      }
      inlineDiffCache.set(cacheKey, { at: Date.now(), ttl, resp });
    }

    function requestInlineDiffFromDaemon(uri, hints) {
      if (isDead() || !uri || typeof win?.__agPrismInlineDiffCall !== 'function') return null;
      const key = makeInlineDiffCacheKey(uri, hints),
        cached = getCachedInlineDiff(key);
      if (cached) return { reqId: inlineDiffReqSeq++, cached, promise: Promise.resolve(cached) };
      const existing = inlineDiffInflight.get(key);
      if (existing) return { reqId: inlineDiffReqSeq++, promise: existing };
      try {
        win.__agPrismInlineDiffResolve = onInlineDiffResolve;
      } catch {}
      while (inlineDiffPending.size >= INLINE_DIFF_MAX_PENDING) {
        const ok = inlineDiffPending.keys().next().value,
          o = inlineDiffPending.get(ok);
        inlineDiffPending.delete(ok);
        if (o?.timer) clearTimeout(o.timer);
        try {
          o?.resolve?.({ ok: false, error: 'evicted' });
        } catch {}
      }
      const reqId = inlineDiffReqSeq++;
      const ch =
        hints && (hints.additions > 0 || hints.deletions > 0)
          ? {
              additions: Math.max(0, Math.trunc(Number(hints.additions) || 0)),
              deletions: Math.max(0, Math.trunc(Number(hints.deletions) || 0)),
            }
          : undefined;
      const promise = new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (!inlineDiffPending.delete(reqId)) return;
          inlineDiffInflight.delete(key);
          resolve({ ok: false, error: 'timeout' });
        }, INLINE_DIFF_TIMEOUT_MS);
        inlineDiffPending.set(reqId, {
          resolve: (resp) => {
            inlineDiffInflight.delete(key);
            if (resp) putCachedInlineDiff(key, resp);
            resolve(resp);
          },
          timer,
        });
        try {
          win.__agPrismInlineDiffCall(
            JSON.stringify(ch ? { id: reqId, action: 'readInlineDiff', uri, hints: ch } : { id: reqId, action: 'readInlineDiff', uri })
          );
        } catch {
          const r = inlineDiffPending.get(reqId);
          if (r) {
            inlineDiffPending.delete(reqId);
            if (r.timer) clearTimeout(r.timer);
          }
          inlineDiffInflight.delete(key);
          resolve({ ok: false, error: 'rpc-error' });
        }
      });
      if (inlineDiffInflight.size < 16) inlineDiffInflight.set(key, promise);
      return { reqId, promise };
    }

    function renderInlineDiffBody(bodyEl, lines, stateKind, metaMode, stepStats, totalStats, onOpenSidebar) {
      if (!doc || !bodyEl) return;
      while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
      const P = 'ag-cs-inline-diff-';

      if (Array.isArray(lines) && lines.length > 0) {
        if (metaMode === 'snapshot') {
          bodyEl.appendChild(mk('div', P + 'note', getUiText('inlineDiffSnapshotNotice')));
        }
        const rows = [];
        let seen = false,
          gap = false;
        for (let i = 0; i < Math.min(lines.length, 160); i++) {
          const r = lines[i];
          if (!r || typeof r !== 'object') continue;
          const kind = r.kind === 'add' || r.kind === 'del' || r.kind === 'hunk' ? r.kind : 'ctx';
          if (kind === 'hunk') {
            if (seen) gap = true;
            continue;
          }
          if (gap) {
            gap = false;
            rows.push({ kind: 'hunk', ln: '⋯', sign: '', text: '' });
          }
          seen = true;
          rows.push({
            kind,
            ln: String(r.ln ?? ''),
            sign: String(r.sign ?? (kind === 'add' ? '+' : kind === 'del' ? '-' : ' ')),
            text: truncateDiffLine(r.text ?? ''),
          });
        }
        const longLineLbl = getUiText('inlineDiffLongLinesTag', 'long line');
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.kind === 'hunk') {
            bodyEl.appendChild(mk('div', P + 'line is-hunk', null, mk('span', P + 'ln', '⋯'), mk('span', P + 'gap-rule')));
            continue;
          }
          const chg = r.kind === 'add' || r.kind === 'del';
          const pSame = chg && i > 0 && rows[i - 1].kind === r.kind;
          const nSame = chg && i + 1 < rows.length && rows[i + 1].kind === r.kind;
          const gc = chg && (pSame || nSame) ? (!pSame ? ' is-grp-start' : !nSame ? ' is-grp-end' : ' is-grp-mid') : '';
          bodyEl.appendChild(
            mk(
              'div',
              `${P}line is-${r.kind}${gc}`,
              null,
              mk('span', P + 'ln', r.ln),
              mk('span', pSame ? P + 'sign is-cont' : P + 'sign', pSame ? '┆' : r.sign),
              mk('span', P + 'code', r.text),
              r.text.endsWith('…') ? mk('span', P + 'wrap-tag', longLineLbl) : null
            )
          );
        }
        if (totalStats?.truncated && typeof onOpenSidebar === 'function') {
          const mb = mk('button', P + 'more-bar', getUiText('inlineDiffLargeExpandBtn'));
          mb.type = 'button';
          mb.addEventListener('click', (ev) => {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            onOpenSidebar();
          });
          bodyEl.appendChild(mb);
        }
        return;
      }
      if (stateKind === 'loading') {
        bodyEl.appendChild(mk('div', P + 'loading', getUiText('inlineDiffLoading', 'Loading diff...')));
        return;
      }
      bodyEl.appendChild(
        mk(
          'div',
          P + 'empty',
          stateKind === 'binary' ? getUiText('inlineDiffBinary') : getUiText('inlineDiffNoPreview')
        )
      );
    }

    function isLikelyActionVerbOnly(el) {
      if (!el) return false;
      if (el.querySelector?.('[data-testid="entity-pill"], .inline-pill, svg, img')) return false;
      const txt = String(el.textContent || '').trim();
      if (!txt || txt.includes('.') || txt.includes('/') || txt.includes('\\')) return false;
      return /^(?:created|edited|updated|deleted|modified|wrote|renamed|added|removed)$/i.test(txt);
    }

    function findDiffChipContainer(badgeEl) {
      if (!badgeEl) return null;
      for (let d = 0, cur = badgeEl.parentElement; d < 4 && cur; d++, cur = cur.parentElement) {
        const tag = tagU(cur);
        if (
          tag === 'BODY' ||
          tag === 'MAIN' ||
          (cur.classList?.contains?.('group') && cur.classList?.contains?.('w-full')) ||
          ga(cur, 'data-testid') === 'tool-call-row'
        ) {
          break;
        }
        if (Array.from(cur.childNodes || []).some((n) => n?.nodeType === 3 && String(n.nodeValue || '').trim().length > 0)) continue;
        const kids = Array.from(cur.children || []).filter(isElementLike);
        if (kids.length === 2) {
          const other = kids.find((k) => k !== badgeEl && !k.contains?.(badgeEl));
          if (other && !isLikelyActionVerbOnly(other)) return cur;
        }
      }
      return null;
    }

    function syncInlineDiffChips() {
      if (isDead() || !doc?.querySelectorAll) return;
      const badges = qa(doc, '[data-testid="diff-line-count"]');
      if (!badges.length) return;
      mut(() => {
        for (const b of badges) {
          if (!b || cl(b, '[data-testid="changed-files-card"]')) continue;
          const bTxt = String(b.textContent || '');
          const prevChip = b._agSyncedChip;
          if (
            b._agSyncedTxt === bTxt &&
            !ga(b, 'data-tooltip-id') &&
            (!prevChip || (prevChip.isConnected !== false && ga(prevChip, 'data-ag-diff-chip') === '1'))
          ) {
            continue;
          }
          const tip = ga(b, 'data-tooltip-id');
          if (tip) {
            b._agOrigTooltipId = tip;
            ra(b, 'data-tooltip-id');
          }
          for (const sp of b.children || []) {
            if (!isElementLike(sp)) continue;
            const st = String(sp.textContent || '').trim();
            if (/^\+[1-9]\d*/.test(st)) setA(sp, 'data-ag-diff-stat', 'add');
            else if (/^-[1-9]\d*/.test(st)) setA(sp, 'data-ag-diff-stat', 'del');
            else if (/^[+-]?0$/.test(st)) setA(sp, 'data-ag-diff-stat', 'zero');
          }
          const chip = findDiffChipContainer(b);
          b._agSyncedTxt = bTxt;
          b._agSyncedChip = chip || null;
          if (!chip) continue;
          setA(chip, 'data-ag-diff-chip', '1');
          for (let k = 0, anc = chip.parentElement; k < 3 && anc; k++, anc = anc.parentElement) {
            if (anc.classList?.contains?.('w-full')) break;
            const cls = String(anc.className || '');
            if (cls.includes('overflow-hidden') || cls.includes('truncate')) setA(anc, 'data-ag-diff-chip-row', '1');
          }
          for (const ch of chip.children || []) {
            if (!isElementLike(ch) || ch === b || ch.contains?.(b)) continue;
            setA(ch, 'data-ag-diff-chip-file', '1');
            const ct = ga(ch, 'data-tooltip-id');
            if (ct) {
              ch._agOrigTooltipId = ct;
              ra(ch, 'data-tooltip-id');
            }
          }
        }
      });
    }

    function closeDiffContextMenu() {
      if (!diffCtxMenuEl) return false;
      const el = diffCtxMenuEl;
      diffCtxMenuEl = null;
      mut(() => {
        try {
          el.remove();
        } catch {}
      });
      return true;
    }

    function dispatchCtxOpenBus() {
      if (!win || typeof win.dispatchEvent !== 'function') return;
      try {
        const Ctor = win.CustomEvent || (typeof CustomEvent === 'function' ? CustomEvent : null);
        const ev = Ctor ? new Ctor('ag-prism:ctx-open', { detail: { source: 'inline-diff' } }) : { type: 'ag-prism:ctx-open', detail: { source: 'inline-diff' } };
        win.dispatchEvent(ev);
      } catch {}
    }

    function openDiffContextMenu(ev, badgeEl) {
      if (isDead() || !doc?.body || !badgeEl) return false;
      closeDiffContextMenu();
      dispatchCtxOpenBus();
      const rowEl = findInlineDiffHostRow(badgeEl),
        isOpen = ga(badgeEl, 'data-ag-inline-diff-open') === '1',
        payload = extractInlineDiffPayload(badgeEl, rowEl);
      const menu = markNoTrOwned(mk('div', 'ag-cs-diff-ctx-menu'));
      sa(menu, 'role', 'menu');
      const addItem = (ic, lbl, fn) => {
        const b = mk('button', 'ag-cs-diff-ctx-item', null, mkSvgIcon(ic, 13), mk('span', '', lbl));
        b.type = 'button';
        sa(b, 'role', 'menuitem');
        b.addEventListener('click', (e) => {
          e.preventDefault?.();
          e.stopPropagation?.();
          closeDiffContextMenu();
          fn();
        });
        menu.appendChild(b);
      };
      addItem(
        isOpen ? 'close' : 'chevDown',
        isOpen ? getUiText('inlineDiffMenuCollapse') : getUiText('inlineDiffMenuExpand'),
        () => toggleInlineDiffPreview(badgeEl)
      );
      addItem('external', getUiText('inlineDiffOpenSidebar'), () => {
        allowNativeDiffClick = true;
        try {
          badgeEl.click?.();
        } finally {
          allowNativeDiffClick = false;
        }
      });
      if (payload.uri) {
        addItem('moreDots', getUiText('inlineDiffMenuCopyPath'), () => {
          try {
            win?.navigator?.clipboard?.writeText?.(String(payload.uri).replace(/^file:\/\/\/?/i, ''));
          } catch {}
        });
      }
      const vw = Number(win?.innerWidth) || 1280,
        vh = Number(win?.innerHeight) || 800;
      if (menu.style) {
        menu.style.left = `${Math.max(8, Math.min(vw - 208, Math.round(Number(ev?.clientX) || 0)))}px`;
        menu.style.top = `${Math.max(8, Math.min(vh - 124, Math.round(Number(ev?.clientY) || 0)))}px`;
      }
      mut(() => doc.body.appendChild(menu));
      diffCtxMenuEl = menu;
      return true;
    }

    function shouldAnimateInlineDiff() {
      if (!win?.requestAnimationFrame || !doc?.getElementById) return false;
      if (!doc.getElementById(INLINE_DIFF_STYLE_ID) && !doc.getElementById('ag-prism-css') && !doc.getElementById('prism-style')) {
        return false;
      }
      if ((getConfig() || {}).motionLevel === 'off' || ga(doc.documentElement, 'data-ag-cs-motion') === 'off') return false;
      return !win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    }

    function clearBoxAnimTimers(b) {
      if (!b) return;
      for (const k of ['_agCloseTimer', '_agSettleTimer']) {
        if (b[k]) {
          clearTimeout(b[k]);
          inlineDiffAnimTimers.delete(b[k]);
          b[k] = 0;
        }
      }
    }

    function normalizeBadgeEl(chipOrBadge) {
      if (!chipOrBadge) return null;
      if (ga(chipOrBadge, 'data-testid') === 'diff-line-count') return chipOrBadge;
      const inner = qs(chipOrBadge, '[data-testid="diff-line-count"]');
      return inner || chipOrBadge;
    }

    function toggleInlineDiffPreview(chipOrBadge, opts = null) {
      if (isDead() || !doc || !chipOrBadge) return false;
      const badgeEl = normalizeBadgeEl(chipOrBadge);
      if (!badgeEl) return false;
      const rowEl = findInlineDiffHostRow(badgeEl);
      if (!rowEl?.parentNode) return false;
      const chipEl = cl(badgeEl, '[data-ag-diff-chip="1"]') || findDiffChipContainer(badgeEl);
      const AO = 'data-ag-inline-diff-open',
        AH = 'data-ag-inline-diff-host',
        AA = 'data-ag-diff-anim',
        AS = 'data-ag-diff-state',
        BC = 'ag-cs-inline-diff-box';
      const nextSib = rowEl.nextElementSibling;
      const allowAnim = !(opts && opts.noAnim === true) && shouldAnimateInlineDiff();
      const schedSettle = (b, checkOpen) => {
        const tid = setTimeout(() => {
          inlineDiffAnimTimers.delete(tid);
          b._agSettleTimer = 0;
          if (!isDead() && b.isConnected !== false && (!checkOpen || ga(b, AS) === 'open')) mut(() => ra(b, AA));
        }, 165);
        b._agSettleTimer = tid;
        inlineDiffAnimTimers.add(tid);
      };
      if (nextSib?.classList?.contains(BC) && nextSib._agDiffBadge === badgeEl) {
        if ((ga(nextSib, AS) || 'open') === 'closing') {
          if (opts && opts.closeOnly) return true;
          clearBoxAnimTimers(nextSib);
          mut(() => {
            if (allowAnim) sa(nextSib, AA, '1');
            sa(nextSib, AS, 'open');
            sa(badgeEl, AO, '1');
            if (chipEl) sa(chipEl, AO, '1');
            sa(rowEl, AH, '1');
          });
          if (allowAnim) schedSettle(nextSib, false);
          stats.inlineDiffToggleCount++;
          return true;
        }
        if (opts && opts.openOnly) return true;
        clearBoxAnimTimers(nextSib);
        nextSib._agDiffReqId = 0;
        if (allowAnim) {
          mut(() => {
            ra(badgeEl, AO);
            if (chipEl) ra(chipEl, AO);
            sa(nextSib, AA, '1');
            sa(nextSib, AS, 'closing');
          });
          const tid = setTimeout(() => {
            inlineDiffAnimTimers.delete(tid);
            nextSib._agCloseTimer = 0;
            if (!isDead()) {
              mut(() => {
                if (nextSib.parentNode) nextSib.remove();
                if (!rowEl.nextElementSibling?.classList?.contains(BC)) ra(rowEl, AH);
              });
            }
          }, 130);
          nextSib._agCloseTimer = tid;
          inlineDiffAnimTimers.add(tid);
        } else {
          mut(() => {
            nextSib.remove();
            ra(badgeEl, AO);
            if (chipEl) ra(chipEl, AO);
            ra(rowEl, AH);
          });
        }
        stats.inlineDiffToggleCount++;
        return true;
      }

      if (opts && opts.closeOnly) return false;

      const payload = extractInlineDiffPayload(badgeEl, rowEl);
      // Graceful fallback when neither local diff lines nor Daemon RPC is available: yield to native host Sidebar click
      if (!payload.lines.length && !(payload.uri && typeof win?.__agPrismInlineDiffCall === 'function')) {
        return false;
      }

      const stepStats = { additions: payload.additions || 0, deletions: payload.deletions || 0 };
      const body = mk('div', 'ag-cs-inline-diff-body'),
        box = markNoTrOwned(mk('div', BC, null, mk('div', 'ag-cs-inline-diff-card', null, body)));
      sa(box, 'data-ag-cs-inline-diff', '1');
      box._agDiffBadge = badgeEl;
      box._agDiffReqId = 0;
      const openSb = () => {
        allowNativeDiffClick = true;
        try {
          badgeEl.click?.();
        } finally {
          allowNativeDiffClick = false;
        }
      };
      const applyResp = (resp) => {
        if (resp?.ok && Array.isArray(resp.lines) && resp.lines.length > 0) {
          renderInlineDiffBody(body, resp.lines, 'lines', resp.mode, stepStats, resp, openSb);
        } else {
          renderInlineDiffBody(body, [], resp?.mode === 'binary' ? 'binary' : 'empty');
        }
      };
      let pendingRpc = null;
      if (payload.lines.length) {
        renderInlineDiffBody(body, payload.lines, 'lines', null, stepStats, null, openSb);
      } else {
        pendingRpc = requestInlineDiffFromDaemon(payload.uri, stepStats);
        if (pendingRpc?.cached) {
          applyResp(pendingRpc.cached);
          pendingRpc = null;
        } else {
          renderInlineDiffBody(body, [], 'loading');
          if (pendingRpc) box._agDiffReqId = pendingRpc.reqId;
        }
      }

      sa(box, AS, 'open');
      if (allowAnim) sa(box, AA, '1');
      mut(() => {
        if (nextSib?.classList?.contains(BC)) {
          clearBoxAnimTimers(nextSib);
          nextSib._agDiffReqId = 0;
          nextSib.remove();
        }
        rowEl.parentNode.insertBefore(box, rowEl.nextElementSibling || null);
        sa(badgeEl, AO, '1');
        if (chipEl) sa(chipEl, AO, '1');
        sa(rowEl, AH, '1');
      });
      if (allowAnim) schedSettle(box, true);
      if (pendingRpc) {
        const expId = pendingRpc.reqId;
        pendingRpc.promise.then((resp) => {
          if (!isDead() && box.isConnected !== false && box._agDiffReqId === expId) mut(() => applyResp(resp));
        });
      }
      stats.inlineDiffToggleCount++;
      return true;
    }

    function resolveDiffBadgeFromTarget(t) {
      if (!t?.closest) return null;
      const d = cl(t, '[data-testid="diff-line-count"]');
      if (d && !cl(d, '[data-testid="changed-files-card"]')) return d;
      const b = qs(cl(t, '[data-ag-diff-chip="1"]'), '[data-testid="diff-line-count"]');
      if (b && !cl(b, '[data-testid="changed-files-card"]')) return b;
      return cl(t, '.ag-cs-inline-diff-box')?._agDiffBadge || null;
    }

    function clearHoverPrefetchTimer() {
      if (inlineDiffHoverTimer) {
        clearTimeout(inlineDiffHoverTimer);
        inlineDiffHoverTimer = 0;
      }
    }

    function scheduleChipSyncDebounce() {
      if (chipSyncDebounceTimer) clearTimeout(chipSyncDebounceTimer);
      chipSyncDebounceTimer = setTimeout(() => {
        chipSyncDebounceTimer = 0;
        if (!isDead()) syncInlineDiffChips();
      }, 24);
    }

    function onDocClickCapture(ev) {
      try {
        const t = ev?.target;
        if (isDead() || !t?.closest) return;
        if (diffCtxMenuEl && !cl(t, '.ag-cs-diff-ctx-menu')) closeDiffContextMenu();
        if (!allowNativeDiffClick && !cl(t, '.ag-cs-inline-diff-box')) {
          const db = resolveDiffBadgeFromTarget(t);
          if (db) {
            if (toggleInlineDiffPreview(db)) {
              ev.preventDefault?.();
              ev.stopPropagation?.();
            }
            return;
          }
        }
        if (cl(t, 'button, [role="button"]')) {
          scheduleChipSyncDebounce();
        }
      } catch {}
    }

    function onWinPointerDownCapture(ev) {
      try {
        if (isDead() || !diffCtxMenuEl) return;
        const t = ev?.target;
        if (!t?.closest || !cl(t, '.ag-cs-diff-ctx-menu')) {
          closeDiffContextMenu();
        }
      } catch {}
    }

    function onWinContextMenu(ev) {
      try {
        if (isDead() || !ev?.target?.closest) return;
        const t = ev.target;
        const db = resolveDiffBadgeFromTarget(t);
        if (!db) {
          closeDiffContextMenu();
          return;
        }
        if (ev.shiftKey) {
          closeDiffContextMenu();
          return;
        }
        if (cl(t, '.ag-cs-inline-diff-box')) {
          const selText = String(win?.getSelection?.() || '').trim();
          if (selText.length > 0) {
            closeDiffContextMenu();
            return;
          }
        }
        if (openDiffContextMenu(ev, db)) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      } catch {}
    }

    // ── In-Conversation Find Overlay (Ctrl+Shift+F, incl. User Message Bubbles) ─
    const FIND_HL_MATCH = 'ag-find-match';
    const FIND_HL_ACTIVE = 'ag-find-active';
    const FIND_BLOCK_TAGS = new Set(
      'ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BUTTON,DD,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL'.split(
        ','
      )
    );
    const FIND_SKIP_TAGS = new Set('SCRIPT,STYLE,NOSCRIPT,TEMPLATE,SVG,CANVAS,INPUT,TEXTAREA,SELECT,OPTION'.split(','));
    const FIND_SKIP_CLASS_RE =
      /\b(?:ag-cs-conv-find|ag-cs-nav-outline-popover|ag-cs-nav-outline-trigger|ag-cs-code-fold-btn|ag-cs-diff-ctx-menu|ag-cs-home-panel-seat|ag-cs-crab|ag-cs-dual-stage|ag-cs-crystal-bar)\b/;
    const FIND_SKIP_TESTID_SET = new Set([
      'agent-input-box',
      'conversation-navigator',
      'user-message-actions',
      'agent-response-actions',
    ]);
    const FIND_WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

    let convFindRoot = null;
    let convFindField = null;
    let convFindInput = null;
    let convFindCountEl = null;
    let convFindCaseBtn = null;
    let convFindWordBtn = null;
    let convFindRegexBtn = null;
    let convFindEarlierBtn = null;
    let convFindPrevBtn = null;
    let convFindNextBtn = null;
    let convFindCloseBtn = null;
    let convFindOpen = false;
    let convFindComposing = false;
    let convFindScanning = false;
    let convFindScanSeq = 0;
    let convFindScanTimer = 0;
    let convFindScrollFixTimer = 0;
    let convFindMatches = [];
    let convFindIdx = -1;
    let convFindDebounceTimer = 0;
    let convFindSonarTimer = 0;
    let convFindSonarEl = null;
    let convFindPrevFocus = null;
    let convFindLastCid = '';
    const convFindOpts = { matchCase: false, wholeWord: false, regex: false };

    function getHighlightCtor() {
      const cssObj = win?.CSS || (typeof CSS !== 'undefined' ? CSS : null);
      const hlCtor = typeof Highlight === 'function' ? Highlight : win?.Highlight || G.Highlight;
      if (cssObj?.highlights && typeof cssObj.highlights.set === 'function' && typeof cssObj.highlights.delete === 'function' && typeof hlCtor === 'function') {
        return { highlights: cssObj.highlights, HighlightCtor: hlCtor };
      }
      return null;
    }

    function clearConvFindHighlights() {
      const api = getHighlightCtor();
      if (api) {
        try {
          api.highlights.delete(FIND_HL_MATCH);
          api.highlights.delete(FIND_HL_ACTIVE);
        } catch {}
      }
    }

    function clearConvFindSonar() {
      if (convFindSonarTimer) {
        clearTimeout(convFindSonarTimer);
        convFindSonarTimer = 0;
      }
      if (convFindSonarEl) {
        const el = convFindSonarEl;
        convFindSonarEl = null;
        if (el.isConnected !== false) mut(() => ra(el, 'data-ag-find-sonar'));
      }
    }

    function pulseFindSonar(target) {
      if (!target || isDead()) return;
      clearConvFindSonar();
      convFindSonarEl = target;
      mut(() => sa(target, 'data-ag-find-sonar', '1'));
      convFindSonarTimer = setTimeout(() => {
        convFindSonarTimer = 0;
        if (convFindSonarEl === target) {
          convFindSonarEl = null;
          if (!isDead() && target.isConnected !== false) mut(() => ra(target, 'data-ag-find-sonar'));
        }
      }, 720);
    }

    function findConvView() {
      if (!doc?.querySelectorAll) return null;
      const views = doc.querySelectorAll('[data-testid="conversation-view"]');
      for (let i = 0; i < views.length; i++) {
        const cv = views[i];
        if (!cv || cv.hidden) continue;
        if (cv.closest?.('[data-testid="subagent-tab-conversation"]')) continue;
        if (cv.closest?.('.agy-home') || cv.querySelector?.('.agy-home')) continue;
        return cv;
      }
      if (views.length > 0) {
        const fb = views[0];
        if (fb && !fb.closest?.('.agy-home') && !fb.querySelector?.('.agy-home')) return fb;
      }
      return null;
    }

    function readActiveCascadeId(conv) {
      const cv = conv || findConvView();
      if (!cv) return '';
      return String(
        ga(cv, 'data-cascade-id') ||
          ga(cl(cv, '[data-cascade-id]'), 'data-cascade-id') ||
          ga(qs(cv, '[data-cascade-id]'), 'data-cascade-id') ||
          ''
      ).trim();
    }

    function findConvViewport(conv, nearEl = null) {
      if (nearEl?.closest) {
        const direct = nearEl.closest('[data-testid="autoscroll-viewport"]');
        if (direct) return direct;
      }
      const root = conv || findConvView();
      if (!root) return null;
      const vps = qa(root, '[data-testid="autoscroll-viewport"]');
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < vps.length; i++) {
        const v = vps[i];
        if (!v || v.hidden) continue;
        if (v.closest?.('[data-testid="subagent-tab-conversation"]') || v.closest?.('.ag-cs-inline-diff-box')) continue;
        const sh = Number(v.scrollHeight || 0);
        const st = Number(v.scrollTop || 0);
        const score = sh > 0 ? sh + (st > 0 ? 1000 : 0) : st > 0 ? 500 : 1;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (best) return best;
      return qs(root, '[data-testid="autoscroll-viewport"]') || root;
    }

    function shouldSkipFindEl(el) {
      if (!el || el.nodeType !== 1) return true;
      if (FIND_SKIP_TAGS.has(tagU(el))) return true;
      if (el.hidden || ga(el, 'aria-hidden') === 'true') return true;
      if (el.classList?.contains?.('hidden')) return true;
      const tid = ga(el, 'data-testid');
      if (tid && FIND_SKIP_TESTID_SET.has(tid)) return true;
      const cls = String(el.className || '');
      if (cls && FIND_SKIP_CLASS_RE.test(cls)) return true;
      if (el.style?.display === 'none' || el.style?.visibility === 'hidden') return true;
      return false;
    }

    function collectConversationBlocks(conv) {
      const searchRoot = conv;
      if (!searchRoot) return [];
      const blocks = [];
      let curRuns = [];
      let curLen = 0;
      let curBlockEl = searchRoot;
      let totalNodes = 0;
      let totalChars = 0;
      const MAX_NODES = 300000;
      const MAX_CHARS = 8000000;

      const flush = (nextBlockEl) => {
        if (curRuns.length > 0 && curLen > 0) {
          let text = '';
          for (let i = 0; i < curRuns.length; i++) text += curRuns[i].norm;
          blocks.push({ text, runs: curRuns, blockEl: curBlockEl });
        }
        curRuns = [];
        curLen = 0;
        if (nextBlockEl) curBlockEl = nextBlockEl;
      };

      const walk = (node) => {
        if (!node || totalNodes >= MAX_NODES || totalChars >= MAX_CHARS) return;
        totalNodes++;
        if (node.nodeType === 3) {
          const raw = node.nodeValue ?? node.textContent ?? '';
          if (!raw) return;
          const norm = raw.replace(/\u00a0/g, ' ');
          const start = curLen;
          curLen += norm.length;
          totalChars += norm.length;
          curRuns.push({ node, start, end: curLen, norm });
          return;
        }
        if (node.nodeType !== 1) return;
        if (node !== searchRoot && shouldSkipFindEl(node)) return;
        const tag = tagU(node);
        if (tag === 'BR') {
          flush(curBlockEl);
          return;
        }
        const isBlock = node !== searchRoot && FIND_BLOCK_TAGS.has(tag);
        if (isBlock) flush(node);
        const kids = node.childNodes && node.childNodes.length ? node.childNodes : node.children;
        if (kids && kids.length) {
          for (let i = 0; i < kids.length; i++) {
            walk(kids[i]);
            if (totalNodes >= MAX_NODES || totalChars >= MAX_CHARS) break;
          }
        }
        if (isBlock) flush(node.parentElement || searchRoot);
      };

      walk(searchRoot);
      flush(searchRoot);
      return blocks;
    }

    function locateOffsetInRuns(runs, targetOffset) {
      let lo = 0;
      let hi = runs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = runs[mid];
        if (targetOffset < r.start) hi = mid - 1;
        else if (targetOffset > r.end) lo = mid + 1;
        else return { node: r.node, offset: targetOffset - r.start };
      }
      const last = runs[runs.length - 1];
      return last ? { node: last.node, offset: last.norm.length } : null;
    }

    function locateEndOffsetInRuns(runs, endOffset) {
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i];
        if (endOffset > r.start && endOffset <= r.end) {
          return { node: r.node, offset: endOffset - r.start };
        }
      }
      return locateOffsetInRuns(runs, endOffset);
    }

    function executeFindQuery(blocks, queryText) {
      const qNorm = String(queryText || '').replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
      if (!qNorm) return { matches: [], invalidRegex: false };

      const maxMatches = 1500;
      const runPass = (needleStr) => {
        const out = [];
        let rx = null;
        if (convFindOpts.regex) {
          try {
            rx = new RegExp(needleStr, convFindOpts.matchCase ? 'g' : 'gi');
          } catch {
            return { matches: [], invalidRegex: true };
          }
        }
        const needle = convFindOpts.matchCase ? needleStr : needleStr.toLowerCase();
        if (!convFindOpts.regex && !needle) return { matches: [], invalidRegex: false };

        for (let bi = 0; bi < blocks.length && out.length < maxMatches; bi++) {
          const blk = blocks[bi];
          const txt = blk.text;
          if (!txt) continue;

          if (rx) {
            rx.lastIndex = 0;
            let m;
            while ((m = rx.exec(txt)) !== null && out.length < maxMatches) {
              const len = m[0].length;
              if (len === 0) {
                rx.lastIndex++;
                continue;
              }
              const sIdx = m.index;
              const eIdx = sIdx + len;
              if (convFindOpts.wholeWord) {
                const prev = sIdx > 0 ? txt[sIdx - 1] : '';
                const next = eIdx < txt.length ? txt[eIdx] : '';
                if ((prev && FIND_WORD_CHAR_RE.test(prev)) || (next && FIND_WORD_CHAR_RE.test(next))) continue;
              }
              const sp = locateOffsetInRuns(blk.runs, sIdx);
              const ep = locateEndOffsetInRuns(blk.runs, eIdx);
              if (sp && ep) out.push({ sp, ep, blockEl: blk.blockEl });
            }
          } else {
            const hay = convFindOpts.matchCase ? txt : txt.toLowerCase();
            let pos = 0;
            while ((pos = hay.indexOf(needle, pos)) !== -1 && out.length < maxMatches) {
              const sIdx = pos;
              const eIdx = pos + needle.length;
              pos += Math.max(1, needle.length);
              if (convFindOpts.wholeWord) {
                const prev = sIdx > 0 ? txt[sIdx - 1] : '';
                const next = eIdx < txt.length ? txt[eIdx] : '';
                if ((prev && FIND_WORD_CHAR_RE.test(prev)) || (next && FIND_WORD_CHAR_RE.test(next))) continue;
              }
              const sp = locateOffsetInRuns(blk.runs, sIdx);
              const ep = locateEndOffsetInRuns(blk.runs, eIdx);
              if (sp && ep) out.push({ sp, ep, blockEl: blk.blockEl });
            }
          }
        }
        return { matches: out, invalidRegex: false };
      };

      let res = runPass(qNorm);
      // Guard pasted trailing/leading invisible spaces (common when copying prompts): retry trimmed if exact 0 hits
      if (!res.invalidRegex && res.matches.length === 0 && !convFindOpts.regex && !convFindOpts.wholeWord) {
        const trimmed = qNorm.trim();
        if (trimmed && trimmed !== qNorm) res = runPass(trimmed);
      }
      if (res.invalidRegex) return res;

      const finalized = [];
      for (let i = 0; i < res.matches.length; i++) {
        const hit = res.matches[i];
        let range = null;
        if (typeof doc?.createRange === 'function') {
          try {
            range = doc.createRange();
            range.setStart(hit.sp.node, hit.sp.offset);
            range.setEnd(hit.ep.node, hit.ep.offset);
          } catch {
            range = null;
          }
        }
        const anchorEl = hit.sp.node?.parentElement || hit.blockEl;
        const turnEl =
          cl(anchorEl, '[data-testid="user-message-bubble"], [data-testid="user-input-step"], [data-testid="agent-response"], [data-testid="planner-response-text"]') ||
          hit.blockEl ||
          anchorEl;
        finalized.push({ range, anchorEl, turnEl });
      }
      return { matches: finalized, invalidRegex: false };
    }

    function applyConvFindHighlights() {
      const api = getHighlightCtor();
      if (!api) return;
      clearConvFindHighlights();
      const ranges = [];
      for (let i = 0; i < convFindMatches.length; i++) {
        if (convFindMatches[i].range) ranges.push(convFindMatches[i].range);
      }
      if (ranges.length) {
        try {
          api.highlights.set(FIND_HL_MATCH, new api.HighlightCtor(...ranges));
        } catch {}
      }
      const act = convFindIdx >= 0 && convFindIdx < convFindMatches.length ? convFindMatches[convFindIdx] : null;
      if (act?.range) {
        try {
          api.highlights.set(FIND_HL_ACTIVE, new api.HighlightCtor(act.range));
        } catch {}
      }
    }

    function scrollMatchIntoView(match) {
      if (!match) return;
      if (convFindScrollFixTimer) {
        clearTimeout(convFindScrollFixTimer);
        convFindScrollFixTimer = 0;
      }
      const target = match.anchorEl || match.turnEl;
      const conv = findConvView();
      const vp = findConvViewport(conv, target);

      const getRect = () => {
        if (match.range && typeof match.range.getBoundingClientRect === 'function') {
          try {
            const r = match.range.getBoundingClientRect();
            if (r && (r.height > 0 || r.width > 0)) return r;
          } catch {}
        }
        if (target && typeof target.getBoundingClientRect === 'function') {
          try {
            const r = target.getBoundingClientRect();
            if (r && (r.height > 0 || r.width > 0)) return r;
          } catch {}
        }
        return null;
      };

      const centerInViewport = (smooth) => {
        const rr = getRect();
        const vr = vp?.getBoundingClientRect?.();
        if (vp && rr && vr && vr.height > 0) {
          const top = Math.max(0, Math.round((vp.scrollTop || 0) + (rr.top - vr.top) - vr.height * 0.36));
          if (typeof vp.scrollTo === 'function') vp.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
          else vp.scrollTop = top;
          return true;
        }
        if (typeof target?.scrollIntoView === 'function') {
          try {
            target.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
          } catch {}
          return true;
        }
        return false;
      };

      centerInViewport(false);
      // Re-center once after off-screen content-visibility:auto turns lay out their real height
      if (typeof setTimeout === 'function' && vp && typeof target?.getBoundingClientRect === 'function') {
        convFindScrollFixTimer = setTimeout(() => {
          convFindScrollFixTimer = 0;
          if (isDead() || !convFindOpen || target.isConnected === false) return;
          const rr = getRect();
          const vr = vp.getBoundingClientRect?.();
          if (rr && vr && vr.height > 0 && (rr.bottom < vr.top + 12 || rr.top > vr.bottom - 12)) {
            centerInViewport(true);
          }
        }, 55);
      }
      pulseFindSonar(match.turnEl || target);
    }

    function updateConvFindStatusUi(invalidRegex = false) {
      if (!convFindCountEl) return;
      const q = String(convFindInput?.value || '');
      const total = convFindMatches.length;
      if (convFindField) setA(convFindField, 'data-invalid', invalidRegex ? '1' : '0');
      if (convFindScanning) {
        convFindCountEl.textContent = getUiText('convFindScanning', 'Loading...');
        ra(convFindCountEl, 'data-empty');
      } else if (invalidRegex) {
        convFindCountEl.textContent = getUiText('convFindInvalid', 'Invalid regex');
        setA(convFindCountEl, 'data-empty', '1');
      } else if (!q) {
        convFindCountEl.textContent = '';
        ra(convFindCountEl, 'data-empty');
      } else if (total === 0) {
        convFindCountEl.textContent = getUiText('convFindEmpty', 'No results');
        setA(convFindCountEl, 'data-empty', '1');
      } else {
        convFindCountEl.textContent = `${convFindIdx + 1}/${total}`;
        ra(convFindCountEl, 'data-empty');
      }
      if (convFindEarlierBtn) {
        const vp = findConvViewport(findConvView());
        const canScan = Boolean(q) && !invalidRegex && (total === 0 || (vp && Number(vp.scrollTop || 0) > 16) || convFindScanning);
        convFindEarlierBtn.hidden = !canScan;
        setA(convFindEarlierBtn, 'data-scanning', convFindScanning ? '1' : '0');
        setA(convFindEarlierBtn, 'aria-pressed', convFindScanning ? 'true' : 'false');
      }
      const dis = total === 0 || convFindScanning;
      if (convFindPrevBtn) convFindPrevBtn.disabled = dis;
      if (convFindNextBtn) convFindNextBtn.disabled = dis;
    }

    function refreshConvFindLocale() {
      if (!convFindRoot) return;
      if (convFindInput) convFindInput.placeholder = getUiText('convFindPh', 'Find in conversation...');
      if (convFindCaseBtn) convFindCaseBtn.title = getUiText('convFindCase', 'Match Case (Aa)');
      if (convFindWordBtn) convFindWordBtn.title = getUiText('convFindWord', 'Match Whole Word (ab)');
      if (convFindRegexBtn) convFindRegexBtn.title = getUiText('convFindRegex', 'Use Regular Expression (.*)');
      if (convFindEarlierBtn) {
        convFindEarlierBtn.textContent = getUiText('convFindEarlier', '↑Earlier');
        const tip = getUiText('convFindEarlierTip', 'Scroll up to load earlier history & find');
        convFindEarlierBtn.title = tip;
        sa(convFindEarlierBtn, 'aria-label', tip);
      }
      if (convFindPrevBtn) {
        const lbl = getUiText('convFindPrev', 'Previous Match');
        convFindPrevBtn.title = lbl;
        sa(convFindPrevBtn, 'aria-label', lbl);
      }
      if (convFindNextBtn) {
        const lbl = getUiText('convFindNext', 'Next Match');
        convFindNextBtn.title = lbl;
        sa(convFindNextBtn, 'aria-label', lbl);
      }
      if (convFindCloseBtn) {
        const lbl = getUiText('convFindClose', 'Close (Esc)');
        convFindCloseBtn.title = lbl;
        sa(convFindCloseBtn, 'aria-label', lbl);
      }
      updateConvFindStatusUi(ga(convFindField, 'data-invalid') === '1');
    }

    function ensureConvFindUi(conv) {
      if (!doc || !doc.createElement) return null;
      const mountParent = conv || doc.body;
      if (!mountParent) return null;
      if (!convFindRoot) {
        const input = mk('input', 'ag-cs-conv-find-input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;

        const mkOpt = (txt, key) => {
          const b = mk('button', 'ag-cs-conv-find-opt', txt);
          b.type = 'button';
          sa(b, 'aria-pressed', 'false');
          sa(b, 'data-no-press-spring', '1');
          b.addEventListener('click', (ev) => {
            ev?.preventDefault?.();
            ev?.stopPropagation?.();
            convFindOpts[key] = !convFindOpts[key];
            sa(b, 'aria-pressed', convFindOpts[key] ? 'true' : 'false');
            runConvFind(true);
            convFindInput?.focus?.();
          });
          return b;
        };

        const caseBtn = mkOpt('Aa', 'matchCase');
        const wordBtn = mkOpt('ab', 'wholeWord');
        const regexBtn = mkOpt('.*', 'regex');
        const field = mk('div', 'ag-cs-conv-find-field', null, input, caseBtn, wordBtn, regexBtn);
        const countEl = mk('span', 'ag-cs-conv-find-count');

        const earlierBtn = mk('button', 'ag-cs-conv-find-earlier');
        earlierBtn.type = 'button';
        earlierBtn.hidden = true;
        sa(earlierBtn, 'data-no-press-spring', '1');
        earlierBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          if (convFindScanning) cancelEarlierScan(true);
          else scanConvFindEarlier();
        });

        const prevBtn = mk('button', 'ag-cs-conv-find-nav', null, mkSvgIcon('chevUp', 13));
        prevBtn.type = 'button';
        sa(prevBtn, 'data-no-press-spring', '1');
        prevBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          stepConvFind(-1);
        });

        const nextBtn = mk('button', 'ag-cs-conv-find-nav', null, mkSvgIcon('chevDown', 13));
        nextBtn.type = 'button';
        sa(nextBtn, 'data-no-press-spring', '1');
        nextBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          stepConvFind(1);
        });

        const closeBtn = mk('button', 'ag-cs-conv-find-nav', null, mkSvgIcon('close', 13));
        closeBtn.type = 'button';
        sa(closeBtn, 'data-no-press-spring', '1');
        closeBtn.addEventListener('click', (ev) => {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
          closeConvFind(true);
        });

        const rootBar = markNoTrOwned(
          mk('div', 'ag-cs-conv-find', null, field, countEl, earlierBtn, prevBtn, nextBtn, closeBtn)
        );
        sa(rootBar, 'role', 'search');
        rootBar.hidden = true;

        input.addEventListener('compositionstart', () => {
          convFindComposing = true;
        });
        input.addEventListener('compositionend', () => {
          convFindComposing = false;
          cancelEarlierScan(false);
          runConvFind(true);
        });
        input.addEventListener('input', () => {
          if (convFindComposing) return;
          cancelEarlierScan(false);
          if (convFindDebounceTimer) clearTimeout(convFindDebounceTimer);
          convFindDebounceTimer = setTimeout(() => {
            convFindDebounceTimer = 0;
            if (!isDead() && convFindOpen) runConvFind(true);
          }, 24);
        });
        rootBar.addEventListener('keydown', (ev) => {
          if (!ev) return;
          if (ev.key === 'Escape') {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            if (convFindScanning) cancelEarlierScan(true);
            else closeConvFind(true);
          } else if (ev.key === 'Enter' || ev.key === 'F3') {
            ev.preventDefault?.();
            ev.stopPropagation?.();
            if (convFindDebounceTimer) {
              clearTimeout(convFindDebounceTimer);
              convFindDebounceTimer = 0;
              runConvFind(true);
            } else if (convFindMatches.length === 0 && convFindInput?.value && !ev.shiftKey) {
              scanConvFindEarlier();
            } else {
              stepConvFind(ev.shiftKey ? -1 : 1);
            }
          }
        });

        convFindRoot = rootBar;
        convFindField = field;
        convFindInput = input;
        convFindCountEl = countEl;
        convFindCaseBtn = caseBtn;
        convFindWordBtn = wordBtn;
        convFindRegexBtn = regexBtn;
        convFindEarlierBtn = earlierBtn;
        convFindPrevBtn = prevBtn;
        convFindNextBtn = nextBtn;
        convFindCloseBtn = closeBtn;
      }

      if (convFindRoot.parentElement !== mountParent) {
        mut(() => {
          if (mountParent === doc.body) sa(convFindRoot, 'data-ag-find-fixed', '1');
          else ra(convFindRoot, 'data-ag-find-fixed');
          mountParent.appendChild(convFindRoot);
        });
      }
      refreshConvFindLocale();
      return convFindRoot;
    }

    function cancelEarlierScan(refreshUi = true) {
      convFindScanSeq++;
      if (convFindScanTimer) {
        clearTimeout(convFindScanTimer);
        convFindScanTimer = 0;
      }
      const was = convFindScanning;
      convFindScanning = false;
      if (was && refreshUi) updateConvFindStatusUi(false);
      return was;
    }

    function emitScrollEvent(vp) {
      if (!vp || typeof vp.dispatchEvent !== 'function') return;
      try {
        if (typeof win?.Event === 'function') vp.dispatchEvent(new win.Event('scroll'));
        else vp.dispatchEvent({ type: 'scroll' });
      } catch {}
    }

    function getTopContentSig(conv) {
      const vp = findConvViewport(conv);
      const first = vp?.firstElementChild || conv?.firstElementChild;
      return `${Number(vp?.scrollHeight || 0)}:${String(first?.textContent || '').slice(0, 64)}`;
    }

    function scanConvFindEarlier() {
      if (isDead() || !convFindOpen) return false;
      const q = String(convFindInput?.value || '');
      if (!q || ga(convFindField, 'data-invalid') === '1') return false;
      const conv = findConvView();
      const vp = findConvViewport(conv);
      if (!conv || !vp) return false;

      cancelEarlierScan(false);
      const mySeq = ++convFindScanSeq;
      convFindScanning = true;
      updateConvFindStatusUi(false);

      const initialCount = convFindMatches.length;
      const initialKeys = new Set(
        convFindMatches.map((m) => String(m.turnEl?.textContent || m.anchorEl?.textContent || '').slice(0, 120))
      );
      const savedTop = Number(vp.scrollTop || 0);
      let hops = 0;
      let idleAtTop = 0;
      let lastSig = getTopContentSig(conv);

      const finishMiss = () => {
        if (convFindScanSeq !== mySeq) return;
        convFindScanning = false;
        if (vp.isConnected !== false && initialCount === 0) {
          vp.scrollTop = savedTop;
          emitScrollEvent(vp);
        }
        runConvFind(false);
      };

      const stepScan = () => {
        convFindScanTimer = 0;
        if (isDead() || !convFindOpen || convFindScanSeq !== mySeq) return;

        const curRes = runConvFind(false);
        const foundMore =
          initialCount === 0
            ? curRes.count > 0
            : curRes.count > initialCount ||
              convFindMatches.some((m) => !initialKeys.has(String(m.turnEl?.textContent || m.anchorEl?.textContent || '').slice(0, 120)));
        if (foundMore) {
          convFindScanning = false;
          convFindIdx = 0;
          applyConvFindHighlights();
          updateConvFindStatusUi(false);
          if (convFindMatches[0]) scrollMatchIntoView(convFindMatches[0]);
          return;
        }

        if (++hops > 45) {
          finishMiss();
          return;
        }

        const curTop = Number(vp.scrollTop || 0);
        if (curTop > 2) {
          const chunk = Math.max(480, Math.round(Number(vp.clientHeight || 600) * 0.85));
          vp.scrollTop = Math.max(0, curTop - chunk);
          emitScrollEvent(vp);
          idleAtTop = 0;
          lastSig = getTopContentSig(conv);
          convFindScanTimer = setTimeout(stepScan, 160);
          return;
        }

        // At top (scrollTop === 0): wait for host history paginator to prepend older turns
        const nextSig = getTopContentSig(conv);
        if (nextSig !== lastSig) {
          lastSig = nextSig;
          idleAtTop = 0;
          convFindScanTimer = setTimeout(stepScan, 180);
          return;
        }
        if (++idleAtTop >= 3) {
          finishMiss();
          return;
        }
        emitScrollEvent(vp);
        convFindScanTimer = setTimeout(stepScan, 260);
      };

      convFindScanTimer = setTimeout(stepScan, 16);
      return true;
    }

    function runConvFind(scrollToActive = true) {
      if (isDead()) return { count: 0, idx: -1 };
      const conv = findConvView();
      if (!conv) {
        convFindMatches = [];
        convFindIdx = -1;
        clearConvFindHighlights();
        updateConvFindStatusUi(false);
        return { count: 0, idx: -1 };
      }
      convFindLastCid = readActiveCascadeId(conv);
      const q = String(convFindInput?.value || '');
      if (!q) {
        convFindMatches = [];
        convFindIdx = -1;
        clearConvFindHighlights();
        updateConvFindStatusUi(false);
        return { count: 0, idx: -1 };
      }
      const blocks = collectConversationBlocks(conv);
      const { matches, invalidRegex } = executeFindQuery(blocks, q);
      convFindMatches = matches;
      convFindIdx = matches.length ? 0 : -1;
      applyConvFindHighlights();
      updateConvFindStatusUi(invalidRegex);
      if (scrollToActive && convFindIdx >= 0) {
        scrollMatchIntoView(convFindMatches[convFindIdx]);
      }
      return { count: convFindMatches.length, idx: convFindIdx };
    }

    function stepConvFind(delta = 1) {
      if (isDead() || !convFindOpen) return false;
      if (!convFindMatches.length) {
        if (convFindInput?.value) {
          const r = runConvFind(true);
          if (r.count === 0 && delta >= 0) return scanConvFindEarlier();
          return r.count > 0;
        }
        return false;
      }
      const n = convFindMatches.length;
      convFindIdx = ((convFindIdx < 0 ? 0 : convFindIdx) + delta + n * 4) % n;
      applyConvFindHighlights();
      updateConvFindStatusUi(false);
      scrollMatchIntoView(convFindMatches[convFindIdx]);
      return true;
    }

    function openConvFind() {
      if (isDead()) return false;
      const conv = findConvView();
      if (!conv) return false;
      ensureStyleMounted();
      closeDiffContextMenu();
      const activeEl = doc?.activeElement;
      if (activeEl && (!convFindRoot || !convFindRoot.contains?.(activeEl))) {
        convFindPrevFocus = activeEl;
      }
      const bar = ensureConvFindUi(conv);
      if (!bar) return false;
      convFindOpen = true;
      mut(() => {
        bar.hidden = false;
      });
      try {
        const sel = String(win?.getSelection?.() || '').trim();
        if (sel && sel.length <= 120 && !/[\r\n]/.test(sel)) {
          if (!convFindRoot.contains?.(activeEl)) {
            convFindInput.value = sel;
          }
        }
      } catch {}
      try {
        convFindInput?.focus?.({ preventScroll: true });
        convFindInput?.select?.();
      } catch {}
      if (convFindInput?.value) runConvFind(true);
      else updateConvFindStatusUi(false);
      return true;
    }

    function closeConvFind(restoreFocus = false) {
      cancelEarlierScan(false);
      if (convFindDebounceTimer) {
        clearTimeout(convFindDebounceTimer);
        convFindDebounceTimer = 0;
      }
      if (convFindScrollFixTimer) {
        clearTimeout(convFindScrollFixTimer);
        convFindScrollFixTimer = 0;
      }
      convFindOpen = false;
      convFindComposing = false;
      convFindMatches = [];
      convFindIdx = -1;
      clearConvFindHighlights();
      clearConvFindSonar();
      if (convFindRoot) {
        mut(() => {
          convFindRoot.hidden = true;
        });
      }
      if (restoreFocus && convFindPrevFocus && convFindPrevFocus.isConnected !== false) {
        try {
          convFindPrevFocus.focus?.({ preventScroll: true });
        } catch {}
      }
      if (!restoreFocus) convFindPrevFocus = null;
      return true;
    }

    function syncConvFindState() {
      if (!convFindOpen) return;
      const conv = findConvView();
      if (!conv) {
        closeConvFind(false);
        return;
      }
      ensureConvFindUi(conv);
      const cid = readActiveCascadeId(conv);
      if (cid !== convFindLastCid) {
        convFindLastCid = cid;
        if (convFindInput?.value) runConvFind(false);
        else {
          convFindMatches = [];
          convFindIdx = -1;
          clearConvFindHighlights();
          updateConvFindStatusUi(false);
        }
      }
    }

    function onWinKeyDownCapture(ev) {
      try {
        if (isDead() || !ev) return;
        const isFindHotkey =
          (ev.ctrlKey || ev.metaKey) &&
          ev.shiftKey &&
          !ev.altKey &&
          (ev.key === 'f' || ev.key === 'F' || ev.code === 'KeyF');
        if (isFindHotkey) {
          const conv = findConvView();
          if (conv) {
            const tgtDlg = ev.target?.closest?.('[role="dialog"]');
            if (!tgtDlg || (convFindRoot && convFindRoot.contains?.(ev.target))) {
              if (openConvFind()) {
                ev.preventDefault?.();
                ev.stopPropagation?.();
              }
            }
          }
          return;
        }
        if (ev.key === 'F3' && convFindOpen) {
          ev.preventDefault?.();
          ev.stopPropagation?.();
          stepConvFind(ev.shiftKey ? -1 : 1);
          return;
        }
        if (ev.key === 'Escape' && diffCtxMenuEl) {
          if (closeDiffContextMenu()) {
            ev.preventDefault?.();
            ev.stopPropagation?.();
          }
          return;
        }
        if (ev.key === 'Escape' && convFindOpen) {
          closeConvFind(true);
          ev.preventDefault?.();
          ev.stopPropagation?.();
        }
      } catch {}
    }

    function onWinPointerOver(ev) {
      try {
        const t = ev?.target;
        if (isDead() || !t?.closest) return;
        if (typeof win?.__agPrismInlineDiffCall !== 'function' || cl(t, '.ag-cs-inline-diff-box')) {
          clearHoverPrefetchTimer();
          return;
        }
        const db = resolveDiffBadgeFromTarget(t);
        if (!db || ga(db, 'data-ag-inline-diff-open') === '1') {
          clearHoverPrefetchTimer();
          return;
        }
        clearHoverPrefetchTimer();
        inlineDiffHoverTimer = setTimeout(() => {
          inlineDiffHoverTimer = 0;
          if (isDead() || db.isConnected === false) return;
          const p = extractInlineDiffPayload(db, null);
          if (p.uri && !p.lines.length) {
            requestInlineDiffFromDaemon(p.uri, { additions: p.additions || 0, deletions: p.deletions || 0 });
          }
        }, 110);
      } catch {}
    }

    function onWinPointerOut(ev) {
      try {
        if (!inlineDiffHoverTimer) return;
        const rel = ev?.relatedTarget;
        if (!rel || !rel.closest || !resolveDiffBadgeFromTarget(rel)) {
          clearHoverPrefetchTimer();
        }
      } catch {}
    }

    function onWinScrollCapture(ev) {
      try {
        if (!diffCtxMenuEl) return;
        const t = ev?.target;
        if (t && diffCtxMenuEl.contains?.(t)) return;
        closeDiffContextMenu();
      } catch {}
    }

    function onWinBlurOrResize() {
      try {
        if (diffCtxMenuEl) closeDiffContextMenu();
      } catch {}
    }

    function onCtxOpenBus(ev) {
      try {
        if (ev?.detail?.source !== 'inline-diff') {
          closeDiffContextMenu();
        }
      } catch {}
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('click', onDocClickCapture, true);
      win.addEventListener('pointerdown', onWinPointerDownCapture, true);
      win.addEventListener('contextmenu', onWinContextMenu, true);
      win.addEventListener('keydown', onWinKeyDownCapture, true);
      win.addEventListener('pointerover', onWinPointerOver, { passive: true });
      win.addEventListener('pointerout', onWinPointerOut, { passive: true });
      win.addEventListener('scroll', onWinScrollCapture, true);
      win.addEventListener('blur', onWinBlurOrResize);
      win.addEventListener('resize', onWinBlurOrResize);
      win.addEventListener('ag-prism:ctx-open', onCtxOpenBus);
    }

    ensureStyleMounted();

    function bindHooks(hooks) {
      if (!hooks || typeof hooks !== 'object') return;
      if (typeof hooks.t === 'function') hookTFn = hooks.t;
      if (typeof hooks.getLang === 'function') hookGetLang = hooks.getLang;
      if (typeof hooks.runGuardedMut === 'function') hookMut = hooks.runGuardedMut;
      if (typeof hooks.setAttrIfChanged === 'function') hookSetA = hooks.setAttrIfChanged;
    }

    function unbindHooks() {
      hookTFn = baseTFn;
      hookGetLang = baseGetLang;
      hookMut = baseMut;
      hookSetA = baseSetA;
    }

    function sync(cfg, hooks) {
      if (isDead()) return;
      if (cfg && typeof cfg === 'object') {
        currentConfig = { ...currentConfig, ...cfg };
      }
      if (hooks && typeof hooks === 'object') {
        bindHooks(hooks);
      }
      ensureStyleMounted();
      syncInlineDiffChips();
      syncConvFindState();
      refreshConvFindLocale();
    }

    function closeMenuIfOpen() {
      return closeDiffContextMenu();
    }

    function getDebugState() {
      return {
        inlineDiffToggleCount: stats.inlineDiffToggleCount,
        cacheSize: inlineDiffCache.size,
        pendingSize: inlineDiffPending.size,
        menuOpen: Boolean(diffCtxMenuEl),
        styleMounted: Boolean(doc?.getElementById?.(INLINE_DIFF_STYLE_ID)),
        findOpen: Boolean(convFindOpen),
        findMatchCount: convFindMatches.length,
        findIndex: convFindIdx,
        destroyed: Boolean(localDestroyed),
      };
    }

    function destroy() {
      if (localDestroyed) return;
      localDestroyed = true;
      for (const tid of inlineDiffAnimTimers) clearTimeout(tid);
      inlineDiffAnimTimers.clear();
      clearHoverPrefetchTimer();
      if (chipSyncDebounceTimer) {
        clearTimeout(chipSyncDebounceTimer);
        chipSyncDebounceTimer = 0;
      }
      closeDiffContextMenu();
      closeConvFind(false);
      convFindRoot = null;
      convFindField = null;
      convFindInput = null;
      convFindCountEl = null;
      convFindCaseBtn = null;
      convFindWordBtn = null;
      convFindRegexBtn = null;
      convFindEarlierBtn = null;
      convFindPrevBtn = null;
      convFindNextBtn = null;
      convFindCloseBtn = null;
      for (const entry of inlineDiffPending.values()) {
        if (entry?.timer) clearTimeout(entry.timer);
        try {
          entry?.resolve?.(null);
        } catch {}
      }
      inlineDiffPending.clear();
      inlineDiffInflight.clear();
      inlineDiffCache.clear();
      if (win && win.__agPrismInlineDiffResolve === onInlineDiffResolve) {
        try {
          delete win.__agPrismInlineDiffResolve;
        } catch {}
      }
      if (win && typeof win.removeEventListener === 'function') {
        try {
          win.removeEventListener('click', onDocClickCapture, true);
          win.removeEventListener('pointerdown', onWinPointerDownCapture, true);
          win.removeEventListener('contextmenu', onWinContextMenu, true);
          win.removeEventListener('keydown', onWinKeyDownCapture, true);
          win.removeEventListener('pointerover', onWinPointerOver);
          win.removeEventListener('pointerout', onWinPointerOut);
          win.removeEventListener('scroll', onWinScrollCapture, true);
          win.removeEventListener('blur', onWinBlurOrResize);
          win.removeEventListener('resize', onWinBlurOrResize);
          win.removeEventListener('ag-prism:ctx-open', onCtxOpenBus);
        } catch {}
      }
      if (doc && typeof doc.querySelectorAll === 'function') {
        mut(() => {
          for (const sel of ['.ag-cs-inline-diff-box', '.ag-cs-diff-ctx-menu', '.ag-cs-conv-find']) {
            qa(doc, sel).forEach((n) => n.remove());
          }
          qa(doc, '[data-testid="diff-line-count"], [data-ag-diff-chip-file="1"]').forEach((el) => {
            if (el._agOrigTooltipId) {
              sa(el, 'data-tooltip-id', el._agOrigTooltipId);
              delete el._agOrigTooltipId;
            }
            delete el._agSyncedTxt;
            delete el._agSyncedChip;
          });
          for (const k of 'diff-chip|diff-chip-file|diff-chip-row|diff-stat|inline-diff-open|inline-diff-host|diff-anim|diff-state|cs-inline-diff|find-sonar|find-fixed'.split(
            '|'
          )) {
            const a = 'data-ag-' + k;
            qa(doc, `[${a}]`).forEach((el) => ra(el, a));
          }
        });
      }
      mut(() => {
        try {
          const st = (typeof doc?.getElementById === 'function' ? doc.getElementById(INLINE_DIFF_STYLE_ID) : null) || styleEl;
          st?.remove?.();
        } catch {}
      });
      styleEl = null;
      unbindHooks();
      if (win && win.__agPrismInlineDiff === selfApi) {
        try {
          delete win.__agPrismInlineDiff;
        } catch {}
      }
      if (G && G.__agPrismInlineDiff === selfApi) {
        try {
          delete G.__agPrismInlineDiff;
        } catch {}
      }
    }

    selfApi = {
      sync,
      unbindHooks,
      toggleInlineDiffPreview,
      closeMenuIfOpen,
      openConvFind,
      closeConvFind,
      runConvFind,
      stepConvFind,
      scanConvFindEarlier,
      getDebugState,
      destroy,
    };
    return selfApi;
  }

  const W = typeof window !== 'undefined' ? window : G;
  const D = typeof document !== 'undefined' ? document : W?.document || null;

  if (W) {
    try {
      W.__agPrismInlineDiffFactory = createInlineDiffClient;
    } catch {}
  }
  if (G && G !== W) {
    try {
      G.__agPrismInlineDiffFactory = createInlineDiffClient;
    } catch {}
  }

  // Idempotent singleton self-mount in browser / CDP runtime (supports hot reload)
  if (W && D && typeof D.createElement === 'function') {
    try {
      W.__agPrismInlineDiff?.destroy?.();
    } catch {}
    try {
      const inst = createInlineDiffClient({ win: W, doc: D });
      W.__agPrismInlineDiff = inst;
      if (G && G !== W) G.__agPrismInlineDiff = inst;
      inst.sync();
    } catch {}
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      STYLE_ID: INLINE_DIFF_STYLE_ID,
      INLINE_DIFF_CSS,
      parseUnifiedDiffLines,
      buildPairDiffLines,
      createInlineDiffClient,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
