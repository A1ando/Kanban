// ==================== 全局状态 ====================
let globalData = null;
let currentViewMode = 'fortnight';
let timeColumns = [];
let collapsedProjects = {};
let easyMDEInstance = null;
let editModalInstance = null;

// 新增：日期标记线相关
let markerDate = null;           // 当前标记的日期字符串 'YYYY-MM-DD'
let markerLine = null;           // 标记线 DOM 元素（稍后赋值）
let markerTag = null;            // 标记标签 DOM 元素

const VIEW_CONFIG = {
    day: { cellWidth: 40, stepDays: 1 },
    week: { cellWidth: 80, stepDays: 7 },
    fortnight: { cellWidth: 100, stepDays: 14 },
    month: { cellWidth: 110, stepDays: 30 },
    quarter: { cellWidth: 140, stepDays: 90 }
};

// ==================== 工具函数 ====================
function getDaysDiff(startStr, endStr) {
    return Math.round((new Date(endStr) - new Date(startStr)) / (1000 * 60 * 60 * 24));
}

function getXPixelByDate(targetDateStr) {
    if (!targetDateStr || !globalData) return 0;
    const daysFromStart = getDaysDiff(globalData.timeline_start, targetDateStr);
    const totalTimelineDays = getDaysDiff(globalData.timeline_start, globalData.timeline_end) + 1;
    const config = VIEW_CONFIG[currentViewMode];
    let totalCanvasWidth = timeColumns.length * config.cellWidth;
    return (daysFromStart / totalTimelineDays) * totalCanvasWidth;
}

function buildTimeColumns(startStr, endStr, mode) {
    const cols = [];
    let curr = new Date(startStr);
    const end = new Date(endStr);
    if (mode === 'day') {
        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            cols.push({ label: `${curr.getDate()}日`, subLabel: `${curr.getMonth()+1}月`, dateStr, days: 1 });
            curr.setDate(curr.getDate() + 1);
        }
    } else if (mode === 'week') {
        let weekIdx = 1;
        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            cols.push({ label: `W${weekIdx++}`, subLabel: `${curr.getMonth()+1}/${curr.getDate()}`, dateStr, days: 7 });
            curr.setDate(curr.getDate() + 7);
        }
    } else if (mode === 'fortnight') {
        let fIdx = 1;
        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            cols.push({ label: `F${fIdx++}`, subLabel: `${curr.getMonth()+1}/${curr.getDate()}`, dateStr, days: 14 });
            curr.setDate(curr.getDate() + 14);
        }
    } else if (mode === 'month') {
        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            cols.push({ label: `${curr.getFullYear()}年`, subLabel: `${curr.getMonth()+1}月`, dateStr, days: 30 });
            curr.setMonth(curr.getMonth() + 1);
        }
    } else if (mode === 'quarter') {
        while (curr <= end) {
            const dateStr = curr.toISOString().split('T')[0];
            const q = Math.floor(curr.getMonth() / 3) + 1;
            cols.push({ label: `${curr.getFullYear()}`, subLabel: `Q${q}`, dateStr, days: 90 });
            curr.setMonth(curr.getMonth() + 3);
        }
    }
    return cols;
}

