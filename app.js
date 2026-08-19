/* CardFoundry - zero dependency prototype app */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const PLAYTEST_CARD_WIDTH = 94;
const PLAYTEST_CARD_HEIGHT = 132;

const seedState = () => ({
  project: { id: 'project_mist', name: '晨雾边境', description: '一款关于远征、资源与未知遗迹的卡牌桌游原型。' },
  boards: [{
    id: 'board_main', name: '基础版图', width: 930, height: 610, background: '#111620',
    objects: [
      { id: 'obj_deck', type: 'deck-zone', name: '事件牌堆', x: 56, y: 95, width: 142, height: 112, color: 'purple', deckId: 'deck_event', showCount: true, drawTarget: '玩家手牌' },
      { id: 'obj_start', type: 'card-slot', name: '起始卡位', x: 263, y: 95, width: 114, height: 112, color: 'blue', cardId: 'card_start', showBack: false },
      { id: 'obj_player', type: 'card-zone', name: '玩家区域', x: 56, y: 290, width: 460, height: 192, color: 'green', layout: '平铺', gap: 10 },
      { id: 'obj_discard', type: 'stack', name: '弃牌区', x: 628, y: 354, width: 150, height: 116, color: 'orange', stackMode: '顶牌', showBack: true }
    ]
  }],
  cards: [
    { id: 'card_start', name: '远征启程', effect: '<b>准备阶段：</b>获得 2 个补给。\n将你的第一张探索牌翻面。', tag: '基础', rarity: '起始', number: 'C-001', art: '✦', color: 'blue' },
    { id: 'card_fire', name: '余烬火花', effect: '对一个区域中的目标造成 <span style="color:#e97968"><b>2 点伤害</b></span>。\n若该区域有遗迹，改为造成 3 点伤害。', tag: '法术', rarity: '普通', number: 'C-014', art: '✹', color: 'orange' },
    { id: 'card_relic', name: '回声罗盘', effect: '查看事件牌堆顶的 3 张牌，将其中 1 张置于牌堆底。', tag: '装备', rarity: '稀有', number: 'C-022', art: '◌', color: 'purple' },
    { id: 'card_medic', name: '林间疗愈', effect: '使一个角色恢复 3 点生命。\n然后将一张手牌置入弃牌区。', tag: '行动', rarity: '普通', number: 'C-031', art: '✚', color: 'green' }
  ],
  tags: ['基础', '法术', '装备', '行动'],
  decks: [
    { id: 'deck_event', name: '事件牌组', description: '每回合揭示一张，改变远征的天气与风险。', entries: [{ cardId: 'card_fire', count: 4 }, { cardId: 'card_relic', count: 3 }, { cardId: 'card_medic', count: 4 }] },
    { id: 'deck_player', name: '玩家牌组', description: '玩家在远征中使用的行动与装备。', entries: [{ cardId: 'card_start', count: 4 }, { cardId: 'card_fire', count: 2 }, { cardId: 'card_medic', count: 2 }] }
  ],
  activeBoardId: 'board_main', activeCardId: 'card_start', activeDeckId: 'deck_event', selectedObjectId: 'obj_deck',
  designTab: 'board',
  playtest: { currentPlayer: 1, players: [{ name: '玩家 1', color: '#d5f567', hand: [] }], decks: [], deckSourceSignature: '', tableCards: [], piles: {}, objectValues: {}, selectedPileId: '', logs: [{ time: '刚刚', text: '试玩会话已准备，牌组已自动洗牌' }] }
});

let state = loadLocal() || seedState();
let db;
let saveTimer;
let undoStack = [];
let redoStack = [];
let projectLibrary = loadProjectLibrary();
let activeDragEntityId = '';
let activeDragOffset = null;
let playtestAnimation = null;
let playtestAnimationToken = 0;
let cardEffectSelection = null;
const CARD_EFFECT_COLOR_PRESETS = {
  foreColor: ['#f2f4f4', '#b9c2c2', '#ff6b6b', '#ff9f43', '#ffd93d', '#6bcb77', '#4d96ff', '#845ef7', '#f06595', '#1f2328'],
  hiliteColor: ['#fff1a8', '#ffd8a8', '#ffc9c9', '#d3f9d8', '#b2f2bb', '#a5d8ff', '#d0bfff', '#eebefa', '#dee2e6', '#495057']
};
let aiSettings = loadAISettings();
const AI_WELCOME_MESSAGE = '你好！我可以根据当前项目创建卡牌、整理卡组、调整版图对象，或解释试玩状态。试试说“创建一张名为迷雾预兆的事件卡”。';
let aiContexts = {};
let activeAIContextId = '';
let aiConversation = [];
let aiSending = false;

