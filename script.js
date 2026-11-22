/* ==============================================================
   STATE
   ============================================================== */
let currentZoom = 40;
let debounceTimer = null;

/* ==============================================================
   PARSER
   ============================================================== */
function parse(source) {
    const lines = source.split('\n');
    const tokens = [];
    const globalConfig = { split: 3, size: 15 };

    for (let raw of lines) {
        const line = raw.trimEnd();
        if (line.trim() === '') continue;
        if (line.trim().startsWith('//')) continue;

        if (line.trim() === '#sjtu') { globalConfig.sjtu = true; continue; }
        if (line.trim() === '#ssjhtsu') { globalConfig.hideFooterCredit = true; continue; }

        // #split
        let m = line.match(/^#split\s+(\d+)/i);
        if (m) { globalConfig.split = Math.max(1, Math.min(6, parseInt(m[1]))); continue; }

        // #size
        m = line.match(/^#size\s+(\d+)/i);
        if (m) { globalConfig.size = parseInt(m[1]); continue; }

        // ### section
        m = line.match(/^###\s+(.+)/);
        if (m) { tokens.push({ type: 'section', text: m[1].trim(), joinNext: false }); continue; }

        // ## subtitle
        m = line.match(/^##\s+(.+)/);
        if (m) { tokens.push({ type: 'subtitle', text: m[1].trim(), joinNext: false }); continue; }

        // # title
        m = line.match(/^#\s+(.+)/);
        if (m) { tokens.push({ type: 'title', text: m[1].trim(), joinNext: false }); continue; }

        // === column break
        if (/^={3,}\s*$/.test(line.trim())) { tokens.push({ type: 'colbreak', joinNext: false }); continue; }

        // --- hr
        if (/^-{3,}\s*$/.test(line.trim())) { tokens.push({ type: 'hr', joinNext: false }); continue; }

        // K-N
        m = line.match(/^K-(\d+(?:\.\d+)?|\.\d+)\s*(\+)?\s*$/i);
        if (m) { tokens.push({ type: 'blankspace', lines: Number(m[1]), noNum: true, joinNext: !!m[2] }); continue; }

        // numbered items — 末尾可选 "+"，题号后可选 "(标注)"
        m = line.match(/^([^.]+)\.\s*(?:\(([^)]*)\)\s*)?(?:([XxTtLlBbJj])-(\d+)|([Pp]))\s*(\+)?\s*$/);
        if (m) {
            const num = m[1];
            const note = m[2] || '';   // 标注文本（可选）
            const code = (m[3] || m[5]).toUpperCase();
            const param = parseInt(m[4]);
            const joinNext = !!m[6];
            switch (code) {
                case 'P':
                    tokens.push({ type: 'choice', num, note, labels: 'TF', count: 2, joinNext });
                    break;
                case 'X': tokens.push({ type: 'choice', num, note, count: param, joinNext }); break;
                case 'T': tokens.push({ type: 'fill', num, note, count: param, joinNext }); break;
                case 'L': tokens.push({ type: 'lines', num, note, count: param, joinNext }); break;
                case 'B': tokens.push({ type: 'numbered', num, note, count: param, joinNext }); break;
                case 'J': tokens.push({ type: 'blankspace', num, note, lines: param, joinNext }); break;
                default: tokens.push({ type: 'text', text: line, joinNext: false });
            }
            continue;
        }

        tokens.push({ type: 'text', text: line, joinNext: false });
    }

    return { config: globalConfig, tokens };
}

/* ==============================================================
   TOKEN → HTML (single item)
   ============================================================== */
function renderOneToken(tok) {
    switch (tok.type) {
        case 'title':
            return `<div class="sheet-item sheet-main-title">${esc(tok.text)}</div>`;

        case 'subtitle':
            return `<div class="sheet-item sheet-sub-title">${esc(tok.text)}</div>`;

        case 'section':
            return `<div class="sheet-item sheet-section-title">${esc(tok.text)}</div>`;

        case 'choice': {
            const labels = tok.labels || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let o = '';
            for (let i = 0; i < tok.count; i++) o += `<span class="sheet-option-box">${labels[i]}</span>`;
            const noteHtml = tok.note ? `<span class="sheet-qnote">(${esc(tok.note)})</span>` : '';
            return `<div class="sheet-item sheet-q-row">
                <span class="sheet-qnum">${tok.num}</span>
                ${noteHtml}
                <span class="sheet-q-body"><span class="sheet-options">${o}</span></span>
            </div>`;
        }

        case 'fill': {
            let b = '';
            const noteHtml = tok.note ? `<span class="sheet-qnote" style="padding-top: 12px">${esc(tok.note)}</span>` : '';
            for (let i = 0; i < tok.count; i++) b += `<span class="sheet-fill-blank"></span>`;
            return `<div class="sheet-item sheet-q-row" style="margin-top: -12px">
        <span class="sheet-qnum" style="padding-top: 12px">${tok.num}</span>${noteHtml}
        <span class="sheet-q-body"><span class="sheet-fill-blanks">${b}</span></span>
      </div>`;
        }

        case 'lines': {
            let lh = '';
            for (let i = 0; i < tok.count; i++) lh += `<div class="sheet-writing-line"></div>`;
            const noteHtml = tok.note ? `<span class="sheet-qnote" style="padding-top: 13px">${esc(tok.note)}</span>` : '';
            return `<div class="sheet-item sheet-q-row" style="margin-top: -6px;">
        <span class="sheet-qnum" style="padding-top: 10px">${tok.num}</span>${noteHtml}
        <span class="sheet-q-body">${lh}</span>
      </div>`;
        }

        case 'numbered': {
            let o = '';
            for (let i = 1; i <= tok.count; i++) o += `<span class="sheet-option-box">${i}</span>`;
            return `<div class="sheet-item sheet-q-row">
        <span class="sheet-qnum">${tok.num}</span>
        <span class="sheet-q-body"><span class="sheet-options">${o}</span></span>
      </div>`;
        }

        case 'blankspace': {
            const h = tok.lines * 10;
            const numHtml = tok.num
                ? `<span class="sheet-qnum">${tok.num}</span>`
                : '';
            const bodyStyle = `height:${h}mm;`;
            if (tok.num) {
                return `<div class="sheet-item sheet-q-row">
          ${numHtml}
          <span class="sheet-q-body"><div class="sheet-blank-inner" style="${bodyStyle}"></div></span>
        </div>`;
            } else {
                return `<div class="sheet-item"><div class="sheet-blank-inner" style="${bodyStyle}"></div></div>`;
            }
        }

        case 'hr':
            return `<hr class="sheet-item sheet-hr">`;

        case 'text':
            return `<div class="sheet-item sheet-text">${esc(tok.text)}</div>`;

        case 'colbreak':
            return ''; // handled at layout level

        default:
            return '';
    }
}

/* ==============================================================
   GROUP TOKENS INTO ROWS (handle "+" joinNext)
   ============================================================== */
function groupTokensIntoRows(tokens) {
    // Returns an array of "render units".
    // Each unit is either:
    //   { grouped: false, token: tok }
    //   { grouped: true, tokens: [tok1, tok2, ...] }
    const units = [];
    let i = 0;
    while (i < tokens.length) {
        if (tokens[i].joinNext) {
            const group = [tokens[i]];
            while (i < tokens.length && tokens[i].joinNext) {
                i++;
                if (i < tokens.length) {
                    group.push(tokens[i]);
                }
            }
            units.push({ grouped: true, tokens: group });
        } else {
            units.push({ grouped: false, token: tokens[i] });
        }
        i++;
    }
    return units;
}

function renderUnit(unit) {
    if (!unit.grouped) {
        return renderOneToken(unit.token);
    }
    // Render grouped tokens in a flex row
    const inner = unit.tokens.map(tok => {
        // Wrap each token's HTML in a flex child
        const html = renderOneToken(tok);
        return `<div class="sheet-row-item">${html}</div>`;
    }).join('');
    return `<div class="sheet-row">${inner}</div>`;
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

/* ==============================================================
   COLUMN-AWARE LAYOUT ENGINE
   with === column breaks and overflow → next page
   ============================================================== */
function render() {
    const source = document.getElementById('editor').value;
    const { config, tokens } = parse(source);
    // 提取标题用于页头，从 tokens 中移除
    const headerTitles = { main: '', sub: '', sjtu: config.sjtu };
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].type === 'title') { headerTitles.main = tokens[i].text; tokens.splice(i, 1); }
        if (tokens[i].type === 'subtitle') { headerTitles.sub = tokens[i].text; tokens.splice(i, 1); }
    }
    const fontSize = config.size || 15;
    const numCols = config.split || 3;
    const container = document.getElementById('previewContainer');
    container.innerHTML = '';

    if (tokens.length === 0) {
        container.appendChild(buildPageSkeleton(fontSize, numCols, config.sjtu, headerTitles, config.hideFooterCredit));
        applyZoom();
        return;
    }

    // Group tokens into render units (handling "+" join)
    const units = groupTokensIntoRows(tokens);

    // Step 1: measure each unit's rendered height
    const measurer = buildPageSkeleton(fontSize, numCols, false, null);
    measurer.style.cssText += 'position:absolute;left:-99999px;top:0;visibility:hidden;';
    document.body.appendChild(measurer);
    measurer.offsetHeight;
    const proxyCol = document.createElement('div');
    measurer.querySelectorAll('.sheet-col')[0].appendChild(proxyCol);
    proxyCol.innerHTML = '';

    const heights = []; // { index, height, isColbreak, html }
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        // Check if this unit is a colbreak
        if (!unit.grouped && unit.token.type === 'colbreak') {
            heights.push({ index: i, height: 0, isColbreak: true, html: '' });
            continue;
        }
        const html = renderUnit(unit);
        proxyCol.innerHTML = html;
        const hBefore = proxyCol.scrollHeight;
        proxyCol.innerHTML = html + html;
        const hAfter = proxyCol.scrollHeight;
        const h = hAfter - hBefore;
        proxyCol.innerHTML = '';
        console.log(h);
        heights.push({ index: i, height: h, isColbreak: false, html });
        proxyCol.innerHTML = '';
    }

    document.body.removeChild(measurer);

    const testPage = buildPageSkeleton(fontSize, numCols);
    testPage.style.cssText += 'position:absolute;left:-99999px;top:0;visibility:hidden;';
    document.body.appendChild(testPage);
    testPage.offsetHeight;
    const colEls = testPage.querySelectorAll('.sheet-col');
    const colHeight = colEls[0].getBoundingClientRect().height;
    document.body.removeChild(testPage);

    // 测量第一页第一栏可用高度（有页头）
    const testPageFirst = buildPageSkeleton(fontSize, numCols, true, headerTitles);
    testPageFirst.style.cssText += 'position:absolute;left:-99999px;top:0;visibility:hidden;';
    document.body.appendChild(testPageFirst);
    testPageFirst.offsetHeight;
    const firstColHeight = testPageFirst.querySelectorAll('.sheet-col')[0].getBoundingClientRect().height;
    document.body.removeChild(testPageFirst);

    // Step 2: bin-pack into columns → pages
    const pages = [];
    let currentPage = newPageCols(numCols);
    let currentColIdx = 0;
    let currentPageIdx = 0;

    console.log(firstColHeight, colHeight);
    function getColCapacity() {
        return (currentPageIdx === 0 && currentColIdx === 0) ? firstColHeight : colHeight;
    }

    let currentColUsed = 0;

    for (const item of heights) {
        if (item.isColbreak) {
            currentColIdx++;
            if (currentColIdx >= numCols) {
                pages.push(currentPage);
                currentPage = newPageCols(numCols);
                currentColIdx = 0;
                currentPageIdx++;
            }
            currentColUsed = 0;
            continue;
        }

        if (currentColUsed + item.height > getColCapacity() + 2 && currentColUsed > 0) {
            console.log(`Page ${currentPageIdx + 1} Col ${currentColIdx + 1} full (used ${currentColUsed}px, item ${item.height}px) capacity = ${getColCapacity()}px, moving to next column`);
            currentColIdx++;
            if (currentColIdx >= numCols) {
                pages.push(currentPage);
                currentPage = newPageCols(numCols);
                currentColIdx = 0;
                currentPageIdx++;
            }
            currentColUsed = 0;
        }

        currentPage[currentColIdx].push(item.html);
        currentColUsed += item.height;
    }

    pages.push(currentPage);

    // Step 3: build DOM
    for (let pi = 0; pi < pages.length; pi++) {
        const pageCols = pages[pi];
        const isFirst = (pi === 0);
        const pageEl = buildPageSkeleton(fontSize, numCols, isFirst, headerTitles, config.hideFooterCredit);
        const cols = pageEl.querySelectorAll('.sheet-col');
        for (let c = 0; c < numCols; c++) {
            if (pageCols[c]) {
                cols[c].innerHTML = pageCols[c].join('');
            }
        }
        container.appendChild(pageEl);
    }

    applyZoom();
}

function newPageCols(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push([]);
    return arr;
}

function dots(n) {
    let dots = '';
    for (let i = 0; i < n; i++) dots += '<div class="sheet-header-dot"></div>';
    return dots;
}

function buildHeaderHTML(titles, numCols) {
    const mainTitle = titles.main || '';
    const subTitle = titles.sub || '';

    function idBox(n) {
        let idBoxes = '';
        for (let i = 0; i < n; i++) idBoxes += '<div class="sheet-header-id-box"></div>';
        return idBoxes;
    }

    const fields = titles.sjtu
        ? [['学\u2003号', 12], ['班\u2003级', 6]]
        : [['报名号', 12], ['考场号', 8], ['座位号', 2]];
    const fieldRows = fields.map(([label, count]) => `
        <div class="sheet-header-field" style="margin-top:2mm;">
          <span class="sheet-header-field-label">${label}</span>
          <div class="sheet-header-id-boxes">${idBox(count)}</div>
        </div>`).join('');

    return `<div class="sheet-header">
    <div class="sheet-header-dots">${dots(numCols <= 2 ? Math.ceil(60 / numCols) : 21)}</div>
    <div class="sheet-header-titles">
      <div class="sheet-header-title-main">${esc(mainTitle)}</div>
      <div class="sheet-header-title-sub">${esc(subTitle)}</div>
    </div>
    <div class="sheet-header-info${titles.sjtu ? ' sheet-header-info-sjtu' : ''}">
      <div class="sheet-header-left">
        <div class="sheet-header-field">
          <span class="sheet-header-field-label">姓\u2003名</span>
          <span class="sheet-header-field-line"></span>
        </div>
        ${fieldRows}
      </div>
      <div class="sheet-header-barcode">粘贴条形码区</div>
    </div>
    <div class="sheet-header-notice">
      <div class="sheet-header-notice-left">
        <div style="display:flex;align-items:flex-start;gap:2mm;color:red;">
          <div class="fill-label">填涂样例</div>
          <div style="align-items: center; display:  flex; flex-direction: column;">
            <div style="font-size:0.85em;margin-bottom:1mm;">正确填涂</div>
            <div class="sheet-fill-example"><div class="sheet-fill-example-block"></div></div>
            <div style="font-size:0.85em;margin-bottom:1mm;margin-top:1.5mm;">错误填涂</div>
            <div class="sheet-fill-wrong-row">
              <div class="sheet-fill-wrong-item">✔</div>
              <div class="sheet-fill-wrong-item">✘</div>
              <div class="sheet-fill-wrong-item">○</div>
            </div>
            <div class="sheet-fill-wrong-row" style="margin-top:1mm;">
              <div class="sheet-fill-wrong-item">●</div>
              <div class="sheet-fill-wrong-item">☐</div>
              <div class="sheet-fill-wrong-item">⬭</div>
            </div>
          </div>
        </div>
      </div>
      <div class="sheet-header-notice-right">
      <ol>
        <li>答题前，考生先在答题纸正面准确填写姓名、准考证号，在答题纸反面准确填写姓名，认真核对条形码上的准考证号、姓名和科目是否有误，并将核对后的条形码粘贴于指定区域。</li>
        <li>选择题部分必须使用2B铅笔填涂，作图使用2B铅笔，其余题型使用黑色字迹的钢笔、水笔或圆珠笔书写，字体工整、笔迹清楚。</li>
        <li>考生应在各题目的答题区域内作答，超出答题区域书写的答案无效。</li>
        <li>保持纸面清洁，不折叠、不破损。</li>
        </ol>
        <span class="sheet-header-absence">缺考标记：<span class="sheet-header-absence-box"></span>（考生不准填涂）</span>
      </div>
    </div>
    <div class="sheet-gray-detector">
    <div class="sheet-fill-example-block" style="background: black !important;"></div>
    <div class="sheet-fill-example-block" style="background: #888 !important;"></div>
    <div class="sheet-fill-example-block" style="background: #ddd !important;"></div>
    </div>
  </div>`;
}

function buildPageSkeleton(fontSize, numCols, isFirstPage, headerTitles, hideFooterCredit = false) {
    const page = document.createElement('div');
    page.className = 'sheet-page';
    page.style.fontSize = fontSize + 'px';

    const hintText = '请在各题目的答题区域内作答，超出矩形边框限定区域的答案无效';

    let colsHtml = '';
    for (let i = 0; i < numCols; i++) {
        const headerPart = (isFirstPage && i === 0 && headerTitles) ? buildHeaderHTML(headerTitles, numCols) : '';
        colsHtml += `<div class="sheet-col-outer">
      ${headerPart}
      <div class="sheet-col-wrap">
        <div class="sheet-col-hint">${hintText}</div>
        <div class="sheet-col-inner">
          <div class="sheet-col"></div>
        </div>
        <div class="sheet-col-hint-bottom">${hintText}</div>
      </div>
    </div>`;
    }
    // 左侧检测栏黑色方块（约10个，均匀分布）
    // 左侧检测栏黑色方块（手动指定每个方块的纵向位置，单位mm，从页面顶部算起）
    const leftMarkerPositions = [18, 42, 50, 276];
    let leftMarkers = '';
    for (const pos of leftMarkerPositions) {
        leftMarkers += `<div class="sheet-side-marker" style="top:${pos}mm;"></div>`;
    }

    // 左侧检测区红色竖框 + 文字
    const detectText = '白色检测区，请勿污染！';
    let detectChars = '';
    for (const ch of detectText) {
        detectChars += `<span>${ch}</span>`;
    }
    const leftDetectZone = `<div class="sheet-detect-zone">
        <div class="sheet-detect-zone-inner">${detectChars}</div>
    </div>`;
    // 右侧黑色方块（底部2个）
    let rightMarkers = '';
    rightMarkers += `<div class="sheet-side-marker"></div>`;
    
    // let dots = '';
    // for (let i = 0; i < 64; i++) dots += '<div class="sheet-header-dot"></div>';

    page.innerHTML = `
        <div class="sheet-corner-mark sheet-corner-bl">+</div>
        <div class="sheet-corner-mark sheet-corner-br">+</div>
        <div class="sheet-left-markers">${leftMarkers}</div>
        ${leftDetectZone}
        <div class="sheet-right-marker-line"></div>
        <div class="sheet-right-markers">${rightMarkers}</div>
        <div class="sheet-outer-frame">${colsHtml}</div>
        <div class="sheet-footer-dots">${dots(60)}</div>
        <div class="sheet-footer-mark">上海市教育考试院设计与监制</div>
        ${hideFooterCredit ? '' : '<div class="sheet-footer-mark-2">#6B50EF 排版与制作</div>'}
    `;
    // <div class="sheet-footer-dots">${dots}</div>
    return page;
}

/* ==============================================================
   ZOOM
   ============================================================== */
function applyZoom() {
    const pages = document.querySelectorAll('#previewContainer .sheet-page');
    pages.forEach(p => {
        p.style.transform = `scale(${currentZoom / 100})`;
        p.style.marginBottom = `-${(1 - currentZoom / 100) * p.offsetHeight}px`;
        const shrinkX = (1 - currentZoom / 100) * p.offsetWidth;
        p.style.marginLeft = `-${shrinkX / 2}px`;
        p.style.marginRight = `-${shrinkX / 2}px`;
    });
    document.getElementById('zoomLabel').textContent = currentZoom + '%';
}

function zoom(delta) {
    currentZoom = Math.max(15, Math.min(150, currentZoom + delta));
    applyZoom();
}

function zoomFit() {
    const scrollEl = document.getElementById('previewScroll');
    const w = scrollEl.clientWidth - 60;
    const pageWidthPx = 420 * 3.7795;
    currentZoom = Math.round((w / pageWidthPx) * 100);
    currentZoom = Math.max(15, Math.min(150, currentZoom));
    applyZoom();
}

/* ==============================================================
   EDITOR
   ============================================================== */
const editor = document.getElementById('editor');

editor.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
});