// ==================== 渲染甘特图 ====================
function renderGantt() {
    if (!globalData) return;
    const { projects, timeline_start, timeline_end, today } = globalData;
    timeColumns = buildTimeColumns(timeline_start, timeline_end, currentViewMode);
    const config = VIEW_CONFIG[currentViewMode];

    // 渲染时间头
    const headerEl = document.getElementById('timelineHeader');
    headerEl.innerHTML = timeColumns.map(col => `
        <div class="time-cell" style="width: ${config.cellWidth}px;">
            <div style="font-size:0.65rem; color:#94a3b8;">${col.label}</div>
            <div class="fw-bold">${col.subLabel}</div>
        </div>
    `).join('');

    const leftContainer = document.getElementById('leftTreeRows');
    const rightContainer = document.getElementById('rightTimelineRows');
    leftContainer.innerHTML = '';
    rightContainer.innerHTML = '';

    // 使用文档片段批量添加
    const leftFragment = document.createDocumentFragment();
    const rightFragment = document.createDocumentFragment();

    projects.forEach((main, index) => {
        const bgColor = (index % 2 === 0) ? '#f8fafc' : '#ffffff';
        // 主行
        const leftRow = createMainLeftRow(main, bgColor);
        const rightRow = createMainRightRow(main, bgColor);
        leftFragment.appendChild(leftRow);
        rightFragment.appendChild(rightRow);

        if (!collapsedProjects[main.id]) {
            main.children.forEach(child => {
                const subLeft = createSubLeftRow(child);
                const subRight = createSubRightRow(child);
                leftFragment.appendChild(subLeft);
                rightFragment.appendChild(subRight);
            });
        }
    });

    leftContainer.appendChild(leftFragment);
    rightContainer.appendChild(rightFragment);

    // 今日线
    const todayX = getXPixelByDate(today);
    document.getElementById('todayLine').style.left = `${todayX}px`;
    document.getElementById('todayLine').title = '今天: ' + globalData.today;

    // 更新展开/折叠全部按钮的状态
    updateCollapseAllIcon();

    // 重新定位标记线（使用全局变量）
    if (markerDate && markerLine) {
        const x = getXPixelByDate(markerDate);
        if (x !== undefined && x >= 0 && isFinite(x)) {
            markerLine.style.left = x + 'px';
            markerLine.style.display = 'block';
            markerTag.textContent = markerDate;
        } else {
            markerLine.style.display = 'none';
            markerDate = null;
        }
    }
}

// ----- 创建主项目左侧行 -----
function createMainLeftRow(main, bgColor) {
    const row = document.createElement('div');
    row.className = 'task-row main-row';
    row.style.backgroundColor = bgColor;
    row.style.borderBottom = '1px solid #cbd5e1';
    row.dataset.id = main.id;
    row.dataset.category = 'main';
    row.innerHTML = `
        <div style="display:flex; align-items:center; width:100%; gap:4px;">
            <span class="collapse-icon" data-main-id="${main.id}">
                <i class="bi ${collapsedProjects[main.id] ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>
            </span>
            <div class="col-value col-name fw-bold" title="${main.name}" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${main.name}</div>
            <div class="col-value col-owner text-muted small">${main.owner || ''}</div>
            <div class="col-value col-man-days text-primary fw-bold small">${main.man_days || 0} 天</div>
            <div class="col-value col-natural small">${main.calendar_days || 0}</div>
            <div class="col-value col-work small">${main.work_days || 0}</div>
        </div>
    `;
    return row;
}

