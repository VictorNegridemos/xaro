/**
 * Weapon creator golden-file generator (Phase 1-D baseline).
 *
 * HOW TO RUN (from the repo root, against the ORIGINAL pre-overhaul source tree):
 *     node docs/overhaul/baseline/generate-weapon-golden.mjs
 * Writes docs/overhaul/baseline/weapon-creator-golden.json (deterministic, no timestamps).
 * Optional: pass an output path as first argument to write somewhere else (e.g. to diff).
 *
 * METHOD: real render, not a re-implementation.
 *   - src/components/WeaponCreator/WeaponCreator.js is read from disk UNMODIFIED and transpiled
 *     in memory with sucrase (JSX + ESM->CJS only; no logic is touched).
 *   - It is mounted with the real react / react-dom (createRoot) into a jsdom document.
 *   - State is driven ONLY through the component's own event handlers: native `change` events
 *     on the four <select>s and a native click on the checkbox.
 *   - Outputs are read back from the rendered DOM (the five <p> lines of the result section).
 *   Two imports are stubbed, neither contains weapon logic:
 *     ./WeaponCreator.module.css -> identity proxy (styles.foo === "foo")
 *     ../Button/Button           -> <a href="#">{text}</a>  (the real one needs the Next app router)
 *
 * Needs (all present in the pre-overhaul node_modules): react, react-dom, jsdom, sucrase.
 * jsdom and sucrase are transitive deps of react-scripts, so after the dependency clean-up this
 * script may no longer run; the JSON it produced is the frozen baseline.
 *
 * FILE FORMAT: see the "format" key at the top of the generated JSON and
 * docs/overhaul/01-investigation-weapon-creator.md.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const outFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, 'weapon-creator-golden.json');

// ---------- DOM environment ----------
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { transform } = require('sucrase');

// ---------- load the real component, unmodified ----------
const srcPath = path.join(repoRoot, 'src', 'components', 'WeaponCreator', 'WeaponCreator.js');
const source = fs.readFileSync(srcPath, 'utf8');
const compiled = transform(source, { transforms: ['jsx', 'imports'], jsxRuntime: 'classic', production: true, filePath: srcPath }).code;
const cssProxy = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : String(k)) });
const ButtonStub = ({ text }) => React.createElement('a', { href: '#', 'data-stub': 'Button' }, text);
const stubRequire = (id) => {
    if (id === 'react') return React;
    if (id.endsWith('.module.css')) return cssProxy;
    if (id === '../Button/Button') return { __esModule: true, default: ButtonStub };
    throw new Error('Unexpected import in WeaponCreator.js: ' + id);
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'React', compiled)(stubRequire, mod, mod.exports, React);
const WeaponCreator = mod.exports.default;

// ---------- driver ----------
const container = document.getElementById('root');
let root = null;
function mountFresh() {
    if (root) act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(React.createElement(WeaponCreator)));
}
const sel = (name) => container.querySelector(`select[name="${name}"]`);
const box = () => container.querySelector('input[name="smart"]');
const optionValues = (name) => Array.from(sel(name).options).map((o) => o.value);
const optionLabels = (name) => Array.from(sel(name).options).map((o) => o.textContent);
function changeSelect(name, value) {
    const node = sel(name);
    if (!optionValues(name).includes(value)) throw new Error(`No option ${value} in select ${name}`);
    act(() => {
        node.value = value;
        node.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
}
function toggleSmart() {
    act(() => box().click());
}
function apply(action) {
    if (action[0] === 'smart') toggleSmart();
    else changeSelect(action[0], action[1]);
}
function readState() {
    return {
        proficiency: sel('proficiency').value,
        style: sel('style').value,
        specialization: sel('specialization').value,
        type: sel('type').value,
        smart: box().checked,
    };
}
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
function readOutput() {
    const ps = Array.from(container.querySelectorAll('.resultsContainer p'));
    if (ps.length !== 5) throw new Error('Expected 5 result lines, got ' + ps.length);
    const raw = ps.map((p) => p.textContent);
    const labels = ['Attack:', 'Damage:', 'Range:', 'Ammo:', 'Special:'];
    raw.forEach((r, i) => { if (!r.startsWith(labels[i])) throw new Error('Unexpected line ' + r); });
    return { raw, text: raw.map(collapse) };
}
const typeLooksDisabled = () => sel('type').className.includes('disabledSelect');
const smartLooksDisabled = () => box().className.includes('disabledCheckbox');

// ---------- option lists as actually rendered ----------
mountFresh();
const initialState = readState();
const proficiencies = optionValues('proficiency');
const proficiencyLabels = Object.fromEntries(proficiencies.map((v, i) => [v, optionLabels('proficiency')[i]]));
const specializations = optionValues('specialization');
const types = optionValues('type');
const stylesByProficiency = {};
for (const p of proficiencies) {
    mountFresh();
    if (p !== initialState.proficiency) changeSelect('proficiency', p);
    stylesByProficiency[p] = optionValues('style');
}

// ---------- reachability: breadth-first search over the real component ----------
// Style is left untouched here (it never influences any output; proven below by the per-style entries).
// mode 'pointer': events on controls that carry the disabled* class (pointer-events:none) are not fired.
// mode 'any'    : every control may be operated (those controls are NOT really disabled: keyboard still works).
const keyOf = (s) => [s.proficiency, s.specialization, s.type, s.smart].join('|');
function bfs(mode) {
    const paths = new Map();
    mountFresh();
    paths.set(keyOf(readState()), []);
    const queue = [[]];
    while (queue.length) {
        const p = queue.shift();
        const actions = [
            ...proficiencies.map((v) => ['proficiency', v]),
            ...specializations.map((v) => ['specialization', v]),
            ...types.map((v) => ['type', v]),
            ['smart'],
        ];
        for (const a of actions) {
            mountFresh();
            p.forEach(apply);
            const before = readState();
            if (a[0] !== 'smart' && before[a[0]] === a[1]) continue; // a real user cannot fire change without changing
            if (mode === 'pointer' && a[0] === 'type' && typeLooksDisabled()) continue;
            if (mode === 'pointer' && a[0] === 'smart' && smartLooksDisabled()) continue;
            apply(a);
            const k = keyOf(readState());
            if (!paths.has(k)) { paths.set(k, [...p, a]); queue.push([...p, a]); }
        }
    }
    return paths;
}
const pointerPaths = bfs('pointer');
const anyPaths = bfs('any');

// ---------- golden entries: every reachable state x every style valid for its proficiency ----------
const specialRaw = {};
const entries = [];
for (const p of proficiencies) for (const st of stylesByProficiency[p]) for (const sp of specializations) for (const t of types) for (const sm of [false, true]) {
    const k = [p, sp, t, sm].join('|');
    if (!anyPaths.has(k)) continue;
    const pointer = pointerPaths.has(k);
    const pth = pointer ? pointerPaths.get(k) : anyPaths.get(k);
    mountFresh();
    pth.forEach(apply);
    // Pick the style the way a user would: if the <select> already shows it, no change event can fire.
    let styleVia = 'change-event';
    if (sel('style').value === st) styleVia = p === initialState.proficiency ? 'initial-state' : 'implicit-first-option';
    else changeSelect('style', st);
    const s = readState();
    const expect = { proficiency: p, style: st, specialization: sp, type: t, smart: sm };
    if (JSON.stringify(s) !== JSON.stringify(expect)) throw new Error('Driver did not reach ' + JSON.stringify(expect) + ' got ' + JSON.stringify(s));
    const out = readOutput();
    const [attack, damage, range, ammo, special] = out.text;
    if (!(special in specialRaw)) specialRaw[special] = out.raw[4];
    else if (specialRaw[special] !== out.raw[4]) throw new Error('raw special mismatch');
    entries.push({
        input: expect,
        reach: pointer ? 'pointer' : 'keyboard-only',
        styleVia,
        ui: { typeSelectDisabledClass: typeLooksDisabled(), smartCheckboxDisabledClass: smartLooksDisabled() },
        output: { attack, damage, range, ammo, special },
        raw: { attack: out.raw[0], damage: out.raw[1], range: out.raw[2], ammo: out.raw[3] },
    });
}

// ---------- combinations that no sequence of UI events can produce ----------
const unreachable = [];
for (const p of proficiencies) for (const sp of specializations) for (const t of types) for (const sm of [false, true]) {
    if (!anyPaths.has([p, sp, t, sm].join('|'))) unreachable.push({ proficiency: p, specialization: sp, type: t, smart: sm });
}

// ---------- odd state: style left over from the previous proficiency ----------
// React state `style` is NOT reset when proficiency changes; the <select> then has a value matching no
// option and the DOM falls back to showing the first option of the new list.
const staleStyle = [];
for (const from of proficiencies) for (const to of proficiencies) {
    if (from === to) continue;
    mountFresh();
    if (from !== initialState.proficiency) changeSelect('proficiency', from);
    const fromStyles = stylesByProficiency[from];
    const chosen = fromStyles[fromStyles.length - 1];
    let reactStyleState;
    if (sel('style').value !== chosen) { changeSelect('style', chosen); reactStyleState = chosen; }
    else reactStyleState = from === initialState.proficiency ? chosen : 'Club'; // never changed -> still the initial 'Club'
    changeSelect('proficiency', to);
    const s = readState();
    const out = readOutput();
    staleStyle.push({
        fromProficiency: from, styleChosenThere: chosen, toProficiency: to,
        reactStyleStateAfter: reactStyleState,
        styleShownInSelectAfter: s.style,
        styleOptionsAfter: optionValues('style'),
        stateAfter: s,
        output: { attack: out.text[0], damage: out.text[1], range: out.text[2], ammo: out.text[3], special: out.text[4] },
    });
}
act(() => root.unmount());

// ---------- sanity: style never changes the output ----------
const byNoStyle = new Map();
for (const e of entries) {
    const k = keyOf(e.input); const v = JSON.stringify([e.output, e.raw]);
    if (byNoStyle.has(k) && byNoStyle.get(k) !== v) throw new Error('Style influenced output at ' + k);
    byNoStyle.set(k, v);
}

// ---------- write ----------
const counts = {
    entries: entries.length,
    pointerReachable: entries.filter((e) => e.reach === 'pointer').length,
    keyboardOnly: entries.filter((e) => e.reach === 'keyboard-only').length,
    distinctStatesIgnoringStyle: byNoStyle.size,
    styleCount: Object.values(stylesByProficiency).reduce((n, a) => n + a.length, 0),
    unreachableIgnoringStyle: unreachable.length,
    unreachableTimesStyles: unreachable.reduce((n, u) => n + stylesByProficiency[u.proficiency].length, 0),
    staleStyleSamples: staleStyle.length,
};
const head = {
    format: {
        description: 'Golden output of the pre-overhaul Kodning weapon creator, produced by rendering the real component (see generate-weapon-golden.mjs).',
        entries: 'One per UI-reachable combination of proficiency x style(valid for that proficiency) x specialization x type x smart.',
        'entries[].input': 'Values of the five controls as read back from the DOM (select.value / checkbox.checked).',
        'entries[].reach': '"pointer" = reachable with mouse/touch only. "keyboard-only" = reachable only by operating the type select / smart checkbox while they carry the disabled CSS class (pointer-events:none but not really disabled, so keyboard focus + keys still change them).',
        'entries[].styleVia': '"change-event" = style picked via onChange. "initial-state" = default Club. "implicit-first-option" = the select merely shows the first option; React state still holds the stale initial "Club". Output is identical either way (style is never used in any output).',
        'entries[].ui': 'Whether the type select has the disabledSelect class and the checkbox the disabledCheckbox class.',
        'entries[].output': 'The five result lines as textContent with whitespace collapsed (runs of whitespace -> one space, trimmed). This is what a browser shows. Compare against this.',
        'entries[].raw': 'Exact textContent (not collapsed) of the four short lines; note the double space after "Attack:" when there is no laser bonus.',
        specialRaw: 'Map: collapsed special text -> exact textContent including the template-literal newlines/indentation.',
        unreachable: 'proficiency/specialization/type/smart combinations that no sequence of UI events produces (each applies to every style of that proficiency). They have no golden output.',
        staleStyle: 'Samples of the left-over-style quirk after a proficiency change.',
    },
    counts,
    initialState,
    options: { proficiencies, proficiencyLabels, stylesByProficiency, specializations, types },
};
let json = '{\n';
for (const [k, v] of Object.entries(head)) json += `${JSON.stringify(k)}: ${JSON.stringify(v, null, 1)},\n`;
json += '"specialRaw": ' + JSON.stringify(specialRaw, null, 1) + ',\n';
json += '"unreachable": [\n' + unreachable.map((u) => JSON.stringify(u)).join(',\n') + '\n],\n';
json += '"staleStyle": [\n' + staleStyle.map((u) => JSON.stringify(u)).join(',\n') + '\n],\n';
json += '"entries": [\n' + entries.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n}\n';
JSON.parse(json);
fs.writeFileSync(outFile, json);
console.log(JSON.stringify(counts, null, 1));
console.log('written', outFile);