editor.addEventListener('keyup', updateLineInfo);
editor.addEventListener('click', updateLineInfo);

function updateLineInfo() {
    const val = editor.value;
    const pos = editor.selectionStart;
    const before = val.substring(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    document.getElementById('lineInfo').textContent = `行 ${line}, 列 ${col}`;
}

editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const s = editor.selectionStart, end = editor.selectionEnd;
        editor.value = editor.value.substring(0, s) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = s + 2;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, 150);
    }
});

/* ==============================================================
   RESIZER
   ============================================================== */
const resizer = document.getElementById('resizer');
const editorPanel = document.getElementById('editorPanel');
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const w = Math.max(280, Math.min(window.innerWidth * 0.7, e.clientX));
    editorPanel.style.width = w + 'px';
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setTimeout(zoomFit, 100);
    }
});

/* ==============================================================
   DRAG & DROP
   ============================================================== */
const dropOverlay = document.getElementById('dropOverlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropOverlay.classList.add('active'); });
document.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
        const reader = new FileReader();
        reader.onload = (ev) => { editor.value = ev.target.result; render(); toast('success', `已加载: ${file.name}`); };
        reader.readAsText(file);
    } else {
        toast('error', '请拖入 .md 或 .txt 文件');
    }
});

/* ==============================================================
   EXPORT PDF
   ============================================================== */
