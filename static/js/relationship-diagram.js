// 关系图谱可视化功能
// 使用D3.js创建数据库关系图

let currentDatabase = 'study';
let diagramData = null;
let svg = null;
let g = null;
let zoom = null;
let simulation = null;

// 颜色配置
const colors = {
    database: '#667eea',
    table: {
        primary: '#4caf50',
        secondary: '#2196f3',
        tertiary: '#ff9800',
        quaternary: '#e91e63'
    },
    column: {
        primary: '#28a745',
        foreign: '#ffc107',
        normal: '#6c757d'
    },
    relationship: '#666'
};

// 节点大小配置
const nodeSizes = {
    database: 80,
    table: 60,
    column: 40
};

// 初始化关系图谱
async function initRelationshipDiagram() {
    console.log('初始化关系图谱');
    
    // 加载数据库结构数据
    await loadDatabaseStructure();
    
    // 初始化图表
    setupDiagram();
    
    // 监听数据库切换事件
    document.addEventListener('databaseChanged', function(event) {
        currentDatabase = event.detail.database;
        updateDiagram();
    });
    
    // 初始化控制按钮
    initControlButtons();
}

// 设置图表容器
function setupDiagram() {
    const canvas = document.getElementById('diagramCanvas');
    if (!canvas) return;
    
    // 清空容器
    canvas.innerHTML = '';
    
    // 创建SVG
    const width = canvas.offsetWidth || 800;
    const height = canvas.offsetHeight || 600;
    
    svg = d3.select(canvas)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('background', '#fafafa');
    
    // 创建主组
    g = svg.append('g');
    
    // 设置缩放
    zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', function(event) {
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    // 创建箭头标记
    createArrowMarkers();
    
    // 渲染图表
    updateDiagram();
}

// 创建箭头标记
function createArrowMarkers() {
    const defs = svg.append('defs');
    
    // 主键箭头
    defs.append('marker')
        .attr('id', 'arrow-primary')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 3)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,0 L0,6 L9,3 z')
        .attr('fill', colors.column.primary);
    
    // 外键箭头
    defs.append('marker')
        .attr('id', 'arrow-foreign')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 3)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,0 L0,6 L9,3 z')
        .attr('fill', colors.column.foreign);
    
    // 关系箭头
    defs.append('marker')
        .attr('id', 'arrow-relationship')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 3)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,0 L0,6 L9,3 z')
        .attr('fill', colors.relationship);
}

// 更新图表
function updateDiagram() {
    if (!databaseStructure || !databaseStructure[currentDatabase]) {
        console.error('数据库结构未加载');
        return;
    }
    
    const dbData = databaseStructure[currentDatabase];
    diagramData = processDatabaseData(dbData);
    
    // 清空现有内容
    g.selectAll('*').remove();
    
    // 创建力导向图
    createForceDirectedGraph();
    
    // 更新关系说明面板
    updateRelationshipInfoPanel();
}

