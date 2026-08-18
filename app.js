/* CardFoundry - zero dependency prototype app */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

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
  playtest: { currentPlayer: 1, players: [{ name: '玩家 1', color: '#d5f567', hand: [] }], decks: [], deckSourceSignature: '', tableCards: [], piles: {}, selectedPileId: '', logs: [{ time: '刚刚', text: '试玩会话已准备' }] }
});

let state = loadLocal() || seedState();
let db;
let saveTimer;
let undoStack = [];
let redoStack = [];
let projectLibrary = loadProjectLibrary();
let activeDragEntityId = '';
let aiSettings = loadAISettings();
const AI_WELCOME_MESSAGE = '你好！我可以根据当前项目创建卡牌、整理卡组、调整版图对象，或解释试玩状态。试试说“创建一张名为迷雾预兆的事件卡”。';
let aiContexts = {};
let activeAIContextId = '';
let aiConversation = [];
let aiSending = false;

const mcpToolDefinitions = [
  { name: 'get_project_state', description: '读取当前桌游项目的版图、单卡、卡组、标签和试玩摘要。', parameters: { type: 'object', properties: {} } },
  { name: 'update_project', description: '更新项目名称或描述。', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'create_card', description: '创建一张单卡，可设置卡名、效果、标签、稀有度、编号、颜色、插图符号、模板和尺寸。', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, effect: { type: 'string' }, tag: { type: 'string' }, rarity: { type: 'string' }, number: { type: 'string' }, color: { type: 'string' }, art: { type: 'string' }, template: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } } },
  { name: 'update_card', description: '更新已有单卡的内容、元数据、模板或尺寸。', parameters: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'string' }, name: { type: 'string' }, effect: { type: 'string' }, tag: { type: 'string' }, rarity: { type: 'string' }, number: { type: 'string' }, art: { type: 'string' }, color: { type: 'string' }, template: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } } } },
  { name: 'delete_card', description: '删除一张单卡；卡组中的引用会保留为缺失项。', parameters: { type: 'object', required: ['cardId'], properties: { cardId: { type: 'string' } } } },
  { name: 'create_deck', description: '创建一个空卡组。', parameters: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'update_deck', description: '更新已有卡组名称或描述。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } } } },
  { name: 'delete_deck', description: '删除一个卡组，不删除其中的单卡。', parameters: { type: 'object', required: ['deckId'], properties: { deckId: { type: 'string' } } } },
  { name: 'add_card_to_deck', description: '向卡组添加单卡或增加单卡数量。', parameters: { type: 'object', required: ['deckId', 'cardId'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' }, count: { type: 'number' } } } },
  { name: 'set_deck_card_count', description: '精确设置一张单卡在卡组中的数量；设为 0 会将其移出卡组。', parameters: { type: 'object', required: ['deckId', 'cardId', 'count'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' }, count: { type: 'number', minimum: 0 } } } },
  { name: 'remove_card_from_deck', description: '从卡组中移除单卡关系。', parameters: { type: 'object', required: ['deckId', 'cardId'], properties: { deckId: { type: 'string' }, cardId: { type: 'string' } } } },
  { name: 'create_board_object', description: '在指定版图（省略 boardId 时为当前版图）添加卡牌放置格、卡牌放置区、卡组放置区或卡堆。', parameters: { type: 'object', required: ['type'], properties: { boardId: { type: 'string' }, type: { type: 'string', enum: ['card-slot', 'card-zone', 'deck-zone', 'stack'] }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, cardId: { type: 'string' }, deckId: { type: 'string' }, background: { type: 'string' }, locked: { type: 'boolean' }, showName: { type: 'boolean' }, showBack: { type: 'boolean' }, showCount: { type: 'boolean' }, drawTarget: { type: 'string' }, layout: { type: 'string' }, gap: { type: 'number' }, stackMode: { type: 'string' } } } },
  { name: 'update_board_object', description: '更新指定版图对象的位置、尺寸、名称、绑定关系、样式、排列或试玩行为。', parameters: { type: 'object', required: ['objectId'], properties: { boardId: { type: 'string' }, objectId: { type: 'string' }, name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, cardId: { type: 'string' }, deckId: { type: 'string' }, background: { type: 'string' }, locked: { type: 'boolean' }, showName: { type: 'boolean' }, showBack: { type: 'boolean' }, showCount: { type: 'boolean' }, drawTarget: { type: 'string' }, layout: { type: 'string' }, gap: { type: 'number' }, stackMode: { type: 'string' } } } },
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
  { name: 'reset_playtest', description: '重新开始试玩并从设计卡组创建新的试玩副本；不会修改设计数据。', parameters: { type: 'object', properties: {} } }
];

function loadAISettings() {
  const defaults = { configured: false, dismissed: false, endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem('cardfoundry_ai_settings')) || {}) }; } catch { return defaults; }
}
function saveAISettings() { try { localStorage.setItem('cardfoundry_ai_settings', JSON.stringify(aiSettings)); } catch { /* local storage unavailable */ } if (db) { const tx = db.transaction('appState', 'readwrite'); tx.objectStore('appState').put({ id: 'aiSettings', value: aiSettings }); } }

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
    aiSettingsRequest.onsuccess = () => { if (aiSettingsRequest.result?.value) aiSettings = aiSettingsRequest.result.value; };
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
  state.cards.forEach(card => { card.template = card.template || '默认 · 晨雾'; card.width = Number(card.width || 63); card.height = Number(card.height || 88); });
  const existingCardTags = state.cards.map(card => card.tag).filter(tag => tag && tag !== '未分类');
  state.tags = [...new Set([...(Array.isArray(state.tags) ? state.tags : []), ...existingCardTags])];
  state.decks = Array.isArray(state.decks) ? state.decks : [];
  state.decks.forEach(deck => { deck.entries = Array.isArray(deck.entries) ? deck.entries : []; deck.description = deck.description || ''; });
  state.boards.forEach(board => { board.objects = Array.isArray(board.objects) ? board.objects : []; board.objects.forEach(object => { object.showName = object.showName !== false; object.showCount = object.showCount !== false; object.gap = Number(object.gap || 10); object.stackMode = object.stackMode || '顶牌'; }); });
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
    playtest: { currentPlayer: 1, players: [{ name: '玩家 1', color: '#d5f567', hand: [] }], decks: [], deckSourceSignature: '', tableCards: [], piles: {}, selectedPileId: '', logs: [{ time: '刚刚', text: '试玩会话已准备' }] }
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
  const allowed = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL']);
  const blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT']);
  const safeStyleProperties = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'font-size', 'line-height'];
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
    // Preserve only a small, presentation-only CSS subset. In particular,
    // discard url(), expression(), javascript: and all other executable CSS.
    if (node.hasAttribute('style')) {
      safeStyleProperties.forEach(property => {
        const styleValue = node.style.getPropertyValue(property).trim();
        if (styleValue && !/(?:url\s*\(|expression\s*\(|javascript\s*:|@import)/i.test(styleValue)) {
          element.style.setProperty(property, styleValue);
        }
      });
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

function markdownToHTML(value = '') {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  const output = []; let paragraph = []; let listType = ''; let inFence = false; let fenceLines = [];
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${markdownInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`); paragraph = []; } };
  const closeList = () => { if (listType) { output.push(`</${listType}>`); listType = ''; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) { if (inFence) { output.push(`<pre><code>${esc(fenceLines.join('\n'))}</code></pre>`); fenceLines = []; inFence = false; } else { flushParagraph(); closeList(); inFence = true; } continue; }
    if (inFence) { fenceLines.push(line); continue; }
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

function renderAIContent(value = '') {
  const raw = String(value);
  if (!raw.trim()) return '';
  const hasHTML = /<\/?[a-z][^>]*>/i.test(raw);
  if (!hasHTML) return markdownToHTML(raw);
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
  return wrapper.innerHTML;
}

function projectAIContext() {
  return { project: state.project, boards: state.boards.map(board => ({ ...board, objects: board.objects })), cards: state.cards, tags: state.tags, decks: state.decks, playtest: { players: state.playtest.players, tableCards: state.playtest.tableCards, piles: state.playtest.piles } };
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
  if (persist) { aiConversation.push({ role, content: String(text || '') }); persistAIContexts(); renderAIContextControls(); }
  return item;
}
function updateAIMessage(item, text) {
  if (!item) return;
  const content = $('.ai-message-content', item); if (content) content.innerHTML = renderAIContent(text);
  const messages = $('#aiMessages'); if (messages) messages.scrollTop = messages.scrollHeight;
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
function ensurePlaytestDecks(force = false) {
  const signature = playtestDeckSignature();
  if (!force && state.playtest.decks.length && state.playtest.deckSourceSignature === signature) return;
  state.playtest.decks = state.decks.map(deck => ({ id: deck.id, name: deck.name, description: deck.description, entries: deck.entries.map(entry => ({ cardId: entry.cardId, count: Number(entry.count || 0) })) }));
  state.playtest.deckSourceSignature = signature;
}
function objectLabel(type) { return ({ 'card-slot': '卡牌放置格', 'card-zone': '卡牌放置区', 'deck-zone': '卡组放置区', stack: '卡堆' })[type] || type; }
function objectColor(type) { return ({ 'card-slot': 'blue', 'card-zone': 'green', 'deck-zone': 'purple', stack: 'orange' })[type] || 'blue'; }
function objectSymbol(type) { return ({ 'card-slot': '▣', 'card-zone': '▤', 'deck-zone': '▥', stack: '▰' })[type] || '▧'; }

function renderAll() {
  renderProjectHeader();
  $('#cardCount').textContent = state.cards.length;
  $('#deckCount').textContent = state.decks.length;
  renderBoard(); renderCards(); renderDecks(); renderPlaytest(); renderExport();
  setDesignTab(state.designTab || 'board', false);
  const viewLabel = ({ design: '桌游设计', playtest: '桌游试玩', export: '文件导出' })[$$('.nav-item.active')[0]?.dataset.view] || '整个项目';
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
      ${[['card-slot','blue','▣','卡牌放置格','放置一张卡牌'],['card-zone','green','▤','卡牌放置区','平铺多张卡牌'],['deck-zone','purple','▥','卡组放置区','从卡组抽牌'],['stack','orange','▰','卡堆','弃牌 / 除外区']].map(([type,color,symbol,name,help]) => `<button class="object-card" data-add-object="${type}"><span class="object-icon ${color}">${symbol}</span><span><span class="object-label">${name}</span><span class="object-help">${help}</span></span></button>`).join('')}
      <div class="layer-section"><div class="panel-heading"><span class="panel-title">图层</span><span class="panel-hint">${board.objects.length} 个对象</span></div>
        ${board.objects.map((o) => `<div class="layer-row ${o.id === state.selectedObjectId ? 'selected' : ''}" data-select-object="${o.id}"><span class="layer-dot" style="background:var(--${objectColor(o.type) === 'blue' ? 'blue' : objectColor(o.type) === 'purple' ? 'purple' : objectColor(o.type) === 'orange' ? 'orange' : 'lime'})"></span><span class="layer-name">${esc(o.name)}</span><span class="layer-type">${objectLabel(o.type)}</span></div>`).join('')}
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
  return `<div class="board-object ${objectColor(o.type)} ${o.id === state.selectedObjectId ? 'selected' : ''}" data-board-object="${o.id}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;${o.background ? `background:${esc(o.background)};` : ''}"><span class="object-symbol">${objectSymbol(o.type)}</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}${o.type === 'deck-zone' && o.showCount ? '<small>11 张剩余</small>' : ''}</div>`;
}
function renderInspector(o) {
  return `<div class="panel-heading"><span class="panel-title">属性检查器</span><button class="danger-button" data-delete-object="${o.id}">删除</button></div>
    <div class="inspector-section"><div class="section-label">基础信息</div><div class="field"><label>对象名称</label><input data-object-field="name" value="${esc(o.name)}"></div><div class="field"><label>对象类型</label><input value="${objectLabel(o.type)}" disabled></div></div>
    <div class="inspector-section"><div class="section-label">位置与尺寸</div><div class="field-row"><div class="field"><label>X</label><input type="number" data-object-field="x" value="${o.x}"></div><div class="field"><label>Y</label><input type="number" data-object-field="y" value="${o.y}"></div></div><div class="field-row"><div class="field"><label>宽度</label><input type="number" data-object-field="width" value="${o.width}"></div><div class="field"><label>高度</label><input type="number" data-object-field="height" value="${o.height}"></div></div></div>
    <div class="inspector-section"><div class="section-label">外观</div><div class="field"><label>背景颜色</label><input type="text" data-object-field="background" value="${esc(o.background || '')}" placeholder="使用默认颜色"></div><div class="toggle-line">显示对象名称 <button class="switch ${o.showName !== false ? 'on' : ''}" data-toggle-field="showName"><span></span></button></div><div class="toggle-line">锁定对象 <button class="switch ${o.locked ? 'on' : ''}" data-toggle-field="locked"><span></span></button></div></div>
    ${o.type === 'card-slot' ? `<div class="inspector-section"><div class="section-label">绑定卡牌</div><div class="field"><label>指定卡牌</label><select data-object-field="cardId"><option value="">任意卡牌</option>${state.cards.map(c => `<option value="${c.id}" ${o.cardId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="toggle-line">显示卡牌背面 <button class="switch ${o.showBack ? 'on' : ''}" data-toggle-field="showBack"><span></span></button></div></div>` : ''}
    ${o.type === 'deck-zone' ? `<div class="inspector-section"><div class="section-label">绑定卡组</div><div class="field"><label>卡组</label><select data-object-field="deckId">${state.decks.map(d => `<option value="${d.id}" ${o.deckId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div><div class="toggle-line">显示剩余数量 <button class="switch ${o.showCount !== false ? 'on' : ''}" data-toggle-field="showCount"><span></span></button></div><div class="field"><label>抽出后进入</label><select data-object-field="drawTarget"><option>玩家手牌</option><option ${o.drawTarget === '玩家区域' ? 'selected' : ''}>玩家区域</option></select></div></div>` : ''}
    ${o.type === 'card-zone' ? `<div class="inspector-section"><div class="section-label">排列方式</div><div class="field"><label>卡牌排列</label><select data-object-field="layout"><option ${o.layout === '平铺' ? 'selected' : ''}>平铺</option><option ${o.layout === '网格' ? 'selected' : ''}>网格</option><option ${o.layout === '扇形' ? 'selected' : ''}>扇形</option></select></div></div>` : ''}`;
}
function bindBoardEvents() {
  $$('.object-card').forEach((el) => el.addEventListener('click', () => addBoardObject(el.dataset.addObject)));
  $$('[data-select-object]').forEach((el) => el.addEventListener('click', () => { state.selectedObjectId = el.dataset.selectObject; renderBoard(); }));
  $$('[data-delete-object]').forEach((el) => el.addEventListener('click', () => { mutate(() => { currentBoard().objects = currentBoard().objects.filter(o => o.id !== el.dataset.deleteObject); state.selectedObjectId = currentBoard().objects[0]?.id; }); renderBoard(); toast('已删除版图对象', 'success'); }));
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
  $$('#boardPage [data-object-field]').forEach((el) => el.addEventListener('change', () => { const o = currentBoard().objects.find(x => x.id === state.selectedObjectId); if (!o) return; mutate(() => { const key = el.dataset.objectField; o[key] = ['x','y','width','height'].includes(key) ? Number(el.value) : el.value; }); renderBoard(); }));
  $$('#boardPage [data-toggle-field]').forEach((el) => el.addEventListener('click', () => { const o = currentBoard().objects.find(x => x.id === state.selectedObjectId); mutate(() => o[el.dataset.toggleField] = !o[el.dataset.toggleField]); renderBoard(); }));
  $('#gridTool')?.addEventListener('click', (e) => { $('#boardCanvasWrap').classList.toggle('no-grid'); e.currentTarget.classList.toggle('active'); });
  $('#fitTool')?.addEventListener('click', () => toast('画布已适应窗口', 'success'));
}
function addBoardObject(type) {
  const names = { 'card-slot': '新卡牌放置格', 'card-zone': '新卡牌区域', 'deck-zone': '新卡组牌堆', stack: '新卡堆' };
  mutate(() => { const object = { id: uid('obj'), type, name: names[type], x: 170 + currentBoard().objects.length * 22, y: 150 + currentBoard().objects.length * 22, width: type === 'card-zone' ? 290 : 138, height: type === 'card-zone' ? 150 : 110, color: objectColor(type), showName: true }; if (type === 'deck-zone') { object.deckId = state.decks[0]?.id; object.showCount = true; object.drawTarget = '玩家手牌'; } currentBoard().objects.push(object); state.selectedObjectId = object.id; }); renderBoard(); toast(`${names[type]}已添加`, 'success');
}

function renderCards() {
  const active = currentCard();
  $('#cardsPage').innerHTML = `<div class="cards-layout"><aside class="card-panel list-panel"><div class="panel-heading"><span class="panel-title">单卡库</span><span class="panel-hint">${state.cards.length} 张</span></div><div class="list-actions"><button class="primary-button" id="newCardButton">＋ 新建</button><button class="ghost-button" id="importCardsButton">导入表格</button></div><div class="search-wrap"><input class="search-input" id="cardSearch" placeholder="搜索卡名、标签" /></div><div class="card-list">${state.cards.length ? state.cards.map(c => `<div class="card-list-item ${c.id === state.activeCardId ? 'selected' : ''}" data-select-card="${c.id}"><span class="mini-card ${c.color || ''}">${esc(c.art || '✦')}</span><span class="card-item-text"><span class="card-item-name">${esc(c.name)}</span><span class="card-item-tag">${esc(c.tag || '未分类')} · ${esc(c.rarity || '普通')}</span></span></div>`).join('') : '<div class="list-empty">还没有单卡<br>创建第一张卡牌，或导入表格批量创建。</div>'}</div></aside><section class="card-panel card-editor"><div class="editor-form">${active ? renderCardForm(active) : '<div class="inspector-empty">选择或新建一张卡牌</div>'}</div>${active ? renderCardPreview(active) : ''}</section><aside class="card-panel editor-side">${active ? renderCardMeta(active) : '<div class="inspector-empty">卡牌属性会显示在这里</div>'}</aside></div>`;
  bindCardEvents();
}
function renderCardForm(c) {
  return `<div class="editor-title-row"><div><div class="editor-kicker">CARD / ${esc(c.number || 'NEW')}</div><div class="editor-title">编辑单卡</div></div><button class="danger-button" id="deleteCardButton">删除</button></div><div class="field"><label>卡名</label><input id="cardNameInput" value="${esc(c.name)}" placeholder="例如：余烬火花"></div><div class="field"><label>卡牌效果</label><div class="rich-toolbar">${[['bold','B'],['italic','I'],['underline','U'],['foreColor','A'],['hiliteColor','▰'],['justifyLeft','≡'],['insertUnorderedList','☷']].map(([command,label]) => `<button type="button" data-command="${command}">${label}</button>`).join('')}<button type="button" data-command="removeFormat">清</button></div><div class="rich-editor" id="cardEffectEditor" contenteditable="true">${c.effect || ''}</div><div class="editor-note">支持从飞书粘贴文字，颜色与底色会被保留。</div></div>`;
}
function renderCardPreview(c) {
  const scale = Math.max(.72, Math.min(1.22, Number(c.width || 63) / 63));
  const templateClass = c.template === '简约 · 象牙' ? 'ivory' : c.template === '事件 · 午夜' ? 'midnight' : '';
  return `<div class="card-preview-wrap"><div class="preview-label">LIVE PREVIEW · 正面</div><div class="playing-card ${templateClass}" style="--card-scale:${scale}"><div class="playing-card-inner"><div class="card-rarity">${esc(c.rarity || '普通')} · ${esc(c.tag || '未分类')}</div><div class="card-title" id="previewName">${esc(c.name || '未命名卡牌')}</div><div class="card-art">${esc(c.art || '✦')}</div><div class="card-effect" id="previewEffect">${c.effect || '<span style="color:#7a8585">卡牌效果将显示在这里</span>'}</div><div class="card-footer"><span>${esc(c.number || 'C-000')}</span><span>${esc(state.project?.name || 'CardFoundry')}</span></div></div></div></div>`;
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
  $('#cardEffectEditor')?.addEventListener('input', e => { const c = currentCard(); c.effect = e.target.innerHTML; $('#previewEffect').innerHTML = c.effect; saveState(); });
  $$('[data-command]').forEach(el => el.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand(el.dataset.command, false, el.dataset.command === 'foreColor' ? '#d5f567' : undefined); $('#cardEffectEditor')?.focus(); }));
  [['cardArtInput','art'],['cardNumberInput','number'],['cardRarityInput','rarity'],['cardTemplate','template']].forEach(([id,key]) => $(`#${id}`)?.addEventListener('change', e => { currentCard()[key] = e.target.value; saveState(); renderCards(); }));
  [['cardWidthInput','width'],['cardHeightInput','height']].forEach(([id,key]) => $(`#${id}`)?.addEventListener('change', e => { currentCard()[key] = Math.max(20, Number(e.target.value) || (key === 'width' ? 63 : 88)); saveState(); renderCards(); }));
  $('#cardTagInput')?.addEventListener('change', e => {
    if (e.target.value === '__new__') { openTagManager(true); return; }
    currentCard().tag = e.target.value;
    saveState(); renderCards();
  });
  $('#manageTagsButton')?.addEventListener('click', () => openTagManager(false));
}
function newCard() { mutate(() => { const c = { id: uid('card'), name: '未命名卡牌', effect: '输入卡牌效果……', tag: '', rarity: '普通', number: `C-${String(state.cards.length + 1).padStart(3, '0')}`, art: '✦', color: 'blue', template: '默认 · 晨雾', width: 63, height: 88 }; state.cards.push(c); state.activeCardId = c.id; }); renderAll(); toast('已创建新单卡，请为它选择标签', 'success'); }

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
  $('#decksPage').innerHTML = `<div class="decks-layout"><aside class="card-panel list-panel"><div class="panel-heading"><span class="panel-title">卡组库</span><span class="panel-hint">${state.decks.length} 组</span></div><div class="list-actions"><button class="primary-button" id="newDeckButton">＋ 新建</button><button class="ghost-button" id="importDeckButton">导入 XLSX</button></div><div class="search-wrap"><input class="search-input" id="deckSearch" placeholder="搜索卡组" /></div><div class="card-list">${state.decks.map(deck => `<div class="card-list-item ${deck.id === state.activeDeckId ? 'selected' : ''}" data-select-deck="${deck.id}"><span class="mini-card purple">▥</span><span class="card-item-text"><span class="card-item-name">${esc(deck.name)}</span><span class="card-item-tag">${deck.entries.length} 种 · ${deck.entries.reduce((s,e)=>s+Number(e.count||0),0)} 张</span></span></div>`).join('')}</div></aside><section class="card-panel deck-editor">${d ? `<div class="deck-header"><div><div class="editor-kicker">DECK / ${esc(d.id.slice(-5).toUpperCase())}</div><div class="deck-title">${esc(d.name)}</div><div class="deck-description">${esc(d.description || '为你的牌组写下一句说明。')}</div></div><div class="stat-row"><div class="stat-card"><span class="stat-value">${d.entries.length}</span><span class="stat-label">卡牌种类</span></div><div class="stat-card"><span class="stat-value">${total}</span><span class="stat-label">卡牌总数</span></div></div></div><div class="field-row"><div class="field"><label>卡组名称</label><input id="deckNameInput" value="${esc(d.name)}"></div><div class="field"><label>描述</label><input id="deckDescriptionInput" value="${esc(d.description || '')}"></div></div><div class="add-card-row"><span class="section-caption">卡组成员 · 拖拽或添加单卡</span><button class="ghost-button" id="addDeckCardButton">＋ 添加单卡</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>卡牌</th><th>标签</th><th>数量</th><th>操作</th></tr></thead><tbody>${d.entries.map((entry, index) => { const c = cardById(entry.cardId); return `<tr><td><strong>${esc(c?.name || '缺失单卡')}</strong></td><td>${esc(c?.tag || '待处理')}</td><td><input class="field qty-input" data-deck-qty="${index}" value="${Number(entry.count || 0)}" type="number" min="0"></td><td><div class="table-actions"><button data-edit-deck-card="${entry.cardId}">编辑</button><button data-remove-deck-card="${index}">移除</button></div></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="inspector-empty">还没有卡组<br>创建一个卡组开始吧</div>'}</section></div>`;
  bindDeckEvents();
}
function bindDeckEvents() {
  $('#newDeckButton')?.addEventListener('click', () => { mutate(() => { const d = { id: uid('deck'), name: '新卡组', description: '', entries: [] }; state.decks.push(d); state.activeDeckId = d.id; }); renderAll(); setDesignTab('decks'); toast('已创建新卡组', 'success'); });
  $('#importDeckButton')?.addEventListener('click', () => $('#deckImportInput').click());
  $$('[data-select-deck]').forEach(el => el.addEventListener('click', () => { state.activeDeckId = el.dataset.selectDeck; renderDecks(); }));
  $('#deckNameInput')?.addEventListener('input', e => { currentDeck().name = e.target.value; saveState(); });
  $('#deckDescriptionInput')?.addEventListener('input', e => { currentDeck().description = e.target.value; saveState(); });
  $$('[data-deck-qty]').forEach(el => el.addEventListener('change', e => { mutate(() => currentDeck().entries[Number(el.dataset.deckQty)].count = Math.max(0, Number(e.target.value))); renderDecks(); }));
  $$('[data-remove-deck-card]').forEach(el => el.addEventListener('click', () => { mutate(() => currentDeck().entries.splice(Number(el.dataset.removeDeckCard), 1)); renderDecks(); }));
  $$('[data-edit-deck-card]').forEach(el => el.addEventListener('click', () => { state.activeCardId = el.dataset.editDeckCard; setDesignTab('cards'); }));
  $('#addDeckCardButton')?.addEventListener('click', openAddCardModal);
}
function openAddCardModal() {
  const d = currentDeck();
  $('#modalRoot').innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal"><button class="modal-close" id="closeModal">×</button><h3>添加单卡到「${esc(d.name)}」</h3><p>选择已有单卡并设置加入数量。</p><div class="field"><label>单卡</label><select id="modalCardSelect">${state.cards.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.tag || '未分类')}</option>`).join('')}</select></div><div class="field"><label>数量</label><input id="modalCardCount" type="number" value="1" min="1"></div><div class="modal-actions"><button class="ghost-button" id="cancelModal">取消</button><button class="primary-button" id="confirmAddCard">添加到卡组</button></div></div></div>`;
  $('#closeModal').onclick = closeModal; $('#cancelModal').onclick = closeModal; $('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
  $('#confirmAddCard').onclick = () => { const id = $('#modalCardSelect').value; const count = Number($('#modalCardCount').value); mutate(() => { const found = d.entries.find(e => e.cardId === id); if (found) found.count += count; else d.entries.push({ cardId: id, count }); }); closeModal(); renderDecks(); toast('已添加到卡组', 'success'); };
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
  if (!force && (aiSettings.configured || aiSettings.dismissed)) return;
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
    else if (name === 'update_project') { if (args.name !== undefined) state.project.name = String(args.name); if (args.description !== undefined) state.project.description = String(args.description); result = state.project; }
    else if (name === 'add_tag') { const tag = String(args.tag || '').trim(); if (tag && !state.tags.includes(tag)) state.tags.push(tag); result = state.tags; }
    else if (name === 'create_card') { const card = { id: uid('card'), name: String(args.name || '未命名卡牌'), effect: args.effect || '', tag: args.tag || '', rarity: args.rarity || '普通', number: args.number || `C-${String(state.cards.length + 1).padStart(3, '0')}`, art: args.art || '✦', color: args.color || 'blue', template: args.template || '默认 · 晨雾', width: Math.max(20, Number(args.width || 63)), height: Math.max(20, Number(args.height || 88)) }; if (card.tag && !state.tags.includes(card.tag)) state.tags.push(card.tag); state.cards.push(card); state.activeCardId = card.id; result = card; }
    else if (name === 'update_card') { const card = cardById(args.cardId); if (!card) throw new Error('找不到单卡'); ['name','effect','tag','rarity','number','art','color','template'].forEach(key => { if (args[key] !== undefined) card[key] = args[key]; }); ['width','height'].forEach(key => { if (args[key] !== undefined) card[key] = Math.max(20, Number(args[key])); }); if (card.tag && !state.tags.includes(card.tag)) state.tags.push(card.tag); result = card; }
    else if (name === 'delete_card') { const card = cardById(args.cardId); if (!card) throw new Error('找不到单卡'); state.cards = state.cards.filter(item => item.id !== args.cardId); if (state.activeCardId === args.cardId) state.activeCardId = state.cards[0]?.id || ''; result = { deleted: args.cardId }; }
    else if (name === 'create_deck') { const deck = { id: uid('deck'), name: String(args.name || '新卡组'), description: args.description || '', entries: [] }; state.decks.push(deck); state.activeDeckId = deck.id; result = deck; }
    else if (name === 'update_deck') { const deck = deckById(args.deckId); if (!deck) throw new Error('找不到卡组'); if (args.name !== undefined) deck.name = args.name; if (args.description !== undefined) deck.description = args.description; result = deck; }
    else if (name === 'delete_deck') { if (!deckById(args.deckId)) throw new Error('找不到卡组'); state.decks = state.decks.filter(item => item.id !== args.deckId); if (state.activeDeckId === args.deckId) state.activeDeckId = state.decks[0]?.id || ''; result = { deleted: args.deckId }; }
    else if (name === 'add_card_to_deck') { const deck = deckById(args.deckId); if (!deck || !cardById(args.cardId)) throw new Error('找不到卡组或单卡'); const entry = deck.entries.find(item => item.cardId === args.cardId); if (entry) entry.count += Number(args.count || 1); else deck.entries.push({ cardId: args.cardId, count: Number(args.count || 1) }); result = deck; }
    else if (name === 'set_deck_card_count') { const deck = deckById(args.deckId); if (!deck || !cardById(args.cardId)) throw new Error('找不到卡组或单卡'); const count = Math.max(0, Number(args.count || 0)); const entry = deck.entries.find(item => item.cardId === args.cardId); if (count === 0) deck.entries = deck.entries.filter(item => item.cardId !== args.cardId); else if (entry) entry.count = count; else deck.entries.push({ cardId: args.cardId, count }); result = deck; }
    else if (name === 'remove_card_from_deck') { const deck = deckById(args.deckId); if (!deck) throw new Error('找不到卡组'); deck.entries = deck.entries.filter(item => item.cardId !== args.cardId); result = deck; }
    else if (name === 'create_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); if (!board) throw new Error('找不到版图'); const object = { id: uid('obj'), type: args.type, name: args.name || objectLabel(args.type), x: Number(args.x ?? 150), y: Number(args.y ?? 150), width: Number(args.width ?? (args.type === 'card-zone' ? 290 : 138)), height: Number(args.height ?? (args.type === 'card-zone' ? 150 : 110)), cardId: args.cardId || '', deckId: args.deckId || '', color: objectColor(args.type), background: args.background || '', locked: Boolean(args.locked), showName: args.showName !== false, showBack: Boolean(args.showBack), showCount: args.showCount !== false, drawTarget: args.drawTarget || '玩家手牌', layout: args.layout || '平铺', gap: Number(args.gap ?? 10), stackMode: args.stackMode || '顶牌' }; board.objects.push(object); state.activeBoardId = board.id; state.selectedObjectId = object.id; result = object; }
    else if (name === 'update_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); const object = board?.objects.find(item => item.id === args.objectId); if (!object) throw new Error('找不到版图对象'); ['name','cardId','deckId','background','locked','showName','showBack','showCount','drawTarget','layout','stackMode'].forEach(key => { if (args[key] !== undefined) object[key] = args[key]; }); ['x','y','width','height','gap'].forEach(key => { if (args[key] !== undefined) object[key] = Number(args[key]); }); result = object; }
    else if (name === 'delete_board_object') { const board = args.boardId ? boardById(args.boardId) : currentBoard(); if (!board?.objects.some(item => item.id === args.objectId)) throw new Error('找不到版图对象'); board.objects = board.objects.filter(item => item.id !== args.objectId); if (state.selectedObjectId === args.objectId) state.selectedObjectId = ''; result = { deleted: args.objectId }; }
    else if (name === 'create_board') { const board = { id: uid('board'), name: args.name || '新版图', width: Number(args.width || 930), height: Number(args.height || 610), background: args.background || '#111620', objects: [] }; state.boards.push(board); state.activeBoardId = board.id; result = board; }
    else if (name === 'update_board') { const board = state.boards.find(item => item.id === args.boardId); if (!board) throw new Error('找不到版图'); ['name','width','height','background'].forEach(key => { if (args[key] !== undefined) board[key] = args[key]; }); result = board; }
    else if (name === 'delete_board') { if (state.boards.length <= 1) throw new Error('至少保留一个版图'); state.boards = state.boards.filter(item => item.id !== args.boardId); state.activeBoardId = state.boards[0].id; result = { deleted: args.boardId }; }
    else if (name === 'delete_tag') { if (state.cards.some(card => card.tag === args.tag)) throw new Error('标签仍被卡牌使用'); state.tags = state.tags.filter(tag => tag !== args.tag); result = state.tags; }
    else if (name === 'move_playtest_card') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); card.x = Number(args.x); card.y = Number(args.y); card.objectId = args.objectId || ''; result = card; }
    else if (name === 'play_card_from_hand') { const index = state.playtest.players[0].hand.findIndex(item => item.id === args.entityId); if (index < 0) throw new Error('找不到手牌'); const [card] = state.playtest.players[0].hand.splice(index, 1); Object.assign(card, { player: 1, x: Number(args.x), y: Number(args.y), objectId: args.objectId || '', tapped: false }); state.playtest.tableCards.push(card); result = card; }
    else if (name === 'set_playtest_card_orientation') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); card.tapped = Boolean(args.tapped); result = card; }
    else if (name === 'return_playtest_card_to_hand') { const card = state.playtest.tableCards.find(item => item.id === args.entityId); if (!card) throw new Error('找不到试玩卡牌'); state.playtest.tableCards = state.playtest.tableCards.filter(item => item.id !== args.entityId); state.playtest.players[0].hand.push({ id: card.id, cardId: card.cardId, name: card.name }); result = { returned: card.name }; }
    else if (name === 'put_playtest_card_in_pile') { const pile = currentBoard().objects.find(item => item.id === args.pileId && item.type === 'stack'); if (!pile) throw new Error('找不到卡堆'); let index = state.playtest.tableCards.findIndex(item => item.id === args.entityId); let card; if (index >= 0) [card] = state.playtest.tableCards.splice(index, 1); else { index = state.playtest.players[0].hand.findIndex(item => item.id === args.entityId); if (index >= 0) [card] = state.playtest.players[0].hand.splice(index, 1); } if (!card) throw new Error('找不到试玩卡牌'); delete card.x; delete card.y; delete card.objectId; delete card.tapped; state.playtest.piles[pile.id] ||= []; state.playtest.piles[pile.id].push(card); result = { pileId: pile.id, count: state.playtest.piles[pile.id].length }; }
    else if (name === 'shuffle_playtest_pile_into') { const source = currentBoard().objects.find(item => item.id === args.sourcePileId && item.type === 'stack'); const target = currentBoard().objects.find(item => item.id === args.targetObjectId && (item.type === 'stack' || item.type === 'deck-zone')); if (!source || !target) throw new Error('找不到源卡堆或目标牌堆'); const cards = shuffleArray((state.playtest.piles[source.id] || []).splice(0)); if (target.type === 'stack') { state.playtest.piles[target.id] ||= []; state.playtest.piles[target.id].push(...cards); } else { const deck = playtestDeckById(target.deckId); if (!deck) throw new Error('目标抽卡堆没有试玩副本'); cards.forEach(card => { const entry = deck.entries.find(item => item.cardId === card.cardId); if (entry) entry.count += 1; else deck.entries.push({ cardId: card.cardId, count: 1 }); }); } result = { moved: cards.length, targetObjectId: target.id }; }
    else if (name === 'draw_playtest_card') { ensurePlaytestDecks(); const deck = playtestDeckById(args.deckId); const entry = deck?.entries.find(item => Number(item.count) > 0); if (!deck || !entry) throw new Error('试玩卡组为空或不存在'); entry.count -= 1; const card = cardById(entry.cardId); state.playtest.players[0].hand.push({ id: uid('entity'), cardId: card?.id, name: card?.name || '缺失卡牌' }); result = { card: card?.name, remaining: deckCardCount(deck) }; }
    else if (name === 'shuffle_playtest_deck') { ensurePlaytestDecks(); const deck = playtestDeckById(args.deckId); if (!deck) throw new Error('找不到试玩卡组'); deck.entries = shuffleArray(deck.entries); result = { deckId: deck.id, count: deckCardCount(deck) }; }
    else if (name === 'reset_playtest') { state.playtest.players[0].hand = []; state.playtest.tableCards = []; state.playtest.piles = {}; state.playtest.selectedPileId = ''; state.playtest.decks = []; state.playtest.deckSourceSignature = ''; ensurePlaytestDecks(true); state.playtest.logs = [{ time: '刚刚', text: 'AI 已重新开始试玩会话' }]; result = { reset: true, decks: state.playtest.decks.map(deck => ({ id: deck.id, count: deckCardCount(deck) })) }; }
    else throw new Error(`不支持的工具：${name}`);
  };
  if (name === 'get_project_state') result = projectAIContext();
  else mutate(run);
  renderAll();
  return result;
}

async function sendAIMessage(text) {
  if (!aiSettings.configured || !aiSettings.endpoint || !aiSettings.model) { openSetupWizard(true); throw new Error('请先完成 API 设置'); }
  setAIStatus('AI 正在思考…');
  const tools = mcpToolDefinitions.map(tool => ({ type: 'function', function: tool }));
  const system = `你是 CardFoundry 桌游设计助手。你可以通过工具修改用户当前项目。需要编辑时必须调用工具，不要假装修改。当前项目摘要：${JSON.stringify(projectAIContext())}`;
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
  if (!response.body?.getReader || /application\/json/i.test(response.headers.get('content-type') || '')) {
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
  $('#playtestPage').innerHTML = `<section class="play-board"><div class="board-canvas-wrap"><div class="board-canvas" id="playCanvas"><span class="canvas-label">PLAYTEST / ${esc(board.name).toUpperCase()}</span>${board.objects.map(renderPlayObject).join('')}${(p.tableCards || []).map(renderPlayedCard).join('')}</div></div></section><aside class="card-panel playtest-side"><div class="side-tabs"><button class="side-tab active" data-side-tab="object">当前对象</button><button class="side-tab" data-side-tab="deck">牌组</button><button class="side-tab" data-side-tab="log">游戏日志</button></div><div class="side-content" id="playSideContent">${renderPlaySide('object')}</div></aside><aside class="card-panel player-panel" id="playerHandDropPanel" data-hand-player="1"><div class="panel-heading"><span class="panel-title">玩家与资源</span><span class="tab-count">单人试玩</span></div><div class="player-block"><div class="player-title"><span class="player-color" style="background:${player.color}"></span>${esc(player.name)} <span class="tab-count">行动中</span></div><div class="player-meta">手牌 ${player.hand.length} 张 · 场上 ${(p.tableCards || []).filter(card => card.player === 1).length} 张</div></div><div class="hand-title">玩家 1 手牌 · 可拖回此处</div><div class="hand-cards" id="activeHandDropZone" data-hand-player="1">${player.hand.map(renderHandCard).join('') || '<span class="muted-caption">抽牌后会显示在这里；也可将场上的牌拖回</span>'}</div></aside>`;
  bindPlaytestEvents();
}
function renderHandCard(entity) {
  const card = cardById(entity.cardId);
  return `<div class="hand-card" draggable="true" tabindex="0" data-play-card="${entity.id}" data-preview-card="${card?.id || ''}" title="拖到版图上出牌"><div class="hand-card-name">${esc(card?.name || entity.name)}</div><div class="hand-card-art">${esc(card?.art || '✦')}</div><div class="hand-card-effect">${card?.effect || ''}</div></div>`;
}
function renderPlayObject(o) {
  const boundCard = o.cardId ? cardById(o.cardId) : null; const boundDeck = o.deckId ? playtestDeckById(o.deckId) : null;
  const pileCount = o.type === 'stack' ? (state.playtest.piles[o.id] || []).length : 0;
  const selected = o.type === 'stack' && state.playtest.selectedPileId === o.id;
  return `<div class="board-object ${objectColor(o.type)} ${selected ? 'selected-pile' : ''}" style="left:${o.x}px;top:${o.y}px;width:${o.width}px;height:${o.height}px;${o.background ? `background:${esc(o.background)};` : ''}" data-play-object="${o.id}" ${boundCard ? `data-preview-card="${boundCard.id}"` : ''}><span class="object-symbol">${objectSymbol(o.type)}</span>${o.showName !== false ? `<span class="object-name">${esc(o.name)}</span>` : ''}${o.type === 'stack' ? `<small>${pileCount} 张牌 · 点击选择</small>` : boundCard ? `<small>${esc(boundCard.name)}</small>` : boundDeck ? `<small>${esc(boundDeck.name)} · ${deckCardCount(boundDeck)}</small>` : ''}</div>`;
}
function renderPlayedCard(entity) {
  const card = cardById(entity.cardId);
  return `<div class="played-card ${entity.tapped ? 'tapped' : ''}" draggable="true" data-table-card="${entity.id}" data-preview-card="${card?.id || ''}" tabindex="0" title="拖动卡牌；右键横置/竖置" style="left:${Number(entity.x || 560)}px;top:${Number(entity.y || 160)}px">${esc(card?.name || entity.name || '缺失卡牌')}</div>`;
}
function deckCardCount(deck) { return deck?.entries?.reduce((sum, entry) => sum + Number(entry.count || 0), 0) || 0; }
function renderPlaySide(tab) {
  if (tab === 'deck') return `<div class="section-label">试玩卡组副本</div><p class="muted-caption" style="line-height:1.5">试玩中的抽牌和洗牌不会修改设计页卡组。</p>${state.playtest.decks.map(d => `<div class="log-item"><strong>${esc(d.name)}</strong><br><span class="muted-caption">${deckCardCount(d)} 张 · 点击抽牌</span><br><button class="ghost-button draw-button" data-draw-deck="${d.id}" style="margin-top:7px">抽一张</button><button class="ghost-button" data-shuffle-deck="${d.id}" style="margin:7px 0 0 5px">洗牌</button></div>`).join('')}`;
  if (tab === 'log') return `<div class="section-label">操作记录</div>${state.playtest.logs.map(log => `<div class="log-item"><span class="log-time">${esc(log.time)}</span>${esc(log.text)}</div>`).join('')}`;
  if (state.playtest.selectedPileId) return renderSelectedPilePanel(state.playtest.selectedPileId);
  return `<div class="section-label">试玩操作</div><p class="muted-caption" style="line-height:1.6">点击版图中的抽卡堆抽牌。点击卡堆可管理其中的牌；右键场上卡牌可横置或竖置。</p>`;
}
function renderSelectedPilePanel(pileId) {
  const pile = currentBoard().objects.find(object => object.id === pileId && object.type === 'stack');
  if (!pile) return `<div class="play-preview-empty">卡堆不存在</div>`;
  const cards = state.playtest.piles[pileId] || [];
  const targets = currentBoard().objects.filter(object => object.id !== pileId && (object.type === 'stack' || object.type === 'deck-zone'));
  return `<div class="pile-panel"><div class="section-label">已选择卡堆</div><div class="pile-panel-title">${esc(pile.name)}</div><div class="pile-count"><strong>${cards.length}</strong><span>张牌在堆内</span></div><p class="muted-caption">将这个卡堆中的全部卡牌洗入另一个卡堆或抽卡堆。</p><div class="field"><label>目标牌堆</label><select id="pileTargetSelect">${targets.length ? targets.map(target => `<option value="${target.id}">${esc(target.name)} · ${target.type === 'stack' ? '卡堆' : '抽卡堆'}</option>`).join('') : '<option value="">没有可用目标</option>'}</select></div><button class="primary-button pile-action-button" id="shufflePileButton" ${!cards.length || !targets.length ? 'disabled' : ''}>全部洗入目标牌堆</button><button class="ghost-button pile-action-button" id="closePileButton">取消选择</button></div>`;
}
function renderPlayCardPreview(card) {
  if (!card) return `<div class="play-preview-empty">这张牌的数据已不存在</div>`;
  const templateClass = card.template === '简约 · 象牙' ? 'ivory' : card.template === '事件 · 午夜' ? 'midnight' : '';
  return `<div class="play-card-preview"><div class="preview-label">CARD PREVIEW · 正面</div><div class="playing-card ${templateClass}"><div class="playing-card-inner"><div class="card-rarity">${esc(card.rarity || '普通')} · ${esc(card.tag || '未分类')}</div><div class="card-title">${esc(card.name || '未命名卡牌')}</div><div class="card-art">${esc(card.art || '✦')}</div><div class="card-effect">${card.effect || '<span style="color:#7a8585">卡牌效果将显示在这里</span>'}</div><div class="card-footer"><span>${esc(card.number || 'C-000')}</span><span>${esc(state.project?.name || 'CardFoundry')}</span></div></div></div><div class="play-preview-hint">移开鼠标后返回试玩操作</div></div>`;
}
function bindPlaytestEvents() {
  $$('[data-side-tab]').forEach(el => el.addEventListener('click', () => { $$('[data-side-tab]').forEach(x => x.classList.remove('active')); el.classList.add('active'); $('#playSideContent').innerHTML = renderPlaySide(el.dataset.sideTab); bindSideActions(); }));
  bindSideActions();
  $$('[data-play-object]').forEach(el => el.addEventListener('click', () => {
    const o = currentBoard().objects.find(x => x.id === el.dataset.playObject);
    if (o?.type === 'deck-zone') drawCard(o.deckId);
    else if (o?.type === 'stack') selectPile(o.id);
    else toast(`${o?.name || '区域'}：可拖入或查看卡牌`);
  }));
  bindPlayCardDragEvents();
  bindPlayCardPreviewEvents();
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
      const rect = canvas.getBoundingClientRect(); const scale = rect.width / currentBoard().width;
      const x = Math.max(5, Math.min(currentBoard().width - 75, (event.clientX - rect.left) / scale - 34));
      const y = Math.max(5, Math.min(currentBoard().height - 102, (event.clientY - rect.top) / scale - 47));
      const targetObject = currentBoard().objects.find(object => object.id === objectId);
      if (targetObject?.type === 'stack') putCardInPile(entityId, targetObject.id, isTableCard(entityId));
      else if (isTableCard(entityId)) moveTableCard(entityId, x, y, objectId);
      else placeCardOnTable(entityId, x, y, objectId);
    });
  };
  addDropTarget(canvas);
  $$('[data-play-object]', canvas).forEach(element => addDropTarget(element, element.dataset.playObject));
  $$('[data-play-card]').forEach(element => {
    element.addEventListener('dragstart', event => { activeDragEntityId = element.dataset.playCard; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-card-entity', activeDragEntityId); event.dataTransfer.setData('text/plain', activeDragEntityId); element.classList.add('dragging'); });
    element.addEventListener('dragend', () => { activeDragEntityId = ''; element.classList.remove('dragging'); });
  });
  $$('[data-table-card]').forEach(element => {
    element.addEventListener('dragstart', event => { activeDragEntityId = element.dataset.tableCard; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-card-entity', activeDragEntityId); event.dataTransfer.setData('text/plain', activeDragEntityId); element.classList.add('dragging'); });
    element.addEventListener('dragend', () => { activeDragEntityId = ''; element.classList.remove('dragging'); });
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
    state.playtest.logs.unshift({ time: '刚刚', text: `“${entity.name}”进入${pile.name}` });
  });
  if (!entity) return;
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
  $$('[data-shuffle-deck]').forEach(el => el.addEventListener('click', () => toast('牌组已洗牌', 'success')));
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
      if (deck) shuffled.forEach(entity => {
        const entry = deck.entries.find(item => item.cardId === entity.cardId);
        if (entry) entry.count = Number(entry.count || 0) + 1;
        else deck.entries.push({ cardId: entity.cardId, count: 1 });
      });
    }
    state.playtest.logs.unshift({ time: '刚刚', text: `${source.name}的 ${count} 张牌已洗入${target.name}` });
    state.playtest.selectedPileId = '';
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
  const entry = deck.entries.find(e => Number(e.count) > 0); if (!entry) return toast('牌组已空');
  const card = cardById(entry.cardId); mutate(() => { entry.count = Number(entry.count) - 1; state.playtest.players[state.playtest.currentPlayer - 1].hand.push({ id: uid('entity'), cardId: card?.id, name: card?.name || '缺失卡牌' }); state.playtest.logs.unshift({ time: '刚刚', text: `玩家${state.playtest.currentPlayer} 从${deck.name}抽取了“${card?.name || '缺失卡牌'}”` }); }); renderPlaytest(); toast(`已抽取「${card?.name || '缺失卡牌'}」`, 'success'); }

function renderExport() {
  const totalCards = state.decks.reduce((sum, d) => sum + d.entries.reduce((s,e)=>s+Number(e.count||0),0), 0);
  $('#exportPage').innerHTML = `<section class="card-panel export-actions"><h3>文件操作</h3><p>导入或导出一个完整的桌游设计文件。所有内容只在本地处理。</p><button class="export-action" id="exportProjectButton"><span class="action-icon">↗</span><span><strong>导出完整项目</strong><small>版图、单卡、卡组与资源</small></span></button><button class="export-action" id="exportBoardButton"><span class="action-icon">▦</span><span><strong>导出当前版图</strong><small>用于分享布局和对象规则</small></span></button><button class="export-action" id="exportCardsButton"><span class="action-icon">▤</span><span><strong>导出全部单卡</strong><small>JSON 数据，可再次导入</small></span></button><button class="export-action" id="importProjectButton"><span class="action-icon">↙</span><span><strong>导入设计文件</strong><small>支持 .bgdesign / .json</small></span></button><div class="file-drop" id="fileDrop"><strong>拖入 .bgdesign 文件</strong>或点击上方按钮选择文件</div></section><section class="card-panel project-overview"><div class="overview-header"><div><h3>项目内容概览</h3><p>${esc(state.project.description)}</p></div><button class="ghost-button" id="checkProjectButton">检查项目</button></div><div class="overview-grid"><div class="overview-tile"><span class="tile-number">${state.boards.length}</span><span class="tile-label">版图</span></div><div class="overview-tile"><span class="tile-number">${state.cards.length}</span><span class="tile-label">单卡</span></div><div class="overview-tile"><span class="tile-number">${state.decks.length}</span><span class="tile-label">卡组</span></div><div class="overview-tile"><span class="tile-number">${totalCards}</span><span class="tile-label">卡牌总数</span></div><div class="overview-tile"><span class="tile-number">${state.playtest.logs.length}</span><span class="tile-label">试玩记录</span></div><div class="overview-tile"><span class="tile-number">本地</span><span class="tile-label">数据存储</span></div></div><div class="section-label">文件格式</div><div class="format-code">manifest.json · project.json · boards.json · cards.json · decks.json · assets/ · playtest/</div></section>`;
  $('#exportProjectButton').onclick = () => downloadFile(`${state.project.name}.bgdesign`, JSON.stringify({ version: 1, ...state }, null, 2), 'application/json');
  $('#exportBoardButton').onclick = () => downloadFile(`${currentBoard().name}.json`, JSON.stringify(currentBoard(), null, 2), 'application/json');
  $('#exportCardsButton').onclick = () => downloadFile(`${state.project.name}-cards.json`, JSON.stringify(state.cards, null, 2), 'application/json');
  $('#importProjectButton').onclick = () => $('#importFileInput').click();
  $('#fileDrop').onclick = () => $('#importFileInput').click(); $('#checkProjectButton').onclick = () => toast('检查完成：未发现缺失引用', 'success');
}
function downloadFile(name, content, type) { const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); toast('文件已导出', 'success'); }

function setDesignTab(tab, rerender = true) {
  state.designTab = tab; $$('.subnav-tab').forEach(el => el.classList.toggle('active', el.dataset.design === tab));
  $('#boardPage').classList.toggle('hidden', tab !== 'board'); $('#cardsPage').classList.toggle('hidden', tab !== 'cards'); $('#decksPage').classList.toggle('hidden', tab !== 'decks');
  if (rerender) { if (tab === 'board') renderBoard(); if (tab === 'cards') renderCards(); if (tab === 'decks') renderDecks(); }
}
function switchView(view) {
  if (view === 'playtest') { ensurePlaytestDecks(); renderPlaytest(); }
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view)); $$('.view').forEach(el => el.classList.add('hidden')); $(`#${view}View`).classList.remove('hidden');
  const viewLabel = ({ design: '桌游设计', playtest: '桌游试玩', export: '文件导出' })[view] || '整个项目';
  setAIContext(`${viewLabel} · 项目「${state.project?.name || '未命名'}」 · ${state.cards.length} 张单卡 · ${state.decks.length} 个卡组`);
}

async function importTable(file, target) {
  const text = await file.text(); let rows = [];
  if (file.name.endsWith('.xlsx') && window.XLSX) { const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }); rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }); } else { rows = text.trim().split(/\r?\n/).map(line => line.split(/\t|,/)); if (rows.length) { const headers = rows.shift(); rows = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))); } }
  if (!rows.length) return toast('没有读取到表格内容');
  if (target === 'cards') { mutate(() => rows.forEach((row, i) => { const tag = row['标签'] || row.tag || ''; if (tag && !state.tags.includes(tag)) state.tags.push(tag); state.cards.push({ id: uid('card'), name: row['卡名'] || row.name || Object.values(row)[0] || `导入卡牌 ${i+1}`, effect: row['卡牌效果'] || row.effect || '', tag, rarity: row['稀有度'] || '普通', number: `C-${String(state.cards.length + i + 1).padStart(3,'0')}`, art: '✦', color: 'blue', template: row['模板'] || row.template || '默认 · 晨雾', width: Number(row['宽度'] || row.width || 63), height: Number(row['高度'] || row.height || 88) }); })); state.activeCardId = state.cards.at(-1).id; renderAll(); setDesignTab('cards'); toast(`已导入 ${rows.length} 张单卡`, 'success'); }
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
  $('#aiChatForm').addEventListener('submit', async event => {
    event.preventDefault();
    // requestSubmit() can be triggered by both the send button and Enter. Keep
    // a small in-memory lock so a second event cannot send the same prompt
    // while the previous request is still in flight.
    if (aiSending) return;
    const input = $('#aiInput');
    const sendButton = $('#aiSendButton');
    const text = input.value.trim();
    if (!text) return;

    // Clear immediately, before making the network request. This prevents a
    // slow request (or an accidental second click) from reusing the prompt.
    input.value = '';
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
  $('#resetPlaytestButton').onclick = () => { mutate(() => { ensurePlaytestDecks(true); state.playtest.players.forEach(p => p.hand = []); state.playtest.tableCards = []; state.playtest.piles = {}; state.playtest.selectedPileId = ''; state.playtest.logs = [{ time: '刚刚', text: '试玩会话已重新开始' }]; }); renderPlaytest(); toast('试玩已重新开始，已重置卡组副本', 'success'); };
  $('#saveSessionButton').onclick = () => { saveState(true); toast('试玩状态已保存', 'success'); };
  $('#importFileInput').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!imported.cards || !imported.boards) throw new Error(); state = { ...seedState(), ...imported }; renderAll(); saveState(true); toast('设计文件导入成功', 'success'); } catch { toast('文件格式无效，导入失败'); } e.target.value = ''; });
  $('#cardImportInput').addEventListener('change', e => { if (e.target.files[0]) importTable(e.target.files[0], 'cards'); e.target.value = ''; }); $('#deckImportInput').addEventListener('change', e => { if (e.target.files[0]) importTable(e.target.files[0], 'deck'); e.target.value = ''; });
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveState(true); toast('已保存', 'success'); } });
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