function exportPDF() {
    const printWin = window.open('', '_blank');
    const pages = document.querySelectorAll('#previewContainer .sheet-page');
    let pagesHtml = '';
    pages.forEach((p, i) => {
        const clone = p.cloneNode(true);
        clone.style.transform = 'none';
        clone.style.marginBottom = '0';
        clone.style.marginRight = '0';
        clone.style.boxShadow = 'none';
        if (i > 0) clone.style.pageBreakBefore = 'always';
        pagesHtml += clone.outerHTML;
    });

    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>答题卡</title>
    <link rel="stylesheet" href="style.css">
<style>
@media print {
  body { margin:0; padding:0; overflow: scroll; }
  @page { size: A3 landscape; margin: 0; }
  .sheet-page { page-break-after: always; box-shadow: none !important; margin-left: 0px !important; }
  .sheet-page:last-child { page-break-after: auto; }
  .sheet-header-dot { background: black !important; }
}
body { margin:0; padding:0; } .sheet-page { page-break-after: always; box-shadow: none !important; margin-left: 0px !important; }
</style></head><body>
<div class="print-container">${pagesHtml}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)};<\/script>
</body></html>`);
    printWin.document.close();
    toast('info', '打印窗口已打开，请选择「另存为 PDF」');
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); exportPDF(); }
});

/* ==============================================================
   EXPORT .md
   ============================================================== */
function exportMD() {
    const content = editor.value;
    if (!content.trim()) { toast('error', '编辑器为空'); return; }
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '答题卡.md';
    a.click();
    URL.revokeObjectURL(url);
    toast('success', '已导出 答题卡.md');
}

/* ==============================================================
   TEMPLATE
   ============================================================== */
function insertTemplate() {
//     editor.value = `#split 3
// #size 15
// # 2025 年上海市普通高中学业水平等级性考试
// ## 物理 答题纸