// ----- 创建主项目右侧行 -----
function createMainRightRow(main, bgColor) {
    const config = VIEW_CONFIG[currentViewMode];
    const row = document.createElement('div');
    row.className = 'timeline-row';
    row.style.backgroundColor = bgColor;
    row.style.borderBottom = '1px solid #cbd5e1';
    row.dataset.id = main.id;
    row.dataset.category = 'main';

    // 网格
    let gridHtml = timeColumns.map(() => `<div class="grid-cell" style="width: ${config.cellWidth}px;"></div>`).join('');
    
    // 主项目条（如果有日期）
    let startDate = main.start;
    let endDate = main.end;
    if ((!startDate || !endDate) && main.children && main.children.length > 0) {
        const starts = main.children.map(c => c.start).filter(s => s);
        const ends = main.children.map(c => c.end).filter(e => e);
        if (starts.length > 0 && ends.length > 0) {
            startDate = starts.reduce((a, b) => a < b ? a : b);
            endDate = ends.reduce((a, b) => a > b ? a : b);
        }
    }
    let barHtml = '';
    if (startDate && endDate) {
        const startX = getXPixelByDate(startDate);
        const endX = getXPixelByDate(endDate);
        const width = Math.max(endX - startX, 4);
        barHtml = `<div class="bar-main" style="left: ${startX}px; width: ${width}px;" data-id="${main.id}" data-category="main"></div>`;
    }

    const eventsHtml = (main.events || []).map(evt => {
        const evtX = getXPixelByDate(evt.date);
        const isMeeting = (evt.type === 'meeting');
        // 转义单引号防止内联 JS 报错
        const safeName = evt.name.replace(/'/g, "\\'");
        return `
            <div class="node-marker ${isMeeting ? 'node-meeting' : 'node-milestone'}" 
                style="left: ${evtX - 12}px;" 
                data-id="${evt.id}" data-category="${evt.type}"
                onmouseenter="showEventTooltip(event, '${safeName}', '${evt.date}')"
                onmouseleave="hideTooltipCard()">
                <i class="bi ${isMeeting ? 'bi-telephone-fill' : 'bi-flag-fill'}" style="font-size:0.75rem;"></i>
            </div>
        `;
    }).join('');

    row.innerHTML = `${gridHtml}${barHtml}${eventsHtml}`;
    return row;
}

// ----- 创建子任务左侧行 -----
function createSubLeftRow(child) {
    const row = document.createElement('div');
    row.className = 'task-row sub-row';
    row.style.backgroundColor = '#ffffff';
    row.style.borderBottom = '1px solid #f1f5f9';
    row.dataset.id = child.id;
    row.dataset.category = 'sub';

    // 获取今日日期（优先使用全局数据，否则用当前日期）
    const today = globalData ? globalData.today : new Date().toISOString().split('T')[0];

    let badgeClass = 'bg-primary'; // 默认进行中（蓝色）
    if (child.actual_end && child.actual_end.trim() !== '') {
        badgeClass = 'bg-success'; // 已完成（绿色）
    } else if (child.start && child.start > today) {
        badgeClass = 'bg-secondary'; // 未开始（灰色）
    }
    // 否则保持蓝色（进行中）
    
    row.innerHTML = `
        <div style="display:flex; align-items:center; width:100%; gap:4px; padding-left:22px;">
            <div class="col-value col-name" title="${child.name}" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                <span class="badge ${badgeClass} me-1">子任务</span>${child.name}
            </div>
            <div class="col-value col-owner text-muted small">${child.owner || ''}</div>
            <div class="col-value col-man-days text-primary fw-bold small">${child.man_days || 0} 天</div>
            <div class="col-value col-natural small">${child.calendar_days || 0}</div>
            <div class="col-value col-work small">${child.work_days || 0}</div>
        </div>
    `;
    return row;
}

// ----- 创建子任务右侧行 -----
function createSubRightRow(child) {
    const config = VIEW_CONFIG[currentViewMode];
    const row = document.createElement('div');
    row.className = 'timeline-row';
    row.style.backgroundColor = '#ffffff';
    row.style.borderBottom = '1px solid #f1f5f9';
    row.dataset.id = child.id;
    row.dataset.category = 'sub';

    const startX = getXPixelByDate(child.start);
    const endX = getXPixelByDate(child.end);
    const totalWidth = Math.max(endX - startX, 16);
    const progress = child.progress || 0;
    const actualEnd = child.actual_end;
    const today = globalData ? globalData.today : new Date().toISOString().split('T')[0];

    // 判断是否未开始：有开始日期且开始日期 > 今天，且无实际完成日期
    const isNotStarted = child.start && child.start > today && !actualEnd;

    let gridHtml = timeColumns.map(() => `<div class="grid-cell" style="width: ${config.cellWidth}px;"></div>`).join('');
    
    let segmentsHtml = '';
    let totalBarWidth = 0;

    if (isNotStarted) {
        // 未开始：进度条灰色，显示0%
        totalBarWidth = totalWidth;
        segmentsHtml = `<div class="bar-segment gray" style="width:100%;">0%</div>`;
    } else if (!actualEnd) {
        // 进行中（无实际结束日期）
        totalBarWidth = totalWidth;
        segmentsHtml = `<div class="bar-segment blue" style="width:100%;">${progress}%</div>`;
    } else {
        // 已完成（有实际结束日期）
        const actualX = getXPixelByDate(actualEnd);
        if (actualX > endX) {
            const planWidth = Math.max(endX - startX, 4);
            const overrunWidth = Math.max(actualX - endX, 4);
            totalBarWidth = planWidth + overrunWidth;
            segmentsHtml = `
                <div class="bar-segment green" style="width:${planWidth}px;">${progress}%</div>
                <div class="bar-segment red" style="width:${overrunWidth}px;"></div>
            `;
        } else if (actualX < endX) {
            const greenWidth = Math.max(actualX - startX, 4);
            const dashWidth = Math.max(endX - actualX, 4);
            totalBarWidth = greenWidth + dashWidth;
            segmentsHtml = `
                <div class="bar-segment green" style="width:${greenWidth}px;display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:bold; color:#fff;">100%</div>
                <div class="bar-segment dashed" style="width:${dashWidth}px;"></div>
            `;
        } else {
            totalBarWidth = totalWidth;
            segmentsHtml = `<div class="bar-segment green" style="width:100%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; font-weight:bold; color:#fff;">100%</div>`;
        }
    }

    const barHtml = `
        <div class="bar-container" style="left: ${startX}px; width: ${totalBarWidth}px;" 
             data-id="${child.id}" data-category="sub"
             onmouseenter="showTooltipCard(event, '${child.name}', '${child.start || ''}', '${child.end || ''}', '${actualEnd || ''}')"
             onmouseleave="hideTooltipCard()">
            ${segmentsHtml}
        </div>
    `;

    row.innerHTML = `${gridHtml}${barHtml}`;
    return row;
}

// ==================== 更新展开/折叠全部按钮 ====================
function updateCollapseAllIcon() {
    const btn = document.getElementById('collapseAllBtn');
    if (!globalData || !globalData.projects || globalData.projects.length === 0) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline';
    const allExpanded = globalData.projects.every(p => !collapsedProjects[p.id]);
    if (allExpanded) {
        btn.innerHTML = '<i class="bi bi-arrows-collapse"></i>';
        btn.title = '折叠全部项目';
    } else {
        btn.innerHTML = '<i class="bi bi-arrows-expand"></i>';
        btn.title = '展开全部项目';
    }
}

// ==================== 事件绑定（委托） ====================
function setupEventDelegation() {
    // 左侧行点击 - 编辑（忽略折叠图标点击）
    document.getElementById('leftTreeRows').addEventListener('click', function(e) {
        if (e.target.closest('.collapse-icon')) return;
        const row = e.target.closest('.task-row');
        if (!row) return;
        const id = row.dataset.id;
        const category = row.dataset.category;
        if (id && category) {
            const node = findNodeById(id, category);
            if (node) openEditModal(node, category);
        }
    });

    // 右侧条点击 - 编辑
    document.getElementById('rightTimelineRows').addEventListener('click', function(e) {
        let target = e.target.closest('.bar-main, .bar-container, .node-marker');
        if (!target) return;
        const id = target.dataset.id;
        const category = target.dataset.category;
        if (id && category) {
            const node = findNodeById(id, category);
            if (node) openEditModal(node, category);
        }
    });

    // 折叠图标点击（阻止冒泡，防止触发编辑）
    document.getElementById('leftTreeRows').addEventListener('click', function(e) {
        const icon = e.target.closest('.collapse-icon');
        if (icon) {
            e.stopPropagation();
            const mainId = icon.dataset.mainId;
            if (mainId) toggleProject(mainId);
        }
    });

    // 展开/折叠全部按钮点击
    document.getElementById('collapseAllBtn').addEventListener('click', function() {
        const projects = globalData ? globalData.projects : [];
        if (projects.length === 0) return;
        // 判断是否全部展开
        const allExpanded = projects.every(p => !collapsedProjects[p.id]);
        if (allExpanded) {
            // 全部折叠
            projects.forEach(p => collapsedProjects[p.id] = true);
        } else {
            // 全部展开
            projects.forEach(p => delete collapsedProjects[p.id]);
        }
        renderGantt();
    });

    // ==================== 日期标记线功能 ====================
    markerLine = document.getElementById('markerLine');
    markerTag = document.getElementById('markerTag');

    // 点击右侧面板（空白区域）添加标记线
    document.getElementById('rightPanel').addEventListener('click', function(e) {
        // 忽略点击任务条、节点、今日线等元素
        const target = e.target;
        if (target.closest('.bar-container') || target.closest('.bar-main') || 
            target.closest('.node-marker') || target.closest('.today-line') ||
            target.closest('.marker-line')) {
            return;
        }
        
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left; 
        const date = getDateFromPixelX(x);
        if (!date) return;
        
        // 更新标记线位置和标签
        markerLine.style.left = x + 'px';
        markerLine.style.display = 'block';
        markerTag.textContent = date;
        markerDate = date;
        
        // 让标记线可交互（双击移除）
        markerLine.classList.add('draggable');
        markerLine.title = '标记日期: ' + date;   // 新增
    });

    // 双击标记线移除
    markerLine.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        this.style.display = 'none';
        markerDate = null;
        this.classList.remove('draggable');
        this.title = '';   // 新增
    });

    // 辅助函数：根据像素位置计算日期
    function getDateFromPixelX(x) {
        if (!globalData || !timeColumns || timeColumns.length === 0) return null;
        const config = VIEW_CONFIG[currentViewMode];
        const totalWidth = timeColumns.length * config.cellWidth;
        const ratio = x / totalWidth;
        const start = new Date(globalData.timeline_start);
        const end = new Date(globalData.timeline_end);
        const totalDays = (end - start) / (1000 * 60 * 60 * 24) + 1;
        const offsetDays = Math.round(ratio * totalDays);
        const targetDate = new Date(start);
        targetDate.setDate(targetDate.getDate() + offsetDays);
        return targetDate.toISOString().split('T')[0];
    }

    // 视图切换
    document.getElementById('viewModeGroup').addEventListener('click', function(e) {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        document.querySelectorAll('#viewModeGroup button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentViewMode = btn.dataset.mode;
        renderGantt();
    });

    // 折叠/展开左侧面板
    document.getElementById('toggleLeftBtn').addEventListener('click', function() {
        const leftPanel = document.getElementById('leftPanel');
        leftPanel.classList.toggle('collapsed');
        this.innerHTML = leftPanel.classList.contains('collapsed') 
            ? '<i class="bi bi-layout-sidebar-inset"></i> 展开左侧' 
            : '<i class="bi bi-layout-sidebar"></i> 折叠左侧';
    });

    // 导出Excel
    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);

    // 新增节点
    document.getElementById('submitNodeBtn').addEventListener('click', submitNode);
    document.getElementById('nodeType').addEventListener('change', function() {
        toggleFormType(this.value);
    });

    // 新增项目
    document.getElementById('submitProjectBtn').addEventListener('click', submitNewProject);

    // 编辑模态框按钮
    document.getElementById('saveEditBtn').addEventListener('click', saveEdits);
    document.getElementById('clearActualBtn').addEventListener('click', clearActualEnd);
    document.getElementById('deleteNodeBtn').addEventListener('click', deleteCurrentNode);

    // 编辑模态框隐藏时销毁EasyMDE
    document.getElementById('editModal').addEventListener('hidden.bs.modal', function() {
        destroyEasyMDE();
    });

    // 新增节点时设置默认日期
    document.getElementById('addNodeModal').addEventListener('show.bs.modal', function() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('startDate').value = today;
        document.getElementById('endDate').value = today;
        document.getElementById('nodeOwner').value = '张伟';
        document.getElementById('nodeManDays').value = '1';
        document.getElementById('nodeSort').value = '1';
    });
}