// 处理数据库数据
function processDatabaseData(dbData) {
    const nodes = [];
    const links = [];
    
    // 获取容器尺寸用于计算初始位置
    const canvas = document.getElementById('diagramCanvas');
    const containerWidth = canvas ? (canvas.offsetWidth || 800) : 800;
    const containerHeight = canvas ? (canvas.offsetHeight || 600) : 600;
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    
    // 对于Study和Teach数据库，不添加数据库节点
    if (currentDatabase !== 'study' && currentDatabase !== 'teach') {
        // 添加数据库节点（仅其他数据库）
        nodes.push({
            id: 'database',
            type: 'database',
            name: dbData.name,
            x: centerX,
            y: 80
        });
    }
    
    // 处理表
    const tableKeys = Object.keys(dbData.tables);
    const tableColors = Object.values(colors.table);
    const tableCount = tableKeys.length;
    
    // 对于Study和Teach数据库，需要跟踪共享的列节点
    const sharedColumnNodes = {};
    const columnToSharedNode = {}; // 映射: tableKey_columnKey -> sharedNodeId
    
    // 如果是Study数据库，预先创建共享节点
    if (currentDatabase === 'study') {
        // 创建共享的学生编号节点，居中分布
        sharedColumnNodes['shared_SNO'] = {
            id: 'shared_SNO',
            type: 'column',
            name: '学生编号',
            columnKey: 'SNO',
            dataType: 'nchar(10)',
            isPrimary: false,
            isForeign: true,
            parentTable: null, // 共享节点，不属于特定表
            isShared: true,
            connectedTables: [],
            x: centerX - 100,
            y: centerY + 50
        };
        
        // 创建共享的课程编号节点
        sharedColumnNodes['shared_CNO'] = {
            id: 'shared_CNO',
            type: 'column',
            name: '课程编号',
            columnKey: 'CNO',
            dataType: 'nchar(10)',
            isPrimary: false,
            isForeign: true,
            parentTable: null, // 共享节点，不属于特定表
            isShared: true,
            connectedTables: [],
            x: centerX + 100,
            y: centerY + 50
        };
        
        nodes.push(sharedColumnNodes['shared_SNO']);
        nodes.push(sharedColumnNodes['shared_CNO']);
    }
    
    // 如果是Teach数据库，预先创建共享节点（合并所有同名列）
    if (currentDatabase === 'teach') {
        // 创建共享的学生编号节点（SNo），居中分布
        sharedColumnNodes['shared_SNo'] = {
            id: 'shared_SNo',
            type: 'column',
            name: '学生编号',
            columnKey: 'SNo',
            dataType: 'nchar(10)',
            isPrimary: false,
            isForeign: true,
            parentTable: null,
            isShared: true,
            connectedTables: [],
            x: centerX - 150,
            y: centerY + 50
        };
        
        // 创建共享的课程编号节点（CNO）
        sharedColumnNodes['shared_CNO'] = {
            id: 'shared_CNO',
            type: 'column',
            name: '课程编号',
            columnKey: 'CNO',
            dataType: 'nchar(10)',
            isPrimary: false,
            isForeign: true,
            parentTable: null,
            isShared: true,
            connectedTables: [],
            x: centerX,
            y: centerY + 50
        };
        
        // 创建共享的教师编号节点（TNO）
        sharedColumnNodes['shared_TNO'] = {
            id: 'shared_TNO',
            type: 'column',
            name: '教师编号',
            columnKey: 'TNO',
            dataType: 'nchar(10)',
            isPrimary: false,
            isForeign: true,
            parentTable: null,
            isShared: true,
            connectedTables: [],
            x: centerX + 150,
            y: centerY + 50
        };
        
        nodes.push(sharedColumnNodes['shared_SNo']);
        nodes.push(sharedColumnNodes['shared_CNO']);
        nodes.push(sharedColumnNodes['shared_TNO']);
    }
    
    // 计算表的初始位置，使其居中分布
    const tableSpacing = Math.min(200, containerWidth / (tableCount + 1));
    const startX = centerX - (tableCount - 1) * tableSpacing / 2;
    
    tableKeys.forEach((tableKey, index) => {
        const table = dbData.tables[tableKey];
        
        // 添加表节点，居中分布
        nodes.push({
            id: tableKey,
            type: 'table',
            name: table.name,
            color: tableColors[index % tableColors.length],
            x: startX + index * tableSpacing,
            y: centerY - 100
        });
        
        // 对于非Study和Teach数据库，添加数据库到表的连接
        if (currentDatabase !== 'study' && currentDatabase !== 'teach') {
            links.push({
                source: 'database',
                target: tableKey,
                type: 'contains',
                relationship: '拥有'
            });
        }
        
        // 处理列
        const columnKeys = Object.keys(table.columns);
        columnKeys.forEach((columnKey, colIndex) => {
            const column = table.columns[columnKey];
            
            // 检查是否是Study或Teach数据库中需要合并的列
            let useSharedNode = false;
            let sharedNodeId = null;
            
            if (currentDatabase === 'study') {
                // 检查是否是学生编号字段（SNO或SNo）
                if (columnKey === 'SNO' || columnKey === 'SNo') {
                    useSharedNode = true;
                    sharedNodeId = 'shared_SNO';
                    columnToSharedNode[`${tableKey}_${columnKey}`] = sharedNodeId;
                    if (!sharedColumnNodes[sharedNodeId].connectedTables.includes(tableKey)) {
                        sharedColumnNodes[sharedNodeId].connectedTables.push(tableKey);
                    }
                }
                // 检查是否是课程编号字段（CNO）
                else if (columnKey === 'CNO') {
                    useSharedNode = true;
                    sharedNodeId = 'shared_CNO';
                    columnToSharedNode[`${tableKey}_${columnKey}`] = sharedNodeId;
                    if (!sharedColumnNodes[sharedNodeId].connectedTables.includes(tableKey)) {
                        sharedColumnNodes[sharedNodeId].connectedTables.push(tableKey);
                    }
                }
            } else if (currentDatabase === 'teach') {
                // 检查是否是学生编号字段（SNo）
                if (columnKey === 'SNo') {
                    useSharedNode = true;
                    sharedNodeId = 'shared_SNo';
                    columnToSharedNode[`${tableKey}_${columnKey}`] = sharedNodeId;
                    if (!sharedColumnNodes[sharedNodeId].connectedTables.includes(tableKey)) {
                        sharedColumnNodes[sharedNodeId].connectedTables.push(tableKey);
                    }
                }
                // 检查是否是课程编号字段（CNO）
                else if (columnKey === 'CNO') {
                    useSharedNode = true;
                    sharedNodeId = 'shared_CNO';
                    columnToSharedNode[`${tableKey}_${columnKey}`] = sharedNodeId;
                    if (!sharedColumnNodes[sharedNodeId].connectedTables.includes(tableKey)) {
                        sharedColumnNodes[sharedNodeId].connectedTables.push(tableKey);
                    }
                }
                // 检查是否是教师编号字段（TNO）
                else if (columnKey === 'TNO') {
                    useSharedNode = true;
                    sharedNodeId = 'shared_TNO';
                    columnToSharedNode[`${tableKey}_${columnKey}`] = sharedNodeId;
                    if (!sharedColumnNodes[sharedNodeId].connectedTables.includes(tableKey)) {
                        sharedColumnNodes[sharedNodeId].connectedTables.push(tableKey);
                    }
                }
            }
            
            if (useSharedNode) {
                // 连接到共享节点
                links.push({
                    source: tableKey,
                    target: sharedNodeId,
                    type: 'contains',
                    relationship: '拥有'
                });
            } else {
                // 创建独立的列节点，相对于表节点定位
                const columnNodeId = `${tableKey}_${columnKey}`;
                const tableNode = nodes.find(n => n.id === tableKey);
                const tableX = tableNode ? tableNode.x : (startX + index * tableSpacing);
                nodes.push({
                    id: columnNodeId,
                    type: 'column',
                    name: column.name,
                    columnKey: columnKey,
                    dataType: column.type,
                    isPrimary: column.key.includes('PK'),
                    isForeign: column.key.includes('FK'),
                    parentTable: tableKey,
                    x: tableX + (colIndex - columnKeys.length / 2) * 60,
                    y: centerY + 50 + (colIndex * 40)
                });
                
                // 添加表到列的连接
                links.push({
                    source: tableKey,
                    target: columnNodeId,
                    type: 'contains',
                    relationship: '拥有'
                });
            }
        });
    });
    
    // 添加表之间的关系
    addTableRelationships(nodes, links, dbData, columnToSharedNode);
    
    return { nodes, links };
}