const mcpToolDefinitions = [
  { name: 'get_project_state', description: '读取当前桌游项目的版图、单卡、卡组、标签和试玩摘要。', parameters: { type: 'object', properties: {} } },
  { name: 'update_project', description: '更新项目名称或描述。', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'create_card', description: '创建一张单卡，可设置卡名、效果、标签、稀有度、编号、颜色、插图符号、模板和尺寸。effect 支持安全 HTML，可使用 strong/em/u、span style="color:...;background-color:..."、br、ul/ol 等表现颜色、底色和排版。', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, effect: { type: 'string' }, tag: { type: 'string' }, rarity: { type: 'string' }, number: { type: 'string' }, color: { type: 'string' }, art: { type: 'string' }, template: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } } },
  { name: 'update_card', description: '更新已有单卡的内容、元数据、模板或尺寸。effect 支持安全 HTML，可保留飞书粘贴的文字颜色、底色、粗体、斜体、下划线和列表排版。', parameters: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'string' }, name: { type: 'string' }, effect: { type: 'string' }, tag: { type: 'string' }, rarity: { type: 'string' }, number: { type: 'string' }, art: { type: 'string' }, color: { type: 'string' }, template: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } } },
  { name: 'delete_card', description: '删除一张单卡；卡组中的引用会保留为缺失项。', parameters: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'string' } } } },
  { name: 'create_deck', description: '创建一个空卡组。', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'update_deck', description: '更新已有卡组名称或描述。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'delete_deck', description: '删除一个卡组，不删除其中的单卡。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' } } } },
  { name: 'add_card_to_deck', description: '向卡组添加单卡或增加单卡数量。', parameters: { type: 'object', required: ['deckId', 'cardId'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' }, count: { type: 'number' } } } },
  { name: 'set_deck_card_count', description: '精确设置一张单卡在卡组中的数量；设为 0 会将其移出卡组。', parameters: { type: 'object', required: ['deckId', 'cardId', 'count'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' }, count: { type: 'number', minimum: 0 } } } },
  { name: 'remove_card_from_deck', description: '从卡组中移除单卡关系。', parameters: { type: 'object', required: ['deckId', 'cardId'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' } } } },
  { name: 'list_programmable_zones', description: '列出当前项目中的可编程区域及其程序块摘要。', parameters: { type: 'object', properties: { boardId: { type: 'string' } } } },
  { name: 'get_programmable_zone', description: '读取一个可编程区域的完整配置，包括嵌套程序块。', parameters: { type: 'object', required: ['zoneId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' } } } },
  { name: 'create_programmable_zone', description: '创建一个可编程区域。可直接传入 program，也可以创建后用 add_program_block 添加程序块。', parameters: { type: 'object', properties: { boardId: { type: 'string' }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, program: { type: 'object' } } } },
  { name: 'update_programmable_zone', description: '更新可编程区域的名称、位置、尺寸、外观或完整程序。', parameters: { type: 'object', required: ['zoneId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'string' }, locked: { type: 'boolean' }, showName: { type: 'boolean' }, program: { type: 'object' } } } },
  { name: 'delete_programmable_zone', description: '删除一个可编程区域及其程序块。', parameters: { type: 'object', required: ['zoneId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' } } } },
  { name: 'add_program_block', description: '向可编程区域添加抽牌、洗牌或选择框程序块。parentBlockId 指向选择框时，会添加到其嵌套指令中。来源和目标使用 hand、temporary-selection 或 object:<版图对象ID>。', parameters: { type: 'object', required: ['zoneId', 'type'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' }, parentBlockId: { type: 'string' }, type: { type: 'string', enum: ['draw', 'shuffle', 'select'] }, source: { type: 'string' }, target: { type: 'string' }, count: { type: 'number', minimum: 1 }, max: { type: 'number', minimum: 1 }, selectedTarget: { type: 'string' }, unselectedTarget: { type: 'string' } } } },
  { name: 'update_program_block', description: '更新可编程区域中的程序块参数或类型。', parameters: { type: 'object', required: ['zoneId', 'blockId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' }, blockId: { type: 'string' }, type: { type: 'string', enum: ['draw', 'shuffle', 'select'] }, source: { type: 'string' }, target: { type: 'string' }, count: { type: 'number', minimum: 1 }, max: { type: 'number', minimum: 1 }, selectedTarget: { type: 'string' }, unselectedTarget: { type: 'string' } } } },
  { name: 'remove_program_block', description: '从可编程区域删除一个程序块及其嵌套指令。', parameters: { type: 'object', required: ['zoneId', 'blockId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' }, blockId: { type: 'string' } } } },
  { name: 'move_program_block', description: '调整同一层级程序块的执行顺序。', parameters: { type: 'object', required: ['zoneId', 'blockId', 'direction'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' }, blockId: { type: 'string' }, direction: { type: 'string', enum: ['up', 'down'] } } } },
  { name: 'clear_program', description: '清空可编程区域中的全部程序块。', parameters: { type: 'object', required: ['zoneId'], properties: { boardId: { type: 'string' }, zoneId: { type: 'string' } } } },
  { name: 'create_board_object', description: '在指定版图（省略 boardId 时为当前版图）添加卡牌放置格、卡牌放置区、卡组放置区、卡堆、可编程区域、骰子或计数器。可编程区域的 program 为 {blocks:[{type:"draw"|"shuffle"|"select",source,target,count,max,blocks,selectedTarget,unselectedTarget}]}。', parameters: { type: 'object', required: ['type'], properties: { boardId: { type: 'string' }, type: { type: 'string', enum: ['card-slot', 'card-zone', 'deck-zone', 'stack', 'programmable-zone', 'dice', 'counter'] }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, cardId: { type: 'string' }, deckId: { type: 'string' }, program: { type: 'object' }, background: { type: 'string' }, locked: { type: 'boolean' }, showName: { type: 'boolean' }, showBack: { type: 'boolean' }, showCount: { type: 'boolean' }, drawTarget: { type: 'string' }, layout: { type: 'string' }, gap: { type: 'number' }, stackMode: { type: 'string' }, counterRightClickAction: { type: 'string', enum: ['set', 'increase', 'decrease'] }, counterRightClickValue: { type: 'number' } } } },
  { name: 'update_board_object', description: '更新指定版图对象的位置、尺寸、名称、绑定关系、样式、排列、程序、计数器规则或试玩行为。', parameters: { type: 'object', required: ['objectId'], properties: { boardId: { type: 'string' }, objectId: { type: 'string' }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, cardId: { type: 'string' }, deckId: { type: 'string' }, program: { type: 'object' }, background: { type: 'string' }, locked: { type: 'boolean' }, showName: { type: 'boolean' }, showBack: { type: 'boolean' }, showCount: { type: 'boolean' }, drawTarget: { type: 'string' }, layout: { type: 'string' }, gap: { type: 'number' }, stackMode: { type: 'string' }, counterRightClickAction: { type: 'string', enum: ['set', 'increase', 'decrease'] }, counterRightClickValue: { type: 'number' } } } },
  { name: 'delete_board_object', description: '删除指定版图（省略 boardId 时为当前版图）中的一个对象。', parameters: { type: 'object', required: ['objectId'], properties: { boardId: { type: 'string' }, objectId: { type: 'string' } } } },
  { name: 'create_board', description: '创建一个空白版图。', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'string' } } } },
  { name: 'update_board', description: '更新版图名称、尺寸或背景。', parameters: { type: 'object', required: ['boardId'], properties: { boardId: { type: 'string' }, name: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, background: { type: 'string' } } } },
  { name: 'delete_board', description: '删除一个版图。', parameters: { type: 'object', required: ['boardId'], properties: { boardId: { type: 'string' } } } },
  { name: 'add_tag', description: '向项目标签库添加预定义标签。', parameters: { type: 'object', required: ['tag'], properties: { tag: { type: 'string' } } } },
  { name: 'delete_tag', description: '删除一个未被单卡使用的标签。', parameters: { type: 'object', required: ['tag'], properties: { tag: { type: 'string' } } } },
  { name: 'move_playtest_card', description: '在试玩中移动场上卡牌，或将它放入版图对象。', parameters: { type: 'object', required: ['entityId', 'x', 'y'], properties: { entityId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, objectId: { type: 'string' } } } },
  { name: 'play_card_from_hand', description: '把试玩手牌中的一张牌放到场上；只修改试玩副本。', parameters: { type: 'object', required: ['entityId', 'x', 'y'], properties: { entityId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, objectId: { type: 'string' } } } },
  { name: 'set_playtest_card_orientation', description: '设置试玩场上卡牌横置或竖置。', parameters: { type: 'object', required: ['entityId', 'tapped'], properties: { entityId: { type: 'string' }, tapped: { type: 'boolean' } } } },
  { name: 'return_playtest_card_to_hand', description: '将试玩中的场上卡牌返回玩家手牌。', parameters: { type: 'object', required: ['entityId'], properties: { entityId: { type: 'string' } } } },
  { name: 'put_playtest_card_in_pile', description: '将试玩手牌或场上的卡牌放入指定卡堆内部；只修改试玩数据。', parameters: { type: 'object', required: ['entityId', 'pileId'], properties: { entityId: { type: 'string' }, pileId: { type: 'string' } } } },
  { name: 'shuffle_playtest_pile_into', description: '将一个试玩卡堆中的全部牌洗入另一个卡堆或抽卡堆；不修改设计卡组。', parameters: { type: 'object', required: ['sourcePileId', 'targetObjectId'], properties: { sourcePileId: { type: 'string' }, targetObjectId: { type: 'string' } } } },
  { name: 'draw_playtest_card', description: '从试玩卡组副本抽取一张牌到玩家手牌，不修改设计卡组。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' } } } },
  { name: 'shuffle_playtest_deck', description: '洗牌试玩卡组副本，不修改设计卡组。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' } } } },
  { name: 'roll_playtest_dice', description: '掷指定版图骰子，产生 1 到 6 的随机点数；只修改试玩数据。', parameters: { type: 'object', required: ['objectId'], properties: { objectId: { type: 'string' } } } },
  { name: 'reset_playtest_dice', description: '将指定版图骰子的试玩点数恢复为 0。', parameters: { type: 'object', required: ['objectId'], properties: { objectId: { type: 'string' } } } },
  { name: 'set_playtest_counter', description: '直接设置指定计数器的试玩数值。', parameters: { type: 'object', required: ['objectId', 'value'], properties: { objectId: { type: 'string' }, value: { type: 'number' } } } },
  { name: 'increment_playtest_counter', description: '增加指定计数器的试玩数值，amount 可为负数。', parameters: { type: 'object', required: ['objectId'], properties: { objectId: { type: 'string' }, amount: { type: 'number' } } } },
  { name: 'apply_playtest_counter_right_click', description: '执行指定计数器在版图中配置的右键操作。', parameters: { type: 'object', required: ['objectId'], properties: { objectId: { type: 'string' } } } },
  { name: 'reset_playtest', description: '重新开始试玩并从设计卡组创建新的试玩副本；不会修改设计数据。', parameters: { type: 'object', properties: {} } }
];

function loadAISettings() {
  const defaults = { configured: false, dismissed: false, endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
  try { return normalizeAISettings({ ...defaults, ...(JSON.parse(localStorage.getItem('cardfoundry_ai_settings')) || {}) }); } catch { return defaults; }
}
function saveAISettings() { try { localStorage.setItem('cardfoundry_ai_settings', JSON.stringify(aiSettings)); } catch { /* local storage unavailable */ } if (db) { const tx = db.transaction('appState', 'readwrite'); tx.objectStore('appState').put({ id: 'aiSettings', value: aiSettings }); } }
function normalizeAISettings(settings) {
  const defaults = { configured: false, dismissed: false, endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
  const normalized = { ...defaults, ...(settings || {}) };
  const hasExplicitConfig = normalized.configured === true
    || Boolean(String(normalized.apiKey || '').trim())
    || String(normalized.endpoint || '').replace(/\/+$/, '') !== defaults.endpoint
    || String(normalized.model || '').trim() !== defaults.model;
  if (hasExplicitConfig && normalized.endpoint && normalized.model) {
    normalized.configured = true;
    normalized.dismissed = false;
  }
  return normalized;
}
function hasAIConfiguration(settings = aiSettings) {
  const normalized = normalizeAISettings(settings);
  return Boolean(normalized.configured && String(normalized.endpoint || '').trim() && String(normalized.model || '').trim());
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem('cardfoundry_state')); } catch { return null; }
}
function loadProjectLibrary() {
  try { return JSON.parse(localStorage.getItem('cardfoundry_projects')) || {}; } catch { return {}; }
}
function rememberProject(projectState = state) {
  if (!projectState?.project?.id) return;
  projectLibrary[projectState.project.id] = JSON.parse(JSON.stringify(projectState));
}
function openDatabase() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    const request = indexedDB.open('BoardGameDesignerDB', 2);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains('appState')) database.createObjectStore('appState', { keyPath: 'id' });
      if (event.oldVersion < 2 && !database.objectStoreNames.contains('aiContexts')) database.createObjectStore('aiContexts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}
async function hydrate() {
  db = await openDatabase();
  if (db) await new Promise((resolve) => {
    const tx = db.transaction('appState', 'readonly');
    const store = tx.objectStore('appState');
    const currentRequest = store.get('current');
    const projectsRequest = store.get('projects');
    const aiSettingsRequest = store.get('aiSettings');
    currentRequest.onsuccess = () => { if (currentRequest.result?.value) state = currentRequest.result.value; };
    projectsRequest.onsuccess = () => { if (projectsRequest.result?.value) projectLibrary = projectsRequest.result.value; };
    aiSettingsRequest.onsuccess = () => { if (aiSettingsRequest.result?.value) aiSettings = normalizeAISettings(aiSettingsRequest.result.value); };
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  if (db?.objectStoreNames.contains('aiContexts')) {
    const records = await new Promise(resolve => {
      const tx = db.transaction('aiContexts', 'readonly'); const request = tx.objectStore('aiContexts').getAll();
      request.onsuccess = () => resolve(request.result || []); request.onerror = () => resolve([]);
    });
    aiContexts = Object.fromEntries(records.map(record => [record.id, record]));
    const meta = await new Promise(resolve => {
      const tx = db.transaction('appState', 'readonly'); const request = tx.objectStore('appState').get('aiContextMeta');
      request.onsuccess = () => resolve(request.result?.value || {}); request.onerror = () => resolve({});
    });
    activeAIContextId = meta.activeId || '';
  }
  loadFallbackAIContexts();
  normalizeAIContexts();
}

function normalizeAIContexts() {
  const records = Object.values(aiContexts).filter(record => record && record.id);
  aiContexts = Object.fromEntries(records.map(record => [record.id, {
    id: record.id,
    name: String(record.name || '新上下文'),
    createdAt: Number(record.createdAt || Date.now()),
    updatedAt: Number(record.updatedAt || record.createdAt || Date.now()),
    messages: (Array.isArray(record.messages) ? record.messages : []).map(normalizeAIMessage).filter(Boolean)
  }]));
  if (!activeAIContextId || !aiContexts[activeAIContextId]) activeAIContextId = records[0]?.id || '';
  if (!activeAIContextId) {
    const context = makeAIContext('默认上下文');
    aiContexts[context.id] = context;
    activeAIContextId = context.id;
  }
  aiConversation = aiContexts[activeAIContextId].messages;
  if (!aiConversation.length) aiConversation.push({ role: 'assistant', content: AI_WELCOME_MESSAGE });
}

function makeAIContext(name = '新上下文') {
  const now = Date.now();
  return { id: uid('ai_context'), name: String(name || '新上下文').trim() || '新上下文', createdAt: now, updatedAt: now, messages: [{ role: 'assistant', content: AI_WELCOME_MESSAGE }] };
}

function persistAIContexts(deletedId = '') {
  const current = aiContexts[activeAIContextId];
  if (current) { current.messages = aiConversation; current.updatedAt = Date.now(); }
  try { localStorage.setItem('cardfoundry_ai_contexts', JSON.stringify({ contexts: aiContexts, activeId: activeAIContextId })); } catch { /* storage may be unavailable */ }
  if (!db || !db.objectStoreNames.contains('aiContexts')) return;
  try {
    const tx = db.transaction(['aiContexts', 'appState'], 'readwrite');
    const store = tx.objectStore('aiContexts');
    if (deletedId) store.delete(deletedId);
    Object.values(aiContexts).forEach(context => store.put(context));
    tx.objectStore('appState').put({ id: 'aiContextMeta', value: { activeId: activeAIContextId } });
  } catch { /* IndexedDB may be unavailable in private browsing */ }
}

function loadFallbackAIContexts() {
  if (Object.keys(aiContexts).length) return;
  try {
    const saved = JSON.parse(localStorage.getItem('cardfoundry_ai_contexts') || '{}');
    aiContexts = saved.contexts || {};
    activeAIContextId = saved.activeId || '';
  } catch { /* ignore malformed fallback data */ }
  normalizeAIContexts();
}
function normalizeState() {
  const seed = seedState();
  state = { ...seed, ...state, project: { ...seed.project, ...(state.project || {}) }, playtest: { ...seed.playtest, ...(state.playtest || {}) } };
  state.boards = Array.isArray(state.boards) ? state.boards : seed.boards;
  state.cards = Array.isArray(state.cards) ? state.cards : [];
  state.cards.forEach(card => { card.template = card.template || '默认 · 晨雾'; card.width = Number(card.width || 63); card.height = Number(card.height || 88); card.effect = sanitizeCardEffectHTML(card.effect || ''); });
  const existingCardTags = state.cards.map(card => card.tag).filter(tag => tag && tag !== '未分类');
  state.tags = [...new Set([...(Array.isArray(state.tags) ? state.tags : []), ...existingCardTags])];
  state.decks = Array.isArray(state.decks) ? state.decks : [];
  state.decks.forEach(deck => { deck.entries = Array.isArray(deck.entries) ? deck.entries : []; deck.entries.forEach(entry => { entry.count = Math.max(0, Math.floor(Number(entry.count) || 0)); }); deck.description = deck.description || ''; });
  state.boards.forEach(board => { board.objects = Array.isArray(board.objects) ? board.objects : []; board.objects.forEach(object => { object.showName = object.showName !== false; object.showCount = object.showCount !== false; object.gap = Number(object.gap || 10); object.stackMode = object.stackMode || '顶牌'; object.color = objectColor(object.type); if (!Number.isFinite(Number(object.width)) || Number(object.width) <= 0) object.width = defaultObjectDimensions(object.type).width; if (!Number.isFinite(Number(object.height)) || Number(object.height) <= 0) object.height = defaultObjectDimensions(object.type).height; if (object.type === 'programmable-zone') object.program = normalizeProgram(object.program); if (object.type === 'counter') { object.counterRightClickAction = normalizeCounterAction(object.counterRightClickAction); object.counterRightClickValue = normalizeCounterRuleValue(object.counterRightClickValue, object.counterRightClickAction); } }); });
  const savedPlayers = Array.isArray(state.playtest.players) ? state.playtest.players : [];
  state.playtest.players = savedPlayers.length ? [{ ...seed.playtest.players[0], ...savedPlayers[0], name: savedPlayers[0].name || '玩家 1' }] : seed.playtest.players;
  const extraHands = savedPlayers.slice(1).flatMap(player => Array.isArray(player.hand) ? player.hand : []);
  if (extraHands.length) state.playtest.players[0].hand = [...(state.playtest.players[0].hand || []), ...extraHands];
  state.playtest.currentPlayer = 1;
  state.playtest.tableCards = Array.isArray(state.playtest.tableCards) ? state.playtest.tableCards : [];
  state.playtest.tableCards.forEach(card => { card.player = 1; });
  state.playtest.decks = Array.isArray(state.playtest.decks) ? state.playtest.decks : [];
  state.playtest.deckSourceSignature = state.playtest.deckSourceSignature || '';
  state.playtest.piles = state.playtest.piles && typeof state.playtest.piles === 'object' ? state.playtest.piles : {};
  state.playtest.objectValues = state.playtest.objectValues && typeof state.playtest.objectValues === 'object' ? state.playtest.objectValues : {};
  Object.keys(state.playtest.objectValues).forEach(objectId => { state.playtest.objectValues[objectId] = Math.trunc(Number(state.playtest.objectValues[objectId]) || 0); });
  state.playtest.selectedPileId = state.playtest.selectedPileId || '';
  state.playtest.logs = Array.isArray(state.playtest.logs) ? state.playtest.logs : [];
  state.playtest.players.forEach(player => { player.hand = Array.isArray(player.hand) ? player.hand : []; player.hand = player.hand.map(entity => ({ ...entity, cardId: entity.cardId || state.cards.find(card => card.name === entity.name)?.id })); });
  ensurePlaytestDecks();
}
function createBlankProject(name, description) {
  const projectId = uid('project');
  const boardId = uid('board');
  return {
    project: { id: projectId, name, description },
    boards: [{ id: boardId, name: '基础版图', width: 930, height: 610, background: '#111620', objects: [] }],
    cards: [], tags: [], decks: [], activeBoardId: boardId, activeCardId: '', activeDeckId: '', selectedObjectId: '', designTab: 'board',
    playtest: { currentPlayer: 1, players: [{ name: '玩家 1', color: '#d5f567', hand: [] }], decks: [], deckSourceSignature: '', tableCards: [], piles: {}, objectValues: {}, selectedPileId: '', logs: [{ time: '刚刚', text: '试玩会话已准备，牌组已自动洗牌' }] }
  };
}
function saveState(immediate = false) {
  $('#saveStatus').textContent = immediate ? '保存中' : '编辑中';
  $('.save-dot').className = 'save-dot saving';
  clearTimeout(saveTimer);
  const write = () => {
    rememberProject();
    try { localStorage.setItem('cardfoundry_state', JSON.stringify(state)); } catch { /* quota may be unavailable */ }
    try { localStorage.setItem('cardfoundry_projects', JSON.stringify(projectLibrary)); } catch { /* quota may be unavailable */ }
    if (db) { const tx = db.transaction('appState', 'readwrite'); tx.objectStore('appState').put({ id: 'current', value: state }); tx.objectStore('appState').put({ id: 'projects', value: projectLibrary }); }
    $('#saveStatus').textContent = '已保存'; $('.save-dot').className = 'save-dot';
  };
  saveTimer = setTimeout(write, immediate ? 20 : 500);
}
function mutate(fn) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
  fn(); saveState();
}
function undo() {
  if (!undoStack.length) return toast('没有可撤销的操作');
  redoStack.push(JSON.stringify(state)); state = JSON.parse(undoStack.pop()); renderAll(); saveState(); toast('已撤销');
}
function redo() {
  if (!redoStack.length) return toast('没有可重做的操作');
  undoStack.push(JSON.stringify(state)); state = JSON.parse(redoStack.pop()); renderAll(); saveState(); toast('已重做');
}
function toast(message, kind = '') {
  const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = message; $('#toastRegion').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function esc(value = '') { return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
function nl2br(value = '') { return value.replace(/\n/g, '<br>'); }

function safeAIUrl(value = '') {
  try {
    const url = new URL(value, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function sanitizeAIHTML(value = '') {
  if (typeof DOMParser === 'undefined') return esc(value).replace(/\n/g, '<br>');
  const allowed = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DEL', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL']);
  const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT']);
  const safeStyleProperties = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'font-size', 'line-height'];
  const safeColorValue = value => /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]{1,80}\)|[a-z]{1,24})$/i.test(String(value || '').trim());
  const parser = new DOMParser();
  const source = parser.parseFromString(String(value), 'text/html').body;
  const output = document.createElement('div');
  const copy = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(document.createTextNode(node.nodeValue)); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    // Do not preserve the contents of executable or document-embedding tags.
    // Unknown presentational tags are flattened to their text/allowed children.
    if (blocked.has(node.tagName)) return;
    if (!allowed.has(node.tagName)) { [...node.childNodes].forEach(child => copy(child, parent)); return; }
    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'A') {
      const href = safeAIUrl(node.getAttribute('href') || '');
      if (href) { element.setAttribute('href', href); element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer'); }
    }
    if (node.tagName === 'IMG') {
      const src = safeAIUrl(node.getAttribute('src') || '');
      if (!src) return;
      element.setAttribute('src', src);
      element.setAttribute('alt', String(node.getAttribute('alt') || '图片'));
      element.setAttribute('loading', 'lazy');
      ['width', 'height'].forEach(attribute => {
        const value = node.getAttribute(attribute);
        if (/^\d{1,4}$/.test(value || '')) element.setAttribute(attribute, value);
      });
    }
    if (node.tagName === 'TD' || node.tagName === 'TH') {
      ['colspan', 'rowspan'].forEach(attribute => {
        const span = Number(node.getAttribute(attribute));
        if (Number.isInteger(span) && span > 1 && span <= 100) element.setAttribute(attribute, String(span));
      });
      if (node.tagName === 'TH' && ['row', 'col', 'rowgroup', 'colgroup'].includes(node.getAttribute('scope'))) element.setAttribute('scope', node.getAttribute('scope'));
    }
    // Preserve only a small, presentation-only CSS subset. In particular,
    // discard url(), expression(), javascript: and all other executable CSS.
    if (node.hasAttribute('style')) {
      safeStyleProperties.forEach(property => {
        const styleValue = node.style.getPropertyValue(property).trim();
        if (styleValue && !/(?:url\s*\(|expression\s*\(|javascript\s*:|@import)/i.test(styleValue)) {
          if ((property === 'color' || property === 'background-color') && !safeColorValue(styleValue)) return;
          element.style.setProperty(property, styleValue);
        }
      });
      const background = node.style.getPropertyValue('background').trim();
      if (!element.style.backgroundColor && safeColorValue(background)) element.style.backgroundColor = background;
    }
    // Feishu and some office clipboard providers still emit legacy color/
    // bgcolor attributes instead of CSS declarations.
    const legacyColor = node.getAttribute('color');
    const legacyBackground = node.getAttribute('bgcolor') || node.getAttribute('background-color');
    if (legacyColor && safeColorValue(legacyColor)) element.style.color = legacyColor.trim();
    if (legacyBackground && safeColorValue(legacyBackground)) element.style.backgroundColor = legacyBackground.trim();
    if (node.tagName === 'FONT' && (legacyColor || legacyBackground)) {
      const replacement = document.createElement('span');
      replacement.style.cssText = element.style.cssText;
      [...node.childNodes].forEach(child => copy(child, replacement));
      parent.appendChild(replacement);
      return;
    }
    [...node.childNodes].forEach(child => copy(child, element));
    parent.appendChild(element);
  };
  [...source.childNodes].forEach(node => copy(node, output));
  return output.innerHTML;
}

function markdownInline(value = '') {
  let text = esc(value);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (match, alt, url, title) => { const safe = safeAIUrl(url); return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${alt || '图片链接'}</a>` : alt; });
  text = text.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (match, label, url) => { const safe = safeAIUrl(url); return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label; });
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return text;
}

function splitMarkdownTableRow(line = '') {
  let source = String(line).trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells = []; let cell = ''; let inCode = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\' && source[index + 1] === '|') { cell += '|'; index += 1; continue; }
    if (character === '`') { inCode = !inCode; cell += character; continue; }
    if (character === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}
function markdownTableAlignment(cell = '') {
  const marker = String(cell).replace(/\s/g, '');
  if (!/^:?-{3,}:?$/.test(marker)) return null;
  if (marker.startsWith(':') && marker.endsWith(':')) return 'center';
  if (marker.endsWith(':')) return 'right';
  return 'left';
}
function renderMarkdownTable(headerLine, dividerLine, bodyLines) {
  const headers = splitMarkdownTableRow(headerLine);
  const alignments = splitMarkdownTableRow(dividerLine).map(markdownTableAlignment);
  if (!headers.length || headers.length !== alignments.length || alignments.some(alignment => !alignment)) return '';
  const renderCell = (tag, value, index) => `<${tag} style="text-align:${alignments[index] || 'left'}">${markdownInline(value)}</${tag}>`;
  const head = `<thead><tr>${headers.map((cell, index) => renderCell('th', cell, index)).join('')}</tr></thead>`;
  const body = bodyLines.map(line => {
    const cells = splitMarkdownTableRow(line);
    while (cells.length < headers.length) cells.push('');
    return `<tr>${cells.slice(0, headers.length).map((cell, index) => renderCell('td', cell, index)).join('')}</tr>`;
  }).join('');
  return `<table>${head}${body ? `<tbody>${body}</tbody>` : ''}</table>`;
}

function markdownToHTML(value = '') {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  const output = []; let paragraph = []; let listType = ''; let inFence = false; let fenceLines = [];
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${markdownInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`); paragraph = []; } };
  const closeList = () => { if (listType) { output.push(`</${listType}>`); listType = ''; } };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (/^\s*```/.test(line)) { if (inFence) { output.push(`<pre><code>${esc(fenceLines.join('\n'))}</code></pre>`); fenceLines = []; inFence = false; } else { flushParagraph(); closeList(); inFence = true; } continue; }
    if (inFence) { fenceLines.push(line); continue; }
    const dividerLine = lines[lineIndex + 1];
    const headerCells = splitMarkdownTableRow(line);
    const dividerCells = dividerLine === undefined ? [] : splitMarkdownTableRow(dividerLine);
    const isTable = (line.includes('|') || dividerLine?.includes('|')) && headerCells.length === dividerCells.length && dividerCells.length > 0 && dividerCells.every(cell => markdownTableAlignment(cell));
    if (isTable) {
      flushParagraph(); closeList();
      const bodyLines = []; let bodyIndex = lineIndex + 2;
      while (bodyIndex < lines.length && lines[bodyIndex].includes('|') && lines[bodyIndex].trim()) { bodyLines.push(lines[bodyIndex]); bodyIndex += 1; }
      output.push(renderMarkdownTable(line, dividerLine, bodyLines));
      lineIndex = bodyIndex - 1;
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); closeList(); output.push(`<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flushParagraph(); closeList(); output.push(`<blockquote>${markdownInline(quote[1])}</blockquote>`); continue; }
    const item = line.match(/^\s*[-*+]\s+(.+)$/) || line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (item) { flushParagraph(); const nextType = line.match(/^\s*\d+[.)]/) ? 'ol' : 'ul'; if (listType !== nextType) { closeList(); output.push(`<${nextType}>`); listType = nextType; } output.push(`<li>${markdownInline(item[1])}</li>`); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    closeList(); paragraph.push(line);
  }
  if (inFence) output.push(`<pre><code>${esc(fenceLines.join('\n'))}</code></pre>`);
  flushParagraph(); closeList();
  return output.join('');
}

function wrapAIContentTables(html = '') {
  if (typeof DOMParser === 'undefined') return html;
  const wrapper = document.createElement('div'); wrapper.innerHTML = html;
  $$('table', wrapper).forEach(table => {
    if (table.parentElement?.classList.contains('ai-table-scroll')) return;
    const scroll = document.createElement('div'); scroll.className = 'ai-table-scroll';
    table.parentNode.insertBefore(scroll, table); scroll.appendChild(table);
  });
  return wrapper.innerHTML;
}

function renderAIContent(value = '') {
  const raw = String(value);
  if (!raw.trim()) return '';
  const hasHTML = /<\/?[a-z][^>]*>/i.test(raw);
  if (!hasHTML) return wrapAIContentTables(markdownToHTML(raw));
  const sanitized = sanitizeAIHTML(raw);
  if (typeof DOMParser === 'undefined') return sanitized;
  const wrapper = document.createElement('div'); wrapper.innerHTML = sanitized;
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  const textNodes = []; let current;
  while ((current = walker.nextNode())) textNodes.push(current);
  textNodes.forEach(node => {
    // Preserve literal code blocks. Markdown markers inside <pre>/<code>
    // should remain code, not turn into nested formatting elements.
    if (node.parentElement?.closest('pre,code')) return;
    if (node.nodeValue.trim()) { const span = document.createElement('span'); span.innerHTML = markdownInline(node.nodeValue); node.replaceWith(span); }
  });
  return wrapAIContentTables(wrapper.innerHTML);
}

function sanitizeAIInputHTML(value = '') {
  return sanitizeAIHTML(value).trim();
}
function sanitizeCardEffectHTML(value = '') {
  const source = String(value || '').replace(/\r\n?/g, '\n');
  if (!source.trim()) return '';
  const html = /<\/?[a-z][^>]*>/i.test(source) ? source : esc(source).replace(/\n/g, '<br>');
  return sanitizeAIHTML(html)
    .replace(/<(?:h1|h2|h3)(\b[^>]*)>/gi, '<p$1><strong>')
    .replace(/<\/(?:h1|h2|h3)>/gi, '</strong></p>')
    .trim();
}
function insertRichHTML(editor, html, plainText = '') {
  if (!editor) return;
  editor.focus();
  const safeHTML = sanitizeCardEffectHTML(html || plainText);
  const selection = window.getSelection();
  let range = cardEffectSelection;
  if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) range = selection.getRangeAt(0);
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    editor.insertAdjacentHTML('beforeend', safeHTML);
    return;
  }
  range.deleteContents();
  const fragment = range.createContextualFragment(safeHTML);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last && selection) {
    range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
    cardEffectSelection = range.cloneRange();
  }
}
function aiInputPayload(input) {
  const plainText = String(input?.innerText || '').replace(/\u00a0/g, ' ').trim();
  const html = sanitizeAIInputHTML(input?.innerHTML || '');
  const hasRichFormatting = /<(?:b|strong|em|i|u|s|del|span|div|p|br|ul|ol|li|blockquote|pre|code|table|tr|td|th)\b|\sstyle=/i.test(html);
  if (!plainText && !html.replace(/<[^>]+>/g, '').trim()) return '';
  return hasRichFormatting ? html : plainText;
}
function insertAIInputHTML(input, html, plainText = '') {
  input.focus();
  const safeHTML = sanitizeAIInputHTML(html || esc(plainText).replace(/\r?\n/g, '<br>'));
  const selection = window.getSelection();
  if (!selection?.rangeCount) { input.insertAdjacentHTML('beforeend', safeHTML); return; }
  const range = selection.getRangeAt(0);
  if (!input.contains(range.commonAncestorContainer)) { input.insertAdjacentHTML('beforeend', safeHTML); return; }
  range.deleteContents();
  const fragment = range.createContextualFragment(safeHTML);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
}

function projectAIContext() {
  return { project: state.project, boards: state.boards.map(board => ({ ...board, objects: board.objects })), cards: state.cards, tags: state.tags, decks: state.decks, playtest: { players: state.playtest.players, tableCards: state.playtest.tableCards, piles: state.playtest.piles, objectValues: state.playtest.objectValues } };
}
function renderAIContextControls() {
  const select = $('#aiContextSelect'); if (!select) return;
  const contexts = Object.values(aiContexts).sort((a, b) => b.updatedAt - a.updatedAt);
  select.innerHTML = contexts.map(context => `<option value="${esc(context.id)}" ${context.id === activeAIContextId ? 'selected' : ''}>${esc(context.name)}</option>`).join('');
  const context = aiContexts[activeAIContextId];
  const deleteButton = $('#aiDeleteContextButton');
  if (deleteButton) deleteButton.disabled = contexts.length <= 1;
  if (context) select.title = `${context.name} · ${context.messages.filter(message => message.role === 'user').length} 条提问`;
}
function renderAIConversation() {
  const messages = $('#aiMessages'); if (!messages) return;
  messages.innerHTML = '';
  aiConversation.filter(message => message.role === 'user' || (message.role === 'assistant' && String(message.content || '').trim())).forEach(message => addAIMessage(message.role, message.content || '', false));
  messages.scrollTop = messages.scrollHeight;
}
function addAIMessage(role, text, persist = true) {
  const messages = $('#aiMessages'); if (!messages) return null;
  const item = document.createElement('div'); item.className = `ai-message ${role}`; item.innerHTML = `<div class="ai-message-role">${role === 'user' ? '你' : 'AI 助手'}</div><div class="ai-message-content">${renderAIContent(text)}</div>`; messages.appendChild(item); messages.scrollTop = messages.scrollHeight;
  updateAIMessageLayout(item);
  if (persist) { aiConversation.push({ role, content: String(text || '') }); persistAIContexts(); renderAIContextControls(); }
  return item;
}
function updateAIMessage(item, text) {
  if (!item) return;
  const content = $('.ai-message-content', item); if (content) content.innerHTML = renderAIContent(text);
  updateAIMessageLayout(item);
  const messages = $('#aiMessages'); if (messages) messages.scrollTop = messages.scrollHeight;
}
function updateAIMessageLayout(item) {
  item?.classList.toggle('has-table', Boolean(item.querySelector('.ai-table-scroll')));
}
function appendAIConversationMessage(message) {
  const normalized = normalizeAIMessage(message);
  if (!normalized) return;
  aiConversation.push(normalized);
  persistAIContexts();
  renderAIContextControls();
}
function normalizeAIMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const normalized = { ...message };
  // OpenAI-compatible APIs require assistant.tool_calls to be omitted unless
  // it contains at least one complete call. Older saved contexts may contain
  // an empty array from the streaming accumulator, which causes HTTP 400.
  const calls = normalized.tool_calls || normalized.toolcalls;
  // Some providers spell this field as `toolcalls`; never forward that alias.
  delete normalized.toolcalls;
  if (Array.isArray(calls) && calls.length) {
    normalized.tool_calls = calls.filter(call => call?.id && call?.function?.name).map(call => ({
      id: String(call.id),
      type: 'function',
      function: { name: String(call.function.name), arguments: String(call.function.arguments || '{}') }
    }));
    if (!normalized.tool_calls.length) delete normalized.tool_calls;
  } else {
    delete normalized.tool_calls;
  }
  if (normalized.role === 'assistant' && !normalized.content && !normalized.tool_calls) return null;
  return normalized;
}
function aiMessagesForRequest() {
  const clean = []; const availableToolCallIds = new Set();
  aiConversation.forEach(message => {
    const normalized = normalizeAIMessage(message);
    if (!normalized) return;
    if (normalized.role === 'tool' && !availableToolCallIds.has(normalized.tool_call_id)) return;
    // Avoid sending UI-only metadata or unsupported empty content values.
    delete normalized._streamRendered;
    clean.push(normalized);
    (normalized.tool_calls || []).forEach(call => availableToolCallIds.add(call.id));
  });
  const changed = JSON.stringify(clean) !== JSON.stringify(aiConversation);
  if (changed) {
    aiConversation = clean;
    const context = aiContexts[activeAIContextId];
    if (context) context.messages = clean;
    persistAIContexts();
  }
  return clean;
}
function switchAIContext(id) {
  if (!aiContexts[id] || id === activeAIContextId) return;
  if (aiSending) return toast('请等待当前回答完成后再切换上下文');
  activeAIContextId = id;
  aiConversation = aiContexts[id].messages;
  if (!aiConversation.length) aiConversation.push({ role: 'assistant', content: AI_WELCOME_MESSAGE });
  persistAIContexts();
  renderAIConversation();
  renderAIContextControls();
  setAIStatus(`已切换到「${aiContexts[id].name}」`);
}
function createAIContext() {
  if (aiSending) return toast('请等待当前回答完成后再新建上下文');
  const name = window.prompt('请输入上下文名称', `上下文 ${Object.keys(aiContexts).length + 1}`);
  if (name === null) return;
  const context = makeAIContext(name);
  aiContexts[context.id] = context;
  activeAIContextId = context.id;
  aiConversation = context.messages;
  persistAIContexts();
  renderAIConversation();
  renderAIContextControls();
  setAIStatus(`已新建「${context.name}」`);
}
function deleteAIContext() {
  const contexts = Object.values(aiContexts);
  if (contexts.length <= 1) return toast('至少保留一个上下文');
  if (aiSending) return toast('请等待当前回答完成后再删除上下文');
  const context = aiContexts[activeAIContextId];
  if (!context || !window.confirm(`确定删除上下文「${context.name}」吗？其中的聊天记录也会删除。`)) return;
  const deletedId = activeAIContextId;
  delete aiContexts[deletedId];
  const next = Object.values(aiContexts).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  activeAIContextId = next.id;
  aiConversation = next.messages;
  persistAIContexts(deletedId);
  renderAIConversation();
  renderAIContextControls();
  setAIStatus(`已删除「${context.name}」`);
}
function setAIStatus(text) { const status = $('#aiToolStatus'); if (status) status.textContent = text; }
function setAIContext(text) { const context = $('#aiContextBar'); if (context) context.textContent = `当前上下文：${text}`; }
function currentBoard() { return state.boards.find((b) => b.id === state.activeBoardId) || state.boards[0]; }
function currentCard() { return state.cards.find((c) => c.id === state.activeCardId) || state.cards[0]; }
function currentDeck() { return state.decks.find((d) => d.id === state.activeDeckId) || state.decks[0]; }
function boardById(id) { return state.boards.find((board) => board.id === id); }
function cardById(id) { return state.cards.find((c) => c.id === id); }
function deckById(id) { return state.decks.find((d) => d.id === id); }
function playtestDeckById(id) { return state.playtest.decks.find((d) => d.id === id); }
function playtestDeckSignature() { return JSON.stringify(state.decks.map(deck => ({ id: deck.id, name: deck.name, entries: deck.entries.map(entry => ({ cardId: entry.cardId, count: Number(entry.count || 0) })) }))); }
// The design deck stores grouped counts; a playtest copy keeps a concrete,
// shuffled card-id queue so duplicate cards can appear in a genuinely random
// order without ever changing the design deck.
function expandDeckEntries(entries = []) {
  return entries.flatMap(entry => Array.from({ length: Math.max(0, Math.floor(Number(entry.count) || 0)) }, () => entry.cardId));
}
function drawPileMatchesEntries(deck) {
  if (!Array.isArray(deck?.drawPile)) return false;
  const expected = expandDeckEntries(deck.entries).sort();
  const actual = [...deck.drawPile].sort();
  return expected.length === actual.length && expected.every((cardId, index) => cardId === actual[index]);
}
function initializePlaytestDeck(deck) {
  const entries = deck.entries.map(entry => ({ cardId: entry.cardId, count: Math.max(0, Math.floor(Number(entry.count) || 0)) }));
  return { id: deck.id, name: deck.name, description: deck.description, entries, drawPile: shuffleArray(expandDeckEntries(entries)) };
}
function ensurePlaytestDrawPile(deck) {
  if (drawPileMatchesEntries(deck)) return false;
  deck.drawPile = shuffleArray(expandDeckEntries(deck.entries));
  return true;
}
function ensurePlaytestDecks(force = false) {
  const signature = playtestDeckSignature();
  if (force || !state.playtest.decks.length || state.playtest.deckSourceSignature !== signature) {
    state.playtest.decks = state.decks.map(initializePlaytestDeck);
    state.playtest.deckSourceSignature = signature;
    return true;
  }
  let migrated = false;
  state.playtest.decks.forEach(deck => { if (ensurePlaytestDrawPile(deck)) migrated = true; });
  return migrated;
}
function shufflePlaytestDeck(deck) {
  ensurePlaytestDrawPile(deck);
  shuffleArray(deck.drawPile);
  return deck;
}
function drawFromPlaytestDeck(deck) {
  ensurePlaytestDrawPile(deck);
  const cardId = deck.drawPile.shift();
  if (!cardId) return '';
  const entry = deck.entries.find(item => item.cardId === cardId && Number(item.count) > 0);
  if (entry) entry.count = Number(entry.count) - 1;
  return cardId;
}
function shuffleCardsIntoPlaytestDeck(deck, cards) {
  ensurePlaytestDrawPile(deck);
  cards.forEach(entity => {
    if (!entity?.cardId) return;
    deck.drawPile.push(entity.cardId);
    const entry = deck.entries.find(item => item.cardId === entity.cardId);
    if (entry) entry.count = Number(entry.count || 0) + 1;
    else deck.entries.push({ cardId: entity.cardId, count: 1 });
  });
  shufflePlaytestDeck(deck);
}
function shuffleAffectedPlaytestPiles(objectIds = []) {
  const requestedIds = [...new Set([...objectIds].filter(Boolean))];
  const affectedIds = new Set(requestedIds);
  const shuffledDeckIds = new Set();
  requestedIds.forEach(objectId => {
    const object = currentBoard().objects.find(item => item.id === objectId);
    if (object?.type === 'stack') {
      state.playtest.piles[object.id] ||= [];
      shuffleArray(state.playtest.piles[object.id]);
    } else if (object?.type === 'deck-zone') {
      playtestDeckObjectIds(object.deckId).forEach(id => affectedIds.add(id));
      const deck = playtestDeckById(object.deckId);
      if (deck && !shuffledDeckIds.has(deck.id)) { shufflePlaytestDeck(deck); shuffledDeckIds.add(deck.id); }
    }
  });
  return [...affectedIds];
}
function playtestDeckObjectIds(deckId) {
  return currentBoard().objects.filter(object => object.type === 'deck-zone' && object.deckId === deckId).map(object => object.id);
}
function normalizeProgramBlock(block = {}) {
  const type = ['draw', 'shuffle', 'select'].includes(block.type) ? block.type : 'draw';
  const normalized = { id: block.id || uid('block'), type, source: block.source || 'hand', target: block.target || 'hand', count: Math.max(1, Math.floor(Number(block.count) || 1)), max: Math.max(1, Math.floor(Number(block.max) || 1)), selectedTarget: block.selectedTarget || 'hand', unselectedTarget: block.unselectedTarget || 'hand', blocks: [] };
  if (type === 'select') normalized.blocks = Array.isArray(block.blocks) ? block.blocks.map(normalizeProgramBlock) : [];
  return normalized;
}
function normalizeProgram(program = {}) { return { blocks: Array.isArray(program?.blocks) ? program.blocks.map(normalizeProgramBlock) : [] }; }
function createProgramBlock(type) { return normalizeProgramBlock({ type, blocks: type === 'select' ? [] : undefined }); }
function defaultObjectDimensions(type) {
  if (type === 'card-zone') return { width: 290, height: 150 };
  if (type === 'programmable-zone') return { width: 190, height: 128 };
  if (type === 'dice' || type === 'counter') return { width: 84, height: 84 };
  return { width: 138, height: 110 };
}
function normalizeCounterAction(action) { return ['set', 'increase', 'decrease'].includes(action) ? action : 'decrease'; }
function normalizeCounterRuleValue(value, action = 'decrease') {
  const number = Number(value);
  const normalized = Number.isFinite(number) ? Math.trunc(number) : 1;
  return action === 'set' ? normalized : Math.abs(normalized);
}
function counterActionLabel(action) { return ({ set: '设为', increase: '增加', decrease: '减少' })[normalizeCounterAction(action)]; }
function objectLabel(type) { return ({ 'card-slot': '卡牌放置格', 'card-zone': '卡牌放置区', 'deck-zone': '卡组放置区', stack: '卡堆', 'programmable-zone': '可编程区域', dice: '骰子', counter: '计数器' })[type] || type; }
function objectColor(type) { return ({ 'card-slot': 'blue', 'card-zone': 'green', 'deck-zone': 'purple', stack: 'orange', 'programmable-zone': 'green', dice: 'pink', counter: 'teal' })[type] || 'blue'; }
function objectColorVariable(type) { const color = objectColor(type); return color === 'green' ? 'lime' : color; }
function objectSymbol(type) { return ({ 'card-slot': '▣', 'card-zone': '▤', 'deck-zone': '▥', stack: '▰', 'programmable-zone': '⚙', dice: '⚄', counter: '#' })[type] || '▧'; }
function isValueObject(type) { return type === 'dice' || type === 'counter'; }

function renderAll() {
  renderProjectHeader();
  $('#cardCount').textContent = state.cards.length;
  $('#deckCount').textContent = state.decks.length;
  renderBoard(); renderCards(); renderDecks(); renderPlaytest(); renderExport();
  setDesignTab(state.designTab || 'board', false);
  const viewLabel = ({ design: '桌游设计', playtest: '桌游试玩', export: '文件导出与导入' })[$$('.nav-item.active')[0]?.dataset.view] || '整个项目';
  setAIContext(`${viewLabel} · 项目「${state.project?.name || '未命名'}」 · ${state.cards.length} 张单卡 · ${state.decks.length} 个卡组`);
  renderAIContextControls();
}
function renderProjectHeader() {
  const button = $('#projectNameButton');
  if (button) button.innerHTML = `${esc(state.project?.name || '未命名项目')} <span>⌄</span>`;
}
function renderBoard() {
  const board = currentBoard();
  const selected = board.objects.find((o) => o.id === state.selectedObjectId);
  $('#boardPage').innerHTML = `<div class="designer-grid">
    <aside class="card-panel object-library">
      <div class="panel-heading"><span class="panel-title">对象库</span><span class="panel-hint">拖入画布</span></div>
      ${[['card-slot','blue','▣','卡牌放置格','放置一张卡牌'],['card-zone','green','▤','卡牌放置区','平铺多张卡牌'],['deck-zone','purple','▥','卡组放置区','从卡组抽牌'],['stack','orange','▰','卡堆','弃牌 / 除外区'],['programmable-zone','green','⚙','可编程区域','点击执行程序块'],['dice','pink','⚄','骰子','试玩时点击掷骰'],['counter','teal','#','计数器','试玩时记录数值']].map(([type,color,symbol,name,help]) => `<button class="object-card" data-add-object="${type}"><span class="object-icon ${color}">${symbol}</span><span><span class="object-label">${name}</span><span class="object-help">${help}</span></span></button>`).join('')}
      <div class="layer-section"><div class="panel-heading"><span class="panel-title">图层</span><span class="panel-hint">${board.objects.length} 个对象</span></div>
        ${board.objects.map((o) => `<div class="layer-row ${o.id === state.selectedObjectId ? 'selected' : ''}" data-select-object="${o.id}"><span class="layer-dot" style="background:var(--${objectColorVariable(o.type)})"></span><span class="layer-name">${esc(o.name)}</span><span class="layer-type">${objectLabel(o.type)}</span></div>`).join('')}
      </div>
    </aside>
    <section class="board-shell"><div class="board-toolbar"><button class="tool-button active" id="selectTool">↖ 选择</button><button class="tool-button" id="gridTool">⊞ 网格</button><button class="tool-button" id="snapTool">⌁ 吸附</button><span class="spacer"></span><span class="zoom-label">100%</span><button class="tool-button" id="fitTool">适应画布</button></div>
      <div class="board-canvas-wrap" id="boardCanvasWrap"><div class="board-canvas" id="boardCanvas"><span class="canvas-label">BOARD / ${esc(board.name).toUpperCase()}</span>${board.objects.map(renderBoardObject).join('')}${board.objects.length ? '' : '<div class="empty-board">从左侧拖入一个对象开始设计</div>'}</div></div><div class="canvas-status"><span>画布 ${board.width} × ${board.height}px</span><span>⌘Z 撤销 · 双击对象编辑名称</span></div>
    </section>
    <aside class="card-panel inspector">${selected ? renderInspector(selected) : `<div class="inspector-empty"><div><div class="empty-icon">◈</div>选择一个对象<br>以编辑它的属性</div></div>`}</aside>
  </div>`;
  bindBoardEvents();
}
function renderBoardObject(o) {
  const content = isValueObject(o.type)
    ? `<span class="object-value">0</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}`
    : `<span class="object-symbol">${objectSymbol(o.type)}</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}${o.type === 'deck-zone' && o.showCount ? '<small>11 张剩余</small>' : ''}`;
  return `<div class="board-object ${objectColor(o.type)} ${o.type === 'programmable-zone' ? 'programmable-object' : ''} ${isValueObject(o.type) ? 'value-object' : ''} ${o.id === state.selectedObjectId ? 'selected' : ''}" data-board-object="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;${o.background ? `background:${esc(o.background)};` : ''}">${content}</div>`;
}
function programReferenceOptions(selected = 'hand', allowTemporary = false) {
  const refs = [{ value: 'hand', label: '玩家手牌' }, ...currentBoard().objects.filter(item => ['deck-zone', 'stack', 'card-zone'].includes(item.type)).map(item => ({ value: `object:${item.id}`, label: item.name }))];
  if (allowTemporary) refs.push({ value: 'temporary-selection', label: '临时选择区' });
  return refs.map(ref => `<option value="${esc(ref.value)}" ${selected === ref.value ? 'selected' : ''}>${esc(ref.label)}</option>`).join('');
}
function renderProgramBlock(block, nested = false, index = 0) {
  const typeMeta = { draw: ['抽牌指令', '▥', 'blue'], shuffle: ['洗牌指令', '⟳', 'purple'], select: ['卡牌选择', '◇', 'orange'] }[block.type];
  const body = block.type === 'draw'
    ? `<div class="program-fields"><div class="program-field wide"><label>来源区域</label><select data-program-field="source" data-program-block="${block.id}">${programReferenceOptions(block.source, nested)}</select></div><div class="program-field compact"><label>顶部抽取</label><div class="program-count-input"><input type="number" min="1" data-program-field="count" data-program-block="${block.id}" value="${block.count}"><span>张</span></div></div><div class="program-flow-arrow">↓</div><div class="program-field wide"><label>发送目标</label><select data-program-field="target" data-program-block="${block.id}">${programReferenceOptions(block.target, nested)}</select></div></div>`
    : block.type === 'shuffle'
      ? `<div class="program-fields"><div class="program-field wide"><label>收集全部卡牌</label><select data-program-field="source" data-program-block="${block.id}">${programReferenceOptions(block.source, nested)}</select></div><div class="program-flow-arrow">↓ 洗牌</div><div class="program-field wide"><label>放入目标</label><select data-program-field="target" data-program-block="${block.id}">${programReferenceOptions(block.target, nested)}</select></div></div>`
      : `<div class="program-fields"><div class="program-field compact"><label>选择上限</label><div class="program-count-input"><input type="number" min="1" data-program-field="max" data-program-block="${block.id}" value="${block.max}"><span>张</span></div></div></div><div class="program-nested"><div class="program-nested-heading"><span>打开选择框前执行</span><small>${block.blocks?.length || 0} 条</small></div>${block.blocks?.length ? block.blocks.map((child, childIndex) => renderProgramBlock(child, true, childIndex)).join('') : '<div class="program-empty"><span>◇</span>尚无准备指令</div>'}<div class="program-inline-add"><button type="button" data-program-add="draw" data-program-parent="${block.id}">＋ 抽牌</button><button type="button" data-program-add="shuffle" data-program-parent="${block.id}">＋ 洗牌</button></div></div><div class="program-fields result-fields"><div class="program-field wide"><label>已选卡牌发往</label><select data-program-field="selectedTarget" data-program-block="${block.id}">${programReferenceOptions(block.selectedTarget, true)}</select></div><div class="program-field wide"><label>未选卡牌发往</label><select data-program-field="unselectedTarget" data-program-block="${block.id}">${programReferenceOptions(block.unselectedTarget, true)}</select></div></div>`;
  return `<div class="program-block ${block.type} ${nested ? 'nested-block' : ''}" data-program-node="${block.id}"><div class="program-block-head"><div class="program-block-title"><span class="program-order">${index + 1}</span><span class="program-type-icon ${typeMeta[2]}">${typeMeta[1]}</span><span><strong>${typeMeta[0]}</strong><small>${block.type === 'draw' ? '从顶部取牌' : block.type === 'shuffle' ? '合并并随机排序' : '打开临时选择区'}</small></span></div><span class="program-block-actions"><button type="button" aria-label="上移" title="上移" data-program-move="up" data-program-block="${block.id}">↑</button><button type="button" aria-label="下移" title="下移" data-program-move="down" data-program-block="${block.id}">↓</button><button class="program-delete" type="button" aria-label="删除" title="删除" data-program-remove="${block.id}">×</button></span></div>${body}</div>`;
}
function renderProgramEditor(o) {
  const program = normalizeProgram(o.program);
  o.program = program;
  return `<div class="inspector-section program-editor"><div class="program-section-heading"><div><div class="section-label">执行程序</div><p>试玩时点击此区域，按顺序执行以下指令。</p></div><span class="program-count-badge">${program.blocks.length} 条</span></div><div class="program-block-list">${program.blocks.length ? program.blocks.map((block, index) => renderProgramBlock(block, false, index)).join('') : '<div class="program-empty program-empty-main"><span>⚙</span><strong>还没有程序指令</strong><small>从下方选择一种指令开始编排</small></div>'}</div><div class="program-add-panel"><div class="program-add-title">添加指令</div><div class="program-add-grid"><button type="button" data-program-add="draw"><span class="program-add-icon blue">▥</span><span><strong>抽牌</strong><small>从顶部取牌</small></span></button><button type="button" data-program-add="shuffle"><span class="program-add-icon purple">⟳</span><span><strong>洗牌</strong><small>合并所有卡牌</small></span></button><button type="button" data-program-add="select"><span class="program-add-icon orange">◇</span><span><strong>卡牌选择</strong><small>玩家临时选择</small></span></button></div></div></div>`;
}
function findProgramList(blocks, blockId) {
  if (!blockId) return blocks;
  for (const block of blocks) { if (block.id === blockId && block.type === 'select') return block.blocks; const nested = findProgramList(block.blocks || [], blockId); if (nested) return nested; }
  return null;
}
function findProgramBlock(blocks, blockId) { for (const block of blocks) { if (block.id === blockId) return block; const found = findProgramBlock(block.blocks || [], blockId); if (found) return found; } return null; }
function removeProgramBlock(blocks, blockId) { const index = blocks.findIndex(block => block.id === blockId); if (index >= 0) { blocks.splice(index, 1); return true; } return blocks.some(block => removeProgramBlock(block.blocks || [], blockId)); }
function moveProgramBlock(blocks, blockId, direction) { const index = blocks.findIndex(block => block.id === blockId); if (index >= 0) { const next = index + direction; if (next < 0 || next >= blocks.length) return; [blocks[index], blocks[next]] = [blocks[next], blocks[index]]; return; } blocks.some(block => moveProgramBlock(block.blocks || [], blockId, direction)); }
function programmableZoneById(zoneId, boardId = '') {
  const board = boardId ? boardById(boardId) : currentBoard();
  const zone = board?.objects.find(object => object.id === zoneId && object.type === 'programmable-zone');
  if (!zone) throw new Error('找不到可编程区域');
  zone.program = normalizeProgram(zone.program);
  return { board, zone };
}
function programBlockForArgs(args = {}) {
  const block = normalizeProgramBlock({ type: args.type, source: args.source, target: args.target, count: args.count, max: args.max, selectedTarget: args.selectedTarget, unselectedTarget: args.unselectedTarget });
  return block;
}
function renderInspector(o) {
  return `<div class="panel-heading"><span class="panel-title">属性检查器</span><button class="danger-button" data-delete-object="${o.id}">删除</button></div>
    <div class="inspector-section"><div class="section-label">基础信息</div><div class="field"><label>对象名称</label><input data-object-field="name" value="${esc(o.name)}"></div><div class="field"><label>对象类型</label><input value="${objectLabel(o.type)}" disabled></div></div>
    <div class="inspector-section"><div class="section-label">位置与尺寸</div><div class="field-row"><div class="field"><label>X</label><input type="number" data-object-field="x" value="${o.x}"></div><div class="field"><label>Y</label><input type="number" data-object-field="y" value="${o.y}"></div></div><div class="field-row"><div class="field"><label>宽度</label><input type="number" data-object-field="width" value="${o.width}"></div><div class="field"><label>高度</label><input type="number" data-object-field="height" value="${o.height}"></div></div></div>
    <div class="inspector-section"><div class="section-label">外观</div><div class="field"><label>背景颜色</label><input type="text" data-object-field="background" value="${esc(o.background || '')}" placeholder="使用默认颜色"></div><div class="toggle-line">显示对象名称 <button class="switch ${o.showName !== false ? 'on' : ''}" data-toggle-field="showName"><span></span></button></div><div class="toggle-line">锁定对象 <button class="switch ${o.locked ? 'on' : ''}" data-toggle-field="locked"><span></span></button></div></div>
    ${o.type === 'card-slot' ? `<div class="inspector-section"><div class="section-label">绑定卡牌</div><div class="field"><label>指定卡牌</label><select data-object-field="cardId"><option value="">任意卡牌</option>${state.cards.map(c => `<option value="${c.id}" ${o.cardId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="toggle-line">显示卡牌背面 <button class="switch ${o.showBack ? 'on' : ''}" data-toggle-field="showBack"><span></span></button></div></div>` : ''}
    ${o.type === 'deck-zone' ? `<div class="inspector-section"><div class="section-label">绑定卡组</div><div class="field"><label>卡组</label><select data-object-field="deckId">${state.decks.map(d => `<option value="${d.id}" ${o.deckId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div><div class="toggle-line">显示剩余数量 <button class="switch ${o.showCount !== false ? 'on' : ''}" data-toggle-field="showCount"><span></span></button></div><div class="field"><label>抽出后进入</label><select data-object-field="drawTarget"><option>玩家手牌</option><option ${o.drawTarget === '玩家区域' ? 'selected' : ''}>玩家区域</option></select></div></div>` : ''}
    ${o.type === 'card-zone' ? `<div class="inspector-section"><div class="section-label">排列方式</div><div class="field"><label>卡牌排列</label><select data-object-field="layout"><option ${o.layout === '平铺' ? 'selected' : ''}>平铺</option><option ${o.layout === '网格' ? 'selected' : ''}>网格</option><option ${o.layout === '扇形' ? 'selected' : ''}>扇形</option></select></div></div>` : ''}
    ${o.type === 'dice' ? `<div class="inspector-section"><div class="section-label">试玩行为</div><p class="muted-caption">左键掷出 1～6 的随机点数，右键将点数恢复为 0。</p></div>` : ''}
    ${o.type === 'counter' ? `<div class="inspector-section"><div class="section-label">右键行为</div><div class="field"><label>操作</label><select data-object-field="counterRightClickAction"><option value="set" ${o.counterRightClickAction === 'set' ? 'selected' : ''}>设为指定数值</option><option value="increase" ${o.counterRightClickAction === 'increase' ? 'selected' : ''}>增加指定数值</option><option value="decrease" ${o.counterRightClickAction === 'decrease' ? 'selected' : ''}>减少指定数值</option></select></div><div class="field"><label>数值</label><input type="number" step="1" data-object-field="counterRightClickValue" value="${normalizeCounterRuleValue(o.counterRightClickValue, o.counterRightClickAction)}"></div><p class="muted-caption">试玩时左键固定 +1，右键${counterActionLabel(o.counterRightClickAction)} ${normalizeCounterRuleValue(o.counterRightClickValue, o.counterRightClickAction)}。</p></div>` : ''}
    ${o.type === 'programmable-zone' ? renderProgramEditor(o) : ''}`;
}
function bindBoardEvents() {
  $$('.object-card').forEach((el) => el.addEventListener('click', () => addBoardObject(el.dataset.addObject)));
  $$('[data-select-object]').forEach((el) => el.addEventListener('click', () => { state.selectedObjectId = el.dataset.selectObject; renderBoard(); }));
  $$('[data-delete-object]').forEach((el) => el.addEventListener('click', () => { mutate(() => { currentBoard().objects = currentBoard().objects.filter(o => o.id !== el.dataset.deleteObject); delete state.playtest.objectValues[el.dataset.deleteObject]; state.selectedObjectId = currentBoard().objects[0]?.id; }); renderBoard(); toast('已删除版图对象', 'success'); }));
  const canvas = $('#boardCanvas');
  $$('[data-board-object]', canvas).forEach((el) => {
    el.addEventListener('mousedown', (event) => {
      const object = currentBoard().objects.find(o => o.id === el.dataset.boardObject); if (!object || object.locked) return;
      event.preventDefault(); state.selectedObjectId = object.id; renderBoard();
      const rect = canvas.getBoundingClientRect(); const startX = event.clientX; const startY = event.clientY; const ox = object.x; const oy = object.y;
      const move = (e) => { object.x = Math.max(0, Math.min(900, ox + e.clientX - startX)); object.y = Math.max(0, Math.min(580, oy + e.clientY - startY)); renderBoard(); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); saveState(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
    el.addEventListener('dblclick', () => { const object = currentBoard().objects.find(o => o.id === el.dataset.boardObject); const name = prompt('对象名称', object.name); if (name?.trim()) { mutate(() => object.name = name.trim()); renderBoard(); } });
  });
  $$('#boardPage [data-object-field]').forEach((el) => el.addEventListener('change', () => { const o = currentBoard().objects.find(x => x.id === state.selectedObjectId); if (!o) return; mutate(() => { const key = el.dataset.objectField; if (['x','y','width','height'].includes(key)) o[key] = Number(el.value); else if (key === 'counterRightClickAction') { o[key] = normalizeCounterAction(el.value); o.counterRightClickValue = normalizeCounterRuleValue(o.counterRightClickValue, o[key]); } else if (key === 'counterRightClickValue') o[key] = normalizeCounterRuleValue(el.value, o.counterRightClickAction); else o[key] = el.value; }); renderBoard(); }));
  $$('#boardPage [data-toggle-field]').forEach((el) => el.addEventListener('click', () => { const o = currentBoard().objects.find(x => x.id === state.selectedObjectId); mutate(() => o[el.dataset.toggleField] = !o[el.dataset.toggleField]); renderBoard(); }));
  $$('#boardPage [data-program-add]').forEach((el) => el.addEventListener('click', () => {
    const object = currentBoard().objects.find(item => item.id === state.selectedObjectId); if (!object) return;
    mutate(() => { const list = findProgramList(object.program?.blocks || [], el.dataset.programParent || ''); if (!list) return; list.push(createProgramBlock(el.dataset.programAdd)); object.program = normalizeProgram(object.program); });
    renderBoard();
  }));
  $$('#boardPage [data-program-remove]').forEach((el) => el.addEventListener('click', () => {
    const object = currentBoard().objects.find(item => item.id === state.selectedObjectId); if (!object) return;
    mutate(() => removeProgramBlock(object.program?.blocks || [], el.dataset.programRemove)); renderBoard();
  }));
  $$('#boardPage [data-program-move]').forEach((el) => el.addEventListener('click', () => {
    const object = currentBoard().objects.find(item => item.id === state.selectedObjectId); if (!object) return;
    mutate(() => moveProgramBlock(object.program?.blocks || [], el.dataset.programBlock, el.dataset.programMove === 'up' ? -1 : 1)); renderBoard();
  }));
  $$('#boardPage [data-program-field]').forEach((el) => el.addEventListener('change', () => {
    const object = currentBoard().objects.find(item => item.id === state.selectedObjectId); const block = findProgramBlock(object?.program?.blocks || [], el.dataset.programBlock); if (!block) return;
    mutate(() => { const key = el.dataset.programField; block[key] = ['count', 'max'].includes(key) ? Math.max(1, Math.floor(Number(el.value) || 1)) : el.value; }); renderBoard();
  }));
  $('#gridTool')?.addEventListener('click', (e) => { $('#boardCanvasWrap').classList.toggle('no-grid'); e.currentTarget.classList.toggle('active'); });
  $('#fitTool')?.addEventListener('click', () => toast('画布已适应窗口', 'success'));
}
function addBoardObject(type) {
  const names = { 'card-slot': '新卡牌放置格', 'card-zone': '新卡牌区域', 'deck-zone': '新卡组牌堆', stack: '新卡堆', 'programmable-zone': '新可编程区域', dice: '新骰子', counter: '新计数器' };
  mutate(() => { const dimensions = defaultObjectDimensions(type); const object = { id: uid('obj'), type, name: names[type], x: 170 + currentBoard().objects.length * 22, y: 150 + currentBoard().objects.length * 22, width: dimensions.width, height: dimensions.height, color: objectColor(type), showName: true }; if (type === 'deck-zone') { object.deckId = state.decks[0]?.id; object.showCount = true; object.drawTarget = '玩家手牌'; } if (type === 'programmable-zone') object.program = normalizeProgram(); if (type === 'counter') { object.counterRightClickAction = 'decrease'; object.counterRightClickValue = 1; } currentBoard().objects.push(object); state.selectedObjectId = object.id; }); renderBoard(); toast(`${names[type]}已添加`, 'success');
}

function renderCards() {
  const active = currentCard();
  $('#cardsPage').innerHTML = `<div class="cards-layout"><aside class="card-panel list-panel"><div class="panel-heading"><span class="panel-title">单卡库</span><span class="panel-hint">${state.cards.length} 张</span></div><div class="list-actions"><button class="primary-button" id="newCardButton">＋ 新建</button><button class="ghost-button" id="importCardsButton">导入表格</button></div><div class="search-wrap"><input class="search-input" id="cardSearch" placeholder="搜索卡名、标签" /></div><div class="card-list">${state.cards.length ? state.cards.map(c => `<div class="card-list-item ${c.id === state.activeCardId ? 'selected' : ''}" data-select-card="${c.id}"><span class="mini-card ${c.color || ''}">${esc(c.art || '✦')}</span><span class="card-item-text"><span class="card-item-name">${esc(c.name)}</span><span class="card-item-tag">${esc(c.tag || '未分类')} · ${esc(c.rarity || '普通')}</span></span></div>`).join('') : '<div class="list-empty">还没有单卡<br>创建第一张卡牌，或导入表格批量创建。</div>'}</div></aside><section class="card-panel card-editor"><div class="editor-form">${active ? renderCardForm(active) : '<div class="inspector-empty">选择或新建一张卡牌</div>'}</div>${active ? renderCardPreview(active) : ''}</section><aside class="card-panel editor-side">${active ? renderCardMeta(active) : '<div class="inspector-empty">卡牌属性会显示在这里</div>'}</aside></div>`;
  bindCardEvents();
}
function renderCardForm(c) {
  const effectHTML = sanitizeCardEffectHTML(c.effect || '');
  return `<div class="editor-title-row"><div><div class="editor-kicker">CARD / ${esc(c.number || 'NEW')}</div><div class="editor-title">编辑单卡</div></div><button class="danger-button" id="deleteCardButton">删除</button></div><div class="field"><label>卡名</label><input id="cardNameInput" value="${esc(c.name)}" placeholder="例如：余烬火花"></div><div class="field"><label>卡牌效果</label><div class="rich-toolbar" role="toolbar" aria-label="卡牌效果格式"><button type="button" class="rich-tool" data-command="bold" title="粗体"><strong>B</strong></button><button type="button" class="rich-tool" data-command="italic" title="斜体"><em>I</em></button><button type="button" class="rich-tool" data-command="underline" title="下划线"><u>U</u></button><span class="rich-toolbar-divider"></span>${renderRichColorControl('foreColor', '文字颜色')}${renderRichColorControl('hiliteColor', '高光颜色')}<span class="rich-toolbar-divider"></span><button type="button" class="rich-tool" data-command="justifyLeft" title="左对齐">≡</button><button type="button" class="rich-tool" data-command="justifyCenter" title="居中">≡</button><button type="button" class="rich-tool" data-command="insertUnorderedList" title="项目列表">☷</button><button type="button" class="rich-tool" data-command="insertOrderedList" title="编号列表">1.</button><button type="button" class="rich-tool" data-command="removeFormat" title="清除格式">清</button></div><div class="rich-editor" id="cardEffectEditor" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="输入卡牌效果……">${effectHTML}</div><div class="editor-note">支持从飞书粘贴富文本；文字颜色和高光均可添加、更换或单独取消。</div></div>`;
}
function renderRichColorControl(command, label) {
  const isHighlight = command === 'hiliteColor';
  const initialColor = isHighlight ? '#fff1a8' : '#f2f4f4';
  const clearLabel = isHighlight ? '无高光' : '自动颜色';
  return `<div class="rich-color-control" data-color-control="${command}"><button type="button" class="rich-tool rich-color-trigger" data-color-trigger="${command}" title="${label}" aria-label="${label}" aria-haspopup="true" aria-expanded="false"><span class="rich-color-glyph ${isHighlight ? 'is-highlight' : ''}">A</span><span class="rich-color-indicator" data-color-indicator style="--rich-tool-color:${initialColor}"></span><span class="rich-color-chevron">⌄</span></button><div class="rich-color-popover" data-color-popover="${command}" role="dialog" aria-label="选择${label}" hidden><div class="rich-color-popover-title">${label}</div><button type="button" class="rich-color-clear" data-color-clear="${command}"><span class="rich-color-none" aria-hidden="true"></span>${clearLabel}</button><div class="rich-color-grid">${CARD_EFFECT_COLOR_PRESETS[command].map(color => `<button type="button" class="rich-color-swatch" data-color-command="${command}" data-color-value="${color}" style="--swatch-color:${color}" title="${color}" aria-label="${label} ${color}"></button>`).join('')}</div><label class="rich-custom-color"><span>自定义颜色</span><span class="rich-custom-color-value" data-custom-color-value>${initialColor.toUpperCase()}</span><input type="color" data-custom-color="${command}" value="${initialColor}" aria-label="自定义${label}"></label></div></div>`;
}
function renderCardPreview(c) {
  const scale = Math.max(.72, Math.min(1.22, Number(c.width || 63) / 63));
  const templateClass = c.template === '简约 · 象牙' ? 'ivory' : c.template === '事件 · 午夜' ? 'midnight' : '';
  const effectHTML = sanitizeCardEffectHTML(c.effect || '');
  return `<div class="card-preview-wrap"><div class="preview-label">LIVE PREVIEW · 正面</div><div class="playing-card ${templateClass}" style="--card-scale:${scale}"><div class="playing-card-inner"><div class="card-rarity">${esc(c.rarity || '普通')} · ${esc(c.tag || '未分类')}</div><div class="card-title" id="previewName">${esc(c.name || '未命名卡牌')}</div><div class="card-art">${esc(c.art || '✦')}</div><div class="card-effect" id="previewEffect">${effectHTML || '<span style="color:#7a8585">卡牌效果将显示在这里</span>'}</div><div class="card-footer"><span>${esc(c.number || 'C-000')}</span><span>${esc(state.project?.name || 'CardFoundry')}</span></div></div></div></div>`;
}
function renderCardMeta(c) {
  const tagOptions = state.tags.map(tag => `<option value="${esc(tag)}" ${c.tag === tag ? 'selected' : ''}>${esc(tag)}</option>`).join('');
  return `<div class="panel-heading"><span class="panel-title">卡片属性</span><span class="panel-hint">自动保存</span></div><div class="inspector-section"><div class="section-label">模板与样式</div><div class="field"><label>卡牌模板</label><select id="cardTemplate"><option ${c.template === '默认 · 晨雾' || !c.template ? 'selected' : ''}>默认 · 晨雾</option><option ${c.template === '简约 · 象牙' ? 'selected' : ''}>简约 · 象牙</option><option ${c.template === '事件 · 午夜' ? 'selected' : ''}>事件 · 午夜</option></select></div><div class="field-row"><div class="field"><label>宽度</label><input id="cardWidthInput" value="${Number(c.width || 63)}" type="number" min="20"></div><div class="field"><label>高度</label><input id="cardHeightInput" value="${Number(c.height || 88)}" type="number" min="20"></div></div><div class="field"><label>插图符号</label><input id="cardArtInput" value="${esc(c.art || '✦')}"></div></div><div class="inspector-section"><div class="section-label">元数据</div><div class="field"><label>标签</label><div class="tag-select-row"><select id="cardTagInput"><option value="">未设置标签</option>${tagOptions}<option value="__new__">＋ 新建标签</option></select><button class="ghost-button" id="manageTagsButton" title="管理标签">管理</button></div><div class="editor-note">标签需要先加入标签库，再分配给卡牌。</div></div><div class="field"><label>稀有度</label><select id="cardRarityInput"><option ${c.rarity === '普通' ? 'selected' : ''}>普通</option><option ${c.rarity === '稀有' ? 'selected' : ''}>稀有</option><option ${c.rarity === '起始' ? 'selected' : ''}>起始</option><option ${c.rarity === '传奇' ? 'selected' : ''}>传奇</option></select></div><div class="field"><label>卡牌编号</label><input id="cardNumberInput" value="${esc(c.number || '')}"></div></div>`;
}
function bindCardEvents() {
  $('#newCardButton')?.addEventListener('click', newCard);
  $('#importCardsButton')?.addEventListener('click', () => $('#cardImportInput').click());
  $$('[data-select-card]').forEach(el => el.addEventListener('click', () => { state.activeCardId = el.dataset.selectCard; renderCards(); }));
  $('#cardSearch')?.addEventListener('input', (e) => $$('.card-list-item').forEach(el => { el.hidden = !el.textContent.toLowerCase().includes(e.target.value.toLowerCase()); }));
  $('#deleteCardButton')?.addEventListener('click', () => { if (!confirm('确定删除这张单卡？卡组中的引用将保留为缺失项。')) return; mutate(() => { state.cards = state.cards.filter(c => c.id !== state.activeCardId); state.activeCardId = state.cards[0]?.id; }); renderAll(); toast('单卡已删除', 'success'); });
  $('#cardNameInput')?.addEventListener('input', e => { const c = currentCard(); c.name = e.target.value; $('#previewName').textContent = c.name || '未命名卡牌'; saveState(); });
  const effectEditor = $('#cardEffectEditor');
  const syncEffect = () => {
    if (!effectEditor) return;
    const c = currentCard(); c.effect = sanitizeCardEffectHTML(effectEditor.innerHTML);
    const preview = $('#previewEffect'); if (preview) preview.innerHTML = c.effect || '<span style="color:#7a8585">卡牌效果将显示在这里</span>';
    saveState();
  };
  effectEditor?.addEventListener('input', syncEffect);
  effectEditor?.addEventListener('keyup', rememberCardEffectSelection);
  effectEditor?.addEventListener('mouseup', rememberCardEffectSelection);
  effectEditor?.addEventListener('focus', rememberCardEffectSelection);
  effectEditor?.addEventListener('paste', event => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    insertRichHTML(effectEditor, clipboard.getData('text/html'), clipboard.getData('text/plain'));
    syncEffect();
  });
  $$('.rich-toolbar [data-command]').forEach(el => el.addEventListener('mousedown', event => {
    event.preventDefault();
    if (!effectEditor) return;
    const selection = window.getSelection();
    if (selection?.rangeCount && effectEditor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      cardEffectSelection = selection.getRangeAt(0).cloneRange();
    }
    restoreCardEffectSelection(effectEditor);
    const command = el.dataset.command;
    const value = el.dataset.value || null;
    executeCardEffectCommand(command, value);
    effectEditor.focus();
    rememberCardEffectSelection();
    syncEffect();
    updateRichToolbarState(effectEditor);
  }));
  bindRichColorControls(effectEditor, syncEffect);
  effectEditor?.addEventListener('keyup', () => updateRichToolbarState(effectEditor));
  effectEditor?.addEventListener('mouseup', () => updateRichToolbarState(effectEditor));
  effectEditor?.addEventListener('input', () => updateRichToolbarState(effectEditor));
  updateRichToolbarState(effectEditor);
  [['cardArtInput','art'],['cardNumberInput','number'],['cardRarityInput','rarity'],['cardTemplate','template']].forEach(([id,key]) => $(`#${id}`)?.addEventListener('change', e => { currentCard()[key] = e.target.value; saveState(); renderCards(); }));
  [['cardWidthInput','width'],['cardHeightInput','height']].forEach(([id,key]) => $(`#${id}`)?.addEventListener('change', e => { currentCard()[key] = Math.max(20, Number(e.target.value) || (key === 'width' ? 63 : 88)); saveState(); renderCards(); }));
  $('#cardTagInput')?.addEventListener('change', e => {
    if (e.target.value === '__new__') { openTagManager(true); return; }
    currentCard().tag = e.target.value;
    saveState(); renderCards();
  });
  $('#manageTagsButton')?.addEventListener('click', () => openTagManager(false));
}
function executeCardEffectCommand(command, value = null) {
  try { document.execCommand('styleWithCSS', false, true); } catch { /* unsupported command */ }
  let applied = false;
  try { applied = document.execCommand(command, false, value); } catch { /* unsupported command */ }
  if (!applied && command === 'hiliteColor') {
    try { document.execCommand('backColor', false, value); } catch { /* unsupported fallback */ }
  }
}
function bindRichColorControls(editor, syncEffect) {
  if (!editor) return;
  const toolbar = editor.parentElement?.querySelector('.rich-toolbar');
  $$('[data-color-trigger]', toolbar).forEach(trigger => trigger.addEventListener('mousedown', event => {
    event.preventDefault(); rememberCardEffectSelection();
    const command = trigger.dataset.colorTrigger;
    const popover = toolbar.querySelector(`[data-color-popover="${command}"]`);
    const shouldOpen = popover?.hidden;
    closeRichColorPopovers(shouldOpen ? command : '');
    if (popover) popover.hidden = !shouldOpen;
  }));
  const applyColor = (command, color = '') => {
    restoreCardEffectSelection(editor);
    if (color) executeCardEffectCommand(command, color);
    else clearCardEffectColor(editor, command);
    editor.focus(); rememberCardEffectSelection(); syncEffect(); updateRichToolbarState(editor); closeRichColorPopovers();
  };
  $$('[data-color-command]', toolbar).forEach(swatch => swatch.addEventListener('mousedown', event => {
    event.preventDefault(); applyColor(swatch.dataset.colorCommand, swatch.dataset.colorValue);
  }));
  $$('[data-color-clear]', toolbar).forEach(button => button.addEventListener('mousedown', event => {
    event.preventDefault(); applyColor(button.dataset.colorClear);
  }));
  $$('[data-custom-color]', toolbar).forEach(input => {
    input.addEventListener('mousedown', rememberCardEffectSelection);
    input.addEventListener('input', () => {
      const label = input.closest('.rich-custom-color')?.querySelector('[data-custom-color-value]');
      if (label) label.textContent = input.value.toUpperCase();
    });
    input.addEventListener('change', () => applyColor(input.dataset.customColor, input.value));
  });
  toolbar.addEventListener('keydown', event => { if (event.key === 'Escape') { closeRichColorPopovers(); editor.focus(); } });
}
function closeRichColorPopovers(except = '') {
  $$('[data-color-popover]').forEach(popover => { if (popover.dataset.colorPopover !== except) popover.hidden = true; });
  $$('[data-color-trigger]').forEach(trigger => trigger.setAttribute('aria-expanded', trigger.dataset.colorTrigger === except ? 'true' : 'false'));
}
function normalizedCSSColor(value, property = 'color') {
  if (!value) return '';
  const probe = document.createElement('span'); probe.style[property] = value;
  return probe.style[property].replace(/\s+/g, '').toLowerCase();
}
function clearCardEffectColor(editor, command) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  if (range.collapsed) {
    const otherCommand = command === 'foreColor' ? 'hiliteColor' : 'foreColor';
    const otherColor = getCardEffectSelectionColor(editor, otherCommand);
    const retainedStates = ['bold', 'italic', 'underline', 'strikeThrough'].filter(name => {
      try { return document.queryCommandState(name); } catch { return false; }
    });
    const marker = document.createElement('span'); marker.dataset.richBoundary = 'caret';
    range.insertNode(marker); liftColorBoundary(marker, editor, command);
    const caretRange = document.createRange(); caretRange.setStartAfter(marker); caretRange.collapse(true);
    selection.removeAllRanges(); selection.addRange(caretRange); marker.remove();
    retainedStates.forEach(name => {
      try { if (!document.queryCommandState(name)) executeCardEffectCommand(name); } catch { /* browser command state unavailable */ }
    });
    if (otherColor) executeCardEffectCommand(otherCommand, otherColor);
    return;
  }
  const startMarker = document.createElement('span');
  const endMarker = document.createElement('span');
  startMarker.dataset.richBoundary = 'start'; endMarker.dataset.richBoundary = 'end';
  const endRange = range.cloneRange(); endRange.collapse(false); endRange.insertNode(endMarker);
  const startRange = range.cloneRange(); startRange.collapse(true); startRange.insertNode(startMarker);
  liftColorBoundary(startMarker, editor, command);
  liftColorBoundary(endMarker, editor, command);
  const selectedRange = document.createRange(); selectedRange.setStartAfter(startMarker); selectedRange.setEndBefore(endMarker);
  $$('*', editor).forEach(element => {
    if (element === startMarker || element === endMarker || !selectedRange.intersectsNode(element)) return;
    removeCardEffectColorProperty(element, command);
  });
  const restoredRange = document.createRange(); restoredRange.setStartAfter(startMarker); restoredRange.setEndBefore(endMarker);
  selection.removeAllRanges(); selection.addRange(restoredRange);
  endMarker.remove(); startMarker.remove();
}
function liftColorBoundary(marker, editor, command) {
  let formattedAncestor = closestCardEffectColorAncestor(marker.parentElement, editor, command);
  while (formattedAncestor) {
    while (marker.parentElement !== formattedAncestor) splitElementAtMarker(marker, marker.parentElement);
    splitElementAtMarker(marker, formattedAncestor);
    formattedAncestor = closestCardEffectColorAncestor(marker.parentElement, editor, command);
  }
}
function splitElementAtMarker(marker, element) {
  if (!element || !element.parentNode || marker.parentElement !== element) return;
  const parent = element.parentNode;
  const right = element.cloneNode(false);
  while (marker.nextSibling) right.appendChild(marker.nextSibling);
  parent.insertBefore(marker, element.nextSibling);
  if (right.childNodes.length) parent.insertBefore(right, marker.nextSibling);
  if (!element.childNodes.length) element.remove();
}
function closestCardEffectColorAncestor(node, editor, command) {
  while (node && node !== editor) {
    if (hasCardEffectColorProperty(node, command)) return node;
    node = node.parentElement;
  }
  return null;
}
function hasCardEffectColorProperty(element, command) {
  if (!element?.style) return false;
  if (command === 'foreColor') return Boolean(element.style.color || (element.tagName === 'FONT' && element.getAttribute('color')));
  return Boolean(element.style.backgroundColor || element.getAttribute('bgcolor'));
}
function removeCardEffectColorProperty(element, command) {
  if (command === 'foreColor') { element.style.color = ''; element.removeAttribute('color'); }
  else { element.style.backgroundColor = ''; element.removeAttribute('bgcolor'); }
  if (!element.getAttribute('style')) element.removeAttribute('style');
}
function rememberCardEffectSelection() {
  const editor = $('#cardEffectEditor'); const selection = window.getSelection();
  if (!editor || !selection?.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
  cardEffectSelection = selection.getRangeAt(0).cloneRange();
}
function restoreCardEffectSelection(editor) {
  const selection = window.getSelection();
  if (!selection || !cardEffectSelection || !editor.contains(cardEffectSelection.commonAncestorContainer)) return;
  selection.removeAllRanges(); selection.addRange(cardEffectSelection);
}
function updateRichToolbarState(editor) {
  if (!editor) return;
  $$('.rich-toolbar [data-command]', editor.parentElement).forEach(button => {
    let active = false;
    try { active = ['bold', 'italic', 'underline', 'justifyLeft', 'justifyCenter', 'insertUnorderedList', 'insertOrderedList'].includes(button.dataset.command) && document.queryCommandState(button.dataset.command); } catch { /* browser command state unavailable */ }
    button.classList.toggle('active', active);
  });
  ['foreColor', 'hiliteColor'].forEach(command => {
    const control = editor.parentElement?.querySelector(`[data-color-control="${command}"]`);
    if (!control) return;
    const value = getCardEffectSelectionColor(editor, command);
    const hasColor = value && value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)';
    const indicator = control.querySelector('[data-color-indicator]');
    if (indicator) { indicator.style.setProperty('--rich-tool-color', hasColor ? value : 'transparent'); indicator.classList.toggle('empty', !hasColor); }
    control.querySelector('[data-color-trigger]')?.classList.toggle('active', Boolean(hasColor));
    $$('[data-color-value]', control).forEach(swatch => swatch.classList.toggle('selected', hasColor && normalizedCSSColor(swatch.dataset.colorValue, command === 'foreColor' ? 'color' : 'backgroundColor') === normalizedCSSColor(value, command === 'foreColor' ? 'color' : 'backgroundColor')));
  });
}
function getCardEffectSelectionColor(editor, command) {
  const selection = window.getSelection();
  let node = selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
    ? selection.getRangeAt(0).startContainer
    : cardEffectSelection?.startContainer;
  if (!node || !editor.contains(node)) return '';
  if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
  const property = command === 'foreColor' ? 'color' : 'backgroundColor';
  while (node && node !== editor) {
    if (node.style?.[property]) return node.style[property];
    if (command === 'foreColor' && node.tagName === 'FONT' && node.getAttribute('color')) return node.getAttribute('color');
    if (command === 'hiliteColor' && node.getAttribute?.('bgcolor')) return node.getAttribute('bgcolor');
    node = node.parentElement;
  }
  return '';
}
function newCard() { mutate(() => { const c = { id: uid('card'), name: '未命名卡牌', effect: '', tag: '', rarity: '普通', number: `C-${String(state.cards.length + 1).padStart(3, '0')}`, art: '✦', color: 'blue', template: '默认 · 晨雾', width: 63, height: 88 }; state.cards.push(c); state.activeCardId = c.id; }); renderAll(); toast('已创建新单卡，请为它选择标签', 'success'); }

function openTagManager(selectAfterCreate = false) {
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="modal-close" id="closeModal">×</button><h3>管理标签</h3><p>先在这里创建标签，之后即可在单卡属性的下拉菜单中选择。</p><div class="tag-manager-list">${state.tags.length ? state.tags.map(tag => `<div class="tag-manager-item"><span>${esc(tag)}</span><button class="danger-button" data-remove-tag="${esc(tag)}">删除</button></div>`).join('') : '<div class="list-empty">还没有标签，请创建第一个标签。</div>'}</div><div class="field"><label>新标签名称</label><input id="newTagInput" maxlength="30" placeholder="例如：地点、敌人、任务"></div><div class="modal-actions"><button class="ghost-button" id="cancelModal">关闭</button><button class="primary-button" id="createTagButton">添加标签</button></div></div></div>`;
  $('#closeModal').onclick = () => { closeModal(); renderCards(); }; $('#cancelModal').onclick = () => { closeModal(); renderCards(); };
  $('#createTagButton').onclick = () => {
    const input = $('#newTagInput'); const tag = input.value.trim();
    if (!tag) return toast('请输入标签名称');
    if (state.tags.includes(tag)) return toast('标签已存在');
    mutate(() => state.tags.push(tag));
    if (selectAfterCreate) currentCard().tag = tag;
    closeModal(); renderCards(); toast(`标签「${tag}」已添加`, 'success');
  };
  $$('[data-remove-tag]').forEach(button => button.addEventListener('click', () => {
    const tag = button.dataset.removeTag;
    const used = state.cards.some(card => card.tag === tag);
    if (used) return toast('该标签仍被卡牌使用，暂时不能删除');
    mutate(() => { state.tags = state.tags.filter(item => item !== tag); });
    openTagManager(selectAfterCreate);
  }));
  $('#newTagInput').focus();
}

function renderDecks() {
  const d = currentDeck();
  const total = d ? d.entries.reduce((sum, e) => sum + Number(e.count || 0), 0) : 0;
  $('#decksPage').innerHTML = `<div class="decks-layout"><aside class="card-panel list-panel"><div class="panel-heading"><span class="panel-title">卡组库</span><span class="panel-hint">${state.decks.length} 组</span></div><div class="list-actions"><button class="primary-button" id="newDeckButton">＋ 新建</button><button class="ghost-button" id="importDeckButton">导入 XLSX</button></div><div class="search-wrap"><input class="search-input" id="deckSearch" placeholder="搜索卡组" /></div><div class="card-list">${state.decks.map(deck => `<div class="card-list-item ${deck.id === state.activeDeckId ? 'selected' : ''}" data-select-deck="${deck.id}"><span class="mini-card purple">▥</span><span class="card-item-text"><span class="card-item-name">${esc(deck.name)}</span><span class="card-item-tag">${deck.entries.length} 种 · ${deck.entries.reduce((s,e)=>s+Number(e.count||0),0)} 张</span></span></div>`).join('')}</div></aside><section class="card-panel deck-editor">${d ? `<div class="deck-header"><div><div class="editor-kicker">DECK / ${esc(d.id.slice(-5).toUpperCase())}</div><div class="deck-title">${esc(d.name)}</div><div class="deck-description">${esc(d.description || '为你的牌组写下一句说明。')}</div></div><div class="stat-row"><div class="stat-card"><span class="stat-value">${d.entries.length}</span><span class="stat-label">卡牌种类</span></div><div class="stat-card"><span class="stat-value">${total}</span><span class="stat-label">卡牌总数</span></div></div></div><div class="field-row"><div class="field"><label>卡组名称</label><input id="deckNameInput" value="${esc(d.name)}"></div><div class="field"><label>描述</label><input id="deckDescriptionInput" value="${esc(d.description || '')}"></div></div><div class="add-card-row"><span class="section-caption">卡组成员 · 拖拽或添加单卡</span><button class="ghost-button" id="addDeckCardButton">＋ 添加单卡</button></div><div class="table-wrap"><table class="data-table deck-card-table"><thead><tr><th>卡牌</th><th>标签</th><th>数量</th><th>操作</th></tr></thead><tbody>${d.entries.map((entry, index) => { const c = cardById(entry.cardId); const count = normalizeDeckQuantity(entry.count); const cardName = c?.name || '缺失单卡'; return `<tr><td><strong>${esc(cardName)}</strong></td><td>${esc(c?.tag || '待处理')}</td><td>${renderQuantityStepper({ value: count, inputData: `data-deck-qty="${index}"`, stepData: `data-deck-qty-step="${index}"`, label: `${cardName}的数量` })}</td><td><div class="table-actions"><button data-edit-deck-card="${entry.cardId}">编辑</button><button data-remove-deck-card="${index}">移除</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="inspector-empty">还没有卡组<br>创建一个卡组开始吧</div>'}</section></div>`;
  bindDeckEvents();
}
function normalizeDeckQuantity(value, minimum = 0) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? Math.max(minimum, Math.floor(quantity)) : minimum;
}
function renderQuantityStepper({ value, inputData = '', stepData = '', label = '数量', minimum = 0 }) {
  const count = normalizeDeckQuantity(value, minimum);
  return `<div class="quantity-stepper" role="group" aria-label="${esc(label)}"><button type="button" class="quantity-step-button" ${stepData} data-quantity-delta="-1" title="减少数量" aria-label="减少${esc(label)}" ${count <= minimum ? 'disabled' : ''}>−</button><input class="quantity-step-input" ${inputData} value="${count}" type="number" min="${minimum}" step="1" inputmode="numeric" aria-label="${esc(label)}"><button type="button" class="quantity-step-button" ${stepData} data-quantity-delta="1" title="增加数量" aria-label="增加${esc(label)}">＋</button></div>`;
}
function bindDeckEvents() {
  $('#newDeckButton')?.addEventListener('click', () => { mutate(() => { const d = { id: uid('deck'), name: '新卡组', description: '', entries: [] }; state.decks.push(d); state.activeDeckId = d.id; }); renderAll(); setDesignTab('decks'); toast('已创建新卡组', 'success'); });
  $('#importDeckButton')?.addEventListener('click', () => $('#deckImportInput').click());
  $$('[data-select-deck]').forEach(el => el.addEventListener('click', () => { state.activeDeckId = el.dataset.selectDeck; renderDecks(); }));
  $('#deckNameInput')?.addEventListener('input', e => { currentDeck().name = e.target.value; saveState(); });
  $('#deckDescriptionInput')?.addEventListener('input', e => { currentDeck().description = e.target.value; saveState(); });
  $$('[data-deck-qty]').forEach(el => {
    el.addEventListener('change', e => { mutate(() => currentDeck().entries[Number(el.dataset.deckQty)].count = normalizeDeckQuantity(e.target.value)); renderDecks(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } });
  });
  $$('[data-deck-qty-step]').forEach(el => el.addEventListener('click', () => {
    const index = Number(el.dataset.deckQtyStep); const entry = currentDeck().entries[index]; if (!entry) return;
    mutate(() => { entry.count = normalizeDeckQuantity(Number(entry.count) + Number(el.dataset.quantityDelta)); }); renderDecks();
  }));
  $$('[data-remove-deck-card]').forEach(el => el.addEventListener('click', () => { mutate(() => currentDeck().entries.splice(Number(el.dataset.removeDeckCard), 1)); renderDecks(); }));
  $$('[data-edit-deck-card]').forEach(el => el.addEventListener('click', () => { state.activeCardId = el.dataset.editDeckCard; setDesignTab('cards'); }));
  $('#addDeckCardButton')?.addEventListener('click', openAddCardModal);
}
function openAddCardModal() {
  const d = currentDeck();
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="modal-close" id="closeModal">×</button><h3>添加单卡到「${esc(d.name)}」</h3><p>选择已有单卡并设置加入数量。</p><div class="field"><label>单卡</label><select id="modalCardSelect">${state.cards.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.tag || '未分类')}</option>`).join('')}</select></div><div class="field modal-quantity-field"><label>加入数量</label>${renderQuantityStepper({ value: 1, inputData: 'id="modalCardCount"', stepData: 'data-modal-qty-step', label: '加入卡牌的数量', minimum: 1 })}</div><div class="modal-actions"><button class="ghost-button" id="cancelModal">取消</button><button class="primary-button" id="confirmAddCard">添加到卡组</button></div></div></div>`;
  $('#closeModal').onclick = closeModal; $('#cancelModal').onclick = closeModal; $('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  $$('[data-modal-qty-step]').forEach(button => button.addEventListener('click', () => {
    const input = $('#modalCardCount'); input.value = normalizeDeckQuantity(Number(input.value) + Number(button.dataset.quantityDelta), 1); updateQuantityStepperButtons(input.closest('.quantity-stepper'), 1);
  }));
  $('#modalCardCount').addEventListener('input', event => updateQuantityStepperButtons(event.currentTarget.closest('.quantity-stepper'), 1));
  $('#modalCardCount').addEventListener('change', event => { event.currentTarget.value = normalizeDeckQuantity(event.currentTarget.value, 1); updateQuantityStepperButtons(event.currentTarget.closest('.quantity-stepper'), 1); });
  $('#confirmAddCard').onclick = () => { const id = $('#modalCardSelect').value; const count = normalizeDeckQuantity($('#modalCardCount').value, 1); mutate(() => { const found = d.entries.find(e => e.cardId === id); if (found) found.count = normalizeDeckQuantity(found.count) + count; else d.entries.push({ cardId: id, count }); }); closeModal(); renderDecks(); toast('已添加到卡组', 'success'); };
}
function updateQuantityStepperButtons(stepper, minimum = 0) {
  if (!stepper) return;
  const input = stepper.querySelector('.quantity-step-input');
  const decrease = stepper.querySelector('[data-quantity-delta="-1"]');
  if (decrease) decrease.disabled = normalizeDeckQuantity(input?.value, minimum) <= minimum;
}
function closeModal() { $('#modalRoot').innerHTML = ''; }

function apiModelsEndpoint(endpoint) {
  const value = String(endpoint || '').trim().replace(/\/+$/, '');
  return value.endsWith('/chat/completions') ? value.slice(0, -'/chat/completions'.length) : value;
}

async function requestAIModels(endpoint, apiKey) {
  const base = apiModelsEndpoint(endpoint);
  if (!base) throw new Error('请先填写 API Base URL');
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const response = await fetch(`${base}/models`, { method: 'GET', headers });
  if (!response.ok) throw new Error(`模型列表请求失败：${response.status}`);
  const payload = await response.json();
  const models = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : payload.models);
  return (Array.isArray(models) ? models : []).map(item => typeof item === 'string' ? item : item?.id).filter(Boolean);
}

function openSetupWizard(force = false) {
  if (!force && (hasAIConfiguration() || aiSettings.dismissed)) return;
  let step = 1;
  const renderStep = () => {
    const root = $('#modalRoot');
    const steps = `<div class="setup-steps"><span class="setup-step ${step >= 1 ? 'active' : ''}"></span><span class="setup-step ${step >= 2 ? 'active' : ''}"></span><span class="setup-step ${step >= 3 ? 'active' : ''}"></span></div>`;
    if (step === 1) root.innerHTML = `<div class="modal-backdrop"><div class="modal setup-modal"><h3>欢迎使用 CardFoundry</h3>${steps}<p>先连接一个 OpenAI 兼容 API，AI 助手就可以通过项目工具编辑版图、单卡、标签和卡组。</p><div class="setup-note">API 配置只保存在当前浏览器。由于纯浏览器应用的限制，密钥仍可能被本机页面脚本读取；生产部署建议通过你自己的后端代理调用模型。</div><div class="modal-actions"><button class="ghost-button" id="setupSkipButton">暂不设置</button><button class="primary-button" id="setupNextButton">开始设置</button></div></div></div>`;
    if (step === 2) root.innerHTML = `<div class="modal-backdrop"><div class="modal setup-modal"><h3>连接兼容 API</h3>${steps}<div class="field"><label>API Base URL</label><input id="setupEndpoint" value="${esc(aiSettings.endpoint || 'https://api.openai.com/v1')}" placeholder="https://api.example.com/v1"></div><div class="field"><label>API Key（本地服务可留空）</label><input id="setupApiKey" type="password" value="${esc(aiSettings.apiKey || '')}" placeholder="sk-..."></div><div class="field"><label>模型名称</label><div class="setup-model-row"><input id="setupModel" list="setupModelOptions" value="${esc(aiSettings.model || 'gpt-4o-mini')}" placeholder="模型 ID"><button type="button" class="ghost-button" id="requestModelsButton">获取模型列表</button></div><datalist id="setupModelOptions"></datalist><div class="setup-model-status" id="setupModelsStatus">填写 API 地址和密钥后，可自动获取模型。</div></div><div class="setup-note">可填写 API Base URL（如 <code>https://api.example.com/v1</code>），也可直接填写完整的 <code>/chat/completions</code> 地址。浏览器将通过 tools/function calling 提供应用编辑能力。</div><div class="modal-actions"><button class="ghost-button" id="setupBackButton">上一步</button><button class="primary-button" id="setupNextButton">继续</button></div></div></div>`;
    if (step === 3) root.innerHTML = `<div class="modal-backdrop"><div class="modal setup-modal"><h3>AI 编辑能力已就绪</h3>${steps}<p>AI 助手将获得以下项目工具。每次工具写入都进入撤销历史，并自动保存。</p><div class="mcp-tool-list">${mcpToolDefinitions.map(tool => `<div class="mcp-tool-item"><span>◇</span>${esc(tool.name)}</div>`).join('')}</div><div class="modal-actions"><button class="ghost-button" id="setupBackButton">上一步</button><button class="primary-button" id="setupFinishButton">完成并打开助手</button></div></div></div>`;
    $('#setupSkipButton')?.addEventListener('click', () => { aiSettings.configured = false; aiSettings.dismissed = true; saveAISettings(); closeModal(); });
    $('#setupBackButton')?.addEventListener('click', () => { step -= 1; renderStep(); });
    $('#requestModelsButton')?.addEventListener('click', async () => {
      const button = $('#requestModelsButton'); const status = $('#setupModelsStatus');
      const endpoint = $('#setupEndpoint').value.trim(); const apiKey = $('#setupApiKey').value.trim();
      if (!endpoint) return toast('请先填写 API 地址');
      button.disabled = true; button.classList.add('is-loading'); status.textContent = '正在获取模型列表…';
      try {
        const models = await requestAIModels(endpoint, apiKey);
        $('#setupModelOptions').innerHTML = models.map(model => `<option value="${esc(model)}"></option>`).join('');
        if (models.length && !models.includes($('#setupModel').value.trim())) $('#setupModel').value = models[0];
        status.textContent = models.length ? `已获取 ${models.length} 个模型，可从输入框选择。` : '服务未返回模型，请手动填写。';
      } catch (error) { status.textContent = error.message; toast(error.message); }
      finally { button.disabled = false; button.classList.remove('is-loading'); }
    });
    $('#setupNextButton')?.addEventListener('click', () => {
      if (step === 2) { aiSettings.endpoint = $('#setupEndpoint').value.trim().replace(/\/$/, ''); aiSettings.apiKey = $('#setupApiKey').value.trim(); aiSettings.model = $('#setupModel').value.trim(); if (!aiSettings.endpoint || !aiSettings.model) return toast('请填写 API 地址和模型名称'); }
      step += 1; renderStep();
    });
    $('#setupFinishButton')?.addEventListener('click', () => { aiSettings.configured = true; aiSettings.dismissed = false; saveAISettings(); closeModal(); toggleAIChat(true); toast('AI 助手已配置', 'success'); });
  };
  renderStep();
}

function toggleAIChat(open) {
  const panel = $('#aiChatPanel'); const shouldOpen = open ?? !panel.classList.contains('open');
  panel.classList.toggle('open', shouldOpen); document.body.classList.toggle('ai-panel-open', shouldOpen);
  if (shouldOpen) setTimeout(() => $('#aiInput')?.focus(), 60);
}

function executeMCPTool(name, args = {}) {
  let result;
  const run = () => {
    if (name === 'get_project_state') result = projectAIContext();
    else if (name === 'list_programmable_zones') { const boards = args.boardId ? [boardById(args.boardId)] : state.boards; if (!boards.length || boards.some(board => !board)) throw new Error('找不到版图'); result = boards.flatMap(board => board.objects.filter(object => object.type === 'programmable-zone').map(zone => ({ id: zone.id, boardId: board.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height, blockCount: normalizeProgram(zone.program).blocks.length, program: normalizeProgram(zone.program) }))); }
    else if (name === 'get_programmable_zone') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); result = { boardId: board.id, ...JSON.parse(JSON.stringify(zone)) }; }
    else if (name === 'create_programmable_zone') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); if (!board) throw new Error('找不到版图'); const object = { id: uid('obj'), type: 'programmable-zone', name: String(args.name || '新可编程区域'), x: Number(args.x ?? 150), y: Number(args.y ?? 150), width: Number(args.width ?? 190), height: Number(args.height ?? 128), color: 'green', showName: true, program: normalizeProgram(args.program) }; board.objects.push(object); state.activeBoardId = board.id; state.selectedObjectId = object.id; result = { boardId: board.id, ...object }; }
    else if (name === 'update_programmable_zone') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); ['name', 'background', 'locked', 'showName'].forEach(key => { if (args[key] !== undefined) zone[key] = key === 'name' ? String(args[key]) : args[key]; }); ['x', 'y', 'width', 'height'].forEach(key => { if (args[key] !== undefined) zone[key] = Number(args[key]); }); if (args.program !== undefined) zone.program = normalizeProgram(args.program); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { boardId: board.id, ...zone }; }
    else if (name === 'delete_programmable_zone') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); board.objects = board.objects.filter(object => object.id !== zone.id); if (state.selectedObjectId === zone.id) state.selectedObjectId = board.objects[0]?.id || ''; result = { boardId: board.id, deleted: zone.id }; }
    else if (name === 'add_program_block') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); const list = findProgramList(zone.program.blocks, args.parentBlockId || ''); if (!list) throw new Error('找不到父级选择框'); const block = programBlockForArgs(args); list.push(block); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { boardId: board.id, zoneId: zone.id, block }; }
    else if (name === 'update_program_block') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); const block = findProgramBlock(zone.program.blocks, args.blockId); if (!block) throw new Error('找不到程序块'); if (args.type !== undefined) block.type = ['draw', 'shuffle', 'select'].includes(args.type) ? args.type : block.type; ['source', 'target', 'selectedTarget', 'unselectedTarget'].forEach(key => { if (args[key] !== undefined) block[key] = String(args[key]); }); ['count', 'max'].forEach(key => { if (args[key] !== undefined) block[key] = Math.max(1, Math.floor(Number(args[key]) || 1)); }); zone.program = normalizeProgram(zone.program); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { boardId: board.id, zoneId: zone.id, block: findProgramBlock(zone.program.blocks, args.blockId) }; }
    else if (name === 'remove_program_block') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); if (!removeProgramBlock(zone.program.blocks, args.blockId)) throw new Error('找不到程序块'); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { removed: args.blockId, zoneId: zone.id }; }
    else if (name === 'move_program_block') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); moveProgramBlock(zone.program.blocks, args.blockId, args.direction === 'up' ? -1 : 1); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { zoneId: zone.id, program: zone.program }; }
    else if (name === 'clear_program') { const { board, zone } = programmableZoneById(args.zoneId, args.boardId); zone.program = normalizeProgram(); state.activeBoardId = board.id; state.selectedObjectId = zone.id; result = { zoneId: zone.id, cleared: true }; }
    else if (name === 'update_project') { if (args.name !== undefined) state.project.name = String(args.name); if (args.description !== undefined) state.project.description = String(args.description); result = state.project; }
    else if (name === 'add_tag') { const tag = String(args.tag || '').trim(); if (tag && !state.tags.includes(tag)) state.tags.push(tag); result = state.tags; }
    else if (name === 'create_card') { const card = { id: uid('card'), name: String(args.name || '未命名卡牌'), effect: sanitizeCardEffectHTML(args.effect || ''), tag: args.tag || '', rarity: args.rarity || '普通', number: args.number || `C-${String(state.cards.length + 1).padStart(3, '0')}`, art: args.art || '✦', color: args.color || 'blue', template: args.template || '默认 · 晨雾', width: Math.max(20, Number(args.width || 63)), height: Math.max(20, Number(args.height || 88)) }; if (card.tag && !state.tags.includes(card.tag)) state.tags.push(card.tag); state.cards.push(card); state.activeCardId = card.id; result = card; }
    else if (name === 'update_card') { const card = cardById(args.cardId); if (!card) throw new Error('找不到单卡'); ['name','tag','rarity','number','art','color','template'].forEach(key => { if (args[key] !== undefined) card[key] = args[key]; }); if (args.effect !== undefined) card.effect = sanitizeCardEffectHTML(args.effect); ['width','height'].forEach(key => { if (args[key] !== undefined) card[key] = Math.max(20, Number(args[key])); }); if (card.tag && !state.tags.includes(card.tag)) state.tags.push(card.tag); result = card; }
    else if (name === 'delete_card') { const card = cardById(args.cardId); if (!card) throw new Error('找不到单卡'); state.cards = state.cards.filter(item => item.id !== args.cardId); if (state.activeCardId === args.cardId) state.activeCardId = state.cards[0]?.id || ''; result = { deleted: args.cardId }; }
    else if (name === 'create_deck') { const deck = { id: uid('deck'), name: String(args.name || '新卡组'), description: args.description || '', entries: [] }; state.decks.push(deck); state.activeDeckId = deck.id; result = deck; }
    else if (name === 'update_deck') { const deck = deckById(args.deckId); if (!deck) throw new Error('找不到卡组'); if (args.name !== undefined) deck.name = args.name; if (args.description !== undefined) deck.description = args.description; result = deck; }
    else if (name === 'delete_deck') { if (!deckById(args.deckId)) throw new Error('找不到卡组'); state.decks = state.decks.filter(item => item.id !== args.deckId); if (state.activeDeckId === args.deckId) state.activeDeckId = state.decks[0]?.id || ''; result = { deleted: args.deckId }; }
    else if (name === 'add_card_to_deck') { const deck = deckById(args.deckId); if (!deck || !cardById(args.cardId)) throw new Error('找不到卡组或单卡'); const entry = deck.entries.find(item => item.cardId === args.cardId); if (entry) entry.count += Number(args.count || 1); else deck.entries.push({ cardId: args.cardId, count: Number(args.count || 1) }); result = deck; }
    else if (name === 'set_deck_card_count') { const deck = deckById(args.deckId); if (!deck || !cardById(args.cardId)) throw new Error('找不到卡组或单卡'); const count = Math.max(0, Number(args.count || 0)); const entry = deck.entries.find(item => item.cardId === args.cardId); if (count === 0) deck.entries = deck.entries.filter(item => item.cardId !== args.cardId); else if (entry) entry.count = count; else deck.entries.push({ cardId: args.cardId, count }); result = deck; }
    else if (name === 'remove_card_from_deck') { const deck = deckById(args.deckId); if (!deck) throw new Error('找不到卡组'); deck.entries = deck.entries.filter(item => item.cardId !== args.cardId); result = deck; }
    else if (name === 'create_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); const supportedTypes = ['card-slot', 'card-zone', 'deck-zone', 'stack', 'programmable-zone', 'dice', 'counter']; if (!board) throw new Error('找不到版图'); if (!supportedTypes.includes(args.type)) throw new Error('不支持的版图对象类型'); const dimensions = defaultObjectDimensions(args.type); const counterAction = normalizeCounterAction(args.counterRightClickAction); const object = { id: uid('obj'), type: args.type, name: args.name || objectLabel(args.type), x: Number(args.x ?? 150), y: Number(args.y ?? 150), width: Number(args.width ?? dimensions.width), height: Number(args.height ?? dimensions.height), cardId: args.cardId || '', deckId: args.deckId || '', program: normalizeProgram(args.program), color: objectColor(args.type), background: args.background || '', locked: Boolean(args.locked), showName: args.showName !== false, showBack: Boolean(args.showBack), showCount: args.showCount !== false, drawTarget: args.drawTarget || '玩家手牌', layout: args.layout || '平铺', gap: Number(args.gap ?? 10), stackMode: args.stackMode || '顶牌' }; if (args.type === 'counter') { object.counterRightClickAction = counterAction; object.counterRightClickValue = normalizeCounterRuleValue(args.counterRightClickValue, counterAction); } board.objects.push(object); state.activeBoardId = board.id; state.selectedObjectId = object.id; result = object; }
    else if (name === 'update_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); const object = board?.objects.find(item => item.id === args.objectId); if (!object) throw new Error('找不到版图对象'); ['name','cardId','deckId','background','locked','showName','showBack','showCount','drawTarget','layout','stackMode'].forEach(key => { if (args[key] !== undefined) object[key] = args[key]; }); ['x','y','width','height','gap'].forEach(key => { if (args[key] !== undefined) object[key] = Number(args[key]); }); if (args.program !== undefined) object.program = normalizeProgram(args.program); if (object.type === 'counter') { if (args.counterRightClickAction !== undefined) object.counterRightClickAction = normalizeCounterAction(args.counterRightClickAction); if (args.counterRightClickValue !== undefined || args.counterRightClickAction !== undefined) object.counterRightClickValue = normalizeCounterRuleValue(args.counterRightClickValue ?? object.counterRightClickValue, object.counterRightClickAction); } result = object; }
    else if (name === 'delete_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); if (!board?.objects.some(item => item.id === args.objectId)) throw new Error('找不到版图对象'); board.objects = board.objects.filter(item => item.id !== args.objectId); delete state.playtest.objectValues[args.objectId]; if (state.selectedObjectId === args.objectId) state.selectedObjectId = ''; result = { deleted: args.objectId }; }
    else if (name === 'create_board') { const board = { id: uid('board'), name: args.name || '新版图', width: Number(args.width || 930), height: Number(args.height || 610), background: args.background || '#111620', objects: [] }; state.boards.push(board); state.activeBoardId = board.id; result = board; }
    else if (name === 'update_board') { const board = state.boards.find(item => item.id === args.boardId); if (!board) throw new Error('找不到版图'); ['name','width','height','background'].forEach(key => { if (args[key] !== undefined) board[key] = args[key]; }); result = board; }
    else if (name === 'delete_board') { if (state.boards.length <= 1) throw new Error('至少保留一个版图'); const board = state.boards.find(item => item.id === args.boardId); if (!board) throw new Error('找不到版图'); board.objects.forEach(object => { delete state.playtest.objectValues[object.id]; }); state.boards = state.boards.filter(item => item.id !== args.boardId); state.activeBoardId = state.boards[0].id; result = { deleted: args.boardId }; }
    else if (name === 'delete_tag') { if (state.cards.some(card => card.tag === args.tag)) throw new Error('标签仍被卡牌使用'); state.tags = state.tags.filter(tag => tag !== args.tag); result = state.tags; }
    else if (name === 'move_playtest_card') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); card.x = Number(args.x); card.y = Number(args.y); card.objectId = args.objectId || ''; result = card; }
    else if (name === 'play_card_from_hand') { const index = state.playtest.players[0].hand.findIndex(item => item.id === args.entityId); if (index < 0) throw new Error('找不到手牌'); const [card] = state.playtest.players[0].hand.splice(index, 1); Object.assign(card, { player: 1, x: Number(args.x), y: Number(args.y), objectId: args.objectId || '', tapped: false }); state.playtest.tableCards.push(card); result = card; }
    else if (name === 'set_playtest_card_orientation') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); card.tapped = Boolean(args.tapped); result = card; }
    else if (name === 'return_playtest_card_to_hand') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); state.playtest.tableCards = state.playtest.tableCards.filter(item => item.id !== args.entityId); state.playtest.players[0].hand.push({ id: card.id, cardId: card.cardId, name: card.name }); result = { returned: card.name }; }
    else if (name === 'put_playtest_card_in_pile') { const pile = currentBoard().objects.find(item => item.id === args.pileId && item.type === 'stack'); if (!pile) throw new Error('找不到卡堆'); let index = state.playtest.tableCards.findIndex(item => item.id === args.entityId); let card; if (index >= 0) [card] = state.playtest.tableCards.splice(index, 1); else { index = state.playtest.players[0].hand.findIndex(item => item.id === args.entityId); if (index >= 0) [card] = state.playtest.players[0].hand.splice(index, 1); } if (!card) throw new Error('找不到试玩卡牌'); delete card.x; delete card.y; delete card.objectId; delete card.tapped; state.playtest.piles[pile.id] ||= []; state.playtest.piles[pile.id].push(card); shuffleAffectedPlaytestPiles([pile.id]); triggerPlaytestAnimation('pile-operation', { objectIds: [pile.id] }); result = { pileId: pile.id, count: state.playtest.piles[pile.id].length }; }
    else if (name === 'shuffle_playtest_pile_into') { const source = currentBoard().objects.find(item => item.id === args.sourcePileId && item.type === 'stack'); const target = currentBoard().objects.find(item => item.id === args.targetObjectId && (item.type === 'stack' || item.type === 'deck-zone')); if (!source || !target) throw new Error('找不到源卡堆或目标牌堆'); const cards = shuffleArray((state.playtest.piles[source.id] || []).splice(0)); if (target.type === 'stack') { state.playtest.piles[target.id] ||= []; state.playtest.piles[target.id].push(...cards); } else { const deck = playtestDeckById(target.deckId); if (!deck) throw new Error('目标抽卡堆没有试玩副本'); shuffleCardsIntoPlaytestDeck(deck, cards); } shuffleAffectedPlaytestPiles([source.id, target.id]); triggerPlaytestAnimation('shuffle', { objectIds: [source.id, target.id] }); result = { moved: cards.length, targetObjectId: target.id }; }
    else if (name === 'draw_playtest_card') { ensurePlaytestDecks(); const deck = playtestDeckById(args.deckId); if (!deck) throw new Error('试玩卡组不存在'); const cardId = drawFromPlaytestDeck(deck); if (!cardId) throw new Error('试玩卡组为空'); const card = cardById(cardId); const entityId = uid('entity'); state.playtest.players[0].hand.push({ id: entityId, cardId, name: card?.name || '缺失卡牌' }); shufflePlaytestDeck(deck); triggerPlaytestAnimation('draw', { entityId, objectIds: playtestDeckObjectIds(deck.id) }); result = { card: card?.name, remaining: deckCardCount(deck) }; }
    else if (name === 'shuffle_playtest_deck') { ensurePlaytestDecks(); const deck = playtestDeckById(args.deckId); if (!deck) throw new Error('找不到试玩卡组'); shufflePlaytestDeck(deck); triggerPlaytestAnimation('shuffle', { objectIds: playtestDeckObjectIds(deck.id) }); result = { deckId: deck.id, count: deckCardCount(deck) }; }
    else if (name === 'roll_playtest_dice') { const object = valueObjectById(args.objectId, 'dice'); const value = setPlaytestObjectValue(object.id, Math.floor(Math.random() * 6) + 1); state.playtest.logs.unshift({ time: '刚刚', text: `AI 掷出“${object.name}”：${value} 点` }); triggerPlaytestAnimation('dice-roll', { objectIds: [object.id] }); result = { objectId: object.id, value }; }
    else if (name === 'reset_playtest_dice') { const object = valueObjectById(args.objectId, 'dice'); setPlaytestObjectValue(object.id, 0); state.playtest.logs.unshift({ time: '刚刚', text: `AI 将“${object.name}”恢复为 0` }); result = { objectId: object.id, value: 0 }; }
    else if (name === 'set_playtest_counter') { const object = valueObjectById(args.objectId, 'counter'); const value = setPlaytestObjectValue(object.id, args.value); state.playtest.logs.unshift({ time: '刚刚', text: `AI 将“${object.name}”设为 ${value}` }); triggerPlaytestAnimation('counter-change', { objectIds: [object.id] }); result = { objectId: object.id, value }; }
    else if (name === 'increment_playtest_counter') { const object = valueObjectById(args.objectId, 'counter'); const amount = Math.trunc(Number(args.amount ?? 1) || 0); const value = setPlaytestObjectValue(object.id, playtestObjectValue(object.id) + amount); state.playtest.logs.unshift({ time: '刚刚', text: `AI 将“${object.name}”${amount >= 0 ? '增加' : '减少'} ${Math.abs(amount)}，当前为 ${value}` }); triggerPlaytestAnimation('counter-change', { objectIds: [object.id] }); result = { objectId: object.id, value }; }
    else if (name === 'apply_playtest_counter_right_click') { const object = valueObjectById(args.objectId, 'counter'); const value = setPlaytestObjectValue(object.id, counterRightClickResult(object, playtestObjectValue(object.id))); state.playtest.logs.unshift({ time: '刚刚', text: `AI 对“${object.name}”执行右键规则，当前为 ${value}` }); triggerPlaytestAnimation('counter-change', { objectIds: [object.id] }); result = { objectId: object.id, value }; }
    else if (name === 'reset_playtest') { state.playtest.players[0].hand = []; state.playtest.tableCards = []; state.playtest.piles = {}; state.playtest.objectValues = {}; state.playtest.selectedPileId = ''; state.playtest.decks = []; state.playtest.deckSourceSignature = ''; ensurePlaytestDecks(true); state.playtest.logs = [{ time: '刚刚', text: 'AI 已重新开始试玩会话，牌组已自动洗牌，骰子与计数器已归零' }]; result = { reset: true, decks: state.playtest.decks.map(deck => ({ id: deck.id, count: deckCardCount(deck) })) }; }
    else throw new Error(`不支持的工具：${name}`);
  };
  if (['get_project_state', 'list_programmable_zones', 'get_programmable_zone'].includes(name)) run();
  else mutate(run);
  renderAll();
  return result;
}