// ==================== 查找节点 ====================
function findNodeById(id, category) {
    if (!globalData) return null;
    if (category === 'main') {
        return globalData.projects.find(p => p.id === id) || null;
    }
    for (let p of globalData.projects) {
        if (category === 'sub') {
            const found = p.children.find(c => c.id === id);
            if (found) return found;
        } else if (category === 'meeting' || category === 'milestone') {
            const found = p.events.find(e => e.id === id);
            if (found) return found;
        }
    }
    return null;
}

// ==================== 折叠项目 ====================
function toggleProject(mainId) {
    collapsedProjects[mainId] = !collapsedProjects[mainId];
    renderGantt();
}


// 事件悬停卡片：仅显示名称和日期
function showEventTooltip(event, name, date) {
    const card = document.getElementById('barTooltipCard');
    // 更新现有元素
    document.getElementById('tipTitle').textContent = name;
    document.getElementById('tipStart').textContent = date;
    document.getElementById('tipEndRow').style.display = 'none';   // 隐藏“预计结束”
    document.getElementById('tipActualRow').style.display = 'none';  // 隐藏实际结束行

    // 定位（与 showTooltipCard 保持一致）
    let x = event.clientX + 15;
    let y = event.clientY - 10;
    const cardWidth = 200;
    const cardHeight = 80;   // 高度可适当减小
    if (x + cardWidth > window.innerWidth) x = event.clientX - cardWidth - 10;
    if (y + cardHeight > window.innerHeight) y = window.innerHeight - cardHeight - 10;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.style.display = 'block';
}
// ==================== 卡片 tooltip ====================
function showTooltipCard(event, name, start, end, actual) {
    const card = document.getElementById('barTooltipCard');
    document.getElementById('tipTitle').textContent = name;
    document.getElementById('tipStart').textContent = start || '-';
    document.getElementById('tipEnd').textContent = end || '-';
    document.getElementById('tipEndRow').style.display = 'flex';
    const actualRow = document.getElementById('tipActualRow');
    if (actual) {
        actualRow.style.display = 'flex';
        document.getElementById('tipActual').textContent = actual;
    } else {
        actualRow.style.display = 'none';
    }
    let x = event.clientX + 15;
    let y = event.clientY - 10;
    const cardWidth = 200;
    const cardHeight = 150;
    if (x + cardWidth > window.innerWidth) x = event.clientX - cardWidth - 10;
    if (y + cardHeight > window.innerHeight) y = window.innerHeight - cardHeight - 10;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.style.display = 'block';
}
function hideTooltipCard() {
    document.getElementById('barTooltipCard').style.display = 'none';
}