// 添加表之间的关系
function addTableRelationships(nodes, links, dbData, columnToSharedNode = {}) {
    const tables = dbData.tables;
    const tableKeys = Object.keys(tables);
    
    // 对于Study和Teach数据库，使用共享节点来表示关系，不添加表之间的连线
    if (currentDatabase === 'study') {
        addStudyDatabaseRelationships(nodes, links, tables, columnToSharedNode);
        return; // Study数据库使用特殊的关系处理方式
    }
    
    if (currentDatabase === 'teach') {
        // Teach数据库不添加表之间的连线，关系通过共享节点体现
        return;
    }
    
    // 查找外键关系（用于其他数据库）
    tableKeys.forEach(tableKey => {
        const table = tables[tableKey];
        const columns = table.columns;
        
        Object.keys(columns).forEach(columnKey => {
            const column = columns[columnKey];
            
            if (column.key.includes('FK')) {
                // 查找对应的主键表
                const referencedTable = findReferencedTable(columnKey, tables);
                if (referencedTable) {
                // 根据外键数量确定关系类型
                const foreignKeyCount = Object.values(columns).filter(col => col.key.includes('FK')).length;
                let relationshipType = '';
                if (foreignKeyCount > 1) {
                    relationshipType = '多对多';
                } else {
                    // 检查是否是中间表（只有外键，没有其他业务字段）
                    const hasBusinessFields = Object.values(columns).some(col => 
                        !col.key.includes('FK') && !col.key.includes('PK')
                    );
                    relationshipType = hasBusinessFields ? '一对多' : '多对多';
                }
                
                links.push({
                    source: referencedTable,
                    target: tableKey,
                    type: 'relationship',
                    relationship: relationshipType,
                    sourceName: tables[referencedTable].name,
                    targetName: table.name,
                    columnName: columnKey
                });
                }
            }
        });
    });
}

