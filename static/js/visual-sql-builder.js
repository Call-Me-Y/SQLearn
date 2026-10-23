// 图形化SQL构建器（统一版本）
class VisualSQLBuilder {
    constructor() {
        this.currentDatabase = 'study';
        this.databaseStructure = null;
        this.selectedColumnKeys = []; // 存储列信息：字符串(列名)或对象({custom: true, name, expression, groupBy})
        this.orderByItems = []; // [{column, direction}] direction: 'ASC'|'DESC'
        this.topLimit = null; // number|undefined 顺序取查询数量
        this.simpleConditions = []; // [{column, operator, value, connector}] connector: 'AND'|'OR'
        this.complexConditions = []; // [{mainColumn, operator, subqueryConditions: [{column, operator, value}]}]
        this.tableRelations = {};
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadDatabaseStructure();
        this.setupTableRelations();
    }
    
    setupEventListeners() {
        // 数据库切换
        document.addEventListener('databaseChanged', (e) => {
            this.currentDatabase = e.detail.database;
            // 清空搜索框
            const searchInput = document.getElementById('columnSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }
            this.resetBuilder();
            this.updateColumnSelector();
        });
        
        // 添加排序规则按钮
        document.getElementById('addOrderBtn')?.addEventListener('click', () => {
            this.showOrderEditor();
        });
        
        // 添加简单过滤条件按钮
        document.getElementById('addSimpleConditionBtn')?.addEventListener('click', () => {
            this.showSimpleConditionEditor(null);
        });
        
        // 添加复杂过滤条件按钮
        document.getElementById('addComplexCondition')?.addEventListener('click', () => {
            this.addComplexCondition();
        });
        
        // 初始化显示
        this.updateOrderDisplay();
        this.updateSimpleConditionsDisplay();
        this.updateComplexConditionsDisplay();
        
        // 顺序取查询数量输入框
        document.getElementById('topLimit')?.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            this.topLimit = value ? parseInt(value) : null;
        });
        
        // 清空和生成SQL按钮
        document.getElementById('clearBuilder')?.addEventListener('click', () => {
            this.clearBuilder();
        });
        
        document.getElementById('generateSQL')?.addEventListener('click', () => {
            this.generateSQL();
        });
        