async function sendAIMessage(text) {
  if (!hasAIConfiguration()) { openSetupWizard(true); throw new Error('请先完成 API 设置'); }
  setAIStatus('AI 正在思考…');
  const tools = mcpToolDefinitions.map(tool => ({ type: 'function', function: tool }));
  const system = `你是 CardFoundry 桌游设计助手。你可以通过工具修改用户当前项目。需要编辑时必须调用工具，不要假装修改。用户消息可能包含从飞书粘贴并清洗过的安全 HTML；必须理解并保留其中的语义与格式，包括文字颜色 color、底色 background-color、粗体、斜体、下划线、列表、表格和段落。创建或更新卡牌效果时，effect 可以使用安全 HTML，例如 <span style="color:#e97968;background-color:#fff1a8"><strong>重点效果</strong></span>；如用户要求保留粘贴格式，应将这些安全 HTML 格式写入 effect。当前项目摘要：${JSON.stringify(projectAIContext())}`;
  const endpoint = aiSettings.endpoint.replace(/\/$/, '').endsWith('/chat/completions') ? aiSettings.endpoint.replace(/\/$/, '') : `${aiSettings.endpoint.replace(/\/$/, '')}/chat/completions`;
  for (let round = 0; round < 6; round += 1) {
    const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
    if (aiSettings.apiKey) headers.Authorization = `Bearer ${aiSettings.apiKey}`;
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model: aiSettings.model, stream: true, messages: [{ role: 'system', content: system }, ...aiMessagesForRequest()], tools, tool_choice: 'auto' }) });
    if (!response.ok) throw new Error(`API 请求失败：${response.status} ${await response.text()}`);
    const message = await readAIStream(response);
    if (!message) throw new Error('API 未返回有效消息');
    appendAIConversationMessage(message);
    if (!message.tool_calls?.length) {
      const content = message.content || '操作已完成。';
      // SSE text is already painted incrementally. JSON fallbacks need one
      // normal paint, while keeping both paths in the same conversation.
      if (!message._streamRendered) addAIMessage('assistant', content, false);
      setAIStatus('MCP 工具已就绪'); return content;
    }
    for (const call of message.tool_calls) {
      setAIStatus(`正在执行 ${call.function.name}…`);
      let toolResult;
      try { toolResult = executeMCPTool(call.function.name, JSON.parse(call.function.arguments || '{}')); }
      catch (error) { toolResult = { error: error.message }; }
      appendAIConversationMessage({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
    }
  }
  throw new Error('AI 工具调用轮次过多，请缩小任务范围');
}