// 查找被引用的表
function findReferencedTable(columnKey, tables) {
    const tableKeys = Object.keys(tables);
    
    for (const tableKey of tableKeys) {
        const table = tables[tableKey];
        const columns = table.columns;
        
        for (const colKey of Object.keys(columns)) {
            const column = columns[colKey];
            if (column.key.includes('PK') && colKey === columnKey) {
                return tableKey;
            }
        }
    }
    
    return null;
}

// 添加Study数据库的特殊关系
function addStudyDatabaseRelationships(nodes, links, tables, columnToSharedNode) {
    // 在Study数据库中，关系仅通过共享节点来表示：
    // 1. 通过学生编号连接：S表和Homework表通过共享的SNO节点（通过contains关系体现）
    // 2. 通过课程编号连接：C表和Homework表通过共享的CNO节点（通过contains关系体现）
    // 3. 通过Homework表连接：S表和C表通过Homework表关联（通过共享节点间接体现）
    // 
    // 不添加表之间的直接连线，关系通过共享节点和contains关系来体现
}

// 创建力导向图
function createForceDirectedGraph() {
    if (!diagramData || !svg) return;
    
    const { nodes, links } = diagramData;
    
    // 获取SVG的实际尺寸
    const svgNode = svg.node();
    const width = svgNode ? svgNode.clientWidth || 800 : 800;
    const height = svgNode ? svgNode.clientHeight || 600 : 600;
    
    // 动态计算中心点，使图形居中
    const centerX = width / 2;
    const centerY = height / 2;
    
    // 创建力导向模拟
    simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(150).strength(0.5))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(centerX, centerY))
        .force('collision', d3.forceCollide().radius(40))
        .alphaDecay(0.05)
        .alphaTarget(0.1);
    
    // 绘制连线
    const link = g.append('g')
        .attr('class', 'links')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', d => {
            if (d.type === 'contains') return '#ccc';
            if (d.type === 'relationship') return colors.relationship;
            return '#999';
        })
        .attr('stroke-width', d => d.type === 'relationship' ? 3 : 2)
        .attr('stroke-dasharray', d => d.type === 'contains' ? '5,5' : 'none')
        .attr('marker-end', d => {
            if (d.type === 'relationship') return 'url(#arrow-relationship)';
            return 'none';
        });
    
    // 绘制连线标签 - 只显示表与表之间的关系标签
    const linkLabels = g.append('g')
        .attr('class', 'link-labels')
        .selectAll('text')
        .data(links.filter(d => d.type === 'relationship'))
        .enter().append('text')
        .attr('class', 'link-label')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', colors.relationship)
        .attr('stroke', 'white')
        .attr('stroke-width', '2px')
        .attr('paint-order', 'stroke')
        .text(d => d.relationship || '');
    
    // 绘制节点
    const node = g.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(nodes)
        .enter().append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));
    
    // 数据库节点
    const databaseNodes = node.filter(d => d.type === 'database');
    databaseNodes.append('circle')
        .attr('r', nodeSizes.database)
        .attr('fill', colors.database)
        .attr('stroke', '#333')
        .attr('stroke-width', 3);
    
    databaseNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(d => d.name);
    
    // 表节点
    const tableNodes = node.filter(d => d.type === 'table');
    tableNodes.append('rect')
        .attr('width', 120)
        .attr('height', 60)
        .attr('x', -60)
        .attr('y', -30)
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('fill', d => d.color)
        .attr('stroke', '#333')
        .attr('stroke-width', 2);
    
    tableNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(d => d.name);
    
    // 列节点
    const columnNodes = node.filter(d => d.type === 'column');
    
    // 区分共享节点和普通列节点
    const sharedNodes = columnNodes.filter(d => d.isShared);
    const regularNodes = columnNodes.filter(d => !d.isShared);
    
    // 共享节点使用特殊样式
    sharedNodes.append('rect')
        .attr('width', 120)
        .attr('height', 35)
        .attr('x', -60)
        .attr('y', -17.5)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', colors.column.foreign)
        .attr('stroke', '#ff6b35')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '5,3');
    
    sharedNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.2em')
        .attr('font-size', '11px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(d => d.name);
    
    sharedNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.9em')
        .attr('font-size', '9px')
        .attr('fill', '#fff3cd')
        .text(d => `(共享节点)`);
    
    // 普通列节点
    regularNodes.append('rect')
        .attr('width', 100)
        .attr('height', 30)
        .attr('x', -50)
        .attr('y', -15)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', d => {
            if (d.isPrimary) return colors.column.primary;
            if (d.isForeign) return colors.column.foreign;
            return colors.column.normal;
        })
        .attr('stroke', '#333')
        .attr('stroke-width', 1);
    
    regularNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .text(d => d.name);
    
    // 添加列详细信息
    regularNodes.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.2em')
        .attr('font-size', '8px')
        .attr('fill', '#666')
        .text(d => d.dataType);
    
    // 添加点击事件
    node.on('click', function(event, d) {
        event.stopPropagation();
        showNodeDetails(d);
    });
    
    // 添加鼠标悬停事件
    node.on('mouseover', function(event, d) {
        showTooltip(event, d);
    });
    
    node.on('mouseout', function(event, d) {
        hideTooltip();
    });
    
    // 更新位置
    simulation.on('tick', () => {
        // 更新连线位置，确保连线始终连接到节点边缘
        link
            .attr('x1', d => getNodeEdgeX(d.source, d.target))
            .attr('y1', d => getNodeEdgeY(d.source, d.target))
            .attr('x2', d => getNodeEdgeX(d.target, d.source))
            .attr('y2', d => getNodeEdgeY(d.target, d.source));
        
        // 更新连线标签位置 - 只更新关系类型的连线标签
        linkLabels
            .attr('x', d => (getNodeEdgeX(d.source, d.target) + getNodeEdgeX(d.target, d.source)) / 2)
            .attr('y', d => (getNodeEdgeY(d.source, d.target) + getNodeEdgeY(d.target, d.source)) / 2);
        
        // 更新节点位置
        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
}

// 计算连线与节点边缘的交点
function getNodeEdgeX(source, target) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return source.x;
    
    // 根据节点类型计算半径
    let radius = 0;
    if (source.type === 'database') radius = nodeSizes.database;
    else if (source.type === 'table') radius = 60; // 矩形的一半宽度
    else if (source.type === 'column') {
        // 共享节点使用更大的尺寸
        radius = source.isShared ? 60 : 50; // 共享节点是120宽，普通节点是100宽
    }
    
    const ratio = radius / distance;
    return source.x + dx * ratio;
}

