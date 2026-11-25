import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');
const cdp = require(path.join(ROOT, 'cdp.js'));
const inlineDiffMod = require(path.join(ROOT, 'vendor', 'inline-diff', 'inline-diff-client.js'));

function createRichMockEnv() {
  const winListeners = new Map();
  const makeTextNode = (val) => ({
    nodeType: 3,
    nodeValue: String(val ?? ''),
    get textContent() { return this.nodeValue; },
    set textContent(v) { this.nodeValue = String(v ?? ''); },
    parentElement: null,
    parentNode: null,
    childNodes: [],
    children: [],
  });

  const makeEl = (tag, attrs = {}, rect = null) => {
    const attrMap = new Map(Object.entries(attrs));
    const elListeners = new Map();
    const childNodes = [];
    let clsSet = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));

    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes,
      get children() { return childNodes.filter((c) => c.nodeType === 1); },
      parentElement: null,
      parentNode: null,
      scrollTop: 0,
      value: '',
      hidden: false,
      disabled: false,
      focused: false,
      selectedAll: false,
      style: {},
      get id() { return attrMap.get('id') || ''; },
      set id(v) { if (v) attrMap.set('id', String(v)); else attrMap.delete('id'); },
      get className() { return Array.from(clsSet).join(' '); },
      set className(v) {
        clsSet = new Set(String(v || '').split(/\s+/).filter(Boolean));
        if (this.className) attrMap.set('class', this.className);
        else attrMap.delete('class');
      },
      classList: {
        add(...cs) { for (const c of cs) if (c) clsSet.add(c); attrMap.set('class', el.className); },
        remove(...cs) { for (const c of cs) clsSet.delete(c); attrMap.set('class', el.className); },
        contains(c) { return clsSet.has(c); },
      },
      get textContent() {
        return childNodes.map((c) => c.textContent).join('');
      },
      set textContent(v) {
        childNodes.length = 0;
        const s = String(v ?? '');
        if (s) {
          const tn = makeTextNode(s);
          tn.parentElement = el;
          tn.parentNode = el;
          childNodes.push(tn);
        }
      },
      setAttribute(k, v) {
        const s = String(v);
        attrMap.set(k, s);
        if (k === 'class') this.className = s;
        if (k === 'hidden') this.hidden = true;
      },
      getAttribute(k) { return attrMap.has(k) ? attrMap.get(k) : null; },
      hasAttribute(k) { return attrMap.has(k); },
      removeAttribute(k) {
        attrMap.delete(k);
        if (k === 'class') clsSet.clear();
        if (k === 'hidden') this.hidden = false;
      },
      appendChild(ch) {
        if (ch.parentNode && Array.isArray(ch.parentNode.childNodes)) {
          const idx = ch.parentNode.childNodes.indexOf(ch);
          if (idx >= 0) ch.parentNode.childNodes.splice(idx, 1);
        }
        childNodes.push(ch);
        ch.parentNode = el;
        ch.parentElement = el;
        return ch;
      },
      append(...nodes) { for (const n of nodes) this.appendChild(n); },
      remove() {
        if (el.parentNode && Array.isArray(el.parentNode.childNodes)) {
          const i = el.parentNode.childNodes.indexOf(el);
          if (i >= 0) el.parentNode.childNodes.splice(i, 1);
        }
        el.parentNode = null;
        el.parentElement = null;
      },
      get isConnected() {
        let c = el;
        while (c) {
          if (c === doc.body || c === doc.documentElement) return true;
          c = c.parentNode;
        }
        return false;
      },
      focus() { el.focused = true; doc.activeElement = el; },
      select() { el.selectedAll = true; },
      click() { el.dispatchEvent({ type: 'click', target: el, preventDefault() {}, stopPropagation() {} }); },
      scrollTo(opts) { if (opts && typeof opts.top === 'number') el.scrollTop = opts.top; },
      getBoundingClientRect() { return rect || { left: 0, top: 0, width: 700, height: 32 }; },
      addEventListener(t, fn) {
        if (!elListeners.has(t)) elListeners.set(t, new Set());
        elListeners.get(t).add(fn);
      },
      removeEventListener(t, fn) { elListeners.get(t)?.delete(fn); },
      dispatchEvent(ev) {
        const event = { target: el, preventDefault() {}, stopPropagation() {}, ...ev };
        for (const fn of Array.from(elListeners.get(event.type) || [])) fn(event);
        // Minimal bubble to ancestors for keydown inside rootBar
        let p = el.parentElement;
        while (p && event._stopped !== true) {
          p._dispatchLocal?.(event);
          p = p.parentElement;
        }
        return event;
      },
      _dispatchLocal(event) {
        for (const fn of Array.from(elListeners.get(event.type) || [])) fn(event);
      },
      matches(selList) {
        return selList.split(',').some((s) => {
          const t = s.trim();
          if (!t) return false;
          if (t.startsWith('.')) return el.classList.contains(t.slice(1));
          const am = /^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/.exec(t);
          if (am) return el.hasAttribute(am[1]) && (am[2] === undefined || el.getAttribute(am[1]) === am[2]);
          return el.tagName.toLowerCase() === t.toLowerCase();
        });
      },
      closest(selList) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (cur.matches(selList)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      contains(target) {
        let cur = target;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const res = [];
        const walk = (n) => {
          for (const ch of n.childNodes || []) {
            if (ch.nodeType === 1) {
              if (ch.matches(sel)) res.push(ch);
              walk(ch);
            }
          }
        };
        walk(el);
        return res;
      },
    };
    return el;
  };

  class MockRange {
    constructor() {
      this.startContainer = null;
      this.startOffset = 0;
      this.endContainer = null;
      this.endOffset = 0;
    }
    setStart(n, o) { this.startContainer = n; this.startOffset = o; }
    setEnd(n, o) { this.endContainer = n; this.endOffset = o; }
    getBoundingClientRect() {
      let cur = this.startContainer;
      while (cur && cur.nodeType !== 1) cur = cur.parentElement;
      return cur?.getBoundingClientRect?.() || { left: 0, top: 0, width: 100, height: 20 };
    }
  }

  class MockHighlight {
    constructor(...ranges) { this.ranges = ranges; }
  }

  const hlMap = new Map();
  const docEl = makeEl('html');
  const head = makeEl('head');
  const body = makeEl('body');
  docEl.append(head, body);

  const doc = {
    documentElement: docEl,
    head,
    body,
    activeElement: body,
    createElement: (t, attrs) => makeEl(t, attrs),
    createTextNode: makeTextNode,
    createRange: () => new MockRange(),
    getElementById: (id) => {
      const find = (n) => {
        if (n.id === id) return n;
        for (const c of n.childNodes || []) {
          if (c.nodeType === 1) {
            const hit = find(c);
            if (hit) return hit;
          }
        }
        return null;
      };
      return find(docEl);
    },
    querySelector: (s) => docEl.querySelector(s),
    querySelectorAll: (s) => docEl.querySelectorAll(s),
  };

  const win = {
    document: doc,
    CSS: { highlights: hlMap },
    Highlight: MockHighlight,
    getSelection: () => ({ toString: () => '' }),
    addEventListener(t, fn, cap) {
      if (!winListeners.has(t)) winListeners.set(t, []);
      winListeners.get(t).push({ fn, cap: Boolean(cap) });
    },
    removeEventListener(t, fn) {
      const list = winListeners.get(t);
      if (list) winListeners.set(t, list.filter((x) => x.fn !== fn));
    },
    dispatchEvent(ev) {
      const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...ev };
      for (const item of Array.from(winListeners.get(event.type) || [])) item.fn(event);
      return event;
    },
  };

  return { doc, win, body, head, docEl, hlMap, makeEl, makeTextNode };
}