async function readAIStream(response) {
  // A few OpenAI-compatible local servers ignore stream=true. Keep a JSON
  // fallback so those endpoints continue to work while the normal path is SSE.
  if (!response.body?.getReader) {
    const data = await response.json(); return data.choices?.[0]?.message;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let rawText = ''; let message = { role: 'assistant', content: '' }; let hasChunk = false; let item = null; let toolCalls = [];
  const consume = (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let chunk; try { chunk = JSON.parse(payload); } catch { return; }
    const delta = chunk.choices?.[0]?.delta || {};
    if (delta.role) message.role = delta.role;
    if (typeof delta.content === 'string') {
      message.content += delta.content;
      setAIStatus('AI 正在输出…');
      if (!item) item = addAIMessage('assistant', '', false);
      updateAIMessage(item, message.content);
    }
    (delta.tool_calls || []).forEach(part => {
      const index = Number(part.index || 0);
      const call = toolCalls[index] ||= { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (part.id) call.id = part.id;
      if (part.type) call.type = part.type;
      if (part.function?.name) call.function.name += part.function.name;
      if (part.function?.arguments) call.function.arguments += part.function.arguments;
    });
    if (toolCalls.length) message.tool_calls = toolCalls;
    hasChunk = true;
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const decoded = decoder.decode(value, { stream: true });
    rawText += decoded;
    buffer += decoded;
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
    lines.forEach(consume);
  }
  const tail = decoder.decode();
  rawText += tail;
  buffer += tail;
  buffer.split(/\r?\n/).forEach(consume);
  if (!hasChunk) {
    try {
      const data = JSON.parse(rawText.trim());
      const fallback = data.choices?.[0]?.message;
      if (fallback) return fallback;
    } catch { /* response was neither SSE nor a JSON completion */ }
    throw new Error('API 未返回有效流式消息');
  }
  Object.defineProperty(message, '_streamRendered', { value: Boolean(item), enumerable: false });
  return message;
}

// Local MCP-style bridge for an embedding host or a future MCP server adapter.
// The browser app keeps the actual state local; callers can enumerate and invoke
// the same tools used by the chat model without reaching into UI internals.
window.cardFoundryMCP = {
  protocol: 'mcp-compatible-local-tools',
  getTools: () => mcpToolDefinitions,
  call: (name, args = {}) => executeMCPTool(name, args),
  getContext: () => JSON.parse(JSON.stringify(projectAIContext())),
  // Minimal JSON-RPC shaped adapter so a host can bridge this browser app to
  // an MCP client without depending on UI selectors.
  request: async (method, params = {}) => {
    if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cardfoundry-local', version: '1.0.0' } };
    if (method === 'tools/list') return { tools: mcpToolDefinitions.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters })) };
    if (method === 'tools/call') return { content: [{ type: 'text', text: JSON.stringify(executeMCPTool(params.name, params.arguments || {})) }] };
    if (method === 'context/get') return JSON.parse(JSON.stringify(projectAIContext()));
    throw new Error(`不支持的 MCP 方法：${method}`);
  }
};