function getNodeEdgeY(source, target) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return source.y;
    
    // 根据节点类型计算半径
    let radius = 0;
    if (source.type === 'database') radius = nodeSizes.database;
    else if (source.type === 'table') radius = 30; // 矩形的一半高度
    else if (source.type === 'column') {
        // 共享节点使用更大的尺寸
        radius = source.isShared ? 17.5 : 15; // 共享节点是35高，普通节点是30高
    }
    
    const ratio = radius / distance;
    return source.y + dy * ratio;
}

// 拖拽事件处理
function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    // 强制更新连线位置
    simulation.alpha(0.3).restart();
}

function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}

// 显示节点详细信息
function showNodeDetails(node) {
    let details = '';
    
    if (node.type === 'database') {
        details = `
            <h4>数据库: ${node.name}</h4>
            <p>包含多个数据表</p>
        `;
    } else if (node.type === 'table') {
        details = `
            <h4>数据表: ${node.name}</h4>
            <p>包含多个数据列</p>
        `;
    } else if (node.type === 'column') {
        details = `
            <h4>数据列: ${node.name}</h4>
            <p><strong>列名:</strong> ${node.columnKey}</p>
            <p><strong>数据类型:</strong> ${node.dataType}</p>
            <p><strong>主键:</strong> ${node.isPrimary ? '是' : '否'}</p>
            <p><strong>外键:</strong> ${node.isForeign ? '是' : '否'}</p>
        `;
    }
    
    // 更新关系说明面板
    updateRelationshipInfo(node);
    
    // 显示通知
    showNotification(details, 'info');
}