function showHoverLine(dateStr, title, posX) {
    const hoverLine = document.getElementById('hoverLine');
    const hoverTag = document.getElementById('hoverTag');
    hoverLine.style.left = `${posX}px`;
    hoverTag.innerText = `${dateStr} | ${title}`;
    hoverLine.style.display = 'block';
}
function hideHoverLine() {
    document.getElementById('hoverLine').style.display = 'none';
}

// ==================== 拖拽滚动 ====================
// 滚动容器为整个甘特图面板 #ganttBoard（单一滚动区域，页面本身不滚动）
// 支持横向 + 纵向双向拖拽
function initDragToScroll() {
    const board = document.getElementById('ganttBoard');
    let isDown = false, startX, startY, startScrollLeft, startScrollTop;

    board.addEventListener('mousedown', (e) => {
        // 左侧任务列表区域不启动拖拽（保留行点击编辑）
        if (e.target.closest('#leftPanel')) return;
        // 任务条 / 节点标记上不启动拖拽（保留点击编辑）
        if (e.target.closest('.node-marker') || e.target.closest('.bar-container') || e.target.closest('.bar-main')) return;
        isDown = true;
        const rect = board.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        startScrollLeft = board.scrollLeft;
        startScrollTop = board.scrollTop;
    });

    // mousemove / mouseup 挂在 window 上，指针拖出面板后依然有效
    window.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const rect = board.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        board.scrollLeft = startScrollLeft - (x - startX) * 1.5;
        board.scrollTop  = startScrollTop  - (y - startY) * 1.5;
    });
    window.addEventListener('mouseup', () => { isDown = false; });
}