function renderPlaytest() {
  const board = currentBoard(); const p = state.playtest;
  const player = p.players[0];
  $('#playtestPage').innerHTML = `<section class="play-board"><div class="board-canvas-wrap"><div class="board-canvas" id="playCanvas"><span class="canvas-label">PLAYTEST / ${esc(board.name).toUpperCase()}</span>${board.objects.map(renderPlayObject).join('')}${(p.tableCards || []).map(renderPlayedCard).join('')}</div></div></section><aside class="card-panel playtest-side"><div class="side-tabs"><button class="side-tab active" data-side-tab="object">当前对象</button><button class="side-tab" data-side-tab="deck">牌组</button><button class="side-tab" data-side-tab="log">游戏日志</button></div><div class="side-content" id="playSideContent">${renderPlaySide('object')}</div></aside><aside class="card-panel player-panel" id="playerHandDropPanel" data-hand-player="1"><div class="hand-panel-heading"><div><span class="panel-title">手牌</span><span class="hand-count">${player.hand.length} 张</span></div><span class="hand-drop-hint">将场上的牌拖回此处</span></div><div class="hand-cards" id="activeHandDropZone" data-hand-player="1">${player.hand.map(renderHandCard).join('') || '<span class="hand-empty-state">抽牌后会显示在这里，也可将场上的牌拖回</span>'}</div></aside>`;
  bindPlaytestEvents();
}
function renderHandCard(entity) {
  const card = cardById(entity.cardId);
  const animationClass = playtestAnimation?.entityId === entity.id ? 'playtest-card-arrive' : '';
  return `<div class="hand-card ${animationClass}" draggable="true" tabindex="0" data-play-card="${entity.id}" data-preview-card="${card?.id || ''}" title="拖到版图上出牌">${renderPlayCardFace(card, entity)}</div>`;
}
function renderPlayCardFace(card, entity = {}) {
  const name = card?.name || entity.name || '缺失卡牌';
  const effectHTML = sanitizeCardEffectHTML(card?.effect || '');
  return `<div class="play-card-face"><div class="play-card-name">${esc(name)}</div><div class="play-card-art">${esc(card?.art || '✦')}</div><div class="play-card-effect">${effectHTML || '<span style="opacity:.58">暂无卡牌效果</span>'}</div></div>`;
}
function playtestObjectValue(objectId) { return Math.trunc(Number(state.playtest.objectValues[objectId]) || 0); }
function valueObjectById(objectId, type = '') {
  const object = currentBoard().objects.find(item => item.id === objectId && isValueObject(item.type));
  if (!object || (type && object.type !== type)) throw new Error(type === 'dice' ? '找不到骰子' : type === 'counter' ? '找不到计数器' : '找不到数值对象');
  return object;
}
function setPlaytestObjectValue(objectId, value) {
  const normalized = Math.trunc(Number(value) || 0);
  state.playtest.objectValues[objectId] = normalized;
  return normalized;
}
function counterRightClickResult(object, currentValue) {
  const action = normalizeCounterAction(object.counterRightClickAction);
  const value = normalizeCounterRuleValue(object.counterRightClickValue, action);
  if (action === 'set') return value;
  return currentValue + (action === 'increase' ? value : -value);
}
function renderPlayObject(o) {
  const boundCard = o.cardId ? cardById(o.cardId) : null; const boundDeck = o.deckId ? playtestDeckById(o.deckId) : null;
  const pileCount = o.type === 'stack' ? (state.playtest.piles[o.id] || []).length : 0;
  const selected = o.type === 'stack' && state.playtest.selectedPileId === o.id;
  const isDrawZone = o.type === 'deck-zone';
  const isProgramZone = o.type === 'programmable-zone';
  const isInteractiveValue = isValueObject(o.type);
  const animationClass = playtestAnimation?.type === 'draw' && playtestAnimation.objectIds?.includes(o.id)
    ? 'playtest-draw-feedback'
    : playtestAnimation?.type === 'shuffle' && playtestAnimation.objectIds?.includes(o.id)
      ? 'playtest-shuffle-feedback'
      : playtestAnimation?.type === 'pile-operation' && playtestAnimation.objectIds?.includes(o.id)
        ? 'playtest-pile-feedback'
        : playtestAnimation?.type === 'dice-roll' && playtestAnimation.objectIds?.includes(o.id)
          ? 'playtest-dice-roll'
          : playtestAnimation?.type === 'counter-change' && playtestAnimation.objectIds?.includes(o.id)
            ? 'playtest-counter-change'
      : '';
  const actionLabel = o.type === 'dice' ? '左键掷骰，右键归零' : o.type === 'counter' ? `左键加一，右键${counterActionLabel(o.counterRightClickAction)} ${normalizeCounterRuleValue(o.counterRightClickValue, o.counterRightClickAction)}` : isProgramZone ? '点击执行程序' : '点击以抽牌';
  const actionAttributes = isDrawZone || isProgramZone || isInteractiveValue ? `role="button" tabindex="0" aria-label="${esc(actionLabel)}" title="${esc(actionLabel)}"` : '';
  const objectDetail = o.type === 'stack'
    ? `<small>${pileCount} 张牌 · 点击选择</small>`
    : boundCard
      ? `<small>${esc(boundCard.name)}</small>`
      : boundDeck
        ? `<small>${esc(boundDeck.name)} · ${deckCardCount(boundDeck)} 张</small>`
        : '';
  const drawHint = isDrawZone ? `<span class="draw-zone-hint">${boundDeck ? '点击以抽牌' : '请先绑定卡组'}</span>` : isProgramZone ? `<span class="draw-zone-hint">点击执行</span>` : '';
  const content = isInteractiveValue
    ? `<span class="object-value">${playtestObjectValue(o.id)}</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}`
    : `<span class="object-symbol">${objectSymbol(o.type)}</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}${objectDetail}${drawHint}`;
  return `<div class="board-object ${objectColor(o.type)} ${selected ? 'selected-pile' : ''} ${isDrawZone ? 'draw-zone' : ''} ${isProgramZone ? 'programmable-object draw-zone' : ''} ${isInteractiveValue ? 'interactive-control value-object' : ''} ${animationClass}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;${o.background ? `background:${esc(o.background)};` : ''}" data-play-object="${o.id}" ${actionAttributes} ${boundCard ? `data-preview-card="${boundCard.id}"` : ''}>${content}</div>`;
}
function renderPlayedCard(entity) {
  const card = cardById(entity.cardId);
  const x = Number.isFinite(Number(entity.x)) ? Number(entity.x) : 560;
  const y = Number.isFinite(Number(entity.y)) ? Number(entity.y) : 160;
  return `<div class="played-card ${entity.tapped ? 'tapped' : ''}" draggable="true" data-table-card="${entity.id}" data-preview-card="${card?.id || ''}" tabindex="0" title="拖动卡牌；右键横置/竖置" style="left:${x}px;top:${y}px">${renderPlayCardFace(card, entity)}</div>`;
}
function triggerPlaytestAnimation(type, options = {}) {
  const token = ++playtestAnimationToken;
  playtestAnimation = { type, ...options };
  window.setTimeout(() => {
    if (token === playtestAnimationToken) playtestAnimation = null;
  }, 560);
}
function deckCardCount(deck) { return deck?.entries?.reduce((sum, entry) => sum + Number(entry.count || 0), 0) || 0; }
function renderPlaySide(tab) {
  if (tab === 'deck') return `<div class="section-label">试玩卡组副本</div><p class="muted-caption" style="line-height:1.5">进入试玩时会自动洗牌；试玩中的抽牌和洗牌不会修改设计页卡组。</p>${state.playtest.decks.map(d => `<div class="log-item"><strong>${esc(d.name)}</strong><br><span class="muted-caption">${deckCardCount(d)} 张 · 点击抽牌</span><br><button class="ghost-button draw-button" data-draw-deck="${d.id}" style="margin-top:7px">抽一张</button><button class="ghost-button" data-shuffle-deck="${d.id}" style="margin:7px 0 0 5px">洗牌</button></div>`).join('')}`;
  if (tab === 'log') return `<div class="section-label">操作记录</div>${state.playtest.logs.map(log => `<div class="log-item"><span class="log-time">${esc(log.time)}</span>${esc(log.text)}</div>`).join('')}`;
  if (state.playtest.selectedPileId) return renderSelectedPilePanel(state.playtest.selectedPileId);
  return `<div class="section-label">试玩操作</div><p class="muted-caption" style="line-height:1.6">点击抽卡堆抽牌，点击卡堆管理卡牌。骰子左键掷骰、右键归零；计数器左键加一、右键执行设计规则。右键场上卡牌可横置或竖置。</p>`;
}
function renderSelectedPilePanel(pileId) {
  const pile = currentBoard().objects.find(object => object.id === pileId && object.type === 'stack');
  if (!pile) return `<div class="play-preview-empty">卡堆不存在</div>`;
  const cards = state.playtest.piles[pileId] || [];
  const targets = currentBoard().objects.filter(object => object.id !== pileId && (object.type === 'stack' || object.type === 'deck-zone'));
  return `<div class="pile-panel"><div class="section-label">已选择卡堆</div><div class="pile-panel-title">${esc(pile.name)}</div><div class="pile-count"><strong>${cards.length}</strong><span>张牌在堆内</span></div><p class="muted-caption">将这个卡堆中的全部卡牌洗入另一个卡堆或抽卡堆。</p><div class="field"><label>目标牌堆</label><select id="pileTargetSelect">${targets.length ? targets.map(target => `<option value="${target.id}">${esc(target.name)} · ${target.type === 'stack' ? '卡堆' : '抽卡堆'}</option>`).join('') : '<option value="">没有可用目标</option>'}</select></div><button class="primary-button pile-action-button" id="shufflePileButton" ${!cards.length || !targets.length ? 'disabled' : ''}>全部洗入目标牌堆</button><button class="ghost-button pile-action-button" id="closePileButton">取消选择</button></div>`;
}
function renderPlayCardPreview(card, hint = '移开鼠标后返回试玩操作') {
  if (!card) return `<div class="play-preview-empty">这张牌的数据已不存在</div>`;
  const templateClass = card.template === '简约 · 象牙' ? 'ivory' : card.template === '事件 · 午夜' ? 'midnight' : '';
  const effectHTML = sanitizeCardEffectHTML(card.effect || '');
  return `<div class="play-card-preview"><div class="preview-label">CARD PREVIEW · 正面</div><div class="playing-card ${templateClass}"><div class="playing-card-inner"><div class="card-rarity">${esc(card.rarity || '普通')} · ${esc(card.tag || '未分类')}</div><div class="card-title">${esc(card.name || '未命名卡牌')}</div><div class="card-art">${esc(card.art || '✦')}</div><div class="card-effect">${effectHTML || '<span style="color:#7a8585">卡牌效果将显示在这里</span>'}</div><div class="card-footer"><span>${esc(card.number || 'C-000')}</span><span>${esc(state.project?.name || 'CardFoundry')}</span></div></div></div>${hint ? `<div class="play-preview-hint">${esc(hint)}</div>` : ''}</div>`;
}
function bindPlaytestEvents() {
  $$('[data-side-tab]').forEach(el => el.addEventListener('click', () => { $$('[data-side-tab]').forEach(x => x.classList.remove('active')); el.classList.add('active'); $('#playSideContent').innerHTML = renderPlaySide(el.dataset.sideTab); bindSideActions(); }));
  bindSideActions();
  const activatePlayObject = el => {
    const o = currentBoard().objects.find(x => x.id === el.dataset.playObject);
    if (o?.type === 'deck-zone') drawCard(o.deckId);
    else if (o?.type === 'stack') selectPile(o.id);
    else if (o?.type === 'programmable-zone') executeProgrammableZone(o.id);
    else if (o?.type === 'dice') rollPlaytestDice(o.id);
    else if (o?.type === 'counter') incrementPlaytestCounter(o.id);
    else toast(`${o?.name || '区域'}：可拖入或查看卡牌`);
  };
  $$('[data-play-object]').forEach(el => {
    el.addEventListener('click', () => activatePlayObject(el));
    if (el.classList.contains('draw-zone') || el.classList.contains('interactive-control')) el.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activatePlayObject(el);
    });
    if (el.classList.contains('interactive-control')) el.addEventListener('contextmenu', event => {
      event.preventDefault();
      const object = currentBoard().objects.find(item => item.id === el.dataset.playObject);
      if (object?.type === 'dice') resetPlaytestDice(object.id);
      else if (object?.type === 'counter') applyPlaytestCounterRightClick(object.id);
    });
  });
  bindPlayCardDragEvents();
  bindPlayCardPreviewEvents();
}
function rollPlaytestDice(objectId) {
  const object = valueObjectById(objectId, 'dice');
  let value = 0;
  mutate(() => {
    value = setPlaytestObjectValue(object.id, Math.floor(Math.random() * 6) + 1);
    state.playtest.logs.unshift({ time: '刚刚', text: `掷出“${object.name}”：${value} 点` });
  });
  triggerPlaytestAnimation('dice-roll', { objectIds: [object.id] });
  renderPlaytest(); toast(`「${object.name}」掷出 ${value}`, 'success');
  return value;
}
function resetPlaytestDice(objectId) {
  const object = valueObjectById(objectId, 'dice');
  mutate(() => {
    setPlaytestObjectValue(object.id, 0);
    state.playtest.logs.unshift({ time: '刚刚', text: `“${object.name}”已恢复为 0` });
  });
  renderPlaytest(); toast(`「${object.name}」已归零`, 'success');
  return 0;
}
function incrementPlaytestCounter(objectId, amount = 1) {
  const object = valueObjectById(objectId, 'counter');
  const delta = Math.trunc(Number(amount) || 0);
  let value = 0;
  mutate(() => {
    value = setPlaytestObjectValue(object.id, playtestObjectValue(object.id) + delta);
    state.playtest.logs.unshift({ time: '刚刚', text: `“${object.name}”${delta >= 0 ? '增加' : '减少'} ${Math.abs(delta)}，当前为 ${value}` });
  });
  triggerPlaytestAnimation('counter-change', { objectIds: [object.id] });
  renderPlaytest();
  return value;
}
function applyPlaytestCounterRightClick(objectId) {
  const object = valueObjectById(objectId, 'counter');
  const action = normalizeCounterAction(object.counterRightClickAction);
  const ruleValue = normalizeCounterRuleValue(object.counterRightClickValue, action);
  let value = 0;
  mutate(() => {
    value = setPlaytestObjectValue(object.id, counterRightClickResult(object, playtestObjectValue(object.id)));
    state.playtest.logs.unshift({ time: '刚刚', text: `右键“${object.name}”：${counterActionLabel(action)} ${ruleValue}，当前为 ${value}` });
  });
  triggerPlaytestAnimation('counter-change', { objectIds: [object.id] });
  renderPlaytest(); toast(`「${object.name}」当前为 ${value}`, 'success');
  return value;
}
function playtestEntity(cardId) { const card = cardById(cardId); return { id: uid('entity'), cardId, name: card?.name || '缺失卡牌', player: 1 }; }
function takeCardsFromPlaytestSource(reference, count, context, affectedPileIds = null) {
  const limit = Math.max(0, Math.floor(Number(count) || 0)); const taken = [];
  if (reference === 'temporary-selection') return context.temporarySelection.splice(0, limit);
  if (reference === 'hand') return state.playtest.players[0].hand.splice(0, limit);
  const object = currentBoard().objects.find(item => `object:${item.id}` === reference); if (!object) return taken;
  if (object.type === 'deck-zone') {
    affectedPileIds?.add(object.id);
    const deck = playtestDeckById(object.deckId); if (!deck) return taken;
    for (let index = 0; index < limit; index += 1) { const cardId = drawFromPlaytestDeck(deck); if (!cardId) break; taken.push(playtestEntity(cardId)); }
  } else if (object.type === 'stack') {
    affectedPileIds?.add(object.id);
    const pile = state.playtest.piles[object.id] || [];
    while (taken.length < limit && pile.length) taken.push(pile.pop());
  } else if (object.type === 'card-zone') {
    for (let index = state.playtest.tableCards.length - 1; index >= 0 && taken.length < limit; index -= 1) if (state.playtest.tableCards[index].objectId === object.id) taken.push(state.playtest.tableCards.splice(index, 1)[0]);
  }
  return taken;
}
function takeAllCardsFromPlaytestSource(reference, context, affectedPileIds = null) {
  if (reference === 'temporary-selection') return context.temporarySelection.splice(0);
  if (reference === 'hand') return state.playtest.players[0].hand.splice(0);
  const object = currentBoard().objects.find(item => `object:${item.id}` === reference); if (!object) return [];
  if (object.type === 'deck-zone') { const deck = playtestDeckById(object.deckId); return deck ? takeCardsFromPlaytestSource(reference, deck.drawPile.length, context, affectedPileIds) : []; }
  if (object.type === 'stack') { affectedPileIds?.add(object.id); return (state.playtest.piles[object.id] || []).splice(0); }
  if (object.type === 'card-zone') { const cards = state.playtest.tableCards.filter(card => card.objectId === object.id); state.playtest.tableCards = state.playtest.tableCards.filter(card => card.objectId !== object.id); return cards; }
  return [];
}
function sendCardsToPlaytestTarget(cards, reference, context, shuffle = false, affectedPileIds = null) {
  if (!cards.length) return;
  cards.forEach(card => { delete card.x; delete card.y; delete card.objectId; delete card.tapped; card.player = 1; });
  if (reference === 'temporary-selection') { context.temporarySelection.push(...cards); if (shuffle) shuffleArray(context.temporarySelection); return; }
  if (reference === 'hand') { state.playtest.players[0].hand.push(...cards); if (shuffle) shuffleArray(state.playtest.players[0].hand); return; }
  const object = currentBoard().objects.find(item => `object:${item.id}` === reference); if (!object) { state.playtest.players[0].hand.push(...cards); return; }
  if (object.type === 'deck-zone') { affectedPileIds?.add(object.id); const deck = playtestDeckById(object.deckId); if (deck) shuffleCardsIntoPlaytestDeck(deck, cards); else state.playtest.players[0].hand.push(...cards); }
  else if (object.type === 'stack') { affectedPileIds?.add(object.id); state.playtest.piles[object.id] ||= []; state.playtest.piles[object.id].push(...cards); if (shuffle) shuffleArray(state.playtest.piles[object.id]); }
  else if (object.type === 'card-zone') cards.forEach((card, index) => state.playtest.tableCards.push({ ...card, x: object.x + 12 + index * 24, y: object.y + 12, objectId: object.id, tapped: false }));
  else state.playtest.players[0].hand.push(...cards);
}
async function executeProgramBlocks(blocks, context) {
  for (const block of blocks) {
    const affectedPileIds = new Set();
    if (block.type === 'draw') sendCardsToPlaytestTarget(takeCardsFromPlaytestSource(block.source, block.count, context, affectedPileIds), block.target, context, false, affectedPileIds);
    else if (block.type === 'shuffle') sendCardsToPlaytestTarget(shuffleArray(takeAllCardsFromPlaytestSource(block.source, context, affectedPileIds)), block.target, context, true, affectedPileIds);
    else if (block.type === 'select') {
      await executeProgramBlocks(block.blocks || [], context);
      const result = await openTemporaryCardSelection(context.temporarySelection.splice(0), block.max);
      sendCardsToPlaytestTarget(result.selected, block.selectedTarget, context, false, affectedPileIds);
      sendCardsToPlaytestTarget(result.unselected, block.unselectedTarget, context, false, affectedPileIds);
    }
    shuffleAffectedPlaytestPiles(affectedPileIds).forEach(id => context.affectedPileIds.add(id));
  }
}
async function executeProgrammableZone(objectId) {
  const object = currentBoard().objects.find(item => item.id === objectId && item.type === 'programmable-zone');
  if (!object) return;
  if (!object.program?.blocks?.length) return toast('这个区域还没有程序块');
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
  try {
    const context = { zoneId: object.id, temporarySelection: [], affectedPileIds: new Set() };
    await executeProgramBlocks(object.program.blocks, context);
    if (context.temporarySelection.length) sendCardsToPlaytestTarget(context.temporarySelection.splice(0), 'hand', context);
    const affectedPileIds = [...context.affectedPileIds];
    if (affectedPileIds.length) triggerPlaytestAnimation('pile-operation', { objectIds: affectedPileIds });
    state.playtest.logs.unshift({ time: '刚刚', text: `已执行“${object.name}”的程序` });
    saveState(); renderPlaytest(); toast(`「${object.name}」执行完成`, 'success');
  } catch (error) { undoStack.pop(); toast(`程序执行失败：${error.message}`); renderPlaytest(); }
}
function openTemporaryCardSelection(cards, max) {
  return new Promise(resolve => {
    if (!cards.length) { resolve({ selected: [], unselected: [] }); return; }
    const root = $('#modalRoot'); const selectedIds = new Set(); const limit = Math.max(1, Math.floor(Number(max) || 1));
    const firstCard = cardById(cards[0].cardId);
    const finish = confirmed => { const selected = confirmed ? cards.filter(card => selectedIds.has(card.id)) : []; const unselected = cards.filter(card => !selected.some(item => item.id === card.id)); closeModal(); resolve({ selected, unselected }); };
    root.innerHTML = `<div class="modal-backdrop" id="temporarySelectionBackdrop"><div class="modal temporary-selection-modal"><div class="temporary-selection-header"><div><h3>临时卡牌选择区</h3><p>最多选择 ${limit} 张。取消时所有卡牌都会按“未选中”处理。</p></div><div class="selection-count" id="temporarySelectionCount">已选择 0 / ${limit}</div></div><div class="temporary-selection-body"><div class="temporary-card-grid">${cards.map(entity => `<button type="button" class="temporary-card" data-temporary-card="${entity.id}" data-preview-card="${esc(entity.cardId || '')}" aria-pressed="false">${renderPlayCardFace(cardById(entity.cardId), entity)}<span class="temporary-check">✓</span></button>`).join('')}</div><aside class="temporary-card-preview" id="temporaryCardPreview" aria-live="polite">${renderPlayCardPreview(firstCard, '悬停或聚焦左侧卡牌以查看')}</aside></div><div class="modal-actions"><button class="ghost-button" id="cancelTemporarySelection">取消</button><button class="primary-button" id="confirmTemporarySelection">确认选择</button></div></div></div>`;
    const showPreview = entityId => {
      const entity = cards.find(card => card.id === entityId); const preview = $('#temporaryCardPreview');
      if (entity && preview) preview.innerHTML = renderPlayCardPreview(cardById(entity.cardId), '悬停或聚焦左侧卡牌以查看');
    };
    const restorePreview = () => showPreview([...selectedIds][0] || cards[0].id);
    $$('[data-temporary-card]', root).forEach(button => {
      button.addEventListener('mouseenter', () => showPreview(button.dataset.temporaryCard));
      button.addEventListener('mouseleave', restorePreview);
      button.addEventListener('focus', () => showPreview(button.dataset.temporaryCard));
      button.addEventListener('blur', restorePreview);
      button.addEventListener('click', () => {
        const id = button.dataset.temporaryCard;
        if (selectedIds.has(id)) selectedIds.delete(id);
        else if (selectedIds.size < limit) selectedIds.add(id);
        else return toast(`最多选择 ${limit} 张牌`);
        button.classList.toggle('selected', selectedIds.has(id));
        button.setAttribute('aria-pressed', String(selectedIds.has(id)));
        $('#temporarySelectionCount').textContent = `已选择 ${selectedIds.size} / ${limit}`;
        showPreview(id);
      });
    });
    $('#confirmTemporarySelection').onclick = () => finish(true); $('#cancelTemporarySelection').onclick = () => finish(false);
  });
}
function bindPlayCardPreviewEvents() {
  const sideContent = $('#playSideContent');
  if (!sideContent) return;
  let previewing = false;
  const show = element => {
    const card = cardById(element.dataset.previewCard);
    if (!card) return;
    previewing = true;
    sideContent.innerHTML = renderPlayCardPreview(card);
  };
  const restore = () => {
    if (!previewing) return;
    previewing = false;
    const activeTab = $('[data-side-tab].active')?.dataset.sideTab || 'object';
    sideContent.innerHTML = renderPlaySide(activeTab);
    bindSideActions();
  };
  $$('[data-preview-card]').forEach(element => {
    element.addEventListener('mouseenter', () => show(element));
    element.addEventListener('mouseleave', restore);
    element.addEventListener('focus', () => show(element));
    element.addEventListener('blur', restore);
  });
}
function bindPlayCardDragEvents() {
  const canvas = $('#playCanvas');
  if (!canvas) return;
  const getEntityId = event => event.dataTransfer.getData('application/x-card-entity') || event.dataTransfer.getData('text/plain') || activeDragEntityId;
  const isTableCard = entityId => state.playtest.tableCards.some(card => card.id === entityId);
  const addDropTarget = (element, objectId = '') => {
    element.addEventListener('dragover', event => { event.preventDefault(); element.classList.add('play-canvas-drop-target'); event.dataTransfer.dropEffect = 'move'; });
    element.addEventListener('dragleave', () => element.classList.remove('play-canvas-drop-target'));
    element.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); element.classList.remove('play-canvas-drop-target');
      const entityId = getEntityId(event); if (!entityId) return;
      const point = clientPointToPlayCanvas(event.clientX, event.clientY, canvas.getBoundingClientRect(), currentBoard());
      const position = playtestCardDropPosition(point, activeDragOffset, currentBoard());
      const targetObject = currentBoard().objects.find(object => object.id === objectId);
      if (targetObject?.type === 'stack') putCardInPile(entityId, targetObject.id, isTableCard(entityId));
      else if (isTableCard(entityId)) moveTableCard(entityId, position.x, position.y, objectId);
      else placeCardOnTable(entityId, position.x, position.y, objectId);
    });
  };
  addDropTarget(canvas);
  $$('[data-play-object]', canvas).forEach(element => addDropTarget(element, element.dataset.playObject));
  $$('[data-play-card]').forEach(element => {
    element.addEventListener('dragstart', event => { activeDragEntityId = element.dataset.playCard; activeDragOffset = handCardDragOffset(event, element); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-card-entity', activeDragEntityId); event.dataTransfer.setData('text/plain', activeDragEntityId); element.classList.add('dragging'); });
    element.addEventListener('dragend', () => { activeDragEntityId = ''; activeDragOffset = null; element.classList.remove('dragging'); });
  });
  $$('[data-table-card]').forEach(element => {
    element.addEventListener('dragstart', event => { const entity = state.playtest.tableCards.find(card => card.id === element.dataset.tableCard); activeDragEntityId = element.dataset.tableCard; activeDragOffset = tableCardDragOffset(event, entity, canvas); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-card-entity', activeDragEntityId); event.dataTransfer.setData('text/plain', activeDragEntityId); element.classList.add('dragging'); });
    element.addEventListener('dragend', () => { activeDragEntityId = ''; activeDragOffset = null; element.classList.remove('dragging'); });
    element.addEventListener('contextmenu', event => { event.preventDefault(); toggleTableCardTapped(element.dataset.tableCard); });
  });
  const handZone = $('#activeHandDropZone');
  const handPanel = $('#playerHandDropPanel');
  const handTargets = [handZone, handPanel].filter(Boolean);
  handTargets.forEach(target => {
    target.addEventListener('dragenter', event => {
      const entityId = getEntityId(event);
      if (!isTableCard(entityId)) return;
      event.preventDefault(); event.stopPropagation(); target.classList.add('hand-drop-target');
    });
    target.addEventListener('dragover', event => {
      const entityId = getEntityId(event);
      if (!isTableCard(entityId)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; target.classList.add('hand-drop-target');
    });
    target.addEventListener('dragleave', event => { if (!target.contains(event.relatedTarget)) target.classList.remove('hand-drop-target'); });
    target.addEventListener('drop', event => {
      event.preventDefault(); event.stopPropagation(); target.classList.remove('hand-drop-target');
      const entityId = getEntityId(event);
      if (isTableCard(entityId)) returnCardToHand(entityId, 1);
    });
  });
}
function clientPointToPlayCanvas(clientX, clientY, rect, board) {
  const scaleX = rect.width / board.width || 1;
  const scaleY = rect.height / board.height || scaleX;
  return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY };
}
function playtestCardDropPosition(point, offset, board) {
  const grab = offset || { x: PLAYTEST_CARD_WIDTH / 2, y: PLAYTEST_CARD_HEIGHT / 2 };
  return {
    x: Math.max(0, Math.min(board.width - PLAYTEST_CARD_WIDTH, point.x - grab.x)),
    y: Math.max(0, Math.min(board.height - PLAYTEST_CARD_HEIGHT, point.y - grab.y))
  };
}
function handCardDragOffset(event, element) {
  const rect = element.getBoundingClientRect();
  const pointerX = event.clientX >= rect.left && event.clientX <= rect.right ? event.clientX : rect.left + rect.width / 2;
  const pointerY = event.clientY >= rect.top && event.clientY <= rect.bottom ? event.clientY : rect.top + rect.height / 2;
  return {
    x: ((pointerX - rect.left) / rect.width) * PLAYTEST_CARD_WIDTH,
    y: ((pointerY - rect.top) / rect.height) * PLAYTEST_CARD_HEIGHT
  };
}
function tableCardDragOffset(event, entity, canvas) {
  if (!entity) return { x: PLAYTEST_CARD_WIDTH / 2, y: PLAYTEST_CARD_HEIGHT / 2 };
  const point = clientPointToPlayCanvas(event.clientX, event.clientY, canvas.getBoundingClientRect(), currentBoard());
  return { x: point.x - Number(entity.x || 0), y: point.y - Number(entity.y || 0) };
}
function putCardInPile(entityId, pileId, fromTable) {
  const pile = currentBoard().objects.find(object => object.id === pileId && object.type === 'stack');
  if (!pile) return;
  let entity;
  mutate(() => {
    if (fromTable) {
      const index = state.playtest.tableCards.findIndex(card => card.id === entityId);
      if (index < 0) return;
      [entity] = state.playtest.tableCards.splice(index, 1);
    } else {
      const player = state.playtest.players[state.playtest.currentPlayer - 1];
      const index = player?.hand.findIndex(card => card.id === entityId) ?? -1;
      if (index < 0) return;
      [entity] = player.hand.splice(index, 1);
      entity.player = state.playtest.currentPlayer;
    }
    if (!entity) return;
    delete entity.x; delete entity.y; delete entity.objectId; delete entity.tapped;
    state.playtest.piles[pileId] ||= [];
    state.playtest.piles[pileId].push(entity);
    shuffleAffectedPlaytestPiles([pile.id]);
    state.playtest.logs.unshift({ time: '刚刚', text: `“${entity.name}”进入${pile.name}` });
  });
  if (!entity) return;
  triggerPlaytestAnimation('pile-operation', { objectIds: [pile.id] });
  renderPlaytest(); toast(`「${entity.name}」已进入${pile.name}`, 'success');
}
function toggleTableCardTapped(entityId) {
  const entity = state.playtest.tableCards.find(card => card.id === entityId);
  if (!entity) return;
  mutate(() => {
    entity.tapped = !entity.tapped;
    state.playtest.logs.unshift({ time: '刚刚', text: `“${entity.name}”已${entity.tapped ? '横置' : '竖置'}` });
  });
  renderPlaytest();
}
function selectPile(pileId) {
  state.playtest.selectedPileId = pileId;
  renderPlaytest();
}
function placeCardOnTable(entityId, x, y, objectId = '') {
  const player = state.playtest.players[state.playtest.currentPlayer - 1];
  const index = player?.hand.findIndex(card => card.id === entityId) ?? -1;
  if (index < 0) return toast('这张牌已经在场上');
  const entity = player.hand[index];
  mutate(() => { player.hand.splice(index, 1); state.playtest.tableCards.push({ ...entity, player: state.playtest.currentPlayer, x: Math.round(x), y: Math.round(y), objectId }); state.playtest.logs.unshift({ time: '刚刚', text: `玩家${state.playtest.currentPlayer} 将“${entity.name}”放入场上` }); });
  renderPlaytest(); toast(`「${entity.name}」已放入场上`, 'success');
}
function moveTableCard(entityId, x, y, objectId = '') {
  const entity = state.playtest.tableCards.find(card => card.id === entityId);
  if (!entity) return;
  const fromObject = currentBoard().objects.find(object => object.id === entity.objectId);
  const toObject = currentBoard().objects.find(object => object.id === objectId);
  mutate(() => {
    entity.x = Math.round(x); entity.y = Math.round(y); entity.objectId = objectId;
    state.playtest.logs.unshift({ time: '刚刚', text: `“${entity.name}”从${fromObject?.name || '场上'}移动到${toObject?.name || '场上'}` });
  });
  renderPlaytest();
}
function returnCardToHand(entityId, playerNumber) {
  const index = state.playtest.tableCards.findIndex(card => card.id === entityId);
  const player = state.playtest.players[playerNumber - 1];
  if (index < 0 || !player) return;
  const entity = state.playtest.tableCards[index];
  mutate(() => {
    state.playtest.tableCards.splice(index, 1);
    player.hand.push({ id: entity.id, cardId: entity.cardId, name: entity.name });
    state.playtest.logs.unshift({ time: '刚刚', text: `“${entity.name}”回到${player.name}的手牌` });
  });
  renderPlaytest(); toast(`「${entity.name}」已回到手牌`, 'success');
}
function bindSideActions() {
  $$('[data-draw-deck]').forEach(el => el.addEventListener('click', () => drawCard(el.dataset.drawDeck)));
  $$('[data-shuffle-deck]').forEach(el => el.addEventListener('click', () => shuffleCardDeck(el.dataset.shuffleDeck)));
  $('#closePileButton')?.addEventListener('click', () => { state.playtest.selectedPileId = ''; renderPlaytest(); });
  $('#shufflePileButton')?.addEventListener('click', () => shufflePileIntoTarget(state.playtest.selectedPileId, $('#pileTargetSelect')?.value));
}
function shufflePileIntoTarget(sourceId, targetId) {
  const source = currentBoard().objects.find(object => object.id === sourceId && object.type === 'stack');
  const target = currentBoard().objects.find(object => object.id === targetId && (object.type === 'stack' || object.type === 'deck-zone'));
  const sourceCards = state.playtest.piles[sourceId] || [];
  if (!source || !target || !sourceCards.length) return toast('请选择有效目标，且源卡堆不能为空');
  const count = sourceCards.length;
  mutate(() => {
    const shuffled = shuffleArray(sourceCards.splice(0));
    if (target.type === 'stack') {
      state.playtest.piles[target.id] ||= [];
      state.playtest.piles[target.id].push(...shuffled);
    } else {
      const deck = playtestDeckById(target.deckId);
      if (deck) shuffleCardsIntoPlaytestDeck(deck, shuffled);
    }
    shuffleAffectedPlaytestPiles([source.id, target.id]);
    state.playtest.logs.unshift({ time: '刚刚', text: `${source.name}的 ${count} 张牌已洗入${target.name}` });
    state.playtest.selectedPileId = '';
    triggerPlaytestAnimation('shuffle', { objectIds: [source.id, target.id] });
  });
  renderPlaytest(); toast(`${count} 张牌已洗入「${target.name}」`, 'success');
}
function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}
function drawCard(deckId) {
  const deck = playtestDeckById(deckId); if (!deck) return toast('没有找到这个试玩卡组');
  let cardId = '';
  let entityId = '';
  mutate(() => {
    cardId = drawFromPlaytestDeck(deck);
    if (!cardId) return;
    const card = cardById(cardId);
    entityId = uid('entity');
    state.playtest.players[state.playtest.currentPlayer - 1].hand.push({ id: entityId, cardId, name: card?.name || '缺失卡牌' });
    shufflePlaytestDeck(deck);
    state.playtest.logs.unshift({ time: '刚刚', text: `玩家${state.playtest.currentPlayer} 从${deck.name}抽取了“${card?.name || '缺失卡牌'}”` });
  });
  if (!cardId) return toast('牌组已空');
  const card = cardById(cardId);
  const drawZoneIds = playtestDeckObjectIds(deck.id);
  triggerPlaytestAnimation('draw', { entityId, objectIds: drawZoneIds });
  renderPlaytest(); toast(`已抽取「${card?.name || '缺失卡牌'}」`, 'success'); }
function shuffleCardDeck(deckId) {
  const deck = playtestDeckById(deckId); if (!deck) return toast('没有找到这个试玩卡组');
  mutate(() => {
    shufflePlaytestDeck(deck);
    state.playtest.logs.unshift({ time: '刚刚', text: `${deck.name}已重新洗牌` });
    triggerPlaytestAnimation('shuffle', { objectIds: currentBoard().objects.filter(object => object.type === 'deck-zone' && object.deckId === deck.id).map(object => object.id) });
  });
  renderPlaytest(); toast(`「${deck.name}」已洗牌`, 'success');
}

function boardExportSnapshot(board) {
  const snapshot = JSON.parse(JSON.stringify(board));
  snapshot.objects = (snapshot.objects || []).map(object => object.type === 'programmable-zone' ? { ...object, program: normalizeProgram(object.program) } : object);
  return snapshot;
}
function buildProjectExportPayload() {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.boards = snapshot.boards.map(boardExportSnapshot);
  return { ...snapshot, format: 'cardfoundry-project', version: 2, exportedAt: new Date().toISOString(), features: { programmableZones: 1, nestedProgramBlocks: 1, richCardEffects: 1, diceObjects: 1, counterObjects: 1 } };
}
function projectIntegrityIssues(projectState = state) {
  const issues = [];
  const cardIds = new Set(projectState.cards.map(card => card.id));
  const deckIds = new Set(projectState.decks.map(deck => deck.id));
  projectState.decks.forEach(deck => deck.entries.forEach(entry => { if (!cardIds.has(entry.cardId)) issues.push(`${deck.name} 引用了缺失单卡`); }));
  projectState.boards.forEach(board => board.objects.forEach(object => {
    if (object.cardId && !cardIds.has(object.cardId)) issues.push(`${board.name} / ${object.name} 引用了缺失单卡`);
    if (object.deckId && !deckIds.has(object.deckId)) issues.push(`${board.name} / ${object.name} 引用了缺失卡组`);
    if (object.type === 'programmable-zone' && !Array.isArray(object.program?.blocks)) issues.push(`${board.name} / ${object.name} 的程序数据无效`);
    if (object.type === 'counter' && !['set', 'increase', 'decrease'].includes(object.counterRightClickAction)) issues.push(`${board.name} / ${object.name} 的计数器右键规则无效`);
    if (object.type === 'counter' && !Number.isFinite(Number(object.counterRightClickValue))) issues.push(`${board.name} / ${object.name} 的计数器右键数值无效`);
  }));
  return issues;
}
function renderExport() {
  const totalCards = state.decks.reduce((sum, deck) => sum + deck.entries.reduce((count, entry) => count + Number(entry.count || 0), 0), 0);
  const programmableZones = state.boards.reduce((sum, board) => sum + board.objects.filter(object => object.type === 'programmable-zone').length, 0);
  const storedProjectCount = new Set([...Object.keys(projectLibrary), state.project.id]).size;
  $('#exportPage').innerHTML = `<section class="card-panel export-actions transfer-panel"><div class="transfer-heading"><span class="transfer-icon">↙</span><div><h3>导入项目</h3><p>文件会作为新项目保存，不会覆盖当前项目。</p></div></div><div class="file-drop" id="fileDrop" tabindex="0" role="button"><span class="file-drop-icon">⇣</span><strong>拖入 .bgdesign 或 .json</strong><span>导入前需要为项目设置新名称</span></div><button class="primary-button transfer-main-button" id="importProjectButton">选择项目文件</button><div class="transfer-divider"><span>导出</span></div><button class="export-action featured" id="exportProjectButton"><span class="action-icon">↗</span><span><strong>导出完整项目</strong><small>包含版图、单卡、卡组、可编程区域、骰子与计数器</small></span><span class="format-badge">V2</span></button><button class="export-action" id="exportBoardButton"><span class="action-icon">▦</span><span><strong>导出当前版图</strong><small>包含全部版图对象及其试玩规则</small></span></button><button class="export-action" id="exportCardsButton"><span class="action-icon">▤</span><span><strong>导出全部单卡</strong><small>独立 JSON 单卡数据</small></span></button></section><section class="card-panel project-overview"><div class="overview-header"><div><span class="overview-kicker">CURRENT PROJECT</span><h3>${esc(state.project.name)}</h3><p>${esc(state.project.description || '暂无项目描述')}</p></div><button class="ghost-button" id="checkProjectButton">检查项目</button></div><div class="overview-grid"><div class="overview-tile"><span class="tile-number">${state.boards.length}</span><span class="tile-label">版图</span></div><div class="overview-tile"><span class="tile-number">${state.cards.length}</span><span class="tile-label">单卡</span></div><div class="overview-tile"><span class="tile-number">${state.decks.length}</span><span class="tile-label">卡组</span></div><div class="overview-tile accent"><span class="tile-number">${programmableZones}</span><span class="tile-label">可编程区域</span></div><div class="overview-tile"><span class="tile-number">${totalCards}</span><span class="tile-label">卡牌总数</span></div><div class="overview-tile"><span class="tile-number">${storedProjectCount}</span><span class="tile-label">浏览器项目</span></div></div><div class="export-format-section"><div class="section-label">完整项目格式</div><div class="format-status"><span class="format-status-icon">✓</span><div><strong>CardFoundry Project V2</strong><small>可编程区域、骰子、计数器及富文本卡牌效果均包含在文件中</small></div></div><div class="format-code">project · boards · cards · decks · board-controls · playtest</div></div><div class="project-storage-note"><span>◇</span><div><strong>导入项目保存在浏览器项目区域</strong><small>可通过左上角“当前项目”菜单随时切换。</small></div></div></section>`;
  $('#exportProjectButton').onclick = () => downloadFile(`${state.project.name}.bgdesign`, JSON.stringify(buildProjectExportPayload(), null, 2), 'application/json');
  $('#exportBoardButton').onclick = () => downloadFile(`${currentBoard().name}.json`, JSON.stringify({ format: 'cardfoundry-board', version: 2, features: { programmableZones: 1, nestedProgramBlocks: 1, diceObjects: 1, counterObjects: 1 }, board: boardExportSnapshot(currentBoard()) }, null, 2), 'application/json');
  $('#exportCardsButton').onclick = () => downloadFile(`${state.project.name}-cards.json`, JSON.stringify({ format: 'cardfoundry-cards', version: 2, cards: state.cards }, null, 2), 'application/json');
  $('#importProjectButton').onclick = () => $('#importFileInput').click();
  const fileDrop = $('#fileDrop');
  fileDrop.onclick = () => $('#importFileInput').click();
  fileDrop.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#importFileInput').click(); } };
  ['dragenter', 'dragover'].forEach(type => fileDrop.addEventListener(type, event => { event.preventDefault(); fileDrop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => fileDrop.addEventListener(type, event => { event.preventDefault(); fileDrop.classList.remove('dragging'); }));
  fileDrop.addEventListener('drop', event => { const file = event.dataTransfer?.files?.[0]; if (file) importProjectFile(file); });
  $('#checkProjectButton').onclick = () => { const issues = projectIntegrityIssues(); toast(issues.length ? `发现 ${issues.length} 个问题：${issues[0]}` : '检查完成：项目引用与程序数据完整', issues.length ? '' : 'success'); };
}
function downloadFile(name, content, type) { const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); toast('文件已导出', 'success'); }

function normalizeImportedProjectState(imported, name) {
  const previousState = state;
  try {
    const seed = seedState();
    const importedCopy = JSON.parse(JSON.stringify(imported));
    delete importedCopy.format; delete importedCopy.version; delete importedCopy.exportedAt; delete importedCopy.features;
    state = { ...seed, ...importedCopy };
    state.project = { ...seed.project, ...(imported.project || {}), id: uid('project'), name };
    normalizeState();
    state.playtest.deckSourceSignature = '';
    ensurePlaytestDecks(true);
    return JSON.parse(JSON.stringify(state));
  } finally {
    state = previousState;
  }
}
function openImportedProjectModal(imported, fileName) {
  const originalName = String(imported.project?.name || fileName.replace(/\.(?:bgdesign|json)$/i, '') || '导入项目').trim();
  const existingNames = new Set([...Object.values(projectLibrary).map(projectState => projectState.project?.name), state.project.name].filter(Boolean));
  let suggestedName = `${originalName}（导入）`;
  let suggestedIndex = 2;
  while (existingNames.has(suggestedName)) { suggestedName = `${originalName}（导入 ${suggestedIndex}）`; suggestedIndex += 1; }
  const boardCount = imported.boards.length;
  const cardCount = imported.cards.length;
  const deckCount = imported.decks.length;
  const programmableCount = imported.boards.reduce((sum, board) => sum + (board.objects || []).filter(object => object.type === 'programmable-zone').length, 0);
  const diceCount = imported.boards.reduce((sum, board) => sum + (board.objects || []).filter(object => object.type === 'dice').length, 0);
  const counterCount = imported.boards.reduce((sum, board) => sum + (board.objects || []).filter(object => object.type === 'counter').length, 0);
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal import-project-modal"><button class="modal-close" id="closeModal">×</button><span class="modal-kicker">IMPORT PROJECT</span><h3>将文件保存为新项目</h3><p>导入不会覆盖“${esc(state.project.name)}”。请为导入的项目设置名称，确认后它会加入左上角项目区域。</p><div class="import-file-summary"><span class="import-file-icon">⇣</span><div><strong>${esc(fileName)}</strong><small>${boardCount} 个版图 · ${cardCount} 张单卡 · ${deckCount} 个卡组 · ${programmableCount} 个可编程区域 · ${diceCount} 个骰子 · ${counterCount} 个计数器</small></div><span class="format-badge">V${Number(imported.version || 1)}</span></div><div class="field"><label>新项目名称</label><input id="importProjectNameInput" value="${esc(suggestedName)}" maxlength="60" autocomplete="off"></div><div class="import-project-note"><span>✓</span>版图对象、程序块、骰子和计数器规则会一并保存。</div><div class="modal-actions"><button class="ghost-button" id="cancelModal">取消</button><button class="primary-button" id="confirmProjectImport">导入并打开</button></div></div></div>`;
  const nameInput = $('#importProjectNameInput');
  const finishImport = () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return toast('请填写新项目名称'); }
    if (name === originalName) { nameInput.focus(); nameInput.select(); return toast('导入项目需要使用一个新名称'); }
    if (existingNames.has(name)) { nameInput.focus(); nameInput.select(); return toast('项目区域中已有同名项目，请使用其他名称'); }
    rememberProject();
    const importedState = normalizeImportedProjectState(imported, name);
    projectLibrary[importedState.project.id] = JSON.parse(JSON.stringify(importedState));
    state = importedState;
    undoStack = []; redoStack = [];
    closeModal(); renderAll(); switchView('design'); saveState(true);
    toast(`项目「${name}」已导入并保存到项目区域`, 'success');
  };
  $('#closeModal').onclick = closeModal; $('#cancelModal').onclick = closeModal;
  $('#modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
  $('#confirmProjectImport').onclick = finishImport;
  nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') finishImport(); });
  nameInput.focus(); nameInput.select();
}
async function importProjectFile(file) {
  try {
    if (!/\.(?:bgdesign|json)$/i.test(file.name)) throw new Error('请选择 .bgdesign 或 .json 项目文件');
    if (file.size > 25 * 1024 * 1024) throw new Error('项目文件不能超过 25 MB');
    const imported = JSON.parse(await file.text());
    if (imported.format === 'cardfoundry-board' || imported.format === 'cardfoundry-cards') throw new Error('这是局部导出文件，请选择完整项目文件');
    if (!imported.project || !Array.isArray(imported.cards) || !Array.isArray(imported.decks) || !Array.isArray(imported.boards)) throw new Error('文件不包含完整的桌游项目数据');
    imported.boards.forEach(board => { board.objects = Array.isArray(board.objects) ? board.objects : []; board.objects.forEach(object => { if (object.type === 'programmable-zone') object.program = normalizeProgram(object.program); }); });
    openImportedProjectModal(imported, file.name);
  } catch (error) {
    toast(`导入失败：${error.message}`);
  }
}

function setDesignTab(tab, rerender = true) {
  state.designTab = tab; $$('.subnav-tab').forEach(el => el.classList.toggle('active', el.dataset.design === tab));
  $('#boardPage').classList.toggle('hidden', tab !== 'board'); $('#cardsPage').classList.toggle('hidden', tab !== 'cards'); $('#decksPage').classList.toggle('hidden', tab !== 'decks');
  if (rerender) { if (tab === 'board') renderBoard(); if (tab === 'cards') renderCards(); if (tab === 'decks') renderDecks(); }
}
function switchView(view) {
  if (view === 'playtest') { ensurePlaytestDecks(); renderPlaytest(); }
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view)); $$('.view').forEach(el => el.classList.add('hidden')); $(`#${view}View`).classList.remove('hidden');
  const viewLabel = ({ design: '桌游设计', playtest: '桌游试玩', export: '文件导出与导入' })[view] || '整个项目';
  setAIContext(`${viewLabel} · 项目「${state.project?.name || '未命名'}」 · ${state.cards.length} 张单卡 · ${state.decks.length} 个卡组`);
}