// 更新关系说明面板（显示所有表之间的关系）
function updateRelationshipInfoPanel() {
    const relationshipList = document.getElementById('relationshipList');
    if (!relationshipList || !diagramData) return;
    
    let relationships = [];
    
    // 对于Study数据库，显示特定的关系（分为两列）
    if (currentDatabase === 'study') {
        const directRelations = [
            { type: '通过学生编号连接', description: 'S学生 ↔ Homework作业成绩（通过学生编号）' },
            { type: '通过课程编号连接', description: 'C课程 ↔ Homework作业成绩（通过课程编号）' }
        ];
        
        const indirectRelations = [
            { type: '间接连接', description: 'S学生 ↔ C课程（通过Homework表）' }
        ];
        
        // 生成两列布局的HTML
        const leftColumn = directRelations.map(rel => `
            <div class="relationship-item">
                <span class="rel-type">${rel.type}</span>
                <span class="rel-description">${rel.description}</span>
            </div>
        `).join('');
        
        const rightColumn = indirectRelations.map(rel => `
            <div class="relationship-item">
                <span class="rel-type">${rel.type}</span>
                <span class="rel-description">${rel.description}</span>
            </div>
        `).join('');
        
        relationshipList.innerHTML = `
            <div class="relationship-columns">
                <div class="relationship-column left-column">
                    ${leftColumn}
                </div>
                <div class="relationship-column right-column">
                    ${rightColumn}
                </div>
            </div>
        `;
        return;
    } else if (currentDatabase === 'teach') {
        // 对于Teach数据库，显示特定的关系（分为两列）
        const directRelations = [
            { type: '通过学生编号连接', description: 'S学生 ↔ SC成绩（通过学生编号）' },
            { type: '通过课程编号连接', description: 'C课程 ↔ SC成绩、TC教师课程（通过课程编号）' },
            { type: '通过教师编号连接', description: 'T教师 ↔ TC教师课程（通过教师编号）' }
        ];
        
        const indirectRelations = [
            { type: '间接连接', description: 'T教师 ↔ C课程（通过TC表）' },
            { type: '间接连接', description: 'T教师 ↔ SC成绩（通过TC表）' },
            { type: '间接连接', description: 'T教师 ↔ S学生（通过TC表、SC表）' },
            { type: '间接连接', description: 'S学生 ↔ C课程（通过SC表）' }
        ];
        
        // 生成两列布局的HTML
        const leftColumn = directRelations.map(rel => `
            <div class="relationship-item">
                <span class="rel-type">${rel.type}</span>
                <span class="rel-description">${rel.description}</span>
            </div>
        `).join('');
        
        const rightColumn = indirectRelations.map(rel => `
            <div class="relationship-item">
                <span class="rel-type">${rel.type}</span>
                <span class="rel-description">${rel.description}</span>
            </div>
        `).join('');
        
        relationshipList.innerHTML = `
            <div class="relationship-columns">
                <div class="relationship-column left-column">
                    ${leftColumn}
                </div>
                <div class="relationship-column right-column">
                    ${rightColumn}
                </div>
            </div>
        `;
        return;
    } else {
        // 对于其他数据库，显示所有表之间的关系
        const relationshipLinks = diagramData.links.filter(link => link.type === 'relationship');
        
        // 去重并格式化关系
        const uniqueRelations = new Map();
        relationshipLinks.forEach(rel => {
            const sourceName = typeof rel.source === 'string' ? rel.source : (rel.source?.name || rel.sourceName || '');
            const targetName = typeof rel.target === 'string' ? rel.target : (rel.target?.name || rel.targetName || '');
            const key = `${sourceName}-${targetName}`;
            
            if (!uniqueRelations.has(key) && sourceName && targetName) {
                uniqueRelations.set(key, {
                    type: rel.relationship || '关联',
                    description: `${sourceName} ↔ ${targetName}`
                });
            }
        });
        
        relationships = Array.from(uniqueRelations.values());
        
        // 如果没有关系，显示默认说明
        if (relationships.length === 0) {
            relationships = [
                { type: '拥有', description: '数据库 → 数据表' },
                { type: '包含', description: '数据表 → 数据列' }
            ];
        }
    }
    
    relationshipList.innerHTML = relationships.map(rel => `
        <div class="relationship-item">
            <span class="rel-type">${rel.type}</span>
            <span class="rel-description">${rel.description}</span>
        </div>
    `).join('');
}