        // 方案执行按钮（动态生成）
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('execute-solution-btn')) {
                const index = parseInt(e.target.dataset.index);
                this.executeQuery(index);
            }
        });
    }
    
    async loadDatabaseStructure() {
        try {
            const response = await fetch('/static/data/database_structure.json');
            this.databaseStructure = await response.json();
            this.updateColumnSelector();
        } catch (error) {
            console.error('加载数据库结构失败:', error);
        }
    }
    
    setupTableRelations() {
        // 定义表之间的关系（基于关系图谱）
        // 格式: { table: { column: [targetTable, targetColumn] } }
        this.tableRelations = {
            study: {
                'S': { 'SNo': ['Homework', 'SNO'] }, // S.SNo = Homework.SNO (注意大小写不同)
                'Homework': { 'CNO': ['C', 'CNO'], 'SNO': ['S', 'SNo'] },
                'C': { 'CNO': ['Homework', 'CNO'] }
            },
            teach: {
                'S': { 'SNo': ['SC', 'SNo'] },
                'SC': { 'SNo': ['S', 'SNo'], 'CNO': ['C', 'CNO'] },
                'C': { 'CNO': ['SC', 'CNO'] },
                'T': { 'TNO': ['TC', 'TNO'] },
                'TC': { 'TNO': ['T', 'TNO'], 'CNO': ['C', 'CNO'] }
            }
        };
    }
    
    updateColumnSelector() {
        if (!this.databaseStructure || !this.databaseStructure[this.currentDatabase]) {
            return;
        }
        
        const dbData = this.databaseStructure[this.currentDatabase];
        const columnSelector = document.getElementById('columnSelector');
        
        if (!columnSelector) return;
        
        // 收集所有列（合并同名）
        const allColumns = {}; // {columnKey: [{table, column, name}]}
        const tablesList = [];
        
            Object.keys(dbData.tables).forEach(tableKey => {
                const table = dbData.tables[tableKey];
            tablesList.push({ key: tableKey, name: table.name });
            
            // 添加"*表的所有内容"选项
            allColumns[`*${tableKey}`] = allColumns[`*${tableKey}`] || [];
            allColumns[`*${tableKey}`].push({
                table: tableKey,
                column: '*',
                name: `${table.name}的所有内容`,
                type: 'all_columns'
            });
            
            // 添加普通列
            Object.keys(table.columns).forEach(columnKey => {
                const column = table.columns[columnKey];
                if (!allColumns[columnKey]) {
                    allColumns[columnKey] = [];
                }
                allColumns[columnKey].push({
                    table: tableKey,
                    column: columnKey,
                    name: column.name,
                    type: 'column'
                });
            });
        });
        
        // 生成HTML
        let html = '<div class="column-options">';
        
        // 1. 添加"*表的所有内容"选项
        html += '<div class="column-group"><h5>表的所有内容</h5><div class="column-items">';
        tablesList.forEach(table => {
            html += `
                <div class="column-item all-columns" data-table="${table.key}" data-type="all_columns">
                    <span class="column-name">*${table.key}</span>
                    <span class="column-desc">${table.name}的所有内容</span>
                </div>
            `;
        });
        html += '</div></div>';
        
        // 2. 添加普通列（合并同名）
        html += '<div class="column-group"><h5>列名</h5><div class="column-items">';
        Object.keys(allColumns).filter(key => !key.startsWith('*')).forEach(columnKey => {
            const columns = allColumns[columnKey];
            
            // 生成显示名称
            let displayName = '';
            let displayDesc = '';
            
            // 统一显示列名的中文含义
            displayName = `${columnKey}`;
            
            if (columns.length > 1) {
                // 多个表：检查所有表的列名含义是否相同
                const columnNames = columns.map(col => col.name);
                const uniqueNames = [...new Set(columnNames)];
                
                // 如果所有表的中文含义相同，显示该含义；否则显示第一个表的含义
                displayDesc = uniqueNames.length === 1 ? uniqueNames[0] : columns[0].name;
            } else {
                // 单个表：显示列的中文名称
                displayDesc = `${columns[0].name}`;
            }
            
            // 存储所有包含此列的表信息到data属性
            const tablesData = JSON.stringify(columns.map(col => ({ table: col.table, column: col.column })));
            
                html += `
                <div class="column-item column-name-item" data-column="${columnKey}" data-tables="${encodeURIComponent(tablesData)}" data-type="column">
                    <span class="column-name">${displayName}</span>
                    <span class="column-desc">${displayDesc}</span>
                </div>
            `;
        });
        html += '</div></div>';
        
        // 2.5 显示已创建的自定义列
        const customColumns = this.selectedColumnKeys.filter(key => typeof key === 'object' && key.custom);
        if (customColumns.length > 0) {
            html += '<div class="column-group"><h5>自定义列</h5><div class="column-items">';
            customColumns.forEach(customCol => {
                    html += `
                    <div class="column-item column-name-item" data-custom="true" data-name="${customCol.name}" data-type="custom">
                        <span class="column-name">${customCol.name}</span>
                    </div>
                    `;
                });
            html += '</div></div>';
        }
        
        // 3. 添加"自定义"选项（自定义新列）
        html += '<div class="column-group"><div class="column-items">';
        html += `
            <div class="column-item more-item" data-type="more">
                <span class="column-name">自定义</span>
                <span class="column-desc">自定义新的列</span>
            </div>
        `;
                html += '</div></div>';
        
        
            html += '</div>';
        columnSelector.innerHTML = html;
        
        // 绑定点击事件
        this.bindColumnClickEvents();
        
        // 绑定搜索事件
        this.bindSearchEvents();
    }
    
    bindSearchEvents() {
        const searchInput = document.getElementById('columnSearchInput');
        if (!searchInput) return;
        
        // 实时搜索
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            this.filterColumns(keyword);
        });
        
        // 清空搜索时显示所有
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                this.filterColumns('');
            }
        });
    }
    
    filterColumns(keyword) {
        const columnItems = document.querySelectorAll('.column-item');
        
        if (!keyword) {
            // 显示所有
            columnItems.forEach(item => {
                item.style.display = '';
            });
            // 显示所有列组
            document.querySelectorAll('.column-group').forEach(group => {
                group.style.display = '';
            });
            return;
        }
        
        columnItems.forEach(item => {
            const columnName = item.querySelector('.column-name')?.textContent.toLowerCase() || '';
            const columnDesc = item.querySelector('.column-desc')?.textContent.toLowerCase() || '';
            
            // 搜索列代号或中文含义
            if (columnName.includes(keyword) || columnDesc.includes(keyword)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
        
        // 隐藏空的列组
        document.querySelectorAll('.column-group').forEach(group => {
            const visibleItems = Array.from(group.querySelectorAll('.column-item')).filter(item => {
                return item.style.display !== 'none' && (item.style.display === '' || !item.style.display);
            });
            
            if (visibleItems.length === 0) {
                group.style.display = 'none';
        } else {
                group.style.display = '';
            }
        });
    }
    
    bindColumnClickEvents() {
        const columnSelector = document.getElementById('columnSelector');
        
        // 处理列点击
        columnSelector.addEventListener('click', (e) => {
            const item = e.target.closest('.column-item');
            if (!item) return;
            
            const type = item.dataset.type;
            
            if (type === 'all_columns') {
                // 添加表的所有列
                const table = item.dataset.table;
                this.addTableAllColumns(table);
            } else if (type === 'column') {
                // 只添加列名，不指定表
                const columnKey = item.dataset.column;
                this.addColumnKey(columnKey);
            } else if (type === 'custom') {
                // 点击自定义列，重新添加（如果还没有的话）
                const customName = item.dataset.name;
                const customCol = this.selectedColumnKeys.find(key => 
                    typeof key === 'object' && key.custom && key.name === customName
                );
                if (!customCol) {
                    // 如果不存在，说明可能被删除了，不应该出现在这里
                    // 但为了安全，我们不做任何操作
                }
                // 已存在的自定义列，点击不做操作（或可以显示编辑选项）
            } else if (type === 'more') {
                // 显示自定义列弹窗（包含名称输入）
                this.showAllColumnsModal();
            }
        });
    }
    
    showExpressionModal(context) {
        // context: 'order' 或 'simpleCondition'
        // 创建只输入表达式的弹窗（没有名称输入）
        const presetColumns = this.getPresetColumns();
        
        let html = '<div class="custom-column-modal" id="expressionModal">';
        html += '<div class="modal-content large">';
        html += '<div class="modal-header"><h3>输入SQL表达式</h3><span class="modal-close">&times;</span></div>';
        html += '<div class="modal-body">';
        
        // 预设列名区域
        if (presetColumns.length > 0) {
            html += '<div class="preset-columns-section">';
            html += '<h4>预设表达式</h4>';
            html += '<div class="preset-columns-list">';
            presetColumns.forEach(preset => {
                html += `
                    <div class="preset-column-item" data-preset='${JSON.stringify(preset)}'>
                        <span class="preset-name">${preset.name}</span>
                        <span class="preset-desc">${preset.expression}</span>
                    </div>
                `;
            });
            html += '</div></div>';
        }
        
        // SQL表达式编辑
        html += '<div class="custom-column-form">';
        html += '<div class="form-group">';
        html += '<label>SQL表达式：</label>';
        html += '<textarea id="expressionInput" rows="4" placeholder="输入SQL表达式（如：HW1 + HW2 + HW3, AVG(Score), COUNT(*), YEAR(BirthDate)等）"></textarea>';
        html += '<div class="expression-hint">';
        html += '<details><summary>📖 SQL表达式编写规则和库函数</summary>';
        html += '<div class="hint-content">';
        html += '<h5>常用聚合函数：</h5>';
        html += '<ul>';
        html += '<li><strong>SUM(列名)</strong> - 求和，如：SUM(Score1)</li>';
        html += '<li><strong>AVG(列名)</strong> - 求平均值，如：AVG(Score)</li>';
        html += '<li><strong>COUNT(列名)</strong> - 计数，如：COUNT(CNO)</li>';
        html += '<li><strong>MAX(列名)</strong> - 求最大值</li>';
        html += '<li><strong>MIN(列名)</strong> - 求最小值</li>';
        html += '</ul>';
        html += '<h5>常用字符串函数：</h5>';
        html += '<ul>';
        html += '<li><strong>CONCAT(列1, 列2)</strong> - 连接字符串</li>';
        html += '<li><strong>SUBSTRING(列, 开始, 长度)</strong> - 截取字符串</li>';
        html += '<li><strong>LEN(列)</strong> - 字符串长度</li>';
        html += '</ul>';
        html += '<h5>常用日期函数：</h5>';
        html += '<ul>';
        html += '<li><strong>YEAR(日期列)</strong> - 提取年份，如：YEAR(BirthDate)</li>';
        html += '<li><strong>MONTH(日期列)</strong> - 提取月份</li>';
        html += '<li><strong>DAY(日期列)</strong> - 提取日期</li>';
        html += '<li><strong>GETDATE()</strong> - 当前日期时间</li>';
        html += '</ul>';
        html += '<h5>数学运算：</h5>';
        html += '<ul>';
        html += '<li><strong>+</strong> - 加法，如：HW1 + HW2 + HW3</li>';
        html += '<li><strong>-</strong> - 减法</li>';
        html += '<li><strong>*</strong> - 乘法</li>';
        html += '<li><strong>/</strong> - 除法</li>';
        html += '</ul>';
        html += '<h5>示例：</h5>';
        html += '<ul>';
        html += '<li>三次作业总分：<code>HW1 + HW2 + HW3</code> 或 <code>SUM(HW1) + SUM(HW2) + SUM(HW3)</code></li>';
        html += '<li>三次作业平均分：<code>AVG(HW1 + HW2 + HW3)</code></li>';
        html += '<li>出生年份：<code>YEAR(Birth)</code></li>';
        html += '<li>选课门数：<code>COUNT(DISTINCT CNO)</code></li>';
        html += '</ul>';
        html += '</div></details>';
        html += '</div>';
        html += '</div>';
        
        html += '</div>'; // custom-column-form
        html += '<div class="modal-footer">';
        html += '<button class="btn-cancel" id="cancelExpression">取消</button>';
        html += `<button class="btn-confirm" id="confirmExpression" data-context="${context}">确认</button>`;
        html += '</div>';
        html += '</div></div></div>';
        
        // 移除旧的模态框
        const oldModal = document.getElementById('expressionModal');
        if (oldModal) oldModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', html);
        
        // 绑定事件
        document.getElementById('confirmExpression').addEventListener('click', (e) => {
            const context = e.target.dataset.context;
            this.saveExpression(context);
        });
        
        document.getElementById('cancelExpression').addEventListener('click', () => {
            document.getElementById('expressionModal').remove();
        });
        
        document.querySelector('#expressionModal .modal-close').addEventListener('click', () => {
            document.getElementById('expressionModal').remove();
        });
        
        // 预设表达式点击事件
        document.querySelectorAll('.preset-column-item').forEach(item => {
            item.addEventListener('click', () => {
                const preset = JSON.parse(item.dataset.preset);
                document.getElementById('expressionInput').value = preset.expression || '';
                
                // 高亮选中的预设项
                document.querySelectorAll('.preset-column-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }
    
    saveExpression(context) {
        const expression = document.getElementById('expressionInput').value.trim();
        
        if (!expression) {
            alert('请输入SQL表达式');
            return;
        }
        
        // 直接使用表达式作为列名，添加到自定义列
        const customColumn = {
            custom: true,
            name: expression, // 使用表达式本身作为名称
            expression: expression,
            groupBy: null
        };
        
        // 检查是否已存在相同的表达式
        const exists = this.selectedColumnKeys.some(key => {
            if (typeof key === 'object' && key.custom && key.expression === expression) {
                return true;
            }
            return false;
        });
        
        if (exists) {
            alert('该表达式已存在');
            return;
        }
        
        // 添加到选中的列（作为自定义列）
        this.selectedColumnKeys.push(customColumn);
        
        // 关闭弹窗
        document.getElementById('expressionModal').remove();
        
        // 刷新列名池，使新添加的自定义列出现在"自定义列"选项中
        if (context === 'order') {
            this.populateOrderColumnPool();
        } else if (context === 'simpleCondition') {
            this.populateSimpleConditionColumnPool();
            // 重新绑定运算符更新事件
            const pool = document.getElementById('simpleConditionColumnPool');
            if (pool) {
                pool.querySelectorAll('.pool-column-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const columnType = item.dataset.type || '';
                        this.updateOperatorOptions(columnType);
                    });
                });
            }
        }
    }
    
    addColumnKey(columnKey) {
        // 检查是否已存在
        const exists = this.selectedColumnKeys.includes(columnKey);
        
        if (exists) {
            // 不显示通知，静默跳过
            return;
        }
        
        this.selectedColumnKeys.push(columnKey);
        this.updateSelectedColumnsDisplay();
        // 不再自动生成SQL，等用户点击"生成SQL语句"按钮
    }
    
    // 在生成SQL时确定每个列属于哪个表
    resolveColumnsToTables() {
        const dbData = this.databaseStructure[this.currentDatabase];
        const resolvedColumns = []; // [{table, column, name}] 或 [{custom: true, name, expression, groupBy, extractedColumns}]
        
        // 分离普通列和自定义列
        const normalColumnKeys = this.selectedColumnKeys.filter(key => typeof key === 'string');
        const customColumns = this.selectedColumnKeys.filter(key => typeof key === 'object' && key.custom);
        
        // 统计每个表中已选择的列数量
        const tableColumnCounts = {}; // {tableKey: count}
        
        // 收集所有可能的列（表.列）
        const allPossibleColumns = {}; // {columnKey: [{table, column, name}]}
        
        Object.keys(dbData.tables).forEach(tableKey => {
        const table = dbData.tables[tableKey];
            tableColumnCounts[tableKey] = 0;
        
        Object.keys(table.columns).forEach(columnKey => {
                // 只处理字符串类型的列名
                if (typeof columnKey === 'string' && normalColumnKeys.includes(columnKey)) {
                    if (!allPossibleColumns[columnKey]) {
                        allPossibleColumns[columnKey] = [];
                    }
            const column = table.columns[columnKey];
                    allPossibleColumns[columnKey].push({
                        table: tableKey,
                        column: columnKey,
                        name: column.name
                    });
                }
            });
        });
        
        // 统计每个表有多少已选择的列
        normalColumnKeys.forEach(columnKey => {
            if (allPossibleColumns[columnKey]) {
                allPossibleColumns[columnKey].forEach(col => {
                    tableColumnCounts[col.table]++;
                });
            }
        });
        
        // 为每个列名选择表（普通列）
        normalColumnKeys.forEach(columnKey => {
            if (!allPossibleColumns[columnKey] || allPossibleColumns[columnKey].length === 0) {
                return; // 该列不存在于任何表
            }
            
            const possibleColumns = allPossibleColumns[columnKey];
            
            if (possibleColumns.length === 1) {
                // 只有一个表包含此列
                resolvedColumns.push(possibleColumns[0]);
            } else {
                // 多个表包含此列，选择已有其他列的表
                let selectedColumn = null;
                let maxCount = -1;
                
                // 优先选择已有其他列的表
                possibleColumns.forEach(col => {
                    if (tableColumnCounts[col.table] > maxCount) {
                        maxCount = tableColumnCounts[col.table];
                        selectedColumn = col;
                    }
                });
                
                // 如果所有表都没有其他列，选择第一个表
                if (maxCount === 0 || !selectedColumn) {
                    selectedColumn = possibleColumns[0];
                }
                
                resolvedColumns.push(selectedColumn);
            }
        });
        
        // 处理自定义列：提取表达式中的列名并找到对应表
        customColumns.forEach(customCol => {
            const extractedColumns = this.extractColumnsFromExpression(customCol.expression, dbData);
            
            // 创建自定义列对象，包含提取的列信息
            // 自定义列的代号和中文名称都等于自定义列名
            const resolvedCustomCol = {
                custom: true,
                column: customCol.name, // 代号等于自定义列名
                name: customCol.name,  // 中文名称等于自定义列名
                expression: customCol.expression,
                groupBy: customCol.groupBy,
                extractedColumns: extractedColumns // [{table, column}] 表达式中的列
            };
            
            resolvedColumns.push(resolvedCustomCol);
            
            // 更新表列计数（用于后续的表选择）
            extractedColumns.forEach(extracted => {
                if (!tableColumnCounts[extracted.table]) {
                    tableColumnCounts[extracted.table] = 0;
                }
                tableColumnCounts[extracted.table]++;
            });
        });
        
        return resolvedColumns;
    }
    
    // 从SQL表达式中提取列名并找到对应的表
    extractColumnsFromExpression(expression, dbData) {
        const extractedColumns = [];
        
        // 提取所有可能的列名（匹配大写字母+数字的组合，如HW1, SNO, CNO等）
        // 也匹配函数中的列名，如 SUM(Score1), AVG(HW1 + HW2) 等
        const columnPattern = /([A-Z][A-Z0-9]+)/g;
        const matches = expression.match(columnPattern);
        
        if (!matches) return extractedColumns;
        
        // 去重
        const uniqueColumnNames = [...new Set(matches)];
        
        // 在每个表中查找这些列名
        Object.keys(dbData.tables).forEach(tableKey => {
            const table = dbData.tables[tableKey];
            Object.keys(table.columns).forEach(columnKey => {
                if (uniqueColumnNames.includes(columnKey)) {
                    extractedColumns.push({
                        table: tableKey,
                        column: columnKey
                    });
                }
            });
        });
        
        return extractedColumns;
    }
    
    addTableAllColumns(table) {
        const dbData = this.databaseStructure[this.currentDatabase];
        const tableData = dbData.tables[table];
        
        Object.keys(tableData.columns).forEach(columnKey => {
            if (!this.selectedColumnKeys.includes(columnKey)) {
                this.selectedColumnKeys.push(columnKey);
            }
        });
        
        this.updateSelectedColumnsDisplay();
        // 不再自动生成SQL
    }
    
    showAllColumnsModal() {
        // 创建自定义列弹窗
        const presetColumns = this.getPresetColumns();
        
        let html = '<div class="custom-column-modal" id="customColumnModal">';
        html += '<div class="modal-content large">';
        html += '<div class="modal-header"><h3>自定义新的列</h3><span class="modal-close">&times;</span></div>';
        html += '<div class="modal-body">';
        
        // 预设列名区域
        if (presetColumns.length > 0) {
            html += '<div class="preset-columns-section">';
            html += '<h4>预设列名</h4>';
            html += '<div class="preset-columns-list">';
            presetColumns.forEach(preset => {
            html += `
                    <div class="preset-column-item" data-preset='${JSON.stringify(preset)}'>
                        <span class="preset-name">${preset.name}</span>
                        <span class="preset-desc">${preset.description || ''}</span>
                    </div>
            `;
        });
            html += '</div></div>';
        }
        
        // 自定义列名输入
        html += '<div class="custom-column-form">';
        html += '<div class="form-group">';
        html += '<label>列名：</label>';
        html += '<input type="text" id="customColumnName" placeholder="输入自定义列名（如：总分、平均分）">';
        html += '</div>';
        
        // SQL表达式编辑
        html += '<div class="form-group">';
        html += '<label>SQL表达式：</label>';
        html += '<textarea id="customColumnExpression" rows="4" placeholder="输入SQL表达式（如：SUM(Score1) + SUM(Score2) + SUM(Score3), AVG(Score), COUNT(*), YEAR(BirthDate)等）"></textarea>';
        html += '<div class="expression-hint">';
        html += '<details><summary>📖 SQL表达式编写规则和库函数</summary>';
        html += '<div class="hint-content">';
        html += '<h5>常用聚合函数：</h5>';
        html += '<ul>';
        html += '<li><strong>SUM(列名)</strong> - 求和，如：SUM(Score1)</li>';
        html += '<li><strong>AVG(列名)</strong> - 求平均值，如：AVG(Score)</li>';
        html += '<li><strong>COUNT(列名)</strong> - 计数，如：COUNT(CNO)</li>';
        html += '<li><strong>MAX(列名)</strong> - 求最大值</li>';
        html += '<li><strong>MIN(列名)</strong> - 求最小值</li>';
        html += '</ul>';
        html += '<h5>常用字符串函数：</h5>';
        html += '<ul>';
        html += '<li><strong>CONCAT(列1, 列2)</strong> - 连接字符串</li>';
        html += '<li><strong>SUBSTRING(列, 开始, 长度)</strong> - 截取字符串</li>';
        html += '<li><strong>LEN(列)</strong> - 字符串长度</li>';
        html += '</ul>';
        html += '<h5>常用日期函数：</h5>';
        html += '<ul>';
        html += '<li><strong>YEAR(日期列)</strong> - 提取年份，如：YEAR(BirthDate)</li>';
        html += '<li><strong>MONTH(日期列)</strong> - 提取月份</li>';
        html += '<li><strong>DAY(日期列)</strong> - 提取日期</li>';
        html += '<li><strong>GETDATE()</strong> - 当前日期时间</li>';
        html += '</ul>';
        html += '<h5>数学运算：</h5>';
        html += '<ul>';
        html += '<li><strong>+</strong> - 加法，如：HW1 + HW2 + HW3</li>';
        html += '<li><strong>-</strong> - 减法</li>';
        html += '<li><strong>*</strong> - 乘法</li>';
        html += '<li><strong>/</strong> - 除法</li>';
        html += '</ul>';
        html += '<h5>示例：</h5>';
        html += '<ul>';
        html += '<li>三次作业总分：<code>HW1 + HW2 + HW3</code> 或 <code>SUM(HW1) + SUM(HW2) + SUM(HW3)</code></li>';
        html += '<li>三次作业平均分：<code>AVG(HW1 + HW2 + HW3)</code></li>';
        html += '<li>出生年份：<code>YEAR(Birth)</code></li>';
        html += '<li>选课门数：<code>COUNT(DISTINCT CNO)</code></li>';
        html += '</ul>';
        html += '</div></details>';
        html += '</div>';
        html += '</div>';
        
        // 分组依据
        html += '<div class="form-group">';
        html += '<label>分组依据（可选）：</label>';
        html += '<select id="customColumnGroupBy">';
        html += '<option value="">无需分组</option>';
        const dbData = this.databaseStructure[this.currentDatabase];
        Object.keys(dbData.tables).forEach(tableKey => {
            const table = dbData.tables[tableKey];
            Object.keys(table.columns).forEach(columnKey => {
                const column = table.columns[columnKey];
                html += `<option value="${tableKey}.${columnKey}">${tableKey}.${columnKey} - ${column.name}</option>`;
            });
        });
        html += '</select>';
        html += '<small class="form-hint">如果表达式包含聚合函数，建议设置分组依据</small>';
        html += '</div>';
        
        html += '</div>'; // custom-column-form
        html += '<div class="modal-footer">';
        html += '<button class="btn-cancel" id="cancelCustomColumn">取消</button>';
        html += '<button class="btn-confirm" id="confirmCustomColumn">确认添加</button>';
        html += '</div>';
        html += '</div></div></div>';
        
        // 移除旧的模态框
        const oldModal = document.getElementById('customColumnModal');
        if (oldModal) oldModal.remove();
        
        document.body.insertAdjacentHTML('beforeend', html);
        
        // 绑定事件
        document.getElementById('confirmCustomColumn').addEventListener('click', () => {
            this.saveCustomColumn();
        });
        
        document.getElementById('cancelCustomColumn').addEventListener('click', () => {
            document.getElementById('customColumnModal').remove();
        });
        
        document.querySelector('#customColumnModal .modal-close').addEventListener('click', () => {
            document.getElementById('customColumnModal').remove();
        });
        
        // 预设列名点击事件
        document.querySelectorAll('.preset-column-item').forEach(item => {
            item.addEventListener('click', () => {
                const preset = JSON.parse(item.dataset.preset);
                document.getElementById('customColumnName').value = preset.name;
                document.getElementById('customColumnExpression').value = preset.expression || '';
                document.getElementById('customColumnGroupBy').value = preset.groupBy || '';
                
                // 高亮选中的预设项
                document.querySelectorAll('.preset-column-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }
    
    getPresetColumns() {
        const presets = {
            study: [
                {
                    name: '三次作业的总分',
                    expression: 'HW1 + HW2 + HW3',
                    groupBy: '',
                    description: '计算三次作业的总分（HW1+HW2+HW3）'
                },
                {
                    name: '三次作业的平均分',
                    expression: 'AVG(HW1 + HW2 + HW3)',
                    groupBy: 'Homework.SNO',
                    description: '计算三次作业的平均分'
                },
                {
                    name: '出生年份',
                    expression: 'YEAR(Birth)',
                    groupBy: '',
                    description: '从出生日期提取年份'
                },
                {
                    name: '选课门数',
                    expression: 'COUNT(DISTINCT CNO)',
                    groupBy: 'Homework.SNO',
                    description: '统计选课数量（默认分组为SNO）'
                }
            ],
            teach: [
                {
                    name: '总学时',
                    expression: 'SUM(CT)',
                    groupBy: '',
                    description: '计算总学时'
                },
                {
                    name: '平均成绩',
                    expression: 'AVG(Score)',
                    groupBy: 'SC.SNo',
                    description: '计算平均成绩（默认分组为SNo）'
                }
            ]
        };
        
        return presets[this.currentDatabase] || [];
    }
    
    saveCustomColumn() {
        const name = document.getElementById('customColumnName').value.trim();
        const expression = document.getElementById('customColumnExpression').value.trim();
        const groupBy = document.getElementById('customColumnGroupBy').value.trim();
        
        if (!name) {
            alert('请输入列名');
            return;
        }
        
        if (!expression) {
            alert('请输入SQL表达式');
            return;
        }
        
        // 创建自定义列对象
        const customColumn = {
            custom: true,
            name: name,
            expression: expression,
            groupBy: groupBy || null
        };
        
        // 检查是否已存在相同名称的自定义列
        const exists = this.selectedColumnKeys.some(key => {
            if (typeof key === 'object' && key.custom && key.name === name) {
                return true;
            }
            return false;
        });
        
        if (exists) {
            alert('该列名已存在，请使用不同的名称');
            return;
        }
        
        // 添加到选中的列
        this.selectedColumnKeys.push(customColumn);
        this.updateSelectedColumnsDisplay();
        
        // 关闭弹窗
        document.getElementById('customColumnModal').remove();
    }
    
    updateSelectedColumnsDisplay() {
        const container = document.getElementById('selectedColumnsContainer');
        if (!container) return;
        
        if (this.selectedColumnKeys.length === 0) {
            container.innerHTML = '<p class="placeholder-text">点击上方列名添加到查询中</p>';
            return;
        }
        
        const dbData = this.databaseStructure[this.currentDatabase];
        
        let html = '';
        this.selectedColumnKeys.forEach((columnKey, index) => {
            let displayText = '';
            let tableNames = '';
            
            if (typeof columnKey === 'string') {
                // 普通列
                const tables = [];
                Object.keys(dbData.tables).forEach(tableKey => {
                    if (dbData.tables[tableKey].columns[columnKey]) {
                        tables.push(tableKey);
                    }
                });
                
                displayText = columnKey;
                if (tables.length > 1) {
                    const tableNamesArray = tables.map(tableKey => {
                        const table = dbData.tables[tableKey];
                        return table.name;
                    });
                    tableNames = `(${tableNamesArray.join('、')})`;
                }
            } else if (columnKey.custom) {
                // 自定义列
                displayText = columnKey.name;
                tableNames = '(自定义)';
            }
            
            html += `
                <div class="selected-column-item" data-index="${index}" draggable="true">
                    <span class="column-name">${displayText}</span>
                    <span class="table-name">${tableNames}</span>
                    <button class="remove-column-btn" onclick="visualSQLBuilder.removeColumn(${index})">&times;</button>
                </div>
            `;
        });
        
        container.innerHTML = html;
        this.initDragAndDrop('selectedColumnsContainer', (oldIndex, newIndex) => {
            const item = this.selectedColumnKeys.splice(oldIndex, 1)[0];
            this.selectedColumnKeys.splice(newIndex, 0, item);
            this.updateSelectedColumnsDisplay();
        });
    }
    
    removeColumn(index) {
        this.selectedColumnKeys.splice(index, 1);
        this.updateSelectedColumnsDisplay();
        // 不再自动生成SQL
    }
    
    // ========== 拖拽排序功能 ==========
    initDragAndDrop(containerId, onReorder) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // 如果已经初始化过拖拽功能，先移除旧的事件监听器
        if (container.dataset.dragInitialized === 'true') {
            // 移除旧的事件监听器（通过克隆节点来移除所有监听器）
            const newContainer = container.cloneNode(false);
            while (container.firstChild) {
                newContainer.appendChild(container.firstChild);
            }
            container.parentNode.replaceChild(newContainer, container);
        }
        
        // 标记已初始化
        const finalContainer = document.getElementById(containerId);
        finalContainer.dataset.dragInitialized = 'true';
        
        let draggedElement = null;
        let draggedIndex = null;
        
        // 处理拖拽开始（使用事件委托）
        finalContainer.addEventListener('dragstart', (e) => {
            // 如果点击的是按钮，不进行拖拽
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                e.preventDefault();
                return;
            }
            
            const draggableElement = e.target.closest('[draggable="true"]');
            if (draggableElement) {
                draggedElement = draggableElement;
                draggedIndex = parseInt(draggableElement.getAttribute('data-index'));
                draggableElement.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', draggableElement.innerHTML);
            }
        });
        
        // 处理拖拽结束（使用事件委托）
        finalContainer.addEventListener('dragend', (e) => {
            const draggableElement = e.target.closest('[draggable="true"]');
            if (draggableElement) {
                draggableElement.style.opacity = '1';
                // 移除所有拖拽相关的样式
                const items = finalContainer.querySelectorAll('[draggable="true"]');
                items.forEach(item => {
                    item.classList.remove('drag-over');
                    item.style.borderLeft = '';
                    item.style.borderRight = '';
                });
            }
        });
        
        // 处理拖拽进入（使用事件委托）
        finalContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            if (!draggedElement) return;
            
            const target = e.target.closest('[draggable="true"]');
            if (!target || target === draggedElement) return;
            
            // 移除所有拖拽相关的样式
            const items = finalContainer.querySelectorAll('[draggable="true"]');
            items.forEach(item => {
                item.classList.remove('drag-over');
            });
            
            // 计算目标位置
            const targetIndex = parseInt(target.getAttribute('data-index'));
            const draggedRect = draggedElement.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const draggedCenter = draggedRect.left + draggedRect.width / 2;
            const targetCenter = targetRect.left + targetRect.width / 2;
            
            // 根据鼠标位置决定插入位置
            if (e.clientX < targetCenter) {
                target.classList.add('drag-over');
                target.style.borderLeft = '3px solid #4CAF50';
                target.style.borderRight = 'none';
            } else {
                target.classList.add('drag-over');
                target.style.borderRight = '3px solid #4CAF50';
                target.style.borderLeft = 'none';
            }
        });
        
        // 处理拖拽离开（使用事件委托）
        finalContainer.addEventListener('dragleave', (e) => {
            const target = e.target.closest('[draggable="true"]');
            if (target && target !== draggedElement) {
                target.classList.remove('drag-over');
                target.style.borderLeft = '';
                target.style.borderRight = '';
            }
        });
        
        // 处理放置（使用事件委托）
        finalContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            
            if (!draggedElement) return;
            
            const target = e.target.closest('[draggable="true"]');
            if (!target || target === draggedElement) return;
            
            // 计算新的索引位置
            const targetIndex = parseInt(target.getAttribute('data-index'));
            const draggedRect = draggedElement.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const targetCenter = targetRect.left + targetRect.width / 2;
            
            let newIndex = targetIndex;
            if (e.clientX < targetCenter) {
                // 插入到目标之前
                newIndex = targetIndex;
            } else {
                // 插入到目标之后
                newIndex = targetIndex + 1;
            }
            
            // 如果拖拽的元素在原位置之后，需要调整索引
            if (draggedIndex < newIndex) {
                newIndex--;
            }
            
            // 调用回调函数重新排列数组
            if (onReorder && draggedIndex !== newIndex) {
                onReorder(draggedIndex, newIndex);
            }
            
            // 清除所有样式
            const items = finalContainer.querySelectorAll('[draggable="true"]');
            items.forEach(item => {
                item.classList.remove('drag-over');
                item.style.borderLeft = '';
                item.style.borderRight = '';
            });
            
            draggedElement = null;
            draggedIndex = null;
        });
    }
    
    // ========== 排序规则相关方法 ==========
    showOrderEditor() {
        const editor = document.getElementById('orderEditor');
        if (!editor) return;
        
        editor.innerHTML = this.buildOrderEditorHTML();
        editor.style.display = 'block';
        
        // 填充列名池
        this.populateOrderColumnPool();
        
        // 绑定事件
        document.getElementById('orderColumnSearch')?.addEventListener('input', (e) => {
            this.filterEditorColumns('orderColumnPool', e.target.value.trim().toLowerCase());
        });
        
    }
    
    buildOrderEditorHTML() {
        return `
            <div class="editor-header">
                <h4>添加排序规则</h4>
                <button class="editor-close" onclick="visualSQLBuilder.hideOrderEditor()">&times;</button>
            </div>
            <div class="editor-body">
                <div class="editor-search">
                    <input type="text" class="editor-search-input" id="orderColumnSearch" placeholder="搜索列名（代号或中文含义）...">
                </div>
                <div class="editor-column-pool" id="orderColumnPool"></div>
                <div class="editor-custom-section">
                    <button class="add-expression-btn" onclick="visualSQLBuilder.showExpressionModal('order')">+ 其他（输入SQL表达式）</button>
                </div>
                <div class="editor-options">
                    <div class="option-group">
                        <label>排序方式：</label>
                        <select id="orderDirection">
                            <option value="ASC">升序</option>
                            <option value="DESC">降序</option>
                        </select>
                    </div>
                </div>
                <div class="editor-actions">
                    <button class="btn-cancel" onclick="visualSQLBuilder.hideOrderEditor()">取消</button>
                    <button class="btn-confirm" onclick="visualSQLBuilder.saveOrderItem()">确定</button>
                </div>
            </div>
        `;
    }
    
    hideOrderEditor() {
        const editor = document.getElementById('orderEditor');
        if (editor) editor.style.display = 'none';
    }
    
    populateOrderColumnPool() {
        const pool = document.getElementById('orderColumnPool');
        if (!pool) return;
        
        pool.innerHTML = this.buildColumnPoolHTML(true, true); // forEditor = true
        this.bindColumnPoolEvents('orderColumnPool');
    }
    
    saveOrderItem() {
        const selectedItem = document.querySelector('#orderColumnPool .pool-column-item.selected');
        const direction = document.getElementById('orderDirection')?.value || 'ASC';
        
        let columnValue = '';
        if (selectedItem) {
            const table = selectedItem.dataset.table;
            const column = selectedItem.dataset.column;
            const isCustom = selectedItem.dataset.custom === 'true';
            
            if (isCustom) {
                // 自定义列：使用表达式
                const customCol = this.selectedColumnKeys.find(key => 
                    typeof key === 'object' && key.custom && key.name === column
                );
                if (customCol) {
                    columnValue = customCol.expression;
                } else {
                    columnValue = column;
                }
            } else {
                columnValue = table ? `${table}.${column}` : column;
            }
        } else {
            alert('请选择列名');
            return;
        }
        
        if (!columnValue) return;
        
        this.orderByItems.push({ column: columnValue, direction });
        this.updateOrderDisplay();
        this.hideOrderEditor();
    }
    
    updateOrderDisplay() {
        const container = document.getElementById('orderItems');
        if (!container) return;
        
        if (this.orderByItems.length === 0) {
            container.innerHTML = '<p class="placeholder-text">暂无排序规则</p>';
            return;
        }
        
        let html = '';
        this.orderByItems.forEach((item, index) => {
            const directionText = item.direction === 'ASC' ? '升序' : '降序';
            html += `
                <div class="horizontal-item" data-index="${index}" draggable="true">
                    <span class="item-label">${item.column} ${directionText}</span>
                    <button class="remove-item-btn" onclick="visualSQLBuilder.removeOrderItem(${index})">&times;</button>
                </div>
            `;
        });
        container.innerHTML = html;
        this.initDragAndDrop('orderItems', (oldIndex, newIndex) => {
            const item = this.orderByItems.splice(oldIndex, 1)[0];
            this.orderByItems.splice(newIndex, 0, item);
            this.updateOrderDisplay();
        });
    }
    
    removeOrderItem(index) {
        this.orderByItems.splice(index, 1);
        this.updateOrderDisplay();
    }
    
    // ========== 简单过滤条件相关方法 ==========
    showSimpleConditionEditor(connector = null) {
        // 如果已有条件，需要先选择连接符
        if (this.simpleConditions.length > 0 && connector === null) {
            this.showConnectorSelector((selectedConnector) => {
                this.showSimpleConditionEditor(selectedConnector);
            });
            return;
        }
        
        const editor = document.getElementById('simpleConditionEditor');
        if (!editor) return;
        
        editor.innerHTML = this.buildSimpleConditionEditorHTML(connector || 'AND');
        editor.style.display = 'block';
        
        // 填充列名池
        this.populateSimpleConditionColumnPool();
        
        // 绑定事件
        document.getElementById('simpleConditionColumnSearch')?.addEventListener('input', (e) => {
            this.filterEditorColumns('simpleConditionColumnPool', e.target.value.trim().toLowerCase());
        });
        
        // 保存连接符
        if (connector) {
            const connectorSelect = document.getElementById('simpleConditionConnector');
            if (connectorSelect) connectorSelect.value = connector;
        }
    }
    
    showConnectorSelector(callback) {
        const choice = confirm('选择过滤条件的连接方式：\n确定 = 同时满足(AND)\n取消 = 任意满足(OR)');
        callback(choice ? 'AND' : 'OR');
    }
    
    buildSimpleConditionEditorHTML(connector) {
        return `
            <div class="editor-header">
                <h4>添加简单过滤条件</h4>
                <button class="editor-close" onclick="visualSQLBuilder.hideSimpleConditionEditor()">&times;</button>
            </div>
            <div class="editor-body">
                ${this.simpleConditions.length > 0 ? `
                <div class="editor-connector">
                    <label>连接方式：</label>
                    <select id="simpleConditionConnector">
                        <option value="AND" ${connector === 'AND' ? 'selected' : ''}>同时满足 (AND)</option>
                        <option value="OR" ${connector === 'OR' ? 'selected' : ''}>任意满足 (OR)</option>
            </select>
                </div>
                ` : ''}
                <div class="editor-search">
                    <input type="text" class="editor-search-input" id="simpleConditionColumnSearch" placeholder="搜索列名（代号或中文含义）...">
                </div>
                <div class="editor-column-pool" id="simpleConditionColumnPool"></div>
                <div class="editor-custom-section">
                    <button class="add-expression-btn" onclick="visualSQLBuilder.showExpressionModal('simpleCondition')">+ 其他（输入SQL表达式）</button>
                </div>
                <div class="editor-options">
                    <div class="option-group">
                        <label>运算符：</label>
                        <select id="simpleConditionOperator">
                            <!-- 运算符选项将根据列类型动态填充 -->
                        </select>
                    </div>
                    <div class="option-group">
                        <label>值：</label>
                        <input type="text" id="simpleConditionValue" placeholder="输入过滤值">
                    </div>
                </div>
                <div class="editor-actions">
                    <button class="btn-cancel" onclick="visualSQLBuilder.hideSimpleConditionEditor()">取消</button>
                    <button class="btn-confirm" onclick="visualSQLBuilder.saveSimpleCondition()">确定</button>
                </div>
            </div>
        `;
    }
    
    populateSimpleConditionColumnPool() {
        const pool = document.getElementById('simpleConditionColumnPool');
        if (!pool) return;
        
        pool.innerHTML = this.buildColumnPoolHTML(true, true); // forEditor = true
        this.bindColumnPoolEvents('simpleConditionColumnPool');
        
        // 绑定列选择事件，用于动态更新运算符选项
        pool.querySelectorAll('.pool-column-item').forEach(item => {
            item.addEventListener('click', () => {
                const columnType = item.dataset.type || '';
                this.updateOperatorOptions(columnType);
            });
        });
    }
    
    updateOperatorOptions(columnType) {
        const operatorSelect = document.getElementById('simpleConditionOperator');
        if (!operatorSelect) return;
        
        // 根据列类型显示不同的运算符
        // 字符串类型：= != LIKE
        // 数值类型：= != > < >= <=
        const isNumeric = columnType && (
            columnType.includes('int') || 
            columnType.includes('float') || 
            columnType.includes('numeric') ||
            columnType.includes('decimal')
        );
        
        operatorSelect.innerHTML = '';
        
        if (isNumeric || !columnType) {
            // 数值类型或未知类型：显示所有运算符
            const operators = [
                { value: '=', text: '等于' },
                { value: '!=', text: '不等于' },
                { value: '>', text: '大于' },
                { value: '<', text: '小于' },
                { value: '>=', text: '大于等于' },
                { value: '<=', text: '小于等于' }
            ];
            operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.value;
                option.textContent = op.text;
                operatorSelect.appendChild(option);
            });
        } else {
            // 字符串类型
            const operators = [
                { value: '=', text: '等于' },
                { value: '!=', text: '不等于' },
                { value: 'LIKE', text: 'LIKE (通配符: %表示任意字符, _表示单个字符)' }
            ];
            operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.value;
                option.textContent = op.text;
                operatorSelect.appendChild(option);
            });
        }
    }
    
    hideSimpleConditionEditor() {
        const editor = document.getElementById('simpleConditionEditor');
        if (editor) editor.style.display = 'none';
    }
    
    saveSimpleCondition() {
        const selectedItem = document.querySelector('#simpleConditionColumnPool .pool-column-item.selected');
        const operator = document.getElementById('simpleConditionOperator')?.value || '=';
        const value = document.getElementById('simpleConditionValue')?.value || '';
        const connector = document.getElementById('simpleConditionConnector')?.value || 'AND';
        
        if (!value) {
            alert('请输入过滤值');
            return;
        }
        
        let columnValue = '';
        if (selectedItem) {
            const table = selectedItem.dataset.table;
            const column = selectedItem.dataset.column;
            const isCustom = selectedItem.dataset.custom === 'true';
            
            if (isCustom) {
                // 自定义列：使用表达式
                const customCol = this.selectedColumnKeys.find(key => 
                    typeof key === 'object' && key.custom && key.name === column
                );
                if (customCol) {
                    columnValue = customCol.expression;
                } else {
                    columnValue = column;
                }
            } else {
                columnValue = table ? `${table}.${column}` : column;
            }
        } else {
            alert('请选择列名');
            return;
        }
        
        if (!columnValue) return;
        
        this.simpleConditions.push({ column: columnValue, operator, value, connector });
        this.updateSimpleConditionsDisplay();
        this.hideSimpleConditionEditor();
    }
    
    updateSimpleConditionsDisplay() {
        const container = document.getElementById('simpleConditionItems');
        if (!container) return;
        
        if (this.simpleConditions.length === 0) {
            container.innerHTML = '<p class="placeholder-text">暂无过滤条件</p>';
            return;
        }
        
        let html = '';
        this.simpleConditions.forEach((item, index) => {
            const connectorText = index > 0 ? (item.connector === 'AND' ? ' 且 ' : ' 或 ') : '';
            html += `
                <div class="horizontal-item" data-index="${index}" draggable="true">
                    <span class="item-label">${connectorText}${item.column} ${item.operator} ${item.value}</span>
                    <button class="remove-item-btn" onclick="visualSQLBuilder.removeSimpleCondition(${index})">&times;</button>
                </div>
            `;
        });
        container.innerHTML = html;
        this.initDragAndDrop('simpleConditionItems', (oldIndex, newIndex) => {
            const item = this.simpleConditions.splice(oldIndex, 1)[0];
            this.simpleConditions.splice(newIndex, 0, item);
            this.updateSimpleConditionsDisplay();
        });
    }
    
    removeSimpleCondition(index) {
        this.simpleConditions.splice(index, 1);
        this.updateSimpleConditionsDisplay();
    }
    
    // ========== 复杂过滤条件（子查询） ==========
    showComplexConditionEditor() {
        const editor = document.getElementById('complexConditionEditor');
        if (!editor) return;
        
        editor.innerHTML = this.buildComplexConditionEditorHTML();
        editor.style.display = 'block';
        
        // 填充主查询列名池
        this.populateMainQueryColumnPool();
        
        // 绑定事件
        document.getElementById('mainQueryColumnSearch')?.addEventListener('input', (e) => {
            this.filterEditorColumns('mainQueryColumnPool', e.target.value.trim().toLowerCase());
        });
        
        // 添加子查询条件按钮
        document.getElementById('addSubqueryCondition')?.addEventListener('click', () => {
            this.showSubqueryConditionEditor();
        });
        
        // 初始化显示子查询条件
        this.updateSubqueryConditionsDisplay();
    }
    
    buildComplexConditionEditorHTML() {
        return `
            <div class="editor-header">
                <h4>添加复杂过滤条件（子查询）</h4>
                <button class="editor-close" onclick="visualSQLBuilder.hideComplexConditionEditor()">&times;</button>
            </div>
            <div class="editor-body">
                <div class="complex-condition-section">
                    <h5>主查询限制列</h5>
                    <div class="editor-search">
                        <input type="text" class="editor-search-input" id="mainQueryColumnSearch" placeholder="搜索列名（代号或中文含义）...">
                    </div>
                    <div class="editor-column-pool" id="mainQueryColumnPool"></div>
                    <div class="editor-options">
                        <div class="option-group">
                            <label>运算符：</label>
                            <select id="mainQueryOperator">
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">></option>
                <option value="<"><</option>
                <option value=">=">>=</option>
                <option value="<="><=</option>
                <option value="IN">IN</option>
                                <option value="NOT IN">NOT IN</option>
                                <option value="EXISTS">EXISTS</option>
                                <option value="NOT EXISTS">NOT EXISTS</option>
            </select>
                        </div>
                    </div>
                </div>
                
                <div class="complex-condition-section">
                    <h5>子查询过滤条件</h5>
                    <div class="horizontal-list-container" id="subqueryConditionContainer">
                        <div class="horizontal-items" id="subqueryConditionItems">
                            <p class="placeholder-text">暂无子查询条件</p>
                        </div>
                        <button class="add-item-btn" id="addSubqueryCondition">+ 添加</button>
                    </div>
                    <div class="item-editor" id="subqueryConditionEditor" style="display: none;"></div>
                </div>
                
                <div class="editor-actions">
                    <button class="btn-cancel" onclick="visualSQLBuilder.hideComplexConditionEditor()">取消</button>
                    <button class="btn-confirm" onclick="visualSQLBuilder.saveComplexCondition()">确定</button>
                </div>
            </div>
        `;
    }
    
    populateMainQueryColumnPool() {
        const pool = document.getElementById('mainQueryColumnPool');
        if (!pool) return;
        
        pool.innerHTML = this.buildColumnPoolHTML(true, true); // forEditor = true
        this.bindColumnPoolEvents('mainQueryColumnPool');
    }
    
    showSubqueryConditionEditor() {
        const editor = document.getElementById('subqueryConditionEditor');
        if (!editor) return;
        
        editor.innerHTML = this.buildSubqueryConditionEditorHTML();
        editor.style.display = 'block';
        
        // 填充列名池
        this.populateSubqueryConditionColumnPool();
        
        // 绑定事件
        document.getElementById('subqueryConditionColumnSearch')?.addEventListener('input', (e) => {
            this.filterEditorColumns('subqueryConditionColumnPool', e.target.value.trim().toLowerCase());
        });
        
        // 绑定列选择事件，用于动态更新运算符选项
        setTimeout(() => {
            const pool = document.getElementById('subqueryConditionColumnPool');
            if (pool) {
                pool.querySelectorAll('.pool-column-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const columnType = item.dataset.type || '';
                        this.updateSubqueryOperatorOptions(columnType);
                    });
                });
            }
        }, 100);
    }
    
    buildSubqueryConditionEditorHTML() {
        return `
            <div class="editor-header">
                <h4>添加子查询条件</h4>
                <button class="editor-close" onclick="visualSQLBuilder.hideSubqueryConditionEditor()">&times;</button>
            </div>
            <div class="editor-body">
                <div class="editor-search">
                    <input type="text" class="editor-search-input" id="subqueryConditionColumnSearch" placeholder="搜索列名（代号或中文含义）...">
                </div>
                <div class="editor-column-pool" id="subqueryConditionColumnPool"></div>
                <div class="editor-options">
                    <div class="option-group">
                        <label>运算符：</label>
                        <select id="subqueryConditionOperator">
                            <!-- 运算符选项将根据列类型动态填充 -->
                        </select>
                    </div>
                    <div class="option-group">
                        <label>值：</label>
                        <input type="text" id="subqueryConditionValue" placeholder="输入过滤值">
                    </div>
                </div>
                <div class="editor-actions">
                    <button class="btn-cancel" onclick="visualSQLBuilder.hideSubqueryConditionEditor()">取消</button>
                    <button class="btn-confirm" onclick="visualSQLBuilder.saveSubqueryCondition()">确定</button>
                </div>
            </div>
        `;
    }
    
    populateSubqueryConditionColumnPool() {
        const pool = document.getElementById('subqueryConditionColumnPool');
        if (!pool) return;
        
        pool.innerHTML = this.buildColumnPoolHTML(true, true); // forEditor = true
        this.bindColumnPoolEvents('subqueryConditionColumnPool');
    }
    
    updateSubqueryOperatorOptions(columnType) {
        const operatorSelect = document.getElementById('subqueryConditionOperator');
        if (!operatorSelect) return;
        
        // 根据列类型显示不同的运算符
        const isNumeric = columnType && (
            columnType.includes('int') || 
            columnType.includes('float') || 
            columnType.includes('numeric') ||
            columnType.includes('decimal')
        );
        
        operatorSelect.innerHTML = '';
        
        if (isNumeric || !columnType) {
            // 数值类型或未知类型：显示所有运算符
            const operators = [
                { value: '=', text: '等于' },
                { value: '!=', text: '不等于' },
                { value: '>', text: '大于' },
                { value: '<', text: '小于' },
                { value: '>=', text: '大于等于' },
                { value: '<=', text: '小于等于' }
            ];
            operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.value;
                option.textContent = op.text;
                operatorSelect.appendChild(option);
            });
        } else {
            // 字符串类型：只显示 = != LIKE
            const operators = [
                { value: '=', text: '等于' },
                { value: '!=', text: '不等于' },
                { value: 'LIKE', text: 'LIKE (通配符: %表示任意字符, _表示单个字符)' }
            ];
            operators.forEach(op => {
                const option = document.createElement('option');
                option.value = op.value;
                option.textContent = op.text;
                operatorSelect.appendChild(option);
            });
        }
    }
    
    hideSubqueryConditionEditor() {
        const editor = document.getElementById('subqueryConditionEditor');
        if (editor) editor.style.display = 'none';
    }
    
    saveSubqueryCondition() {
        const selectedItem = document.querySelector('#subqueryConditionColumnPool .pool-column-item.selected');
        const operator = document.getElementById('subqueryConditionOperator')?.value || '=';
        const value = document.getElementById('subqueryConditionValue')?.value.trim();
        
        if (!value) {
            alert('请输入过滤值');
            return;
        }
        
        if (!selectedItem) {
            alert('请选择列名');
            return;
        }
        
        let columnValue = '';
        const table = selectedItem.dataset.table;
        const column = selectedItem.dataset.column;
        const isCustom = selectedItem.dataset.custom === 'true';
        
        if (isCustom) {
            const customCol = this.selectedColumnKeys.find(key => 
                typeof key === 'object' && key.custom && key.name === column
            );
            if (customCol) {
                columnValue = customCol.expression;
            } else {
                columnValue = column;
            }
        } else {
            columnValue = table ? `${table}.${column}` : column;
        }
        
        // 添加到临时子查询条件列表
        if (!this.tempSubqueryConditions) {
            this.tempSubqueryConditions = [];
        }
        
        this.tempSubqueryConditions.push({
            column: columnValue,
            operator: operator,
            value: value
        });
        
        this.updateSubqueryConditionsDisplay();
        this.hideSubqueryConditionEditor();
    }
    
    updateSubqueryConditionsDisplay() {
        const container = document.getElementById('subqueryConditionItems');
        if (!container) return;
        
        if (!this.tempSubqueryConditions || this.tempSubqueryConditions.length === 0) {
            container.innerHTML = '<p class="placeholder-text">暂无子查询条件</p>';
            return;
        }
        
        let html = '';
        this.tempSubqueryConditions.forEach((cond, index) => {
            const operatorText = cond.operator === 'LIKE' ? 'LIKE' : cond.operator;
            html += `
                <div class="horizontal-item" data-index="${index}">
                    <span class="item-label">${cond.column} ${operatorText} '${cond.value}'</span>
                    <button class="remove-item-btn" onclick="visualSQLBuilder.removeTempSubqueryCondition(${index})">&times;</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    
    removeTempSubqueryCondition(index) {
        if (this.tempSubqueryConditions && this.tempSubqueryConditions[index]) {
            this.tempSubqueryConditions.splice(index, 1);
            this.updateSubqueryConditionsDisplay();
        }
    }
    
    addSubqueryCondition() {
        // 这个方法现在只用于显示编辑器（已在showComplexConditionEditor中绑定）
        this.showSubqueryConditionEditor();
    }
    
    hideComplexConditionEditor() {
        const editor = document.getElementById('complexConditionEditor');
        if (editor) {
            editor.style.display = 'none';
            this.tempSubqueryConditions = null;
        }
    }
    
    saveComplexCondition() {
        // 获取主查询限制列
        const selectedMainColumn = document.querySelector('#mainQueryColumnPool .pool-column-item.selected');
        const mainOperator = document.getElementById('mainQueryOperator')?.value;
        
        if (!selectedMainColumn) {
            alert('请选择主查询限制列');
            return;
        }
        
        if (!this.tempSubqueryConditions || this.tempSubqueryConditions.length === 0) {
            alert('请至少添加一个子查询条件');
            return;
        }
        
        // 获取主查询列的值
        const table = selectedMainColumn.dataset.table;
        const column = selectedMainColumn.dataset.column;
        const isCustom = selectedMainColumn.dataset.custom === 'true';
        
        let mainColumnValue = '';
        if (isCustom) {
            const customCol = this.selectedColumnKeys.find(key => 
                typeof key === 'object' && key.custom && key.name === column
            );
            if (customCol) {
                mainColumnValue = customCol.expression;
            } else {
                mainColumnValue = column;
            }
        } else {
            mainColumnValue = table ? `${table}.${column}` : column;
        }
        
        // 验证子查询条件
        const validSubqueryConditions = [];
        this.tempSubqueryConditions.forEach(cond => {
            if (cond.column && cond.operator && cond.value) {
                validSubqueryConditions.push({
                    column: cond.column,
                    operator: cond.operator,
                    value: cond.value
                });
            }
        });
        
        if (validSubqueryConditions.length === 0) {
            alert('请填写完整的子查询条件');
            return;
        }
        
        // 检查是否已存在相同的复杂条件（避免重复）
        const exists = this.complexConditions.some(existing => {
            if (existing.mainColumn === mainColumnValue && 
                existing.operator === mainOperator &&
                existing.subqueryConditions.length === validSubqueryConditions.length) {
                // 检查子查询条件是否完全相同
                return existing.subqueryConditions.every((existingCond, idx) => {
                    const newCond = validSubqueryConditions[idx];
                    return existingCond.column === newCond.column &&
                           existingCond.operator === newCond.operator &&
                           existingCond.value === newCond.value;
                });
            }
            return false;
        });
        
        if (exists) {
            alert('该复杂过滤条件已存在');
            return;
        }
        
        // 保存复杂条件
        this.complexConditions.push({
            mainColumn: mainColumnValue,
            operator: mainOperator,
            subqueryConditions: validSubqueryConditions
        });
        
        this.updateComplexConditionsDisplay();
        this.hideComplexConditionEditor();
    }
    
    updateComplexConditionsDisplay() {
        const container = document.getElementById('complexConditionItems');
        if (!container) return;
        
        if (this.complexConditions.length === 0) {
            container.innerHTML = '<p class="placeholder-text">暂无复杂过滤条件</p>';
            return;
        }
        
        let html = '';
        this.complexConditions.forEach((item, index) => {
            const subqueryText = item.subqueryConditions.map(c => `${c.column} ${c.operator} '${c.value}'`).join(', ');
            html += `
                <div class="horizontal-item" data-index="${index}" draggable="true">
                    <span class="item-label">${item.mainColumn} ${item.operator} (子查询: ${subqueryText})</span>
                    <button class="remove-item-btn" onclick="visualSQLBuilder.removeComplexCondition(${index})">&times;</button>
                </div>
            `;
        });
        container.innerHTML = html;
        this.initDragAndDrop('complexConditionItems', (oldIndex, newIndex) => {
            const item = this.complexConditions.splice(oldIndex, 1)[0];
            this.complexConditions.splice(newIndex, 0, item);
            this.updateComplexConditionsDisplay();
        });
    }
    
    removeComplexCondition(index) {
        this.complexConditions.splice(index, 1);
        this.updateComplexConditionsDisplay();
    }
    
    addComplexCondition() {
        // 初始化临时子查询条件列表
        this.tempSubqueryConditions = [];
        // 显示编辑器
        this.showComplexConditionEditor();
    }
    
    // ========== 获取复杂过滤条件 ==========
    getComplexConditions() {
        // 返回旧格式用于向后兼容
        const conditions = [];
        this.complexConditions.forEach(complex => {
            // 构建子查询字符串
            const subqueryConditions = complex.subqueryConditions.map(c => {
                if (c.operator === 'LIKE') {
                    return `${c.column} ${c.operator} '%${c.value}%'`;
                } else {
                    return `${c.column} ${c.operator} '${c.value}'`;
                }
            }).join(' AND ');
            
            // 构建完整条件
            if (complex.operator === 'IN' || complex.operator === 'NOT IN') {
                conditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${complex.subqueryConditions[0].column} FROM ... WHERE ${subqueryConditions})`);
            } else if (complex.operator === 'EXISTS' || complex.operator === 'NOT EXISTS') {
                conditions.push(`${complex.operator} (SELECT 1 FROM ... WHERE ${subqueryConditions})`);
            } else {
                conditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${complex.subqueryConditions[0].column} FROM ... WHERE ${subqueryConditions})`);
            }
        });
        return conditions;
    }
    
    // ========== 生成带复杂条件的多表SQL（连接查询和子查询两种方案） ==========
    generateMultiTableSQLWithComplexConditions(tables, resolvedColumns) {
        const solutions = {
            sqls: [],
            types: []
        };
        
        // 方案1: 连接查询
        const joinSQL = this.generateMultiTableSQLWithComplexConditionsJoin(tables, resolvedColumns);
        solutions.sqls.push(joinSQL);
        solutions.types.push('连接查询');
        
        // 方案2: 子查询
        const subquerySQL = this.generateMultiTableSQLWithComplexConditionsSubquery(tables, resolvedColumns);
        solutions.sqls.push(subquerySQL);
        solutions.types.push('子查询');
        
        return solutions;
    }
    
    // 生成连接查询方案（将复杂条件转换为JOIN条件）
    generateMultiTableSQLWithComplexConditionsJoin(tables, resolvedColumns) {
        // TOP子句
        let sql = 'SELECT ';
        if (this.topLimit) {
            sql += `TOP ${this.topLimit} `;
        }
        
        // 选择列
        const selectParts = resolvedColumns.map(col => {
            if (col.custom) {
                let expression = col.expression;
                if (col.extractedColumns && col.extractedColumns.length > 0) {
                    col.extractedColumns.forEach(extracted => {
                        const prefixedPattern = new RegExp(`[A-Za-z_]+\\s*\\.\\s*${extracted.column}\\b`);
                        if (!prefixedPattern.test(expression)) {
                            const regex = new RegExp(`\\b${extracted.column}\\b`, 'g');
                            expression = expression.replace(regex, `${extracted.table}.${extracted.column}`);
                        }
                    });
                }
                return `${expression} AS ${col.name}`;
            } else {
                return `${col.table}.${col.column}`;
            }
        });
        sql += selectParts.join(', ');
        
        // FROM和JOIN子句
        const allRequiredTables = new Set(tables);
        // 添加复杂条件中涉及的子查询表
        this.complexConditions.forEach(complex => {
            complex.subqueryConditions.forEach(cond => {
                // 从子查询条件的列中提取表名
                if (cond.column.includes('.')) {
                    const tableName = cond.column.split('.')[0];
                    allRequiredTables.add(tableName);
                }
            });
        });
        const finalTables = Array.from(allRequiredTables);
        
        const joins = this.generateJoins(finalTables);
        sql += ' FROM ' + finalTables[0];
        if (joins.length > 0) {
            sql += ' ' + joins.join(' ');
        }
        
        // WHERE子句
        const whereConditions = [];
        
        // 添加简单过滤条件
        if (this.simpleConditions.length > 0) {
            const simpleCondParts = [];
            this.simpleConditions.forEach((cond, index) => {
                let condPart = `${cond.column} ${cond.operator} `;
                if (cond.operator === 'LIKE') {
                    condPart += `'${cond.value}'`;
                } else {
                    condPart += `'${cond.value}'`;
                }
                if (index > 0) {
                    condPart = `${cond.connector} ${condPart}`;
                }
                simpleCondParts.push(condPart);
            });
            whereConditions.push(simpleCondParts.join(' '));
        }
        
        // 添加复杂过滤条件（转换为JOIN条件）
        this.complexConditions.forEach(complex => {
            complex.subqueryConditions.forEach(subCond => {
                // 将子查询条件转换为JOIN条件
                // 例如：主查询列 = 子查询列 转换为 JOIN ON 条件
                let condPart = '';
                if (subCond.operator === 'LIKE') {
                    condPart = `${subCond.column} ${subCond.operator} '%${subCond.value}%'`;
                } else {
                    condPart = `${subCond.column} ${subCond.operator} '${subCond.value}'`;
                }
                
                if (whereConditions.length > 0) {
                    whereConditions.push('AND');
                }
                whereConditions.push(condPart);
                
                // 添加主查询列和子查询列的等值连接条件
                if (complex.operator === '=' || complex.operator === 'IN') {
                    // 提取子查询列的表名和列名
                    let subTable = null;
                    let subColumn = null;
                    if (subCond.column.includes('.')) {
                        const parts = subCond.column.split('.');
                        subTable = parts[0];
                        subColumn = parts[1];
                    }
                    
                    // 提取主查询列的表名和列名
                    let mainTable = null;
                    let mainColumn = null;
                    if (complex.mainColumn.includes('.')) {
                        const parts = complex.mainColumn.split('.');
                        mainTable = parts[0];
                        mainColumn = parts[1];
                    }
                    
                    // 添加等值连接（如果还没有相应的JOIN）
                    if (mainTable && subTable && mainTable !== subTable) {
                        const existingJoin = joins.find(j => 
                            j.includes(`${mainTable}.`) && j.includes(`${subTable}.`)
                        );
                        if (!existingJoin && subColumn) {
                            // 这里可以添加额外的JOIN条件，但为了简化，我们只在WHERE中添加
                            // 实际的JOIN应该已经在generateJoins中生成了
                        }
                    }
                }
            });
        });
        
        if (whereConditions.length > 0) {
            sql += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY
        const groupByColumns = this.resolveGroupByColumns(resolvedColumns);
        if (groupByColumns.length > 0) {
            sql += ' GROUP BY ' + groupByColumns.join(', ');
        }
        
        // ORDER BY
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                orderParts.push(`${item.column} ${item.direction}`);
            });
            sql += ' ORDER BY ' + orderParts.join(', ');
        }
        
        sql += ';';
        return sql;
    }
    
    // 生成子查询方案
    generateMultiTableSQLWithComplexConditionsSubquery(tables, resolvedColumns) {
        // TOP子句
        let sql = 'SELECT ';
        if (this.topLimit) {
            sql += `TOP ${this.topLimit} `;
        }
        
        // 选择列（主查询表的列）
        const mainTable = tables[0];
        const selectParts = resolvedColumns
            .filter(col => !col.custom && col.table === mainTable)
            .map(col => `${col.table}.${col.column}`);
        
        // 添加自定义列（如果涉及主表）
        resolvedColumns.forEach(col => {
            if (col.custom) {
                // 检查自定义列是否主要依赖主表
                if (col.extractedColumns && col.extractedColumns.some(extracted => extracted.table === mainTable)) {
                    let expression = col.expression;
                    col.extractedColumns.forEach(extracted => {
                        const prefixedPattern = new RegExp(`[A-Za-z_]+\\s*\\.\\s*${extracted.column}\\b`);
                        if (!prefixedPattern.test(expression)) {
                            const regex = new RegExp(`\\b${extracted.column}\\b`, 'g');
                            expression = expression.replace(regex, `${extracted.table}.${extracted.column}`);
                        }
                    });
                    selectParts.push(`${expression} AS ${col.name}`);
                }
            }
        });
        
        if (selectParts.length === 0) {
            selectParts.push(`${mainTable}.*`);
        }
        sql += selectParts.join(', ');
        
        sql += ` FROM ${mainTable}`;
        
        // WHERE子句
        const whereConditions = [];
        
        // 添加简单过滤条件（仅主表的条件）
        if (this.simpleConditions.length > 0) {
            const simpleCondParts = [];
            this.simpleConditions.forEach((cond, index) => {
                // 只包含主表的条件
                if (cond.column.includes('.') && cond.column.split('.')[0] === mainTable) {
                    let condPart = `${cond.column} ${cond.operator} `;
                    if (cond.operator === 'LIKE') {
                        condPart += `'${cond.value}'`;
                    } else {
                        condPart += `'${cond.value}'`;
                    }
                    if (simpleCondParts.length > 0) {
                        condPart = `${cond.connector} ${condPart}`;
                    }
                    simpleCondParts.push(condPart);
                }
            });
            if (simpleCondParts.length > 0) {
                whereConditions.push(simpleCondParts.join(' '));
            }
        }
        
        // 添加复杂过滤条件（子查询）
        this.complexConditions.forEach(complex => {
            if (whereConditions.length > 0) {
                whereConditions.push('AND');
            }
            
            // 构建子查询WHERE条件
            const subqueryConditions = complex.subqueryConditions.map(c => {
                if (c.operator === 'LIKE') {
                    return `${c.column} ${c.operator} '%${c.value}%'`;
                } else {
                    return `${c.column} ${c.operator} '${c.value}'`;
                }
            }).join(' AND ');
            
            // 从子查询条件中提取所有涉及的表
            const subqueryTables = new Set();
            complex.subqueryConditions.forEach(c => {
                if (c.column && c.column.includes('.')) {
                    const tableName = c.column.split('.')[0].trim();
                    if (tableName) {
                        subqueryTables.add(tableName);
                    }
                }
            });
            
            // 如果子查询条件没有表，尝试从主查询列中提取
            if (subqueryTables.size === 0 && complex.mainColumn.includes('.')) {
                const mainTableName = complex.mainColumn.split('.')[0].trim();
                if (mainTableName) {
                    subqueryTables.add(mainTableName);
                }
            }
            
            // 如果只有一个表，直接使用；如果有多个表，需要JOIN
            let subqueryTableClause = '';
            const subqueryTableArray = Array.from(subqueryTables);
            
            if (subqueryTableArray.length === 0) {
                // 如果还是没有表，使用默认表（优先使用tables中的其他表）
                if (tables.length > 1) {
                    subqueryTableClause = tables[1]; // 使用第二个表
                } else if (tables.length === 1) {
                    subqueryTableClause = tables[0]; // 只能使用第一个表（自查询）
                } else {
                    // 没有表可用，使用数据库的第一个表
            const dbData = this.databaseStructure[this.currentDatabase];
                    if (dbData && dbData.tables) {
                        const firstTable = Object.keys(dbData.tables)[0];
                        subqueryTableClause = firstTable || 'S'; // 默认使用S表
                    } else {
                        subqueryTableClause = 'S'; // 最后的默认值
                    }
                }
            } else if (subqueryTableArray.length === 1) {
                // 单个表
                subqueryTableClause = subqueryTableArray[0];
            } else {
                // 多个表，需要JOIN
                subqueryTableClause = subqueryTableArray[0];
                
                // 生成JOIN子句
                const subqueryJoins = this.generateJoins(subqueryTableArray);
                if (subqueryJoins.length > 0) {
                    subqueryTableClause += ' ' + subqueryJoins.join(' ');
                }
            }
            
            // 确保subqueryTableClause不为空
            if (!subqueryTableClause || subqueryTableClause.trim() === '') {
                subqueryTableClause = tables[0] || 'S'; // 默认使用第一个表或S表
            }
            
            // 构建子查询SELECT列（使用主查询限制列，而不是子查询条件的列）
            // 提取主查询限制列的表名和列名
            let subquerySelectCol = complex.mainColumn;
            if (complex.mainColumn.includes('.')) {
                // 如果主查询列有表前缀，只使用列名（因为子查询中的表可能不同）
                const parts = complex.mainColumn.split('.');
                subquerySelectCol = parts[1]; // 只使用列名
            }
            
            // 根据运算符生成不同的子查询
            if (complex.operator === 'IN' || complex.operator === 'NOT IN') {
                whereConditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${subquerySelectCol} FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            } else if (complex.operator === 'EXISTS' || complex.operator === 'NOT EXISTS') {
                whereConditions.push(`${complex.operator} (SELECT 1 FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            } else {
                // =, !=, >, < 等
                whereConditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${subquerySelectCol} FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            }
        });
        
        if (whereConditions.length > 0) {
            sql += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY
        const groupByColumns = this.resolveGroupByColumns(resolvedColumns.filter(col => 
            !col.custom || (col.table && col.table === mainTable)
        ));
        if (groupByColumns.length > 0) {
            sql += ' GROUP BY ' + groupByColumns.join(', ');
        }
        
        // ORDER BY
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                let orderCol = item.column;
                if (orderCol.includes('.')) {
                    const parts = orderCol.split('.');
                    if (parts[0] !== mainTable) {
                        orderCol = parts[1]; // 只使用列名，因为主查询只有一个表
                    }
                }
                orderParts.push(`${orderCol} ${item.direction}`);
            });
            sql += ' ORDER BY ' + orderParts.join(', ');
        }
        
        sql += ';';
        return sql;
    }
    
    // ========== 通用辅助方法 ==========
    // 解析GROUP BY列，确保它们与SELECT中的列匹配
    resolveGroupByColumns(resolvedColumns) {
        const groupByColumns = [];
        const selectColumnNames = new Set(); // 存储SELECT中所有列的标识符
        const selectColumnsInfo = []; // 存储SELECT列的详细信息 [{table, column, fullName}]
        
        // 收集SELECT中已选择的列（用于匹配GROUP BY）
        resolvedColumns.forEach(col => {
            if (col.custom) {
                // 自定义列：使用列名作为标识符
                selectColumnNames.add(col.name);
                // 也添加表达式中的列（如果有表前缀）
                if (col.extractedColumns) {
                    col.extractedColumns.forEach(extracted => {
                        const fullName = `${extracted.table}.${extracted.column}`;
                        selectColumnNames.add(fullName);
                        selectColumnNames.add(extracted.column);
                        selectColumnsInfo.push({
                            table: extracted.table,
                            column: extracted.column,
                            fullName: fullName
                        });
                    });
                }
            } else {
                // 普通列
                if (col.table) {
                    const fullName = `${col.table}.${col.column}`;
                    selectColumnNames.add(fullName);
                    selectColumnNames.add(col.column);
                    selectColumnsInfo.push({
                        table: col.table,
                        column: col.column,
                        fullName: fullName
                    });
                } else {
                    selectColumnNames.add(col.column);
                    selectColumnsInfo.push({
                        table: null,
                        column: col.column,
                        fullName: col.column
                    });
                }
            }
        });
        
        // 处理GROUP BY列
        resolvedColumns.forEach(col => {
            if (col.custom && col.groupBy) {
                const groupByCol = col.groupBy.trim();
                if (!groupByCol) return;
                
                // 检查GROUP BY列是否在SELECT列中存在
                let resolvedGroupByCol = null;
                
                // 1. 直接匹配（完全匹配）
                if (selectColumnNames.has(groupByCol)) {
                    resolvedGroupByCol = groupByCol;
                } else {
                    // 2. 尝试提取列名进行匹配
                    let groupByTable = null;
                    let groupByColumn = null;
                    if (groupByCol.includes('.')) {
                        const parts = groupByCol.split('.');
                        groupByTable = parts[0].trim();
                        groupByColumn = parts[1].trim();
                    } else {
                        groupByColumn = groupByCol;
                    }
                    
                    // 2.1 首先尝试匹配相同列名（不区分大小写）
                    let bestMatch = null;
                    let bestMatchPriority = 0; // 优先级：3=同表同列，2=同列名，1=相似列名
                    
                    selectColumnsInfo.forEach(selectCol => {
                        const selectColNameLower = selectCol.column.toLowerCase();
                        const groupByColNameLower = groupByColumn.toLowerCase();
                        
                        // 完全匹配列名（不区分大小写）
                        if (selectColNameLower === groupByColNameLower) {
                            const priority = (selectCol.table && groupByTable && selectCol.table.toLowerCase() === groupByTable.toLowerCase()) ? 3 : 2;
                            if (priority > bestMatchPriority) {
                                bestMatchPriority = priority;
                                bestMatch = selectCol.fullName;
                            }
                        }
                        // 相似匹配（SNO匹配SN，SN匹配SNO等，仅差一个字母）
                        else if (bestMatchPriority < 1) {
                            const diff = Math.abs(selectColNameLower.length - groupByColNameLower.length);
                            if (diff <= 1 && (
                                selectColNameLower.includes(groupByColNameLower) || 
                                groupByColNameLower.includes(selectColNameLower)
                            )) {
                                bestMatchPriority = 1;
                                bestMatch = selectCol.fullName;
                            }
                        }
                    });
                    
                    if (bestMatch) {
                        resolvedGroupByCol = bestMatch;
                    }
                    
                    // 2.2 如果还是找不到，尝试从resolvedColumns中查找普通列
                    if (!resolvedGroupByCol) {
                        resolvedColumns.forEach(selectCol => {
                            if (!selectCol.custom) {
                                const selectColName = selectCol.table ? `${selectCol.table}.${selectCol.column}` : selectCol.column;
                                const selectColNameOnly = selectCol.column.toLowerCase();
                                const groupByColNameOnly = groupByColumn.toLowerCase();
                                
                                // 匹配列名（不区分大小写）
                                if (selectColNameOnly === groupByColNameOnly) {
                                    resolvedGroupByCol = selectColName;
                                }
                            }
                        });
                    }
                    
                    // 3. 如果还是找不到，检查GROUP BY列的表是否在FROM中，如果是则保留
                    // 如果不在SELECT中但表存在，尝试查找同一表的其他列
                    if (!resolvedGroupByCol && groupByTable) {
            const dbData = this.databaseStructure[this.currentDatabase];
                        if (dbData && dbData.tables[groupByTable]) {
                            // 检查SELECT中是否有同一表的其他列
                            const sameTableCol = selectColumnsInfo.find(sc => 
                                sc.table && sc.table.toLowerCase() === groupByTable.toLowerCase()
                            );
                            if (sameTableCol) {
                                // 使用同一表的另一个列，但尽量使用主键或ID列
                                const tableInfo = dbData.tables[groupByTable];
                                let primaryKeyCol = null;
                                Object.keys(tableInfo.columns).forEach(colKey => {
                                    const colInfo = tableInfo.columns[colKey];
                                    if (colInfo.key && colInfo.key.includes('PK')) {
                                        primaryKeyCol = colKey;
                                    }
                                });
                                
                                if (primaryKeyCol) {
                                    resolvedGroupByCol = `${groupByTable}.${primaryKeyCol}`;
                                } else {
                                    resolvedGroupByCol = sameTableCol.fullName;
                                }
                            }
                        }
                    }
                    
                    // 4. 如果还是找不到，使用原始值
                    if (!resolvedGroupByCol) {
                        resolvedGroupByCol = groupByCol;
                    }
                }
                
                // 添加到GROUP BY列表（去重）
                if (resolvedGroupByCol && !groupByColumns.includes(resolvedGroupByCol)) {
                    groupByColumns.push(resolvedGroupByCol);
                }
            }
        });
        
        return groupByColumns;
    }
    
    buildColumnPoolHTML(includeCustom = true, forEditor = false) {
        const dbData = this.databaseStructure[this.currentDatabase];
        const allColumns = {};
        const existingColumns = this.resolvedColumns || [];
        
        Object.keys(dbData.tables).forEach(tableKey => {
            const table = dbData.tables[tableKey];
            Object.keys(table.columns).forEach(columnKey => {
                const column = table.columns[columnKey];
                if (!allColumns[columnKey]) {
                    allColumns[columnKey] = [];
                }
                allColumns[columnKey].push({ table: tableKey, column: columnKey, name: column.name, type: column.type });
            });
        });
        
        let html = '<div class="column-pool-list">';
        
        // 已有列
        if (existingColumns.length > 0) {
            html += '<div class="pool-section"><h5>已有列</h5><div class="pool-columns">';
            existingColumns.forEach(col => {
                if (forEditor) {
                    // 编辑器模式：大标题显示列名代号，小标题显示含义
                    const displayColumn = col.custom ? col.name : (col.table ? `${col.table}.${col.column}` : col.column);
                    html += `
                        <div class="pool-column-item" data-column="${col.custom ? col.name : col.column}" data-table="${col.table || ''}" data-type="${col.type || ''}" data-custom="${col.custom ? 'true' : ''}">
                            <span class="column-name">${displayColumn}</span>
                            <span class="column-desc">${col.name}</span>
                        </div>
                    `;
                } else {
                    html += `
                        <div class="pool-column-item" data-column="${col.column}" data-table="${col.table}">
                            <span class="column-name">${col.table}.${col.column}</span>
                            <span class="column-desc">${col.name}</span>
                        </div>
                    `;
                }
            });
            html += '</div></div>';
        }
        
        // 所有列
        html += '<div class="pool-section"><h5>所有列</h5><div class="pool-columns">';
        Object.keys(allColumns).filter(key => {
            return !existingColumns.some(c => c.column === key);
        }).forEach(columnKey => {
            const columns = allColumns[columnKey];
            if (forEditor) {
                // 编辑器模式：大标题显示列名代号，小标题显示含义
                const displayName = columns.length > 1 ? `${columnKey} (${columns.length}个表)` : columnKey;
                html += `
                    <div class="pool-column-item" data-column="${columnKey}" data-type="${columns[0].type || ''}" data-table="${columns.length > 1 ? '' : columns[0].table}">
                        <span class="column-name">${displayName}</span>
                        <span class="column-desc">${columns[0].name}</span>
                    </div>
                `;
            } else {
                const displayName = columns.length > 1 ? `${columnKey} (${columns.length}个表)` : `${columnKey} - ${columns[0].name}`;
                html += `
                    <div class="pool-column-item" data-column="${columnKey}" data-type="${columns[0].type || ''}" data-table="${columns.length > 1 ? '' : columns[0].table}">
                        <span class="column-name">${displayName}</span>
                        <span class="column-desc">${columns[0].name}</span>
                    </div>
                `;
            }
        });
        html += '</div></div>';
        
        // 自定义列（如果有）
        const customColumns = this.selectedColumnKeys.filter(key => typeof key === 'object' && key.custom);
        if (customColumns.length > 0 && forEditor) {
            html += '<div class="pool-section"><h5>自定义列</h5><div class="pool-columns">';
            customColumns.forEach(customCol => {
                html += `
                    <div class="pool-column-item" data-column="${customCol.name}" data-custom="true">
                        <span class="column-name">${customCol.name}</span>
                        <span class="column-desc">${customCol.name}</span>
                    </div>
                `;
            });
            html += '</div></div>';
        }
        
        // 编辑器模式下不显示"自定义"输入框
        // 非编辑器模式下显示"自定义"输入框（用于其他场景）
        if (includeCustom && !forEditor) {
            html += '<div class="pool-section"><h5>自定义</h5>';
            html += '<div class="custom-column-input">';
            html += '<input type="text" id="customColumn" placeholder="输入自定义列名（如：表名.列名）">';
            html += '</div></div>';
        }
        
        html += '</div>';
        return html;
    }
    
    bindColumnPoolEvents(poolId) {
        const pool = document.getElementById(poolId);
        if (!pool) return;
        
        pool.querySelectorAll('.pool-column-item').forEach(item => {
            item.addEventListener('click', () => {
                pool.querySelectorAll('.pool-column-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
        });
    }
    
    filterEditorColumns(poolId, keyword) {
        const pool = document.getElementById(poolId);
        if (!pool) return;
        
        const items = pool.querySelectorAll('.pool-column-item');
        if (!keyword) {
            items.forEach(item => item.style.display = '');
            return;
        }
        
        items.forEach(item => {
            const name = item.querySelector('.column-name')?.textContent.toLowerCase() || '';
            const desc = item.querySelector('.column-desc')?.textContent.toLowerCase() || '';
            item.style.display = (name.includes(keyword) || desc.includes(keyword)) ? '' : 'none';
        });
    }
    
    populateConditionColumns(selectElement) {
        // 如果有解析后的列，使用解析后的列；否则使用所有可用列
        if (this.resolvedColumns && this.resolvedColumns.length > 0) {
            this.resolvedColumns.forEach(col => {
                const option = document.createElement('option');
                option.value = `${col.table}.${col.column}`;
                option.textContent = `${col.table}.${col.column}`;
                selectElement.appendChild(option);
            });
        }
        
        // 添加所有可用列（包括未选择的）
        const dbData = this.databaseStructure[this.currentDatabase];
        Object.keys(dbData.tables).forEach(tableKey => {
            const table = dbData.tables[tableKey];
            Object.keys(table.columns).forEach(columnKey => {
                const exists = Array.from(selectElement.options).some(opt => opt.value === `${tableKey}.${columnKey}`);
                if (!exists) {
                    const option = document.createElement('option');
                    option.value = `${tableKey}.${columnKey}`;
                    option.textContent = `${tableKey}.${columnKey}`;
                    selectElement.appendChild(option);
                }
            });
        });
    }
    
    populateConditionColumns(selectElement) {
        // 如果有解析后的列，使用解析后的列；否则使用所有可用列
        if (this.resolvedColumns && this.resolvedColumns.length > 0) {
            this.resolvedColumns.forEach(col => {
                const option = document.createElement('option');
                option.value = `${col.table}.${col.column}`;
                option.textContent = `${col.table}.${col.column}`;
                selectElement.appendChild(option);
            });
        }
        
        // 添加所有可用列（包括未选择的）
        const dbData = this.databaseStructure[this.currentDatabase];
        Object.keys(dbData.tables).forEach(tableKey => {
            const table = dbData.tables[tableKey];
            Object.keys(table.columns).forEach(columnKey => {
                const exists = Array.from(selectElement.options).some(opt => opt.value === `${tableKey}.${columnKey}`);
                if (!exists) {
                    const option = document.createElement('option');
                    option.value = `${tableKey}.${columnKey}`;
                    option.textContent = `${tableKey}.${columnKey}`;
                    selectElement.appendChild(option);
                }
            });
        });
    }
    
    addOrderBy() {
        const container = document.getElementById('order');
        if (!container) return;
        
        const orderDiv = document.createElement('div');
        orderDiv.className = 'order-item';
        orderDiv.innerHTML = `
            <select class="order-column">
                <option value="">选择列</option>
            </select>
            <select class="order-direction">
                <option value="ASC">升序</option>
                <option value="DESC">降序</option>
            </select>
            <button class="remove-order" onclick="this.parentElement.remove();">删除</button>
        `;
        
        // 填充列选项
        this.populateOrderColumns(orderDiv.querySelector('.order-column'));
        
        // 添加事件监听（不再自动生成SQL）
        orderDiv.querySelector('.order-column').addEventListener('change', () => {});
        orderDiv.querySelector('.order-direction').addEventListener('change', () => {});
        
        container.appendChild(orderDiv);
    }
    
    populateOrderColumns(selectElement) {
        // 如果有解析后的列，使用解析后的列
        if (this.resolvedColumns && this.resolvedColumns.length > 0) {
            this.resolvedColumns.forEach(col => {
                const option = document.createElement('option');
                option.value = `${col.table}.${col.column}`;
                option.textContent = `${col.table}.${col.column}`;
                selectElement.appendChild(option);
            });
        } else {
            // 否则使用所有可用列
            const dbData = this.databaseStructure[this.currentDatabase];
            Object.keys(dbData.tables).forEach(tableKey => {
                const table = dbData.tables[tableKey];
                Object.keys(table.columns).forEach(columnKey => {
                const option = document.createElement('option');
                    option.value = `${tableKey}.${columnKey}`;
                    option.textContent = `${tableKey}.${columnKey}`;
                selectElement.appendChild(option);
                });
            });
        }
    }
    
    addGroupBy() {
        const container = document.getElementById('group');
        if (!container) return;
        
        const groupDiv = document.createElement('div');
        groupDiv.className = 'group-item';
        groupDiv.innerHTML = `
            <select class="group-column">
                <option value="">选择列</option>
            </select>
            <button class="remove-group" onclick="this.parentElement.remove();">删除</button>
        `;
        
        // 填充列选项
        this.populateGroupColumns(groupDiv.querySelector('.group-column'));
        
        // 添加事件监听（不再自动生成SQL）
        groupDiv.querySelector('.group-column').addEventListener('change', () => {});
        
        container.appendChild(groupDiv);
    }
    
    populateGroupColumns(selectElement) {
        // 如果有解析后的列，使用解析后的列
        if (this.resolvedColumns && this.resolvedColumns.length > 0) {
            this.resolvedColumns.forEach(col => {
                const option = document.createElement('option');
                option.value = `${col.table}.${col.column}`;
                option.textContent = `${col.table}.${col.column}`;
                selectElement.appendChild(option);
            });
        } else {
            // 否则使用所有可用列
            const dbData = this.databaseStructure[this.currentDatabase];
            Object.keys(dbData.tables).forEach(tableKey => {
                const table = dbData.tables[tableKey];
                Object.keys(table.columns).forEach(columnKey => {
                const option = document.createElement('option');
                    option.value = `${tableKey}.${columnKey}`;
                    option.textContent = `${tableKey}.${columnKey}`;
                selectElement.appendChild(option);
                });
            });
        }
    }
    
    generateSQL() {
        // 先解析列名到表
        const resolvedColumns = this.resolveColumnsToTables();
        
        if (resolvedColumns.length === 0) {
            this.displaySQL(['SELECT * FROM table_name;'], ['单表查询']);
            return;
        }
        
        // 判断是单表还是多表查询
        // 需要包含自定义列提取的表
        const allTables = new Set();
        resolvedColumns.forEach(col => {
            if (col.custom && col.extractedColumns) {
                col.extractedColumns.forEach(extracted => {
                    allTables.add(extracted.table);
                });
            } else if (col.table) {
                allTables.add(col.table);
            }
        });
        const tables = Array.from(allTables);
        const isSingleTable = tables.length === 1;
        
        // 检查是否有复杂过滤条件
        const hasComplexConditions = this.complexConditions && this.complexConditions.length > 0;
        
        // 获取过滤条件（仅用于向后兼容的判断，不用于实际SQL生成）
        const conditions = this.getConditions();
        
        // 临时保存解析后的列，供后续方法使用
        this.resolvedColumns = resolvedColumns;
        
        // 生成SQL方案
        let sqlSolutions = [];
        let solutionTypes = [];
        
        if (isSingleTable && hasComplexConditions) {
            // 单表但有复杂条件，需要转换为多表查询（因为子查询需要另一个表）
            // 将复杂条件中的表添加到tables中
            const allTables = new Set(tables);
            this.complexConditions.forEach(complex => {
                complex.subqueryConditions.forEach(cond => {
                    if (cond.column.includes('.')) {
                        allTables.add(cond.column.split('.')[0]);
                    }
                });
                // 也从主查询限制列中提取表
                if (complex.mainColumn.includes('.')) {
                    allTables.add(complex.mainColumn.split('.')[0]);
                }
            });
            const expandedTables = Array.from(allTables);
            if (expandedTables.length > 1) {
                // 转换为多表查询
                const solutions = this.generateMultiTableSQLWithComplexConditions(expandedTables, resolvedColumns);
                sqlSolutions = solutions.sqls;
                solutionTypes = solutions.types;
        } else {
                // 如果仍然是单表，生成子查询方案
                const sql = this.generateSingleTableSQLWithSubquery(tables[0], resolvedColumns);
                sqlSolutions.push(sql);
                solutionTypes.push('单表查询（子查询）');
            }
        } else if (isSingleTable) {
            // 单表查询（无复杂条件）
            // 检查是否有简单过滤条件，且过滤条件列不在选择列中
            const hasFilterColumnsNotInSelect = this.checkFilterColumnsNotInSelect(resolvedColumns);
            
            if (hasFilterColumnsNotInSelect && this.simpleConditions.length > 0) {
                // 生成4种SQL方案
                const solutions = this.generateSingleTableSQLWithAlternatives(tables[0], resolvedColumns);
                sqlSolutions = solutions.sqls;
                solutionTypes = solutions.types;
            } else {
                // 普通的单表查询
                const sql = this.generateSingleTableSQL(tables[0], conditions, resolvedColumns);
                sqlSolutions.push(sql);
                solutionTypes.push('单表查询');
            }
        } else {
            // 多表查询
            if (hasComplexConditions) {
                // 有复杂过滤条件（子查询），生成两种方案：连接查询和子查询
                const solutions = this.generateMultiTableSQLWithComplexConditions(tables, resolvedColumns);
                sqlSolutions = solutions.sqls;
                solutionTypes = solutions.types;
            } else if (conditions.length > 0) {
                // 有简单过滤条件，一题多解
                const solutions = this.generateMultiTableSQLWithAlternatives(tables, conditions, resolvedColumns);
                sqlSolutions = solutions.sqls;
                solutionTypes = solutions.types;
            } else {
                // 只有连接查询
                const sql = this.generateMultiTableSQL(tables, resolvedColumns);
                sqlSolutions.push(sql);
                solutionTypes.push('连接查询');
            }
        }
        
        this.displaySQL(sqlSolutions, solutionTypes);
    }
    
    generateSingleTableSQLWithSubquery(table, resolvedColumns) {
        // TOP子句（如果有指定数量）
        let sql = 'SELECT ';
        if (this.topLimit) {
            sql += `TOP ${this.topLimit} `;
        }
        
        // 选择列
        if (resolvedColumns.length === 0) {
            sql += '*';
        } else {
            const selectParts = resolvedColumns.map(col => {
                if (col.custom) {
                    return `${col.expression} AS ${col.name}`;
                } else {
                    return col.column;
                }
            });
            sql += selectParts.join(', ');
        }
        
        sql += ` FROM ${table}`;
        
        // WHERE子句（只包含复杂过滤条件）
        const whereConditions = [];
        
        // 添加复杂过滤条件（子查询）
        this.complexConditions.forEach(complex => {
            if (whereConditions.length > 0) {
                whereConditions.push('AND');
            }
            
            // 构建子查询WHERE条件
            const subqueryConditions = complex.subqueryConditions.map(c => {
                if (c.operator === 'LIKE') {
                    return `${c.column} ${c.operator} '%${c.value}%'`;
                } else {
                    return `${c.column} ${c.operator} '${c.value}'`;
                }
            }).join(' AND ');
            
            // 从子查询条件中提取所有涉及的表
            const subqueryTables = new Set();
            complex.subqueryConditions.forEach(c => {
                if (c.column && c.column.includes('.')) {
                    const tableName = c.column.split('.')[0].trim();
                    if (tableName) {
                        subqueryTables.add(tableName);
                    }
                }
            });
            
            // 如果子查询条件没有表，尝试从主查询列中提取，或使用当前表
            if (subqueryTables.size === 0) {
                if (complex.mainColumn.includes('.')) {
                    const mainTableName = complex.mainColumn.split('.')[0].trim();
                    if (mainTableName) {
                        subqueryTables.add(mainTableName);
                    }
                } else {
                    subqueryTables.add(table); // 使用当前表
                }
            }
            
            // 如果只有一个表，直接使用；如果有多个表，需要JOIN
            let subqueryTableClause = '';
            const subqueryTableArray = Array.from(subqueryTables);
            
            if (subqueryTableArray.length === 0) {
                subqueryTableClause = table; // 使用当前表（自查询）
            } else if (subqueryTableArray.length === 1) {
                subqueryTableClause = subqueryTableArray[0];
            } else {
                // 多个表，需要JOIN
                subqueryTableClause = subqueryTableArray[0];
                const subqueryJoins = this.generateJoins(subqueryTableArray);
                if (subqueryJoins.length > 0) {
                    subqueryTableClause += ' ' + subqueryJoins.join(' ');
                }
            }
            
            // 确保subqueryTableClause不为空
            if (!subqueryTableClause || subqueryTableClause.trim() === '') {
                subqueryTableClause = table; // 默认使用当前表
            }
            
            // 构建子查询SELECT列（使用主查询限制列的列名）
            let subquerySelectCol = complex.mainColumn;
            if (complex.mainColumn.includes('.')) {
                const parts = complex.mainColumn.split('.');
                subquerySelectCol = parts[1]; // 只使用列名
            }
            
            // 根据运算符生成不同的子查询
            if (complex.operator === 'IN' || complex.operator === 'NOT IN') {
                whereConditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${subquerySelectCol} FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            } else if (complex.operator === 'EXISTS' || complex.operator === 'NOT EXISTS') {
                whereConditions.push(`${complex.operator} (SELECT 1 FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            } else {
                whereConditions.push(`${complex.mainColumn} ${complex.operator} (SELECT ${subquerySelectCol} FROM ${subqueryTableClause} WHERE ${subqueryConditions})`);
            }
        });
        
        if (whereConditions.length > 0) {
            sql += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY
        const groupByColumns = this.resolveGroupByColumns(resolvedColumns);
        if (groupByColumns.length > 0) {
            sql += ' GROUP BY ' + groupByColumns.join(', ');
        }
        
        // ORDER BY
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                orderParts.push(`${item.column} ${item.direction}`);
            });
            sql += ' ORDER BY ' + orderParts.join(', ');
        }
        
        sql += ';';
        return sql;
    }
    
    generateSingleTableSQL(table, conditions, resolvedColumns) {
        // TOP子句（如果有指定数量）
        let sql = 'SELECT ';
        if (this.topLimit) {
            sql += `TOP ${this.topLimit} `;
        }
        
        // 选择列
        if (resolvedColumns.length === 0) {
            sql += '*';
        } else {
            const selectParts = resolvedColumns.map(col => {
                if (col.custom) {
                    // 自定义列：使用表达式和别名（单表查询不需要表前缀）
                    return `${col.expression} AS ${col.name}`;
                } else {
                    // 普通列
                    return col.column;
                }
            });
            sql += selectParts.join(', ');
        }
        
        sql += ` FROM ${table}`;
        
        // WHERE子句（简单过滤条件 + 复杂过滤条件）
        const whereConditions = [];
        
        // 添加简单过滤条件
        if (this.simpleConditions.length > 0) {
            const simpleCondParts = [];
            this.simpleConditions.forEach((cond, index) => {
                let condPart = `${cond.column} ${cond.operator} `;
                if (cond.operator === 'LIKE') {
                    condPart += `'${cond.value}'`;
                } else {
                    condPart += `'${cond.value}'`;
                }
                
                if (index > 0) {
                    condPart = `${cond.connector} ${condPart}`;
                }
                simpleCondParts.push(condPart);
            });
            whereConditions.push(simpleCondParts.join(' '));
        }
        
        // 添加复杂过滤条件（子查询方案）
        // 注意：单表查询中如果使用复杂条件，应该转换为普通WHERE条件或提示用户使用多表查询
        if (this.complexConditions.length > 0) {
            // 对于单表查询，复杂条件（子查询）需要特殊处理
            // 这里应该提示用户或者转换为合适的WHERE条件
            // 暂时跳过，因为复杂条件通常用于多表查询
        }
        
        // 向后兼容：添加原有的conditions
        if (conditions.length > 0) {
            if (whereConditions.length > 0) {
                whereConditions.push('AND');
            }
            whereConditions.push(conditions.join(' AND '));
        }
        
        if (whereConditions.length > 0) {
            sql += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY子句（如果有自定义列需要分组）
        // 检查并调整GROUP BY列，确保它们与SELECT中的列匹配
        const groupByColumns = this.resolveGroupByColumns(resolvedColumns);
        
        if (groupByColumns.length > 0) {
            sql += ' GROUP BY ' + groupByColumns.join(', ');
        }
        
        // ORDER BY子句
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                orderParts.push(`${item.column} ${item.direction}`);
            });
            sql += ' ORDER BY ' + orderParts.join(', ');
        }
        
        // TOP子句（如果有LIMIT）
        const firstWithLimit = this.orderByItems.find(item => item.limit);
        if (firstWithLimit) {
            sql = sql.replace(';', '');
            sql += ` TOP ${firstWithLimit.limit};`;
        } else {
            sql += ';';
        }
        
        return sql;
    }
    
    // 检查过滤条件列是否不在选择列中
    checkFilterColumnsNotInSelect(resolvedColumns) {
        if (!this.simpleConditions || this.simpleConditions.length === 0) {
            return false;
        }
        
        // 获取所有选择列的列名（包括表前缀）
        const selectedColumnKeys = new Set();
        resolvedColumns.forEach(col => {
            if (col.custom && col.extractedColumns) {
                // 自定义列中的提取列
                col.extractedColumns.forEach(extracted => {
                    selectedColumnKeys.add(`${extracted.table}.${extracted.column}`);
                    selectedColumnKeys.add(extracted.column); // 也添加不带表前缀的
                });
            } else if (col.table && col.column) {
                selectedColumnKeys.add(`${col.table}.${col.column}`);
                selectedColumnKeys.add(col.column); // 也添加不带表前缀的
            }
        });
        
        // 检查每个过滤条件列是否在选择列中
        for (const cond of this.simpleConditions) {
            // 处理带表前缀和不带表前缀的情况
            const condColumn = cond.column.trim();
            if (!selectedColumnKeys.has(condColumn)) {
                return true; // 至少有一个过滤条件列不在选择列中
            }
        }
        
        return false;
    }
    
    // 生成单表查询的4种SQL方案（当过滤条件列不在选择列中时）
    generateSingleTableSQLWithAlternatives(table, resolvedColumns) {
        const sqls = [];
        const types = [];
        
        const dbData = this.databaseStructure[this.currentDatabase];
        
        // 解析过滤条件，确定需要连接的表和列
        const filterConditions = [];
        this.simpleConditions.forEach(cond => {
            let condColumn = cond.column.trim();
            let filterTable = null;
            let filterColumn = null;
            
            if (condColumn.includes('.')) {
                // 已经有表前缀
                const parts = condColumn.split('.');
                filterTable = parts[0];
                filterColumn = parts[1];
            } else {
                // 没有表前缀，需要查找该列属于哪个表
                // 首先检查是否在主表中
                if (dbData.tables[table].columns[condColumn]) {
                    filterTable = table;
                    filterColumn = condColumn;
                } else {
                    // 查找其他表
                    for (const tableKey in dbData.tables) {
                        if (dbData.tables[tableKey].columns[condColumn]) {
                            filterTable = tableKey;
                            filterColumn = condColumn;
                            break;
                        }
                    }
                }
            }
            
            if (filterTable && filterColumn) {
                filterConditions.push({
                    table: filterTable,
                    column: filterColumn,
                    operator: cond.operator,
                    value: cond.value,
                    connector: cond.connector,
                    originalColumn: condColumn
                });
            }
        });
        
        const filterTables = new Set(filterConditions.map(fc => fc.table));
        const allTables = Array.from(new Set([table, ...filterTables]));
        
        // 构建SELECT子句
        let selectClause = 'SELECT ';
        if (this.topLimit) {
            selectClause += `TOP ${this.topLimit} `;
        }
        
        if (resolvedColumns.length === 0) {
            selectClause += '*';
        } else {
            const selectParts = resolvedColumns.map(col => {
                if (col.custom) {
                    return `${col.expression} AS ${col.name}`;
                } else {
                    return col.column;
                }
            });
            selectClause += selectParts.join(', ');
        }
        
        // 获取表之间的连接关系
        const getJoinCondition = (mainTable, filterTable, filterColumn) => {
            // 使用tableRelations查找连接关系
            const relations = this.tableRelations[this.currentDatabase];
            if (relations && relations[mainTable]) {
                // 检查主表是否有指向过滤表的列
                for (const col in relations[mainTable]) {
                    const [targetTable, targetCol] = relations[mainTable][col];
                    if (targetTable === filterTable) {
                        return `${mainTable}.${col} = ${filterTable}.${targetCol}`;
                    }
                }
            }
            if (relations && relations[filterTable]) {
                // 检查过滤表是否有指向主表的列
                for (const col in relations[filterTable]) {
                    const [targetTable, targetCol] = relations[filterTable][col];
                    if (targetTable === mainTable) {
                        return `${mainTable}.${targetCol} = ${filterTable}.${col}`;
                    }
                }
            }
            // 尝试通过共享列名连接
            const mainTableCols = Object.keys(dbData.tables[mainTable].columns);
            if (mainTableCols.includes(filterColumn)) {
                return `${mainTable}.${filterColumn} = ${filterTable}.${filterColumn}`;
            }
            // 查找两个表共同的列
            const filterTableCols = Object.keys(dbData.tables[filterTable].columns);
            const commonCols = mainTableCols.filter(col => filterTableCols.includes(col));
            if (commonCols.length > 0) {
                return `${mainTable}.${commonCols[0]} = ${filterTable}.${commonCols[0]}`;
            }
            return null;
        };
        
        // 方案1：连接查询
        let sql1 = selectClause;
        if (allTables.length === 1) {
            sql1 += ` FROM ${table}`;
            // 单表但过滤列在其他表，需要通过中间表连接
            if (filterConditions.length > 0 && filterConditions[0].table !== table) {
                const filterTable = filterConditions[0].table;
                const filterColumn = filterConditions[0].column;
                // 查找中间表（如Homework连接S和C）
                let intermediateTable = null;
                const relations = this.tableRelations[this.currentDatabase];
                if (relations) {
                    // 查找能连接主表和过滤表的中间表
                    for (const tableKey in dbData.tables) {
                        if (tableKey !== table && tableKey !== filterTable) {
                            const tableRelations = relations[tableKey];
                            if (tableRelations) {
                                let canJoinMain = false;
                                let canJoinFilter = false;
                                for (const col in tableRelations) {
                                    const [targetTable] = tableRelations[col];
                                    if (targetTable === table) canJoinMain = true;
                                    if (targetTable === filterTable) canJoinFilter = true;
                                }
                                if (canJoinMain && canJoinFilter) {
                                    intermediateTable = tableKey;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                if (intermediateTable) {
                    sql1 += `, ${intermediateTable}, ${filterTable}`;
                    // 添加连接条件
                    const join1 = getJoinCondition(table, intermediateTable);
                    const join2 = getJoinCondition(intermediateTable, filterTable);
                    const whereConditions = [];
                    if (join1) whereConditions.push(join1);
                    if (join2) whereConditions.push(join2);
                    whereConditions.push(`${filterTable}.${filterColumn} ${filterConditions[0].operator} '${filterConditions[0].value}'`);
                    sql1 += ' WHERE ' + whereConditions.join(' AND ');
                } else {
                    // 直接连接
                    sql1 += `, ${filterTable}`;
                    const joinCond = getJoinCondition(table, filterTable, filterColumn);
                    const whereConditions = [];
                    if (joinCond) whereConditions.push(joinCond);
                    filterConditions.forEach((fc, idx) => {
                        whereConditions.push(`${fc.table}.${fc.column} ${fc.operator} '${fc.value}'`);
                        if (idx > 0 && fc.connector) {
                            whereConditions[whereConditions.length - 1] = fc.connector + ' ' + whereConditions[whereConditions.length - 1];
                        }
                    });
                    sql1 += ' WHERE ' + whereConditions.join(' ');
                }
            } else {
                // 单表条件
                const whereConditions = [];
                filterConditions.forEach((fc, idx) => {
                    whereConditions.push(`${fc.column} ${fc.operator} '${fc.value}'`);
                    if (idx > 0 && fc.connector) {
                        whereConditions[whereConditions.length - 1] = fc.connector + ' ' + whereConditions[whereConditions.length - 1];
                    }
                });
                if (whereConditions.length > 0) {
                    sql1 += ' WHERE ' + whereConditions.join(' ');
                }
            }
        } else {
            // 多表连接
            const fromTables = allTables.map(t => t).join(', ');
            sql1 += ` FROM ${fromTables}`;
            // 添加连接条件和过滤条件
            const whereConditions = [];
            // 添加表之间的连接条件
            const processedPairs = new Set();
            for (let i = 0; i < allTables.length; i++) {
                for (let j = i + 1; j < allTables.length; j++) {
                    const pair = `${allTables[i]}-${allTables[j]}`;
                    if (!processedPairs.has(pair)) {
                        processedPairs.add(pair);
                        const joinCond = getJoinCondition(allTables[i], allTables[j]);
                        if (joinCond) {
                            whereConditions.push(joinCond);
                        }
                    }
                }
            }
            // 添加过滤条件
            filterConditions.forEach((fc, idx) => {
                whereConditions.push(`${fc.table}.${fc.column} ${fc.operator} '${fc.value}'`);
                if (idx > 0 && fc.connector) {
                    whereConditions[whereConditions.length - 1] = fc.connector + ' ' + whereConditions[whereConditions.length - 1];
                }
            });
            if (whereConditions.length > 0) {
                sql1 += ' WHERE ' + whereConditions.join(' ');
            }
        }
        
        // 添加ORDER BY
        if (this.orderByItems.length > 0) {
            const orderParts = this.orderByItems.map(item => `${item.column} ${item.direction}`);
            sql1 += ' ORDER BY ' + orderParts.join(', ');
        }
        sql1 += ';';
        sqls.push(sql1);
        types.push('连接查询');
        
        // 方案2：普通子查询
        let sql2 = selectClause + ` FROM ${table}`;
        const subqueryConditions = [];
        
        filterConditions.forEach((fc, index) => {
            if (fc.table !== table) {
                // 过滤列在其他表，需要通过中间表或主键列连接
                // 查找主表和过滤表之间的连接列
                const joinCond = getJoinCondition(table, fc.table, fc.column);
                let mainTableJoinCol = null;
                
                if (joinCond) {
                    // 从连接条件中提取主表的连接列
                    const match = joinCond.match(new RegExp(`${table}\\.(\\w+)`));
                    if (match) {
                        mainTableJoinCol = match[1];
                    }
                }
                
                // 如果找不到连接列，使用主表的第一列
                if (!mainTableJoinCol) {
                    mainTableJoinCol = Object.keys(dbData.tables[table].columns)[0];
                }
                
                // 查找过滤表用于连接的列
                let filterTableJoinCol = null;
                const relations = this.tableRelations[this.currentDatabase];
                if (relations && relations[fc.table]) {
                    for (const col in relations[fc.table]) {
                        const [targetTable] = relations[fc.table][col];
                        if (targetTable === table) {
                            filterTableJoinCol = col;
                            break;
                        }
                    }
                }
                
                if (!filterTableJoinCol) {
                    // 尝试通过中间表
                    for (const tableKey in dbData.tables) {
                        if (tableKey !== table && tableKey !== fc.table) {
                            const tableRelations = relations && relations[tableKey];
                            if (tableRelations) {
                                let hasTableCol = false;
                                let hasFilterCol = false;
                                for (const col in tableRelations) {
                                    const [targetTable] = tableRelations[col];
                                    if (targetTable === table) hasTableCol = true;
                                    if (targetTable === fc.table) hasFilterCol = true;
                                }
                                if (hasTableCol && hasFilterCol) {
                                    // 通过中间表连接
                                    // 获取中间表连接主表的列
                                    let intermediateJoinCol = null;
                                    for (const col in tableRelations) {
                                        const [targetTable] = tableRelations[col];
                                        if (targetTable === table) {
                                            intermediateJoinCol = col;
                                            break;
                                        }
                                    }
                                    // 获取中间表连接过滤表的列
                                    let intermediateFilterCol = null;
                                    for (const col in tableRelations) {
                                        const [targetTable] = tableRelations[col];
                                        if (targetTable === fc.table) {
                                            intermediateFilterCol = col;
                                            break;
                                        }
                                    }
                                    
                                    if (intermediateJoinCol && intermediateFilterCol) {
                                        // 通过中间表的子查询
                                        subqueryConditions.push(`${table}.${intermediateJoinCol} IN (SELECT ${intermediateJoinCol} FROM ${tableKey} WHERE ${intermediateFilterCol} IN (SELECT ${fc.column} FROM ${fc.table} WHERE ${fc.table}.${fc.column} ${fc.operator} '${fc.value}'))`);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (!subqueryConditions[subqueryConditions.length - 1] || !subqueryConditions[subqueryConditions.length - 1].includes('IN')) {
                        // 直接使用过滤表的列
                        const firstMainCol = Object.keys(dbData.tables[table].columns)[0];
                        subqueryConditions.push(`${table}.${firstMainCol} IN (SELECT ${fc.column} FROM ${fc.table} WHERE ${fc.table}.${fc.column} ${fc.operator} '${fc.value}')`);
                    }
                } else {
                    // 使用找到的连接列
                    subqueryConditions.push(`${table}.${mainTableJoinCol} IN (SELECT ${filterTableJoinCol} FROM ${fc.table} WHERE ${fc.table}.${fc.column} ${fc.operator} '${fc.value}')`);
                }
            } else {
                // 单表条件
                subqueryConditions.push(`${fc.column} ${fc.operator} '${fc.value}'`);
            }
            
            if (index > 0 && fc.connector) {
                subqueryConditions[index] = fc.connector + ' ' + subqueryConditions[index];
            }
        });
        
        if (subqueryConditions.length > 0) {
            sql2 += ' WHERE ' + subqueryConditions.join(' ');
        }
        if (this.orderByItems.length > 0) {
            const orderParts = this.orderByItems.map(item => `${item.column} ${item.direction}`);
            sql2 += ' ORDER BY ' + orderParts.join(', ');
        }
        sql2 += ';';
        sqls.push(sql2);
        types.push('普通子查询');
        
        // 方案3：相关子查询（使用IN和相关条件）
        let sql3 = selectClause + ` FROM ${table} t1`;
        const correlatedConditions = [];
        
        filterConditions.forEach((fc, index) => {
            if (fc.table !== table) {
                // 查找连接关系
                const joinCond = getJoinCondition(table, fc.table, fc.column);
                let mainTableJoinCol = null;
                let filterTableJoinCol = null;
                
                if (joinCond) {
                    const match1 = joinCond.match(new RegExp(`${table}\\.(\\w+)`));
                    const match2 = joinCond.match(new RegExp(`${fc.table}\\.(\\w+)`));
                    if (match1) mainTableJoinCol = match1[1];
                    if (match2) filterTableJoinCol = match2[1];
                }
                
                // 如果找不到，尝试通过tableRelations
                if (!mainTableJoinCol || !filterTableJoinCol) {
                    const relations = this.tableRelations[this.currentDatabase];
                    if (relations && relations[fc.table]) {
                        for (const col in relations[fc.table]) {
                            const [targetTable] = relations[fc.table][col];
                            if (targetTable === table) {
                                filterTableJoinCol = col;
                                // 在主表中查找对应的列
                                const mainTableRelations = relations && relations[table];
                                if (mainTableRelations) {
                                    for (const mainCol in mainTableRelations) {
                                        const [targetTable2, targetCol] = mainTableRelations[mainCol];
                                        if (targetTable2 === fc.table && targetCol === col) {
                                            mainTableJoinCol = mainCol;
                                            break;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                    
                    // 如果还是找不到，尝试通过中间表
                    if (!mainTableJoinCol || !filterTableJoinCol) {
                        const relations = this.tableRelations[this.currentDatabase];
                        for (const tableKey in dbData.tables) {
                            if (tableKey !== table && tableKey !== fc.table) {
                                const tableRelations = relations && relations[tableKey];
                                if (tableRelations) {
                                    let hasTableCol = false;
                                    let hasFilterCol = false;
                                    let intermediateJoinCol = null;
                                    let intermediateFilterCol = null;
                                    for (const col in tableRelations) {
                                        const [targetTable] = tableRelations[col];
                                        if (targetTable === table) {
                                            hasTableCol = true;
                                            intermediateJoinCol = col;
                                        }
                                        if (targetTable === fc.table) {
                                            hasFilterCol = true;
                                            intermediateFilterCol = col;
                                        }
                                    }
                                    if (hasTableCol && hasFilterCol) {
                                        // 通过中间表的相关子查询
                                        correlatedConditions.push(`t1.${intermediateJoinCol} IN (SELECT ${intermediateJoinCol} FROM ${tableKey} t2 WHERE t2.${intermediateFilterCol} IN (SELECT ${fc.column} FROM ${fc.table} t3 WHERE t3.${fc.column} ${fc.operator} '${fc.value}' AND t2.${intermediateFilterCol} = t3.${intermediateFilterCol}) AND t1.${intermediateJoinCol} = t2.${intermediateJoinCol})`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (mainTableJoinCol && filterTableJoinCol && (!correlatedConditions[index] || !correlatedConditions[index].includes('IN'))) {
                    // 使用找到的连接列进行相关子查询
                    correlatedConditions.push(`t1.${mainTableJoinCol} IN (SELECT ${filterTableJoinCol} FROM ${fc.table} t2 WHERE t2.${fc.column} ${fc.operator} '${fc.value}' AND t1.${mainTableJoinCol} = t2.${filterTableJoinCol})`);
                } else if (!correlatedConditions[index] || !correlatedConditions[index].includes('IN')) {
                    // 回退方案
                    const firstMainCol = Object.keys(dbData.tables[table].columns)[0];
                    correlatedConditions.push(`t1.${firstMainCol} IN (SELECT ${fc.column} FROM ${fc.table} WHERE ${fc.column} ${fc.operator} '${fc.value}')`);
                }
            } else {
                // 单表条件
                correlatedConditions.push(`t1.${fc.column} ${fc.operator} '${fc.value}'`);
            }
            
            if (index > 0 && fc.connector) {
                correlatedConditions[index] = fc.connector + ' ' + correlatedConditions[index];
            }
        });
        if (correlatedConditions.length > 0) {
            sql3 += ' WHERE ' + correlatedConditions.join(' ');
        }
        if (this.orderByItems.length > 0) {
            const orderParts = this.orderByItems.map(item => `t1.${item.column} ${item.direction}`);
            sql3 += ' ORDER BY ' + orderParts.join(', ');
        }
        sql3 += ';';
        sqls.push(sql3);
        types.push('相关子查询');
        
        // 方案4：使用EXISTS关键字的相关子查询
        let sql4 = selectClause + ` FROM ${table} t1`;
        const existsConditions = [];
        
        filterConditions.forEach((fc, index) => {
            if (fc.table !== table) {
                // 查找连接关系
                const joinCond = getJoinCondition(table, fc.table, fc.column);
                let mainTableJoinCol = null;
                let filterTableJoinCol = null;
                
                if (joinCond) {
                    const match1 = joinCond.match(new RegExp(`${table}\\.(\\w+)`));
                    const match2 = joinCond.match(new RegExp(`${fc.table}\\.(\\w+)`));
                    if (match1) mainTableJoinCol = match1[1];
                    if (match2) filterTableJoinCol = match2[1];
                }
                
                // 如果找不到，尝试通过tableRelations或中间表
                if (!mainTableJoinCol || !filterTableJoinCol) {
                    const relations = this.tableRelations[this.currentDatabase];
                    if (relations && relations[fc.table]) {
                        for (const col in relations[fc.table]) {
                            const [targetTable] = relations[fc.table][col];
                            if (targetTable === table) {
                                filterTableJoinCol = col;
                                const mainTableRelations = relations && relations[table];
                                if (mainTableRelations) {
                                    for (const mainCol in mainTableRelations) {
                                        const [targetTable2, targetCol] = mainTableRelations[mainCol];
                                        if (targetTable2 === fc.table && targetCol === col) {
                                            mainTableJoinCol = mainCol;
                                            break;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                    
                    // 尝试通过中间表
                    if (!mainTableJoinCol || !filterTableJoinCol) {
                        for (const tableKey in dbData.tables) {
                            if (tableKey !== table && tableKey !== fc.table) {
                                const tableRelations = relations && relations[tableKey];
                                if (tableRelations) {
                                    let hasTableCol = false;
                                    let hasFilterCol = false;
                                    let intermediateJoinCol = null;
                                    let intermediateFilterCol = null;
                                    for (const col in tableRelations) {
                                        const [targetTable] = tableRelations[col];
                                        if (targetTable === table) {
                                            hasTableCol = true;
                                            intermediateJoinCol = col;
                                        }
                                        if (targetTable === fc.table) {
                                            hasFilterCol = true;
                                            intermediateFilterCol = col;
                                        }
                                    }
                                    if (hasTableCol && hasFilterCol) {
                                        // 通过中间表的EXISTS查询
                                        existsConditions.push(`EXISTS (SELECT 1 FROM ${tableKey} t2 WHERE t2.${intermediateJoinCol} = t1.${intermediateJoinCol} AND EXISTS (SELECT 1 FROM ${fc.table} t3 WHERE t3.${fc.column} ${fc.operator} '${fc.value}' AND t3.${intermediateFilterCol} = t2.${intermediateFilterCol}))`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (mainTableJoinCol && filterTableJoinCol && (!existsConditions[index] || !existsConditions[index].includes('EXISTS'))) {
                    // 使用找到的连接列进行EXISTS相关子查询
                    existsConditions.push(`EXISTS (SELECT 1 FROM ${fc.table} t2 WHERE t2.${fc.column} ${fc.operator} '${fc.value}' AND t1.${mainTableJoinCol} = t2.${filterTableJoinCol})`);
                } else if (!existsConditions[index] || !existsConditions[index].includes('EXISTS')) {
                    // 如果没有找到连接关系，使用EXISTS但可能不准确
                    const firstMainCol = Object.keys(dbData.tables[table].columns)[0];
                    existsConditions.push(`EXISTS (SELECT 1 FROM ${fc.table} WHERE ${fc.column} ${fc.operator} '${fc.value}')`);
                }
            } else {
                // 单表条件
                existsConditions.push(`t1.${fc.column} ${fc.operator} '${fc.value}'`);
            }
            
            if (index > 0 && fc.connector) {
                existsConditions[index] = fc.connector + ' ' + existsConditions[index];
            }
        });
        if (existsConditions.length > 0) {
            sql4 += ' WHERE ' + existsConditions.join(' ');
        }
        if (this.orderByItems.length > 0) {
            const orderParts = this.orderByItems.map(item => `t1.${item.column} ${item.direction}`);
            sql4 += ' ORDER BY ' + orderParts.join(', ');
        }
        sql4 += ';';
        sqls.push(sql4);
        types.push('使用EXISTS关键字的相关子查询');
        
        return { sqls, types };
    }
    
    generateMultiTableSQL(tables, resolvedColumns) {
        // TOP子句（如果有指定数量）
        let sql = 'SELECT ';
        if (this.topLimit) {
            sql += `TOP ${this.topLimit} `;
        }
        
        // 选择列
        const selectParts = resolvedColumns.map(col => {
            if (col.custom) {
                // 自定义列：处理表达式中的列名，添加表前缀
                let expression = col.expression;
                
                // 替换表达式中的列名为"表.列"格式
                // 只替换未带表前缀的列名，跳过已经包含表前缀的（如 Homework.CNO）
                if (col.extractedColumns && col.extractedColumns.length > 0) {
                    col.extractedColumns.forEach(extracted => {
                        // 检查列名是否已经有表前缀（格式：表名.列名）
                        const prefixedPattern = new RegExp(`[A-Za-z_]+\\s*\\.\\s*${extracted.column}\\b`);
                        if (!prefixedPattern.test(expression)) {
                            // 如果没有表前缀，才进行替换
                            // 使用单词边界，确保不会误匹配
                            const regex = new RegExp(`\\b${extracted.column}\\b`, 'g');
                            expression = expression.replace(regex, `${extracted.table}.${extracted.column}`);
                        }
                    });
                }
                
                return `${expression} AS ${col.name}`;
            } else {
                // 普通列
                return `${col.table}.${col.column}`;
            }
        });
        sql += selectParts.join(', ');
        
        // FROM和JOIN子句
        // 确保tables包含自定义列提取的所有表
        const allRequiredTables = new Set(tables);
        resolvedColumns.forEach(col => {
            if (col.custom && col.extractedColumns) {
                col.extractedColumns.forEach(extracted => {
                    allRequiredTables.add(extracted.table);
                });
            }
        });
        const finalTables = Array.from(allRequiredTables);
        
        const joins = this.generateJoins(finalTables);
        sql += ' FROM ' + finalTables[0];
        if (joins.length > 0) {
            sql += ' ' + joins.join(' ');
        }
        
        // WHERE子句（简单过滤条件 + 复杂过滤条件）
        const whereConditions = [];
        
        // 添加简单过滤条件
        if (this.simpleConditions.length > 0) {
            const simpleCondParts = [];
            this.simpleConditions.forEach((cond, index) => {
                let condPart = `${cond.column} ${cond.operator} `;
                if (cond.operator === 'LIKE') {
                    condPart += `'${cond.value}'`;
                } else {
                    condPart += `'${cond.value}'`;
                }
                
                if (index > 0) {
                    condPart = `${cond.connector} ${condPart}`;
                }
                simpleCondParts.push(condPart);
            });
            whereConditions.push(simpleCondParts.join(' '));
        }
        
        // 添加复杂过滤条件（子查询方案）
        // 注意：单表查询中如果使用复杂条件，应该转换为普通WHERE条件或提示用户使用多表查询
        if (this.complexConditions.length > 0) {
            // 对于单表查询，复杂条件（子查询）需要特殊处理
            // 这里应该提示用户或者转换为合适的WHERE条件
            // 暂时跳过，因为复杂条件通常用于多表查询
        }
        
        if (whereConditions.length > 0) {
            sql += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY子句（如果有自定义列需要分组）
        // 检查并调整GROUP BY列，确保它们与SELECT中的列匹配
        const groupByColumns = this.resolveGroupByColumns(resolvedColumns);
        
        if (groupByColumns.length > 0) {
            sql += ' GROUP BY ' + groupByColumns.join(', ');
        }
        
        // ORDER BY子句
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                orderParts.push(`${item.column} ${item.direction}`);
            });
            sql += ' ORDER BY ' + orderParts.join(', ');
        }
        
        sql += ';';
        return sql;
    }
    
    generateMultiTableSQLWithAlternatives(tables, conditions, resolvedColumns) {
        const solutions = {
            sqls: [],
            types: []
        };
        
        // 方案1: 连接查询
        let joinSQL = 'SELECT ';
        if (this.topLimit) {
            joinSQL += `TOP ${this.topLimit} `;
        }
        const joinSelectParts = resolvedColumns.map(col => {
            if (col.custom) {
                // 自定义列：处理表达式中的列名，添加表前缀
                let expression = col.expression;
                
                // 替换表达式中的列名为"表.列"格式
                // 只替换未带表前缀的列名，跳过已经包含表前缀的（如 Homework.CNO）
                if (col.extractedColumns && col.extractedColumns.length > 0) {
                    col.extractedColumns.forEach(extracted => {
                        // 检查列名是否已经有表前缀（格式：表名.列名）
                        const prefixedPattern = new RegExp(`[A-Za-z_]+\\s*\\.\\s*${extracted.column}\\b`);
                        if (!prefixedPattern.test(expression)) {
                            // 如果没有表前缀，才进行替换
                            // 使用单词边界，确保不会误匹配
                            const regex = new RegExp(`\\b${extracted.column}\\b`, 'g');
                            expression = expression.replace(regex, `${extracted.table}.${extracted.column}`);
                        }
                    });
                }
                
                return `${expression} AS ${col.name}`;
            } else {
                return `${col.table}.${col.column}`;
            }
        });
        joinSQL += joinSelectParts.join(', ');
        
        // 确保tables包含自定义列提取的所有表
        const allRequiredTables = new Set(tables);
        resolvedColumns.forEach(col => {
            if (col.custom && col.extractedColumns) {
                col.extractedColumns.forEach(extracted => {
                    allRequiredTables.add(extracted.table);
                });
            }
        });
        const finalTables = Array.from(allRequiredTables);
        
        const joins = this.generateJoins(finalTables);
        joinSQL += ' FROM ' + finalTables[0];
        if (joins.length > 0) {
            joinSQL += ' ' + joins.join(' ');
        }
        // WHERE子句（简单过滤条件 + 复杂过滤条件）
        const whereConditions = [];
        
        // 添加简单过滤条件
        if (this.simpleConditions.length > 0) {
            const simpleCondParts = [];
            this.simpleConditions.forEach((cond, index) => {
                let condPart = `${cond.column} ${cond.operator} `;
                if (cond.operator === 'LIKE') {
                    condPart += `'${cond.value}'`;
                } else {
                    condPart += `'${cond.value}'`;
                }
                
                if (index > 0) {
                    condPart = `${cond.connector} ${condPart}`;
                }
                simpleCondParts.push(condPart);
            });
            whereConditions.push(simpleCondParts.join(' '));
        }
        
        // 添加复杂过滤条件（子查询方案）
        // 注意：单表查询中如果使用复杂条件，应该转换为普通WHERE条件或提示用户使用多表查询
        if (this.complexConditions.length > 0) {
            // 对于单表查询，复杂条件（子查询）需要特殊处理
            // 这里应该提示用户或者转换为合适的WHERE条件
            // 暂时跳过，因为复杂条件通常用于多表查询
        }
        
        // 向后兼容
        if (conditions.length > 0) {
            if (whereConditions.length > 0) {
                whereConditions.push('AND');
            }
            whereConditions.push(conditions.join(' AND '));
        }
        
        if (whereConditions.length > 0) {
            joinSQL += ' WHERE ' + whereConditions.join(' ');
        }
        
        // GROUP BY子句（如果有自定义列需要分组）
        // 检查并调整GROUP BY列，确保它们与SELECT中的列匹配
        const joinGroupByColumns = this.resolveGroupByColumns(resolvedColumns);
        
        if (joinGroupByColumns.length > 0) {
            joinSQL += ' GROUP BY ' + joinGroupByColumns.join(', ');
        }
        
        // ORDER BY子句
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                orderParts.push(`${item.column} ${item.direction}`);
            });
            joinSQL += ' ORDER BY ' + orderParts.join(', ');
        }
        
        joinSQL += ';';
        solutions.sqls.push(joinSQL);
        solutions.types.push('连接查询');
        
        // 方案2: 普通子查询
        // 找到主查询表（通常是第一个表）
        const mainTable = tables[0];
        const otherTables = tables.slice(1);
        
        // 分析条件，找出哪些属于主表，哪些属于其他表
        // 简化版本：将所有条件放在子查询中
        let subquerySQL = 'SELECT ';
        if (this.topLimit) {
            subquerySQL += `TOP ${this.topLimit} `;
        }
        subquerySQL += resolvedColumns.filter(col => col.table === mainTable)
            .map(col => col.column).join(', ');
        subquerySQL += ` FROM ${mainTable}`;
        
        // 添加子查询条件
        if (conditions.length > 0) {
            // 简化：提取涉及其他表的条件作为子查询条件
            const subConditions = conditions.filter(cond => {
                return otherTables.some(table => cond.includes(`${table}.`));
            });
            if (subConditions.length > 0) {
                // 构建子查询
                const subTable = otherTables[0];
                const subJoins = this.generateJoins([mainTable, subTable]);
                const subQuery = `EXISTS (SELECT 1 FROM ${subTable}${subJoins.length > 0 ? ' ' + subJoins.join(' ') : ''} WHERE ${subConditions.join(' AND ')})`;
                subquerySQL += ' WHERE ' + subQuery;
            }
        }
        
        // ORDER BY子句
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                let orderCol = item.column.replace(`${mainTable}.`, '');
                orderParts.push(`${orderCol} ${item.direction}`);
            });
            subquerySQL += ' ORDER BY ' + orderParts.join(', ');
        }
        
        solutions.sqls.push(subquerySQL + ';');
        solutions.types.push('普通子查询');
        
        // 方案3: 相关子查询
        let correlatedSQL = 'SELECT ';
        if (this.topLimit) {
            correlatedSQL += `TOP ${this.topLimit} `;
        }
        correlatedSQL += resolvedColumns.filter(col => col.table === mainTable)
            .map(col => col.column).join(', ');
        correlatedSQL += ` FROM ${mainTable} t1`;
        
        if (otherTables.length > 0 && conditions.length > 0) {
            const correlatedConditions = conditions.filter(cond => {
                return otherTables.some(table => cond.includes(`${table}.`));
            });
            if (correlatedConditions.length > 0) {
                const subTable = otherTables[0];
                const joinKey = this.findJoinKey(mainTable, subTable);
                if (joinKey) {
                    correlatedSQL += ` WHERE EXISTS (SELECT 1 FROM ${subTable} t2 WHERE t1.${joinKey.from} = t2.${joinKey.to} AND ${correlatedConditions.map(c => c.replace(`${subTable}.`, 't2.')).join(' AND ')})`;
                }
            }
        }
        
        // ORDER BY子句
        if (this.orderByItems.length > 0) {
            const orderParts = [];
            this.orderByItems.forEach(item => {
                let orderCol = item.column.replace(`${mainTable}.`, 't1.');
                orderParts.push(`${orderCol} ${item.direction}`);
            });
            correlatedSQL += ' ORDER BY ' + orderParts.join(', ');
        }
        
        solutions.sqls.push(correlatedSQL + ';');
        solutions.types.push('相关子查询');
        
        // 方案4: EXISTS相关子查询
        let existsSQL = 'SELECT ';
        if (this.topLimit) {
            existsSQL += `TOP ${this.topLimit} `;
        }
        existsSQL += resolvedColumns.filter(col => col.table === mainTable)
            .map(col => col.column).join(', ');
        existsSQL += ` FROM ${mainTable} t1`;
        
        if (otherTables.length > 0 && conditions.length > 0) {
            const existsConditions = conditions.filter(cond => {
                return otherTables.some(table => cond.includes(`${table}.`));
            });
            if (existsConditions.length > 0) {
                const subTable = otherTables[0];
                const joinKey = this.findJoinKey(mainTable, subTable);
                if (joinKey) {
                    existsSQL += ` WHERE EXISTS (SELECT 1 FROM ${subTable} t2 WHERE t1.${joinKey.from} = t2.${joinKey.to} AND ${existsConditions.map(c => {
                        const parts = c.split(' ');
                        if (parts.length >= 3) {
                            return `t2.${parts[0].split('.')[1]} ${parts[1]} ${parts.slice(2).join(' ')}`;
                        }
                        return c.replace(`${subTable}.`, 't2.');
                    }).join(' AND ')})`;
                }
            }
        }
        
        const existsOrders = this.getOrderBy();
        if (existsOrders.length > 0) {
            existsSQL += ' ORDER BY ' + existsOrders.map(ord => {
                return ord.replace(`${mainTable}.`, 't1.');
            }).join(', ');
        }
        
        solutions.sqls.push(existsSQL + ';');
        solutions.types.push('EXISTS相关子查询');
        
        return solutions;
    }
    
    generateJoins(tables) {
        const joins = [];
        const relations = this.tableRelations[this.currentDatabase];
        const connectedTables = new Set([tables[0]]); // 已连接的表
        const allTables = this.getAllTableNames(); // 所有可用的表（包括中间表）
        
        // 使用广度优先搜索连接所有表
        const queue = [tables[0]];
        
        while (queue.length > 0 && connectedTables.size < tables.length) {
            const currentTable = queue.shift();
            
            // 查找所有未连接的表
            for (const targetTable of tables) {
                if (connectedTables.has(targetTable)) continue;
                
                // 查找直接连接
                const directJoin = this.findJoinCondition(currentTable, targetTable, relations);
                if (directJoin) {
                    joins.push(`JOIN ${targetTable} ON ${directJoin}`);
                    connectedTables.add(targetTable);
                    queue.push(targetTable);
                    continue;
                }
                
                // 查找间接连接路径（通过中间表）
                // 尝试通过所有可能的中间表找到路径
                const path = this.findConnectionPath(currentTable, targetTable, relations, allTables, connectedTables);
                
                if (path !== null) {
                    // path为空数组表示直接连接，已经在上面处理过了
                    // path有内容表示需要通过中间表
                    if (path.length > 0) {
                        // 依次连接路径中的每个中间表
                        let lastTable = currentTable;
                        for (const pathStep of path) {
                            const nextTable = pathStep.table;
                            
                            // 如果中间表还没有连接，先连接它
                            if (!connectedTables.has(nextTable)) {
                                const joinCond = this.findJoinCondition(lastTable, nextTable, relations);
                                if (joinCond) {
                                    joins.push(`JOIN ${nextTable} ON ${joinCond}`);
                                    connectedTables.add(nextTable);
                                }
                                lastTable = nextTable;
                            } else {
                                lastTable = nextTable;
                            }
                        }
                        
                        // 最后连接到目标表
                        if (lastTable !== targetTable) {
                            const finalJoin = this.findJoinCondition(lastTable, targetTable, relations);
                            if (finalJoin) {
                                joins.push(`JOIN ${targetTable} ON ${finalJoin}`);
                                connectedTables.add(targetTable);
                                queue.push(targetTable);
                            }
                        } else if (!connectedTables.has(targetTable)) {
                            connectedTables.add(targetTable);
                            queue.push(targetTable);
                        }
                    }
                }
            }
        }
        
        return joins;
    }
    
    // 获取所有表名（用于查找可能的中间表）
    getAllTableNames() {
        const dbData = this.databaseStructure[this.currentDatabase];
        if (!dbData) return [];
        return Object.keys(dbData.tables);
    }
    
    // 查找两个表之间的连接路径（使用广度优先搜索）
    // 返回值：null表示未找到路径，空数组[]表示直接连接（已在调用处处理），数组表示需要经过的中间表
    findConnectionPath(table1, table2, relations, allTables, connectedTables) {
        // 使用广度优先搜索查找最短路径
        const queue = [{ table: table1, path: [] }];
        const visited = new Set([table1]);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            // 检查所有可能的表（包括不在查询列表中的中间表）
            for (const nextTable of allTables) {
                if (visited.has(nextTable)) continue;
                if (nextTable === table1) continue;
                
                // 检查是否可以连接
                const joinCondition = this.findJoinCondition(current.table, nextTable, relations);
                if (joinCondition) {
                    const newPath = [...current.path, { table: nextTable, joinCondition }];
                    
                    // 如果到达目标表，返回路径
                    if (nextTable === table2) {
                        return newPath; // 返回中间表路径（可能是空数组表示直接连接）
                    }
                    
                    visited.add(nextTable);
                    queue.push({ table: nextTable, path: newPath });
                }
            }
        }
        
        return null; // 未找到路径
    }
    
    findJoinCondition(table1, table2, relations) {
        if (!relations[table1] || !relations[table2]) {
            return null;
        }
        
        // 查找table1中的外键指向table2
        for (const col1 in relations[table1]) {
            const targets = relations[table1][col1];
            if (Array.isArray(targets) && targets.length >= 2) {
                const targetTable = targets[0];
                const targetCol = targets[1];
                
                if (targetTable === table2) {
                    return `${table1}.${col1} = ${table2}.${targetCol}`;
                }
            }
        }
        
        // 反向查找：table2中的外键指向table1
            for (const col2 in relations[table2]) {
            const targets = relations[table2][col2];
            if (Array.isArray(targets) && targets.length >= 2) {
                const targetTable = targets[0];
                const targetCol = targets[1];
                
                if (targetTable === table1) {
                    return `${table2}.${col2} = ${table1}.${targetCol}`;
                }
            }
        }
        
        return null;
    }
    
    findJoinKey(table1, table2) {
        const relations = this.tableRelations[this.currentDatabase];
        
        // 查找table1中指向table2的外键
        if (relations[table1]) {
            for (const col1 in relations[table1]) {
                const targets = relations[table1][col1];
                if (Array.isArray(targets) && targets[0] === table2) {
                    return { from: col1, to: targets[1] };
                }
            }
        }
        
        // 反向查找
        if (relations[table2]) {
            for (const col2 in relations[table2]) {
                const targets = relations[table2][col2];
                if (Array.isArray(targets) && targets[0] === table1) {
                    return { from: col2, to: targets[1] };
                }
            }
        }
        
        return null;
    }
    
    // 保留getConditions用于向后兼容（现在获取复杂过滤条件）
    getConditions() {
        return this.getComplexConditions();
    }
    
    getOrderBy() {
        // 返回空数组，现在使用orderByItems
        return [];
    }
    
    getGroupBy() {
        // 返回空数组，分组规则已删除
        return [];
    }
    
    // 格式化SQL语句，添加换行和缩进
    formatSQL(sql) {
        if (!sql) return sql;
        
        // 移除多余的空白字符，但保留必要的空格
        let formatted = sql.trim();
        
        // 替换多个连续空格为单个空格
        formatted = formatted.replace(/\s+/g, ' ');
        
        // 在各个SQL关键字前添加换行
        formatted = formatted.replace(/\s+FROM\s+/gi, '\nFROM ');
        formatted = formatted.replace(/\s+WHERE\s+/gi, '\nWHERE ');
        formatted = formatted.replace(/\s+GROUP\s+BY\s+/gi, '\nGROUP BY ');
        formatted = formatted.replace(/\s+ORDER\s+BY\s+/gi, '\nORDER BY ');
        formatted = formatted.replace(/\s+HAVING\s+/gi, '\nHAVING ');
        formatted = formatted.replace(/\s+(INNER|LEFT|RIGHT|FULL)\s+JOIN\s+/gi, '\n$1 JOIN ');
        
        // WHERE后的条件换行并缩进
        formatted = formatted.replace(/WHERE\s+/gi, 'WHERE\n    ');
        
        // AND/OR前换行并缩进
        formatted = formatted.replace(/\s+(AND|OR)\s+/gi, '\n    $1 ');
        
        // 处理多表FROM - 每个表单独一行
        formatted = formatted.replace(/FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*/g, 'FROM $1,\n    ');
        
        // 处理子查询 - IN (SELECT ...)
        formatted = formatted.replace(/\bIN\s*\(\s*SELECT\s+/gi, 'IN (\n        SELECT ');
        formatted = formatted.replace(/\bIN\s*\(\s*SELECT\s+([^)]+)\s+FROM\s+/gi, 'IN (\n        SELECT $1\n        FROM ');
        formatted = formatted.replace(/\bIN\s*\(\s*SELECT\s+([^)]+)\s+FROM\s+([^)]+)\s+WHERE\s+/gi, 'IN (\n        SELECT $1\n        FROM $2\n        WHERE ');
        
        // 处理EXISTS子查询
        formatted = formatted.replace(/\bEXISTS\s*\(\s*SELECT\s+/gi, 'EXISTS (\n        SELECT ');
        formatted = formatted.replace(/\bEXISTS\s*\(\s*SELECT\s+([^)]+)\s+FROM\s+/gi, 'EXISTS (\n        SELECT $1\n        FROM ');
        formatted = formatted.replace(/\bEXISTS\s*\(\s*SELECT\s+([^)]+)\s+FROM\s+([^)]+)\s+WHERE\s+/gi, 'EXISTS (\n        SELECT $1\n        FROM $2\n        WHERE ');
        
        // 子查询中的AND/OR也要换行
        formatted = formatted.replace(/(\([\s\n]*SELECT[^)]+)\s+(AND|OR)\s+/gi, '$1\n            $2 ');
        
        // 子查询结束括号前换行
        formatted = formatted.replace(/\)\s*(AND|OR|WHERE|GROUP|ORDER|;)/gi, '\n    ) $1');
        
        // 处理嵌套的子查询缩进
        const lines = formatted.split('\n');
        const formattedLines = [];
        let indentLevel = 0;
        
        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return;
            }
            
            // 检测子查询开始（括号内的SELECT）
            if (trimmed.match(/\([\s\n]*SELECT/i)) {
                indentLevel++;
            }
            
            // 应用当前缩进级别
            const indented = '    '.repeat(Math.max(0, indentLevel)) + trimmed;
            formattedLines.push(indented);
            
            // 检测子查询结束
            if (trimmed.includes(')') && trimmed.match(/\)/)) {
                // 计算关闭的括号数
                const closeCount = (trimmed.match(/\)/g) || []).length;
                indentLevel = Math.max(0, indentLevel - closeCount);
            }
        });
        
        formatted = formattedLines.join('\n');
        
        // 清理多余的空行
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        // 清理行尾空格
        formatted = formatted.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
        
        // 确保最后有分号
        formatted = formatted.trim();
        if (!formatted.endsWith(';')) {
            formatted += ';';
        }
        
        return formatted;
    }
    
    displaySQL(sqlSolutions, solutionTypes) {
        const container = document.getElementById('sqlSolutions');
        if (!container) return;
        
        let html = '';
        sqlSolutions.forEach((sql, index) => {
            // 格式化SQL
            const formattedSQL = this.formatSQL(sql);
            // 转义HTML特殊字符（用于显示）
            const escapedSQL = formattedSQL
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            html += `
                <div class="sql-solution">
                    <div class="solution-header">
                        <span class="solution-type">${solutionTypes[index] || `方案 ${index + 1}`}</span>
                        <button class="execute-solution-btn" data-index="${index}">执行此方案</button>
                    </div>
                    <div style="position: relative;">
                        <pre class="sql-code" id="sqlCode${index}">${escapedSQL}</pre>
                        <button class="copy-sql-btn" data-sql-index="${index}" title="复制SQL">复制</button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        // 绑定复制按钮事件
        container.querySelectorAll('.copy-sql-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const sqlIndex = parseInt(e.target.getAttribute('data-sql-index'));
                const sqlElement = document.getElementById(`sqlCode${sqlIndex}`);
                if (sqlElement) {
                    // 从pre元素获取纯文本（已自动解码HTML实体）
                    const sqlText = sqlElement.textContent || sqlElement.innerText;
                    this.copySQLToClipboard(sqlText, e.target);
                }
            });
        });
    }
    
    // 复制SQL到剪贴板
    async copySQLToClipboard(sql, button) {
        try {
            // 使用现代Clipboard API
            await navigator.clipboard.writeText(sql);
            
            // 显示成功反馈
            const originalText = button.textContent;
            button.textContent = '已复制';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        } catch (err) {
            // 降级方案：使用传统方法
            const textarea = document.createElement('textarea');
            textarea.value = sql;
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    const originalText = button.textContent;
                    button.textContent = '已复制';
                    button.classList.add('copied');
                    
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.classList.remove('copied');
                    }, 2000);
                } else {
                    alert('复制失败，请手动复制SQL语句');
                }
            } catch (e) {
                alert('复制失败，请手动复制SQL语句');
            }
            
            document.body.removeChild(textarea);
        }
    }
    
    async executeQuery(solutionIndex = 0) {
        const sqlCodeElement = document.getElementById(`sqlCode${solutionIndex}`);
        if (!sqlCodeElement) {
            showNotification('请先构建SQL查询', 'error');
            return;
        }
        
        const sql = sqlCodeElement.textContent.trim();
        const resultsTable = document.getElementById('resultsTable');
        
        if (!sql || sql === 'SELECT * FROM table_name;') {
            showNotification('请先构建SQL查询', 'error');
            return;
        }
        
        resultsTable.innerHTML = '<div class="loading">正在执行查询...</div>';
        
        try {
            const response = await fetch('/api/execute-sql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sql: sql,
                    database: this.currentDatabase
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.displayResults(result.columns, result.data);
            } else {
                resultsTable.innerHTML = `<div class="error">查询执行失败: ${result.error}</div>`;
            }
        } catch (error) {
            resultsTable.innerHTML = `<div class="error">网络错误: ${error.message}</div>`;
        }
    }
    
    displayResults(columns, data) {
        const resultsTable = document.getElementById('resultsTable');
        
        if (data.length === 0) {
            resultsTable.innerHTML = '<p>查询结果为空</p>';
            return;
        }
        
        let html = '<table class="results-table-content">';
        
        // 表头
        html += '<thead><tr>';
        columns.forEach(column => {
            html += `<th>${column}</th>`;
        });
        html += '</tr></thead>';
        
        // 数据行
        html += '<tbody>';
        data.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${cell !== null ? cell : 'NULL'}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        
        html += '</table>';
        html += `<p class="result-info">共 ${data.length} 行数据</p>`;
        
        resultsTable.innerHTML = html;
    }
    
    clearBuilder() {
        // 清空实际数据
        this.selectedColumnKeys = [];
        this.orderByItems = [];
        this.simpleConditions = [];
        this.complexConditions = [];
        this.topLimit = null;
        this.resolvedColumns = [];
        
        // 清空顺序取查询数量输入框
        const topLimitInput = document.getElementById('topLimit');
        if (topLimitInput) {
            topLimitInput.value = '';
        }
        
        // 清空界面 - 已选择的列
        const selectedContainer = document.getElementById('selectedColumnsContainer');
        if (selectedContainer) {
            selectedContainer.innerHTML = '<p class="placeholder-text">点击上方列名添加到查询中</p>';
        }
        
        // 清空界面 - 排序规则
        this.updateOrderDisplay();
        
        // 清空界面 - 简单过滤条件
        this.updateSimpleConditionsDisplay();
        
        // 清空界面 - 复杂过滤条件
        this.updateComplexConditionsDisplay();
        
        // 隐藏编辑器
        this.hideOrderEditor();
        this.hideSimpleConditionEditor();
        this.hideComplexConditionEditor();
        
        // 清空SQL显示
        this.displaySQL(['SELECT * FROM table_name;'], ['单表查询']);
        
        // 清空查询结果
        const resultsTable = document.getElementById('resultsTable');
        if (resultsTable) {
            resultsTable.innerHTML = '<p>点击"生成SQL语句"生成查询，然后点击"执行此方案"查看结果</p>';
        }
    }
    
    resetBuilder() {
        this.clearBuilder();
        this.updateColumnSelector();
    }
}

// 全局实例
let visualSQLBuilder;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    visualSQLBuilder = new VisualSQLBuilder();
});