async function importTable(file, target) {
  const text = await file.text(); let rows = [];
  if (file.name.endsWith('.xlsx') && window.XLSX) { const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }); } else { rows = text.trim().split(/\r?\n/).map(line => line.split(/\t|,/)); if (rows.length) { const headers = rows.shift(); rows = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))); } }
  if (!rows.length) return toast('没有读取到表格内容');
  if (target === 'cards') { mutate(() => rows.forEach((row, i) => { const tag = row['标签'] || row.tag || ''; if (tag && !state.tags.includes(tag)) state.tags.push(tag); state.cards.push({ id: uid('card'), name: row['卡名'] || row.name || Object.values(row)[0] || `导入卡牌 ${i+1}`, effect: sanitizeCardEffectHTML(row['卡牌效果'] || row.effect || ''), tag, rarity: row['稀有度'] || '普通', number: `C-${String(state.cards.length + i + 1).padStart(3,'0')}`, art: '✦', color: 'blue', template: row['模板'] || row.template || '默认 · 晨雾', width: Number(row['宽度'] || row.width || 63), height: Number(row['高度'] || row.height || 88) }); })); state.activeCardId = state.cards.at(-1).id; renderAll(); setDesignTab('cards'); toast(`已导入 ${rows.length} 张单卡`, 'success'); }
  if (target === 'deck') { const d = currentDeck(); mutate(() => rows.forEach(row => { const name = row['卡名'] || row.name || Object.values(row)[0]; const c = state.cards.find(card => card.name === name); if (c) { const count = Number(row['数量'] || row.count || 1); const existing = d.entries.find(e => e.cardId === c.id); if (existing) existing.count += count; else d.entries.push({ cardId: c.id, count }); } })); renderDecks(); toast(`已导入卡组成员`, 'success'); }
}