// 更新关系说明（单个节点点击时）
function updateRelationshipInfo(node) {
    // 这个方法保留用于节点点击时的详细信息
    // 但现在主要使用 updateRelationshipInfoPanel 来显示所有关系
    updateRelationshipInfoPanel();
}

// 初始化控制按钮
function initControlButtons() {
    // 重置视图
    const resetBtn = document.getElementById('resetView');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (svg && zoom) {
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity
                );
            }
        });
    }
    
    // 导出图片
    const exportBtn = document.getElementById('exportDiagram');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            exportDiagram();
        });
    }
}

// 导出图表
function exportDiagram() {
    if (!svg || !g) return;
    
    try {
        // 获取SVG的边界框（包含所有内容）
        const bounds = g.node().getBBox();
        
        // 检查边界框是否有效
        if (!bounds || bounds.width === 0 || bounds.height === 0) {
            alert('图表内容为空，无法导出');
            return;
        }
        
        // 添加一些边距
        const padding = 50;
        const width = Math.max(bounds.width + padding * 2, 800);
        const height = Math.max(bounds.height + padding * 2, 600);
        
        // 创建临时SVG用于导出
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.setAttribute('width', width);
        tempSvg.setAttribute('height', height);
        tempSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        
        // 创建临时组并复制所有内容
        const tempG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        tempG.setAttribute('transform', `translate(${padding - bounds.x}, ${padding - bounds.y})`);
        
        // 复制所有子元素
        const clone = g.node().cloneNode(true);
        tempG.appendChild(clone);
        tempSvg.appendChild(tempG);
        
        // 复制defs（箭头标记等）
        const defs = svg.select('defs');
        if (defs.node()) {
            const clonedDefs = defs.node().cloneNode(true);
            tempSvg.insertBefore(clonedDefs, tempG);
        }
        
        // 设置白色背景
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('fill', 'white');
        tempSvg.insertBefore(rect, tempSvg.firstChild);
        
        // 序列化SVG
        const serializer = new XMLSerializer();
        const svgData = serializer.serializeToString(tempSvg);
        
        // 创建图片对象
        const img = new Image();
        const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        img.onload = function() {
            // 创建canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // 绘制白色背景
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);
            
            // 绘制SVG内容
            ctx.drawImage(img, 0, 0);
            
            // 创建下载链接
            const link = document.createElement('a');
            link.download = `database-diagram-${currentDatabase}-${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 清理URL
            URL.revokeObjectURL(url);
        };
        
        img.onerror = function() {
            console.error('图片导出失败');
            alert('导出图片时发生错误，请重试');
            URL.revokeObjectURL(url);
        };
        
        img.src = url;
    } catch (error) {
        console.error('导出图表错误:', error);
        alert('导出图片时发生错误: ' + error.message);
    }
}

// 重置图表
function resetDiagram() {
    if (svg) {
        svg.selectAll('*').remove();
        setupDiagram();
    }
}

// 显示工具提示
function showTooltip(event, node) {
    const tooltip = d3.select('body').append('div')
        .attr('class', 'node-tooltip')
        .style('opacity', 0);
    
    let content = '';
    if (node.type === 'database') {
        content = `<strong>数据库:</strong> ${node.name}`;
    } else if (node.type === 'table') {
        content = `<strong>数据表:</strong> ${node.name}`;
    } else if (node.type === 'column') {
        content = `
            <strong>数据列:</strong> ${node.name}<br>
            <strong>类型:</strong> ${node.dataType}<br>
            <strong>主键:</strong> ${node.isPrimary ? '是' : '否'}<br>
            <strong>外键:</strong> ${node.isForeign ? '是' : '否'}
        `;
    }
    
    tooltip.html(content)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .transition()
        .duration(200)
        .style('opacity', 1);
}

// 隐藏工具提示
function hideTooltip() {
    d3.selectAll('.node-tooltip').remove();
}

// 导出函数供外部使用
window.initRelationshipDiagram = initRelationshipDiagram;
window.resetDiagram = resetDiagram;