// ### 一、光学实验
// 1. X-4 +
// 2. X-4
// 3. T-2
// ---
// ### 二、量子百年
// 1. X-4 +
// 2. X-5
// 3. T-1
// 4. X-4
// ---
// ### 三、滑动变阻器
// 1. T-2
// 2 (1). X-4 +
// 2 (2). T-1
// 2 (3). X-4
// 3. T-2
// ===
// ### 四、竖直圆轨道
// 1. X-5 +
// 2. X-4
// 3 (1). J-5
// 3 (2). J-7
// ---
// ### 五、特雷门琴
// 1 (1). X-3 +
// 1 (2). X-4
// 2 (1). T-1
// 2 (2). X-4
// 2 (3). T-2
// 3. X-4
// ===
// ### 六、再生制动与气囊减震
// 1. X-4
// 2. J-5
// 3 (1). J-5
// 3 (2). J-6
// 3 (3) (1). X-3
// 3 (3) (2). J-4`;
// editor.value = `
// #split 3
// # 2026年普通高等学校招生全国统一考试
// ## 语文 答题纸

// ### 一　积累与运用
// 1 (1). T-1
// (2). T-2
// (3). T-2
// 2 (1). X-4 +
// (2). X-4
// ----
// ### 二　阅读
// 3. X-4 +
// 4. X-4 +
// 5. X-4
// ---
// 6. L-4
// ---
// 7. L-5
// ===
// 8.L-4
// ---
// 9.L-4
// ---
// 10.L-4
// ---
// 11.L-5
// K-1
// ----
// 12. X-4
// ---
// 13. L-5
// K-1
// ===
// 14 (1). T-1 +
// (2). T-1
// ---
// 15 (1). X-4 +
// (2). X-4
// 16. X-4
// 17. J-1
// ---
// 18. L-3
// ---
// 19. L-5
// K-1
// ---
// 20. X-4
// ---
// 21. L-4
// ---
// 22. L-5
// K-1
// `
editor.value = `
# 2024年上海市普通高中学业水平等级性考试
## 化学　答题纸
### 一　氟及其化合物
1. X-4 +
2. (不定项)X-4
----
3 (1). L-1
(2). X-4
----
4. T-1 +
 .T-1
---
5. L-2
----
6. X-4 +
7. (不定项)X-4
----
8. T-1
----
### 二　粗盐水的精制
1. X-4
----
2. L-2
---
3. L-1
---
4. (不定项)X-4
===
5. T-1
---
6. X-4
---
7 (1). L-1
(2). L-1
---
8. J-6
---
### 三　溴化铝的结构和性质
1. X-4 +
2 (1). X-3
---
2 (2). T-1 +
2 (3). X-4
---
3. L-1
---
4. X-4
---
5. L-1 +
 .T-0
---
6. L-2
---
7 (1). L-2
---
(2). X-4
----
### 四　降血糖药物瑞格列奈
1. X-4 + 
2. X-4
===
3. T-1
---
4. J-1 + 
5. J-1
 .L-1 +
 .L-1
---
6 (1). X-4 + 
(2). X-4
---
7. L-2
---
8. J-7
----
### 五　珊瑚礁的形成与保护
1. X-4 +
2. X-4
3. (不定项)X-4
---
4. L-2
---
5. T-1 +
 .T-1
6. X-4
---
7. L-1
---
8. L-3
`
    render();
    toast('success', '已插入示例模板');
}

/* ==============================================================
   MISC
   ============================================================== */
function clearEditor() {
    if (editor.value.trim() && !confirm('确定清空？')) return;
    editor.value = '';
    render();
    toast('info', '已清空');
}

function showHelp() { document.getElementById('helpModal').classList.add('active'); }
function closeHelp() { document.getElementById('helpModal').classList.remove('active'); }
document.getElementById('helpModal').addEventListener('click', (e) => { if (e.target === document.getElementById('helpModal')) closeHelp(); });

function toast(type, msg) {
    const c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

/* ==============================================================
   INIT
   ============================================================== */
window.addEventListener('load', () => { setTimeout(zoomFit, 100); render(); insertTemplate(); });
window.addEventListener('resize', () => { clearTimeout(window._rzT); window._rzT = setTimeout(zoomFit, 200); });
