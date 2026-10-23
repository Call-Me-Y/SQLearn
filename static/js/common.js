// 通用JavaScript功能
// 用于所有页面的共享功能

// 数据库结构数据
let databaseStructure = null;
// 数据库表格数据
let databaseTableData = null;

// 加载数据库结构数据
async function loadDatabaseStructure() {
    try {
        const response = await fetch('/static/data/database_structure.json');
        databaseStructure = await response.json();
        return databaseStructure;
    } catch (error) {
        console.error('加载数据库结构失败:', error);
        return null;
    }
}

// 加载数据库表格数据
async function loadDatabaseTableData() {
    try {
        const response = await fetch('/static/data/database_table.json');
        databaseTableData = await response.json();
        return databaseTableData;
    } catch (error) {
        console.error('加载数据库表格数据失败:', error);
        return null;
    }
}

// 动态生成侧边栏内容
function generateSidebarContent(database) {
    if (!databaseStructure || !databaseStructure[database]) {
        console.error('数据库结构未加载或不存在:', database);
        return '';
    }
    
    const dbData = databaseStructure[database];
    let html = '';
    
    // 遍历所有表
    Object.keys(dbData.tables).forEach(tableKey => {
        const table = dbData.tables[tableKey];
        html += `
            <div class="table-group" data-table-name="${tableKey}">
                <div class="table-group-header">
                    <h4>${table.name}</h4>
                    <button class="view-data-btn" onclick="showTablePopup('${tableKey}')" title="查看表格数据">预览</button>
                </div>
                <div class="table-structure">
        `;
        
        // 遍历所有列
        Object.keys(table.columns).forEach(columnKey => {
            const column = table.columns[columnKey];
            const keyClass = column.key ? (column.key.includes('PK') ? 'primary-key' : 'foreign-key') : '';
            const keyText = column.key ? `, ${column.key}` : '';
            
            html += `
                <div class="column-item ${keyClass}">
                    <span class="column-name">${columnKey} ${column.name}</span>
                    <span class="column-type">${column.type}</span>
                    <span class="column-null">${column.null}${keyText}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    return html;
}

// 更新侧边栏内容
function updateSidebarContent(database) {
    const databaseStructure = document.getElementById('databaseStructure');
    if (databaseStructure) {
        databaseStructure.innerHTML = generateSidebarContent(database);
    }
}

// 显示表格浮窗
function showTablePopup(tableName) {
    if (!databaseTableData) {
        console.error('数据库表格数据未加载');
        return;
    }
    
    // 创建浮窗元素（如果不存在）
    let popup = document.getElementById('table-popup');
    if (!popup) {
        popup = createTablePopup();
    }
    
    const popupTitle = document.getElementById('popup-title');
    const popupTables = document.getElementById('popup-tables');
    
    // 获取表的显示名称
    const currentDb = getCurrentDatabase();
    const dbData = databaseStructure[currentDb];
    const tableDisplayName = dbData && dbData.tables[tableName] ? dbData.tables[tableName].name : tableName;
    
    if (popupTitle) popupTitle.textContent = `${tableDisplayName} 表格数据`;
    
    // 根据当前数据库类型显示不同的表格
    let tables = [];
    
    if (currentDb === 'study' && databaseTableData.Study && databaseTableData.Study[tableName]) {
        tables = databaseTableData.Study[tableName];
    } else if (currentDb === 'teach' && databaseTableData.Teach && databaseTableData.Teach[tableName]) {
        tables = databaseTableData.Teach[tableName];
    }
    
    if (tables.length === 0) {
        if (popupTables) popupTables.innerHTML = '<p>暂无数据</p>';
    } else {
        // 创建表格HTML
        let tableHtml = '<div class="table-container">';
        tableHtml += '<table class="data-table">';
        
        // 表头
        if (tables.length > 0) {
            tableHtml += '<thead><tr>';
            Object.keys(tables[0]).forEach(key => {
                tableHtml += `<th>${key}</th>`;
            });
            tableHtml += '</tr></thead>';
        }
        
        // 表体
        tableHtml += '<tbody>';
        tables.forEach(row => {
            tableHtml += '<tr>';
            Object.values(row).forEach(value => {
                const displayValue = value === null ? 'NULL' : value;
                tableHtml += `<td>${displayValue}</td>`;
            });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody>';
        tableHtml += '</table>';
        tableHtml += '</div>';
        
        if (popupTables) popupTables.innerHTML = tableHtml;
    }
    
    popup.style.display = 'block';
    // 使用setTimeout确保display生效后再设置opacity，触发动画
    setTimeout(() => {
        popup.style.opacity = '1';
    }, 10);
}

// 隐藏表格浮窗
function hideTablePopup() {
    const popup = document.getElementById('table-popup');
    if (popup) {
        popup.style.opacity = '0';
        setTimeout(() => {
            popup.style.display = 'none';
        }, 300);
    }
}

// 点击弹窗外部关闭
document.addEventListener('click', function(event) {
    const popup = document.getElementById('table-popup');
    if (popup && popup.style.display === 'block') {
        // 如果点击的是弹窗外部（背景遮罩）
        if (!popup.contains(event.target) && !event.target.classList.contains('view-data-btn')) {
            hideTablePopup();
        }
    }
});

// 创建表格浮窗元素
function createTablePopup() {
    const popup = document.createElement('div');
    popup.id = 'table-popup';
    popup.className = 'table-popup';
    popup.style.display = 'none';
    popup.style.opacity = '0';
    popup.innerHTML = `
        <div class="popup-header">
            <h3 id="popup-title">数据库表格</h3>
            <button class="popup-close" onclick="hideTablePopup()">&times;</button>
        </div>
        <div class="popup-content">
            <div id="popup-tables"></div>
        </div>
    `;
    document.body.appendChild(popup);
    return popup;
}

// 获取当前选中的数据库
function getCurrentDatabase() {
    const activeBtn = document.querySelector('.db-switch-btn.active');
    return activeBtn ? activeBtn.getAttribute('data-db') : 'study';
}

// 数据库切换功能
function initDatabaseSwitch() {
    const dbSwitchBtns = document.querySelectorAll('.db-switch-btn');
    
    dbSwitchBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetDb = this.getAttribute('data-db');
            
            // 更新按钮状态
            dbSwitchBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // 更新侧边栏内容
            updateSidebarContent(targetDb);
            
            // 触发数据库切换事件
            const event = new CustomEvent('databaseChanged', {
                detail: { database: targetDb }
            });
            document.dispatchEvent(event);
        });
    });
}

// 侧边栏折叠功能
function initSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleIcon = toggleBtn ? toggleBtn.querySelector('.toggle-icon') : null;
    
    if (toggleBtn && sidebar && toggleIcon) {
        // 从localStorage恢复侧边栏状态
        const savedState = localStorage.getItem('sidebarCollapsed');
        if (savedState === 'true') {
            sidebar.classList.add('collapsed');
            toggleIcon.textContent = '▶';
            toggleBtn.classList.add('collapsed');
            if (mainContent) {
                mainContent.style.marginLeft = '0';
            }
        }
        
        toggleBtn.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            // 保存状态到localStorage
            localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
            
            // 更新图标方向
            if (isCollapsed) {
                toggleIcon.textContent = '▶';
                // 添加收起状态的样式类
                toggleBtn.classList.add('collapsed');
                // 调整主内容区域的布局
                if (mainContent) {
                    mainContent.style.marginLeft = '0';
                }
            } else {
                toggleIcon.textContent = '◀';
                // 移除收起状态的样式类
                toggleBtn.classList.remove('collapsed');
                // 恢复主内容区域的布局
                if (mainContent) {
                    mainContent.style.marginLeft = '';
                }
            }
            
            // 触发窗口resize事件，让其他组件能够响应布局变化
            window.dispatchEvent(new Event('resize'));
        });
    }
}

// 示例卡片点击功能
function initExampleCards() {
    const exampleCards = document.querySelectorAll('.example-card');
    
    exampleCards.forEach(card => {
        card.addEventListener('click', function() {
            const exampleText = this.getAttribute('data-example');
            const nlInput = document.getElementById('nlInput');
            
            if (nlInput) {
                nlInput.value = exampleText;
                // 触发输入事件
                nlInput.dispatchEvent(new Event('input'));
            }
        });
    });
}

// 图形化SQL构建器初始化（已移至专门的visual-sql-builder.js文件）

// 自然语言转换器初始化
function initNaturalLanguageConverter() {
    console.log('初始化自然语言转换器');
    
    // 清空输入
    const clearBtn = document.getElementById('clearInput');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            const nlInput = document.getElementById('nlInput');
            const generatedSql = document.getElementById('generatedSql');
            const resultsTable = document.getElementById('resultsTable');
            
            if (nlInput) {
                nlInput.value = '';
            }
            if (generatedSql) {
                generatedSql.textContent = '-- 请输入自然语言描述';
            }
            if (resultsTable) {
                resultsTable.innerHTML = '<p>点击"转换"后点击"执行查询"查看结果</p>';
            }
        });
    }
    
    // 转换查询
    const convertBtn = document.getElementById('convertQuery');
    if (convertBtn) {
        convertBtn.addEventListener('click', async function() {
            const nlInput = document.getElementById('nlInput');
            const generatedSql = document.getElementById('generatedSql');
            
            if (nlInput && generatedSql) {
                const inputText = nlInput.value.trim();
                if (inputText) {
                    // 显示加载状态
                    convertBtn.disabled = true;
                    convertBtn.textContent = '转换中...';
                    generatedSql.textContent = '正在转换，请稍候...';
                    
                    try {
                        // 调用后端API进行自然语言转SQL
                        const response = await fetch('/api/natural-language-to-sql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                natural_language: inputText,
                                database: getCurrentDatabase()
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            generatedSql.textContent = result.sql_query;
                            showNotification('转换成功！', 'success');
                            
                            // 自动执行查询
                            await autoExecuteQuery(result.sql_query);
                        } else {
                            generatedSql.textContent = `-- 转换失败: ${result.error}`;
                            showNotification(`转换失败: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        console.error('转换错误:', error);
                        generatedSql.textContent = '-- 转换失败: 网络错误或服务器异常';
                        showNotification('转换失败: 网络错误', 'error');
                    } finally {
                        // 恢复按钮状态
                        convertBtn.disabled = false;
                        convertBtn.textContent = '转换';
                    }
                } else {
                    showNotification('请输入自然语言描述', 'error');
                }
            }
        });
    }
    
    // 执行生成的查询
    const executeBtn = document.getElementById('executeGeneratedQuery');
    if (executeBtn) {
        executeBtn.addEventListener('click', async function() {
            const generatedSql = document.getElementById('generatedSql');
            const resultsTable = document.getElementById('resultsTable');
            
            if (generatedSql && resultsTable) {
                const sqlQuery = generatedSql.textContent;
                if (sqlQuery && !sqlQuery.startsWith('--')) {
                    // 显示加载状态
                    executeBtn.disabled = true;
                    executeBtn.textContent = '执行中...';
                    resultsTable.innerHTML = `
                        <div class="loading">正在执行查询...</div>
                    `;
                    
                    try {
                        // 调用后端API执行SQL查询
                        const response = await fetch('/api/execute-sql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                sql: sqlQuery,
                                database: getCurrentDatabase()
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            // 显示查询结果
                            displayQueryResults(result, resultsTable);
                            showNotification('查询执行成功！', 'success');
                        } else {
                            resultsTable.innerHTML = `
                                <div class="error-message">
                                    <h4>查询执行失败</h4>
                                    <p>${result.error}</p>
                                </div>
                            `;
                            showNotification(`查询执行失败: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        console.error('执行查询错误:', error);
                        resultsTable.innerHTML = `
                            <div class="error-message">
                                <h4>执行失败</h4>
                                <p>网络错误或服务器异常</p>
                            </div>
                        `;
                        showNotification('查询执行失败: 网络错误', 'error');
                    } finally {
                        // 恢复按钮状态
                        executeBtn.disabled = false;
                        executeBtn.textContent = '执行查询';
                    }
                } else {
                    showNotification('请先生成SQL语句', 'error');
                }
            }
        });
    }
}

// 关系图谱初始化
function initRelationshipDiagram() {
    console.log('初始化关系图谱');
    
    // 重置视图
    const resetBtn = document.getElementById('resetView');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            const canvas = document.getElementById('diagramCanvas');
            if (canvas) {
                // 重置图表视图
                canvas.innerHTML = `
                    <div class="diagram-placeholder">
                        <div class="placeholder-icon">📊</div>
                        <p>关系图已重置</p>
                    </div>
                `;
            }
        });
    }
    
    // 导出图片
    const exportBtn = document.getElementById('exportDiagram');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            alert('导出功能开发中...');
        });
    }
    
    // 初始化图表
    renderRelationshipDiagram();
}

// 显示查询结果
function displayQueryResults(result, container) {
    if (!result.data || result.data.length === 0) {
        container.innerHTML = `
            <div class="no-results">
                <p>查询成功，但没有返回数据</p>
                <p>共 ${result.row_count || 0} 行</p>
            </div>
        `;
        return;
    }
    
    let tableHtml = '<div class="table-container">';
    tableHtml += '<table class="results-table-content">';
    
    // 表头
    if (result.columns && result.columns.length > 0) {
        tableHtml += '<thead><tr>';
        result.columns.forEach(column => {
            tableHtml += `<th>${column}</th>`;
        });
        tableHtml += '</tr></thead>';
    }
    
    // 表体
    tableHtml += '<tbody>';
    result.data.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(cell => {
            const displayValue = cell === null ? 'NULL' : cell;
            tableHtml += `<td>${displayValue}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody>';
    tableHtml += '</table>';
    tableHtml += '</div>';
    
    // 添加结果统计信息
    tableHtml += `
        <div class="result-summary">
            <p>查询成功，共返回 ${result.row_count || 0} 行数据</p>
        </div>
    `;
    
    container.innerHTML = tableHtml;
}

// 简单的自然语言转SQL转换器（模拟）
function convertNaturalLanguageToSQL(naturalLanguage) {
    const text = naturalLanguage.toLowerCase();
    
    // 简单的关键词匹配
    if (text.includes('所有学生') || text.includes('学生信息')) {
        return 'SELECT * FROM S;';
    } else if (text.includes('年龄') && text.includes('大于')) {
        return 'SELECT * FROM S WHERE Age > 20;';
    } else if (text.includes('平均成绩')) {
        return 'SELECT SNo, AVG(Score) FROM SC GROUP BY SNo;';
    } else if (text.includes('选修') && text.includes('课程')) {
        return 'SELECT S.* FROM S, SC, C WHERE S.SNo = SC.SNo AND SC.CNo = C.CNo;';
    } else {
        return '-- 无法识别查询意图，请尝试更简单的描述';
    }
}

// 渲染关系图谱
function renderRelationshipDiagram() {
    const canvas = document.getElementById('diagramCanvas');
    if (!canvas) return;
    
    // 简单的SVG关系图
    const svg = `
        <svg width="100%" height="400" viewBox="0 0 800 400">
            <!-- 表框 -->
            <rect x="50" y="50" width="120" height="80" fill="#e3f2fd" stroke="#2196f3" stroke-width="2" rx="5"/>
            <text x="110" y="70" text-anchor="middle" font-size="12" font-weight="bold">学生表(S)</text>
            <text x="60" y="90" font-size="10">SNo (PK)</text>
            <text x="60" y="105" font-size="10">SN</text>
            <text x="60" y="120" font-size="10">Age</text>
            
            <rect x="300" y="50" width="120" height="80" fill="#e8f5e8" stroke="#4caf50" stroke-width="2" rx="5"/>
            <text x="360" y="70" text-anchor="middle" font-size="12" font-weight="bold">课程表(C)</text>
            <text x="310" y="90" font-size="10">CNO (PK)</text>
            <text x="310" y="105" font-size="10">CN</text>
            <text x="310" y="120" font-size="10">CT</text>
            
            <rect x="550" y="50" width="120" height="80" fill="#fff3e0" stroke="#ff9800" stroke-width="2" rx="5"/>
            <text x="610" y="70" text-anchor="middle" font-size="12" font-weight="bold">成绩表(SC)</text>
            <text x="560" y="90" font-size="10">SNo (FK)</text>
            <text x="560" y="105" font-size="10">CNO (FK)</text>
            <text x="560" y="120" font-size="10">Score</text>
            
            <rect x="300" y="200" width="120" height="80" fill="#fce4ec" stroke="#e91e63" stroke-width="2" rx="5"/>
            <text x="360" y="220" text-anchor="middle" font-size="12" font-weight="bold">教师表(T)</text>
            <text x="310" y="240" font-size="10">TNO (PK)</text>
            <text x="310" y="255" font-size="10">TN</text>
            <text x="310" y="270" font-size="10">Dept</text>
            
            <!-- 关系线 -->
            <line x1="170" y1="90" x2="300" y2="90" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            <line x1="420" y1="90" x2="550" y2="90" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            <line x1="360" y1="130" x2="360" y2="200" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>
            
            <!-- 箭头标记 -->
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
                </marker>
            </defs>
            
            <!-- 关系标签 -->
            <text x="235" y="85" text-anchor="middle" font-size="10" fill="#666">1:N</text>
            <text x="485" y="85" text-anchor="middle" font-size="10" fill="#666">1:N</text>
            <text x="360" y="165" text-anchor="middle" font-size="10" fill="#666">1:N</text>
        </svg>
    `;
    
    canvas.innerHTML = svg;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    // 加载数据库结构数据
    await loadDatabaseStructure();
    
    // 加载数据库表格数据
    await loadDatabaseTableData();
    
    // 初始化通用功能
    initDatabaseSwitch();
    initSidebarToggle();
    initExampleCards();
    
    // 初始化默认侧边栏内容（Study数据库）
    updateSidebarContent('study');
    
    // 根据当前页面初始化特定功能
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('natural-language')) {
        initNaturalLanguageConverter();
    } else if (currentPage.includes('relationship-diagram')) {
        initRelationshipDiagram();
    }
    // visual-sql页面的初始化已移至visual-sql-builder.js
});

// 工具函数
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加样式
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    if (type === 'success') {
        notification.style.backgroundColor = '#4caf50';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#f44336';
    } else {
        notification.style.backgroundColor = '#2196f3';
    }
    
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// 自动执行查询函数
async function autoExecuteQuery(sqlQuery) {
    const resultsTable = document.getElementById('resultsTable');
    const executeBtn = document.getElementById('executeGeneratedQuery');
    
    if (!resultsTable) return;
    
    // 显示加载状态
    if (executeBtn) {
        executeBtn.disabled = true;
        executeBtn.textContent = '执行中...';
    }
    
    resultsTable.innerHTML = `
        <div class="loading">正在自动执行查询...</div>
    `;
    
    try {
        // 调用后端API执行SQL查询
        const response = await fetch('/api/execute-sql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sqlQuery,
                database: getCurrentDatabase()
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 显示查询结果
            displayQueryResults(result, resultsTable);
            showNotification('查询自动执行成功！', 'success');
        } else {
            resultsTable.innerHTML = `
                <div class="error-message">
                    <h4>查询执行失败</h4>
                    <p>${result.error}</p>
                </div>
            `;
            showNotification(`查询执行失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('自动执行查询错误:', error);
        resultsTable.innerHTML = `
            <div class="error-message">
                <h4>执行失败</h4>
                <p>网络错误或服务器异常</p>
            </div>
        `;
        showNotification('查询执行失败: 网络错误', 'error');
    } finally {
        // 恢复按钮状态
        if (executeBtn) {
            executeBtn.disabled = false;
            executeBtn.textContent = '执行查询';
        }
    }
}