test('Ctrl+Shift+F finds user message bubbles (including cross-span text & trailing pasted whitespace), agent replies, steps & cleans up', () => {
  const env = createRichMockEnv();
  const convView = env.makeEl('div', { 'data-testid': 'conversation-view', 'data-cascade-id': 'cid-find-1' }, { left: 0, top: 0, width: 900, height: 800 });
  const viewport = env.makeEl('div', { 'data-testid': 'autoscroll-viewport' }, { left: 0, top: 50, width: 900, height: 700 });
  viewport.scrollTop = 400;

  // User turn bubble matching the exact Antigravity bug scenario, split across inline spans
  const userStep = env.makeEl('div', { 'data-testid': 'user-input-step' }, { left: 40, top: -180, width: 640, height: 48 });
  const userBubble = env.makeEl('div', { 'data-testid': 'user-message-bubble' }, { left: 180, top: -180, width: 500, height: 48 });
  const userContent = env.makeEl('div', { 'data-testid': 'user-message-content' }, { left: 190, top: -175, width: 480, height: 38 });
  const sp1 = env.makeEl('span');
  sp1.textContent = '这个项目也帮我跟之前那个皮肤一样做个监控，';
  const sp2 = env.makeEl('span');
  sp2.textContent = '每两天看一下更新，如果更新的话就提示我，我来手动更新，创建一个任务。';
  userContent.append(sp1, sp2);
  userBubble.appendChild(userContent);
  userStep.appendChild(userBubble);

  // Assistant reply below
  const agentResp = env.makeEl('div', { 'data-testid': 'agent-response' }, { left: 40, top: 260, width: 700, height: 90 });
  const p = env.makeEl('p', {}, { left: 40, top: 260, width: 700, height: 24 });
  p.textContent = '已创建每两天监控任务，建议先试运行一次。';
  agentResp.appendChild(p);

  // Hidden node & composer box & nav rail (all MUST be skipped)
  const hiddenDiv = env.makeEl('div', { 'aria-hidden': 'true' });
  hiddenDiv.textContent = '每两天 hidden match';
  const inputBox = env.makeEl('div', { 'data-testid': 'agent-input-box' });
  inputBox.textContent = '每两天 composer draft';
  const navRail = env.makeEl('div', { 'data-testid': 'conversation-navigator' });
  navRail.textContent = '每两天 nav tooltip';

  viewport.append(userStep, agentResp, hiddenDiv);
  convView.append(viewport, inputBox, navRail);
  env.body.appendChild(convView);

  const ctl = inlineDiffMod.createInlineDiffClient({ win: env.win, doc: env.doc, getLang: () => 'zh-CN' });

  // Plain Ctrl+F (no shiftKey) must NOT open Obsidian Prism overlay
  const plainCtrlF = env.win.dispatchEvent({ type: 'keydown', key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: false, altKey: false, target: env.body });
  assert.equal(plainCtrlF.prevented, false);
  assert.equal(ctl.getDebugState().findOpen, false);

  // Ctrl+Shift+F opens find bar inside convView
  const prevFocusEl = env.makeEl('div');
  env.body.appendChild(prevFocusEl);
  prevFocusEl.focus();

  const shiftCtrlF = env.win.dispatchEvent({ type: 'keydown', key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true, altKey: false, target: prevFocusEl });
  assert.equal(shiftCtrlF.prevented, true);
  assert.equal(ctl.getDebugState().findOpen, true);

  const bar = convView.querySelector('.ag-cs-conv-find');
  assert.ok(bar, 'Find bar must mount in conversation-view');
  assert.equal(bar.hidden, false);
  assert.equal(bar.getAttribute('data-ag-no-i18n'), '');
  assert.equal(bar.getAttribute('data-ag-owned'), '1');

  const findInput = bar.querySelector('.ag-cs-conv-find-input');
  const countEl = bar.querySelector('.ag-cs-conv-find-count');

  // 1) Exact pasted sentence WITH trailing space (as in raw prompt history) matches user bubble!
  findInput.value = '这个项目也帮我跟之前那个皮肤一样做个监控，每两天看一下更新，如果更新的话就提示我，我来手动更新，创建一个任务。 ';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '1/1');
  assert.equal(env.hlMap.get('ag-find-match').ranges.length, 1);
  assert.equal(env.hlMap.get('ag-find-active').ranges.length, 1);
  assert.equal(userBubble.getAttribute('data-ag-find-sonar'), '1');

  // 2) Short query '每两天' matches BOTH user bubble (#1) and assistant reply (#2), skipping hidden/composer/nav!
  findInput.value = '每两天';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '1/2');
  assert.equal(ctl.getDebugState().findMatchCount, 2);

  // Step forward via Enter -> jumps to assistant reply (#2) and back via Shift+Enter -> #1
  bar.dispatchEvent({ type: 'keydown', key: 'Enter', target: findInput, preventDefault() {}, stopPropagation() {} });
  assert.equal(countEl.textContent, '2/2');
  assert.equal(agentResp.getAttribute('data-ag-find-sonar'), '1');

  bar.dispatchEvent({ type: 'keydown', key: 'Enter', shiftKey: true, target: findInput, preventDefault() {}, stopPropagation() {} });
  assert.equal(countEl.textContent, '1/2');

  // 3) Case / Whole Word / Regex toggles
  sp1.textContent = 'Monitor first ';
  sp2.textContent = 'then monitor once';
  p.textContent = 'Check MonitorApi details';
  findInput.value = 'Monitor';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '1/3'); // Monitor, monitor, MonitorApi

  const [caseBtn, wordBtn, regexBtn] = bar.querySelectorAll('.ag-cs-conv-find-opt');
  caseBtn.click(); // Match Case ON -> drops lowercase 'monitor' -> 2 hits (Monitor, MonitorApi)
  assert.equal(countEl.textContent, '1/2');
  wordBtn.click(); // Whole Word ON -> drops MonitorApi -> 1 hit (Monitor)
  assert.equal(countEl.textContent, '1/1');
  caseBtn.click();
  wordBtn.click();

  // Regex toggle & invalid regex handling
  regexBtn.click();
  findInput.value = '[invalid(';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '正则无效');
  assert.equal(countEl.getAttribute('data-empty'), '1');
  findInput.value = 'Monitor(?!Api)';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '1/2'); // Monitor, monitor (skips MonitorApi)
  regexBtn.click();

  // IME composition guard must defer search until compositionend
  sp1.textContent = '中文输入法测试词 ';
  sp2.textContent = '';
  p.textContent = 'done';
  findInput.value = '每两天';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '无结果');
  findInput.dispatchEvent({ type: 'compositionstart', target: findInput });
  findInput.value = '输入法';
  findInput.dispatchEvent({ type: 'input', target: findInput });
  assert.equal(countEl.textContent, '无结果');
  findInput.dispatchEvent({ type: 'compositionend', target: findInput });
  assert.equal(countEl.textContent, '1/1');

  // 4) Escape closes, clears highlights & sonar, restores focus
  const escEv = env.win.dispatchEvent({ type: 'keydown', key: 'Escape', target: findInput });
  assert.equal(escEv.prevented, true);
  assert.equal(ctl.getDebugState().findOpen, false);
  assert.equal(env.hlMap.has('ag-find-match'), false);
  assert.equal(env.hlMap.has('ag-find-active'), false);
  assert.equal(env.doc.activeElement, prevFocusEl);

  // 5) Open again + verify full destroy cleanup + INLINE_DIFF_REMOVE_EXPRESSION includes ag-find cleanup
  ctl.openConvFind();
  assert.equal(ctl.getDebugState().findOpen, true);
  ctl.destroy();
  assert.equal(convView.querySelector('.ag-cs-conv-find'), null);
  assert.equal(env.hlMap.has('ag-find-match'), false);
  assert.equal(env.hlMap.has('ag-find-active'), false);

  assert.doesNotThrow(() => new vm.Script(cdp.INLINE_DIFF_REMOVE_EXPRESSION));
  assert.ok(cdp.INLINE_DIFF_REMOVE_EXPRESSION.includes('ag-find-match'));
  assert.ok(cdp.REMOVE_EXPRESSION.includes('ag-find-active'));
  assert.ok(Buffer.byteLength(cdp.buildInjectExpression(cdp.DEFAULT_CONFIG), 'utf8') < 549500);
});