// ==================== EasyMDE 管理 ====================
function destroyEasyMDE() {
    if (easyMDEInstance) {
        easyMDEInstance.toTextArea();
        easyMDEInstance = null;
    }
}

function initEasyMDE(text) {
    destroyEasyMDE();
    const textarea = document.getElementById('editDescription');
    easyMDEInstance = new EasyMDE({
        element: textarea,
        autofocus: false,
        spellChecker: false,
        minHeight: '200px',
        preview: true,          // 关键：开启预览模式
        sideBySide: false,      // 纯预览（不并排）
        toolbar: ['bold', 'italic', 'heading', '|', 'quote', 'unordered-list', 'ordered-list', '|', 'link', 'image', '|', 'preview', 'guide']
    });
    easyMDEInstance.value(text || '');

    // 延迟执行，确保 DOM 完全渲染
    setTimeout(() => {
        // 刷新 CodeMirror 实例，修正尺寸
        easyMDEInstance.codemirror.refresh();

        // 强制进入预览模式（保证一定是预览）
        const container = document.querySelector('.EasyMDEContainer');
        if (container && !container.classList.contains('editor-preview-active')) {
            easyMDEInstance.togglePreview();
        }

        // 设置容器高度，避免被挤压
        const wrapper = document.querySelector('.editor-wrapper .EasyMDEContainer');
        if (wrapper) wrapper.style.height = '100%';
    }, 150);
}

// ==================== 编辑模态框 ====================
if (!editModalInstance) {
    editModalInstance = new bootstrap.Modal(document.getElementById('editModal'), { backdrop: 'static' });
}

