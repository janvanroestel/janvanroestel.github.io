/* Interactive survey data-release timeline. Reads RELEASES and LAST_REVIEWED from data/releases.js. */
(function () {
    'use strict';

    const DAY_MS = 86400000;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const LABEL_W = 150;
    const ROW_H = 36;
    const AXIS_H = 34;
    const MIN_PLOT_W = 480;
    const RANGES = {
        core: { from: '2024-01-01', to: '2027-12-31' },
        all: { from: '2024-01-01', to: '2031-01-01' },
    };
    // Notes that mark a window as approximate rather than an official range.
    const APPROX_RE = /month only|assum|our summary/i;
    const STATUS_TEXT = {
        confirmed: 'confirmed',
        target: 'target (not confirmed)',
        projected: 'projected (not confirmed)',
    };

    const state = { bands: new Set(), range: 'core', showCompleted: false };
    let today = 0;

    function dayNum(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
    }

    function todayFromUrl() {
        try {
            const v = new URLSearchParams(window.location.search).get('today');
            if (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayNum(v))) {
                return dayNum(v);
            }
        } catch (err) {
            // Malformed query string: fall back to the real date.
        }
        return Math.floor(Date.now() / DAY_MS);
    }

    function endDay(r) { return dayNum(r.end || r.start); }
    function startDay(r) { return dayNum(r.start); }
    function isCompleted(r) { return r.status === 'confirmed' && endDay(r) < today; }
    function isOverdue(r) { return r.status !== 'confirmed' && endDay(r) < today; }
    function isApprox(r) { return r.kind === 'window' && APPROX_RE.test(r.notes); }

    function passesBands(r) {
        return state.bands.size === 0 || r.bands.some((b) => state.bands.has(b));
    }

    function visibleReleases() {
        return RELEASES.filter((r) => passesBands(r) && (state.showCompleted || !isCompleted(r)));
    }

    function inRange(r, x0, x1) {
        return !(endDay(r) < x0 || startDay(r) > x1);
    }

    function dateText(r) {
        if (r.kind === 'window') {
            return `${r.start} to ${r.end}${isApprox(r) ? ' (approximate)' : ''}`;
        }
        if (r.kind === 'lower_bound') return `not before ${r.start}`;
        return r.start;
    }

    function statusText(r) {
        return STATUS_TEXT[r.status] + (isOverdue(r) ? ' (overdue)' : '');
    }

    function evidenceText(r) {
        return r.evidence === 'official' ? 'official source' : 'secondary source, not officially confirmed';
    }

    function describe(r) {
        return [
            `${r.survey}: ${r.release}`,
            dateText(r),
            `Status: ${statusText(r)}`,
            `Evidence: ${evidenceText(r)}`,
            `Type: ${r.event.replace('_', ' ')}`,
            r.access === 'restricted' ? 'Access: restricted' : null,
            r.notes,
        ].filter(Boolean);
    }

    function markClass(r) {
        let cls = `tl-${r.status}`;
        if (isOverdue(r)) cls += ' tl-overdue';
        return cls;
    }

    function svgEl(name, attrs, parent) {
        const node = document.createElementNS(SVG_NS, name);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
        if (parent) parent.appendChild(node);
        return node;
    }

    function groupBySurvey(list) {
        const groups = new Map();
        list.forEach((r) => {
            if (!groups.has(r.survey)) groups.set(r.survey, []);
            groups.get(r.survey).push(r);
        });
        const sorted = [...groups.entries()].map(([name, items]) => {
            items.sort((a, b) => startDay(a) - startDay(b));
            return { name, items };
        });
        sorted.sort((a, b) => startDay(a.items[0]) - startDay(b.items[0]));
        return sorted;
    }

    /* ---------- tooltip ---------- */

    const tip = document.getElementById('tl-tip');

    function showTip(anchor, r) {
        tip.replaceChildren();
        describe(r).forEach((line) => {
            const p = document.createElement('div');
            p.textContent = line;
            tip.appendChild(p);
        });
        const b = anchor.getBoundingClientRect();
        tip.style.left = `${b.left + b.width / 2}px`;
        tip.style.top = `${b.top}px`;
        tip.hidden = false;
    }

    function hideTip() { tip.hidden = true; }

    /* ---------- figure ---------- */

    function renderFigure(list) {
        const host = document.getElementById('tl-figure');
        host.replaceChildren();

        const range = RANGES[state.range];
        const x0 = dayNum(range.from);
        const x1 = dayNum(range.to);
        const inView = list.filter((r) => inRange(r, x0, x1));
        const surveys = groupBySurvey(inView);
        if (surveys.length === 0) return;

        const plotW = Math.max(MIN_PLOT_W, host.clientWidth - LABEL_W - 8);
        const width = LABEL_W + plotW;
        const height = AXIS_H + surveys.length * ROW_H + 8;
        const px = (d) => LABEL_W + ((d - x0) / (x1 - x0)) * plotW;

        const svg = svgEl('svg', {
            width,
            height,
            viewBox: `0 0 ${width} ${height}`,
            class: 'tl-svg',
            focusable: 'false',
        });

        const defs = svgEl('defs', {}, svg);
        const pattern = svgEl('pattern', {
            id: 'tl-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
        }, defs);
        svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'tl-hatch-line' }, pattern);

        surveys.forEach((survey, i) => {
            if (i % 2 === 0) {
                svgEl('rect', { x: 0, y: AXIS_H + i * ROW_H, width, height: ROW_H, class: 'tl-stripe' }, svg);
            }
        });

        const firstYear = Number(range.from.slice(0, 4));
        const lastYear = Number(range.to.slice(0, 4));
        for (let y = firstYear; y <= lastYear; y += 1) {
            const x = px(dayNum(`${y}-01-01`));
            svgEl('line', { x1: x, y1: AXIS_H, x2: x, y2: height, class: 'tl-grid' }, svg);
            svgEl('text', { x: x + 4, y: 20, class: 'tl-axis' }, svg).textContent = String(y);
        }

        if (today >= x0 && today <= x1) {
            const tx = px(today);
            svgEl('line', { x1: tx, y1: AXIS_H, x2: tx, y2: height, class: 'tl-today' }, svg);
            svgEl('text', { x: tx + 4, y: height - 4, class: 'tl-axis tl-today-label' }, svg).textContent = 'today';
        }

        surveys.forEach((survey, i) => {
            const rowTop = AXIS_H + i * ROW_H;
            const cy = rowTop + ROW_H / 2;
            svgEl('text', { x: 6, y: cy + 5, class: 'tl-label' }, svg).textContent = survey.name;

            survey.items.forEach((r) => {
                const s = Math.max(startDay(r), x0);
                const e = Math.min(endDay(r), x1);
                const group = svgEl('a', {
                    href: r.url,
                    target: '_blank',
                    rel: 'noopener',
                    class: `tl-item ${markClass(r)}`,
                    'aria-label': describe(r).join('. '),
                }, svg);

                let anchorX;
                if (r.kind === 'window') {
                    const xa = px(s);
                    const xb = px(Math.min(e + 1, x1));
                    anchorX = xa;
                    svgEl('rect', {
                        x: xa, y: cy - 6, width: Math.max(xb - xa, 6), height: 12, rx: 2, class: 'tl-shape',
                    }, group);
                } else {
                    anchorX = px(s);
                    if (r.kind === 'lower_bound') {
                        svgEl('line', { x1: anchorX, y1: cy, x2: px(x1), y2: cy, class: 'tl-tail' }, group);
                    }
                    svgEl('circle', { cx: anchorX, cy, r: 6, class: 'tl-shape' }, group);
                }
                if (r.evidence === 'secondary') {
                    svgEl('circle', { cx: anchorX, cy: cy - 9, r: 2.5, class: 'tl-badge' }, group);
                }

                group.addEventListener('mouseenter', () => showTip(group, r));
                group.addEventListener('mouseleave', hideTip);
                group.addEventListener('focus', () => showTip(group, r));
                group.addEventListener('blur', hideTip);
            });
        });

        host.appendChild(svg);
    }

    /* ---------- table ---------- */

    function cell(row, text) {
        const td = document.createElement('td');
        td.textContent = text;
        row.appendChild(td);
        return td;
    }

    function renderTable(list) {
        const table = document.getElementById('tl-table');
        table.querySelectorAll('tbody').forEach((tb) => tb.remove());
        const sorted = [...list].sort((a, b) => (a.start.localeCompare(b.start) || a.survey.localeCompare(b.survey)));

        let year = null;
        let body = null;
        sorted.forEach((r) => {
            const y = r.start.slice(0, 4);
            if (y !== year) {
                year = y;
                body = document.createElement('tbody');
                const head = document.createElement('tr');
                head.className = 'tl-year';
                const th = document.createElement('th');
                th.scope = 'rowgroup';
                th.colSpan = 8;
                th.textContent = y;
                head.appendChild(th);
                body.appendChild(head);
                table.appendChild(body);
            }
            const tr = document.createElement('tr');
            tr.className = markClass(r);
            cell(tr, dateText(r));
            cell(tr, r.survey);
            const releaseTd = cell(tr, r.release);
            if (r.notes) {
                const note = document.createElement('small');
                note.textContent = r.notes;
                releaseTd.appendChild(note);
            }
            cell(tr, statusText(r));
            cell(tr, evidenceText(r));
            cell(tr, r.event.replace('_', ' '));
            cell(tr, r.access);
            const linkTd = document.createElement('td');
            const link = document.createElement('a');
            link.href = r.url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = 'Source';
            link.setAttribute('aria-label', `Source for ${r.survey}: ${r.release}`);
            linkTd.appendChild(link);
            tr.appendChild(linkTd);
            body.appendChild(tr);
        });
    }

    /* ---------- controls ---------- */

    function syncControls() {
        document.querySelectorAll('[data-band]').forEach((b) => {
            b.setAttribute('aria-pressed', String(state.bands.has(b.dataset.band)));
        });
        document.querySelectorAll('[data-range]').forEach((b) => {
            b.setAttribute('aria-pressed', String(b.dataset.range === state.range));
        });
        document.getElementById('tl-completed').checked = state.showCompleted;
    }

    function render() {
        const list = visibleReleases();
        const empty = document.getElementById('tl-empty');
        const table = document.getElementById('tl-table');
        empty.hidden = list.length > 0;
        table.hidden = list.length === 0;
        document.getElementById('tl-count').textContent =
            `Showing ${list.length} of ${RELEASES.length} releases.`;
        syncControls();
        renderFigure(list);
        renderTable(list);
    }

    function clearFilters() {
        state.bands.clear();
        render();
    }

    function bindControls() {
        document.querySelectorAll('[data-band]').forEach((b) => {
            b.addEventListener('click', () => {
                const key = b.dataset.band;
                if (state.bands.has(key)) state.bands.delete(key);
                else state.bands.add(key);
                render();
            });
        });
        document.querySelectorAll('[data-range]').forEach((b) => {
            b.addEventListener('click', () => {
                state.range = b.dataset.range;
                render();
            });
        });
        document.getElementById('tl-completed').addEventListener('change', (ev) => {
            state.showCompleted = ev.target.checked;
            render();
        });
        document.getElementById('tl-clear').addEventListener('click', clearFilters);
        document.getElementById('tl-clear-empty').addEventListener('click', clearFilters);

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => {
                hideTip();
                renderFigure(visibleReleases());
            }, 150);
        });
    }

    function showError() {
        document.getElementById('tl-error').hidden = false;
        document.querySelector('.tl-controls').hidden = true;
        document.getElementById('tl-figure').hidden = true;
    }

    function init() {
        if (typeof RELEASES === 'undefined' || !Array.isArray(RELEASES)) {
            showError();
            return;
        }
        today = todayFromUrl();
        document.getElementById('tl-reviewed').textContent =
            typeof LAST_REVIEWED === 'string' ? LAST_REVIEWED : 'unknown';
        bindControls();
        try {
            render();
        } catch (err) {
            console.error('Timeline failed to render', err);
            showError();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