test('Ctrl+Shift+F scans through display:contents / checkVisibility=false subtrees and upward history paging loads unloaded earlier turns', async () => {
  const env = createRichMockEnv();
  const convView = env.makeEl('div', { 'data-testid': 'conversation-view', 'data-cascade-id': 'cid-long-1' }, { left: 0, top: 0, width: 900, height: 800 });
  const viewport = env.makeEl('div', { 'data-testid': 'autoscroll-viewport' }, { left: 0, top: 50, width: 900, height: 700 });
  viewport.clientHeight = 700;
  viewport.scrollHeight = 5000;
  viewport.scrollTop = 1200;

  // Off-screen wrapper where checkVisibility() returns false (e.g. display:contents or content-visibility:auto ancestor)
  const contentsWrap = env.makeEl('div', { style: 'display:contents' });
  contentsWrap.checkVisibility = () => false;
  const offscreenBubble = env.makeEl('div', { 'data-testid': 'user-message-bubble' }, { left: 100, top: -900, width: 500, height: 40 });
  offscreenBubble.textContent = '较早但仍在DOM的离屏提问词';
  contentsWrap.appendChild(offscreenBubble);

  const curReply = env.makeEl('div', { 'data-testid': 'agent-response' }, { left: 40, top: 260, width: 700, height: 60 });
  curReply.textContent = '当前屏幕可见的最新回复内容';
  viewport.append(contentsWrap, curReply);
  convView.appendChild(viewport);
  env.body.appendChild(convView);

  // Simulate lazy history loading when scrolling viewport to top
  let olderLoaded = false;
  viewport.addEventListener('scroll', () => {
    if (!olderLoaded && viewport.scrollTop === 0) {
      olderLoaded = true;
      const olderTurn = env.makeEl('div', { 'data-testid': 'user-message-bubble' }, { left: 100, top: 120, width: 520, height: 42 });
      olderTurn.textContent = '更早期被分页卸载的历史提问气泡';
      viewport.childNodes.unshift(olderTurn);
      olderTurn.parentNode = viewport;
      olderTurn.parentElement = viewport;
      viewport.scrollHeight = 6400;
    }
  });

  const ctl = inlineDiffMod.createInlineDiffClient({ win: env.win, doc: env.doc, getLang: () => 'zh-CN' });
  ctl.openConvFind();
  const bar = convView.querySelector('.ag-cs-conv-find');
  const findInput = bar.querySelector('.ag-cs-conv-find-input');
  const countEl = bar.querySelector('.ag-cs-conv-find-count');

  // 1) Even though checkVisibility() returns false on contentsWrap, mounted DOM search finds it immediately!
  findInput.value = '离屏提问词';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '1/1');

  // 2) Unloaded earlier turn is NOT in initial DOM, pressing Enter / scanConvFindEarlier scrolls up & loads it!
  findInput.value = '被分页卸载的历史提问气泡';
  ctl.runConvFind(true);
  assert.equal(countEl.textContent, '无结果');

  const earlierBtn = bar.querySelector('.ag-cs-conv-find-earlier');
  assert.equal(earlierBtn.hidden, false);
  ctl.scanConvFindEarlier();

  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(olderLoaded, true);
  assert.equal(countEl.textContent, '1/1');
  assert.equal(ctl.getDebugState().findMatchCount, 1);

  ctl.destroy();
});