function openEditModal(node, category) {
    document.getElementById('editId').value = node.id;
    document.getElementById('editCategory').value = category;
    document.getElementById('editModalLabel').textContent = `编辑 ${node.name || '节点'}`;
    document.getElementById('editName').value = node.name || '';
    document.getElementById('editOwner').value = node.owner || '';

    const isSub = (category === 'sub');
    document.getElementById('subTaskFields').style.display = isSub ? 'block' : 'none';
    document.getElementById('eventFields').style.display = (category === 'meeting' || category === 'milestone') ? 'block' : 'none';

    if (isSub) {
        document.getElementById('editManDays').value = node.man_days || 0;
        document.getElementById('editProgress').value = node.progress || 0;
        document.getElementById('editStart').value = node.start || '';
        document.getElementById('editEnd').value = node.end || '';
        document.getElementById('editActualEnd').value = node.actual_end || '';
    } else if (category === 'meeting' || category === 'milestone') {
        document.getElementById('editEventDate').value = node.date || '';
    }

    editModalInstance.show();
    const modalElement = document.getElementById('editModal');
    modalElement.addEventListener('shown.bs.modal', function onShown() {
        modalElement.removeEventListener('shown.bs.modal', onShown);
        setTimeout(() => {
            initEasyMDE(node.description || '');
        }, 50);
}, { once: true });
}

// ==================== 保存编辑 ====================
function saveEdits() {
    let description = '';
    if (easyMDEInstance) {
        description = easyMDEInstance.value();
    } else {
        description = document.getElementById('editDescription').value;
    }

    const category = document.getElementById('editCategory').value;
    const payload = {
        id: document.getElementById('editId').value,
        name: document.getElementById('editName').value,
        owner: document.getElementById('editOwner').value,
        description: description
    };

    if (category === 'sub') {
        payload.man_days = parseFloat(document.getElementById('editManDays').value) || 0;
        payload.start = document.getElementById('editStart').value;
        payload.end = document.getElementById('editEnd').value;
        payload.actual_end = document.getElementById('editActualEnd').value || null;
    } else if (category === 'meeting' || category === 'milestone') {
        payload.date = document.getElementById('editEventDate').value;
    }

    fetch('/api/nodes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        if (data.success) {
            editModalInstance.hide();
            loadGanttData();
        } else {
            alert('更新失败：' + (data.error || '未知错误'));
        }
    })
    .catch(err => {
        alert('请求失败：' + err.message);
    });
}

function deleteCurrentNode() {
    const nodeId = document.getElementById('editId').value;
    if (!nodeId) return;
    if (!confirm('确定要删除此节点吗？')) return;
    fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                editModalInstance.hide();
                loadGanttData();
            } else {
                alert('删除失败：' + (data.error || '未知错误'));
            }
        });
}

function clearActualEnd() {
    const category = document.getElementById('editCategory').value;
    if (category !== 'sub') {
        alert('只有子任务可以清空实际完成日期');
        return;
    }
    document.getElementById('editActualEnd').value = '';
}

// ==================== 新增节点 ====================
function toggleFormType(val) {
    const endContainer = document.getElementById('endContainer');
    const manDaysInput = document.getElementById('manDaysInput');
    const startLabel = document.getElementById('startLabel');
    if (val === 'meeting' || val === 'milestone') {
        endContainer.style.display = 'none';
        manDaysInput.style.display = 'none';
        startLabel.innerText = '发生时间点';
    } else {
        endContainer.style.display = 'block';
        manDaysInput.style.display = 'block';
        startLabel.innerText = '开始日期';
    }
}

function submitNode() {
    const payload = {
        main_project_id: document.getElementById('mainProjectId').value,
        type: document.getElementById('nodeType').value,
        name: document.getElementById('nodeName').value,
        owner: document.getElementById('nodeOwner').value,
        man_days: parseFloat(document.getElementById('nodeManDays').value || 0),
        start: document.getElementById('startDate').value,
        end: document.getElementById('endDate').value || document.getElementById('startDate').value,
        description: document.getElementById('nodeDescription').value,
        sort_order: parseInt(document.getElementById('nodeSort').value) || 0
    };

    fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('addNodeModal')).hide();
            document.getElementById('nodeForm').reset();
            loadGanttData();
        } else {
            alert('添加失败：' + (data.error || '未知错误'));
        }
    });
}