function bindGlobal() {
  $$('[data-view]').forEach(el => el.addEventListener('click', () => switchView(el.dataset.view)));
  $$('[data-design]').forEach(el => el.addEventListener('click', () => setDesignTab(el.dataset.design)));
  $('#quickPlayButton').onclick = () => switchView('playtest'); $('#undoButton').onclick = undo; $('#redoButton').onclick = redo;
  $('#aiToggleButton').onclick = () => toggleAIChat();
  $('#aiCloseButton').onclick = () => toggleAIChat(false);
  $('#aiSettingsButton').onclick = () => openSetupWizard(true);
  $('#aiContextSelect').addEventListener('change', event => switchAIContext(event.target.value));
  $('#aiNewContextButton').addEventListener('click', createAIContext);
  $('#aiDeleteContextButton').addEventListener('click', deleteAIContext);
  $('#aiInput').addEventListener('paste', event => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const html = clipboard.getData('text/html');
    if (!html) return;
    event.preventDefault();
    insertAIInputHTML($('#aiInput'), html, clipboard.getData('text/plain'));
  });
  $('#aiChatForm').addEventListener('submit', async event => {
    event.preventDefault();
    // requestSubmit() can be triggered by both the send button and Enter. Keep
    // a small in-memory lock so a second event cannot send the same prompt
    // while the previous request is still in flight.
    if (aiSending) return;
    const input = $('#aiInput');
    const sendButton = $('#aiSendButton');
    const text = aiInputPayload(input);
    if (!text) return;

    // Clear immediately, before making the network request. This prevents a
    // slow request (or an accidental second click) from reusing the prompt.
    input.innerHTML = '';
    aiSending = true;
    addAIMessage('user', text);
    sendButton.disabled = true;
    try { await sendAIMessage(text); }
    catch (error) { addAIMessage('assistant', `请求失败：${error.message}`); setAIStatus('请求失败，请检查 API 设置'); }
    finally { aiSending = false; sendButton.disabled = false; input.focus(); }
  });
  $('#aiInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#aiChatForm').requestSubmit(); } });
  $('#projectNameButton').onclick = openNewProjectModal;
  $('#helpButton').onclick = () => { $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="modal-close" id="closeModal">×</button><h3>CardFoundry 快速指南</h3><p>从左侧对象库添加版图区域；在单卡设计中粘贴飞书富文本；用卡组页设置牌数；最后进入试玩验证抽牌和弃牌。所有内容自动保存在当前浏览器。</p><div class="modal-actions"><button class="primary-button" id="cancelModal">知道了</button></div></div></div>`; $('#closeModal').onclick = closeModal; $('#cancelModal').onclick = closeModal; };
  $('#resetPlaytestButton').onclick = () => { mutate(() => { ensurePlaytestDecks(true); state.playtest.players.forEach(p => p.hand = []); state.playtest.tableCards = []; state.playtest.piles = {}; state.playtest.objectValues = {}; state.playtest.selectedPileId = ''; state.playtest.logs = [{ time: '刚刚', text: '试玩会话已重新开始，牌组已自动洗牌，骰子与计数器已归零' }]; }); renderPlaytest(); toast('试玩已重新开始，牌组已洗牌，骰子与计数器已归零', 'success'); };
  $('#saveSessionButton').onclick = () => { saveState(true); toast('试玩状态已保存', 'success'); };
  $('#importFileInput').addEventListener('change', async event => { const file = event.target.files[0]; if (file) await importProjectFile(file); event.target.value = ''; });
  $('#cardImportInput').addEventListener('change', e => { if (e.target.files[0]) importTable(e.target.files[0], 'cards'); e.target.value = ''; }); $('#deckImportInput').addEventListener('change', e => { if (e.target.files[0]) importTable(e.target.files[0], 'deck'); e.target.value = ''; });
  document.addEventListener('mousedown', e => { if (!e.target.closest?.('.rich-color-control')) closeRichColorPopovers(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRichColorPopovers(); if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveState(true); toast('已保存', 'success'); } });
}

function openNewProjectModal() {
  rememberProject();
  const items = Object.values(projectLibrary).sort((a, b) => a.project.name.localeCompare(b.project.name, 'zh-CN'));
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="modal-close" id="closeModal">×</button><h3>项目</h3><p>切换已有项目，或创建一个全新的桌游项目。</p><div class="project-picker-list">${items.map(item => `<div class="project-picker-item ${item.project.id === state.project.id ? 'current' : ''}"><div><div class="project-picker-name">${esc(item.project.name)}</div><div class="project-picker-meta">${item.cards?.length || 0} 张单卡 · ${item.boards?.length || 0} 个版图</div></div>${item.project.id === state.project.id ? '<span class="tab-count">当前</span>' : `<button class="ghost-button" data-switch-project="${item.project.id}">打开</button>`}</div>`).join('')}</div><div class="section-label">新建项目</div><div class="field"><label>项目名称</label><input id="newProjectNameInput" value="未命名桌游" maxlength="60"></div><div class="field"><label>项目描述（可选）</label><textarea id="newProjectDescriptionInput" placeholder="写一句关于这个桌游的介绍"></textarea></div><div class="modal-actions"><button class="ghost-button" id="cancelModal">取消</button><button class="primary-button" id="confirmNewProject">创建项目</button></div></div></div>`;
  $('#closeModal').onclick = closeModal; $('#cancelModal').onclick = closeModal; $('#modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
  const nameInput = $('#newProjectNameInput'); nameInput.focus(); nameInput.select();
  $$('[data-switch-project]').forEach(button => button.addEventListener('click', () => { rememberProject(); state = JSON.parse(JSON.stringify(projectLibrary[button.dataset.switchProject])); normalizeState(); closeModal(); renderAll(); saveState(true); toast(`已打开「${state.project.name}」`, 'success'); }));
  $('#confirmNewProject').onclick = () => {
    const name = nameInput.value.trim() || '未命名桌游'; const description = $('#newProjectDescriptionInput').value.trim();
    mutate(() => { rememberProject(); state = createBlankProject(name, description); });
    closeModal(); renderAll(); switchView('design'); toast(`项目「${name}」已创建`, 'success');
  };
}

(async function boot() { await hydrate(); normalizeState(); bindGlobal(); renderAll(); renderAIConversation(); renderAIContextControls(); persistAIContexts(); saveState(); setTimeout(() => openSetupWizard(false), 120); })();