// ==================== 新增项目 ====================
function submitNewProject() {
    const name = document.getElementById('newProjectName').value.trim();
    if (!name) {
        alert('请输入项目名称');
        return;
    }
    const sort_order = parseInt(document.getElementById('newProjectSort').value) || 0;
    const payload = {
        name: name,
        owner: document.getElementById('newProjectOwner').value,
        description: document.getElementById('newProjectDesc').value,
        sort_order: sort_order
    };
    fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            collapsedProjects[data.id] = false;
            bootstrap.Modal.getInstance(document.getElementById('addProjectModal')).hide();
            document.getElementById('addProjectForm').reset();
            loadGanttData();
        } else {
            alert('创建失败：' + (data.error || '未知错误'));
        }
    });
}

// ==================== 导出 Excel ====================
function exportToExcel() {
    if (!globalData || !globalData.projects) {
        alert('没有数据可导出');
        return;
    }

    const taskRows = [];
    const headers = ['层级', '项目/任务名称', '负责人', '开始日期', '预计结束日期', 
                     '实际结束日期', '人天', '进度(%)', '自然日', '工作日', '描述'];
    taskRows.push(headers);

    globalData.projects.forEach(main => {
        taskRows.push([
            '主项目',
            main.name,
            main.owner || '',
            main.start || '',
            main.end || '',
            '',
            main.man_days || 0,
            '',
            main.calendar_days || 0,
            main.work_days || 0,
            main.description || ''
        ]);
        (main.children || []).forEach(child => {
            taskRows.push([
                '  └─ 子任务',
                child.name,
                child.owner || '',
                child.start || '',
                child.end || '',
                child.actual_end || '',
                child.man_days || 0,
                child.progress || 0,
                child.calendar_days || 0,
                child.work_days || 0,
                child.description || ''
            ]);
        });
    });

    const eventRows = [];
    const eventHeaders = ['归属项目', '事件名称', '类型', '负责人', '日期', '描述'];
    eventRows.push(eventHeaders);
    globalData.projects.forEach(main => {
        (main.events || []).forEach(evt => {
            eventRows.push([
                main.name,
                evt.name,
                evt.type === 'meeting' ? '沟通会' : '里程碑',
                evt.owner || '',
                evt.date || '',
                evt.description || ''
            ]);
        });
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(taskRows);
    ws1['!cols'] = [
        { wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 16 },
        { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, '任务列表');

    const ws2 = XLSX.utils.aoa_to_sheet(eventRows);
    ws2['!cols'] = [
        { wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '事件列表');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `甘特图数据_${new Date().toISOString().slice(0,10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ==================== 加载数据 ====================
function loadGanttData() {
    fetch('/api/projects')
        .then(res => res.json())
        .then(data => {
            globalData = data;
            renderGantt();
            populateDropdown(data.projects);
        })
        .catch(err => {
            alert('加载数据失败：' + err.message);
        });
}

function populateDropdown(projects) {
    const select = document.getElementById('mainProjectId');
    select.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

// ==================== 面板高度自适应 ====================
// 让甘特图成为页面上唯一的纵向滚动区域（避免"页面 + 面板"双滚动条）
function fitBoardHeight() {
    const board = document.getElementById('ganttBoard');
    const top = board.getBoundingClientRect().top;
    const available = window.innerHeight - top - 16; // 16px 底部留白
    board.style.maxHeight = Math.max(available, 300) + 'px';
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
    loadGanttData();
    setupEventDelegation();
    initDragToScroll();   // 只绑定一次，避免重复监听
    fitBoardHeight();     // 设置唯一滚动区域的高度
    window.addEventListener('resize', fitBoardHeight);
    toggleFormType('sub');
    // 顶部图例折叠切换
    const toggleBtn = document.getElementById('toggleTopBar');
    const container = document.querySelector('.container-fluid');

    toggleBtn.addEventListener('click', function() {
        container.classList.toggle('top-bar-hidden');
        const icon = this.querySelector('i');
        if (container.classList.contains('top-bar-hidden')) {
            icon.className = 'bi bi-chevron-down';
            this.title = '显示图例';
        } else {
            icon.className = 'bi bi-chevron-up';
            this.title = '隐藏图例';
        }
        // 重新计算甘特图高度，适应新布局
        fitBoardHeight();
    });
});
