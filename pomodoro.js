const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3457;
const MAX_PORT_ATTEMPTS = 10;
const DATA_FILE = path.join(__dirname, 'pomodoro-data.json');
const PUBLIC_DIR = __dirname;

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getWeekId(timestamp) {
  const d = new Date(timestamp);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
}

const CLASSIFY_RULES = {
  dev: { label: '研发类', keywords: ['开发','部署','代码','重构','bug','调试','测试','前端','后端','api','数据库','优化','pr','review','合并','分支','需求','功能','升级','迁移','配置','分析'] },
  meeting: { label: '会议类', keywords: ['会议','同步','评审','复盘','讨论','对齐','宣讲','培训','晨会','周会','访谈','1on1','presentation'] },
  doc: { label: '办公材料类', keywords: ['文档','材料','邮件','ppt','方案','报告','复盘','wiki','周报','规范','流程','申请','报销','审批','填写','整理'] },
};

function classifyTask(task) {
  if (task.category) return task.category;
  const text = task.text.toLowerCase();
  for (const [key, rule] of Object.entries(CLASSIFY_RULES)) {
    if (rule.keywords.some(kw => text.includes(kw))) return key;
  }
  return 'uncategorized';
}

function computeWeeklyAnalysis(data) {
  const now = new Date();
  const currentWeekId = getWeekId(now.getTime());
  const tasks = data.tasks || [];
  const cats = {};
  let totalMin = 0;

  tasks.forEach(task => {
    const sessions = (task.sessions || []).filter(s => {
      try { return s && s.timestamp && getWeekId(s.timestamp) === currentWeekId; } catch(e) { return false; }
    });
    if (sessions.length === 0) return;
    const catKey = classifyTask(task);
    const rule = CLASSIFY_RULES[catKey];
    const label = rule ? rule.label : '未分类';
    if (!cats[catKey]) cats[catKey] = { label, totalMinutes: 0, count: 0, tasks: [] };
    const totalMinForTask = Math.round(sessions.reduce((sum, s) => sum + (s.duration || 1500), 0) / 60);
    cats[catKey].totalMinutes += totalMinForTask;
    cats[catKey].count++;
    totalMin += totalMinForTask;
    cats[catKey].tasks.push({
      text: task.text,
      createdAt: task.createdAt,
      totalMinutes: totalMinForTask,
      sessionCount: sessions.length,
    });
  });

  // 找占比最大的类别
  let topCat = null, topMin = 0;
  for (const [key, c] of Object.entries(cats)) {
    if (c.totalMinutes > topMin) { topMin = c.totalMinutes; topCat = { key, ...c }; }
  }

  // 生成总结文字
  let summary = '';
  if (topCat) {
    const pct = Math.round(topCat.totalMinutes / totalMin * 100);
    summary += `本周你主要精力在${topCat.label}（占比${pct}%），`;
    if (topCat.count > 1) summary += `共完成了${topCat.count}个相关任务。`;
    else summary += `完成了1个相关任务。`;
    // 夸一句
    const praises = ['做得不错！', '赞！', '继续保持！', '效率很高！'];
    summary += ' ' + praises[Math.floor(Math.random() * praises.length)];
    // 建议
    const suggestions = [];
    if (!cats.dev || cats.dev.totalMinutes < totalMin * 0.2) suggestions.push('建议适当安排研发时间，保持编码节奏');
    if (!cats.doc || cats.doc.totalMinutes < totalMin * 0.1) suggestions.push('别忘了把工作成果整理成文档，沉淀下来');
    if (!cats.meeting) suggestions.push('本周没有会议记录，如果实际有会议可以标记一下');
    if (cats.uncategorized) suggestions.push('有未分类的任务，可以在周报中补充分类');
    if (suggestions.length > 0) summary += ' ' + suggestions[Math.floor(Math.random() * suggestions.length)];
  } else {
    summary = '本周还没有专注记录，加油！';
  }

  return { categories: cats, totalMinutes: totalMin, summary };
}

function computeWeeklySummary(data) {
  const now = new Date();
  const currentWeekId = getWeekId(now.getTime());
  const currentMonday = new Date(currentWeekId);
  const prevMonday = new Date(currentMonday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  const prevWeekId = `${prevMonday.getFullYear()}-${String(prevMonday.getMonth()+1).padStart(2,'0')}-${String(prevMonday.getDate()).padStart(2,'0')}`;
  const tasks = data.tasks || [];

  function summarizeWeek(weekId) {
    const result = { completedTasks: [], incompleteTasks: [], totalMinutes: 0 };
    tasks.forEach(task => {
      const sessions = (task.sessions || []).filter(s => {
        try { return s && s.timestamp && getWeekId(s.timestamp) === weekId; } catch(e) { return false; }
      });
      if (sessions.length === 0) return;
      const totalMin = Math.round(sessions.reduce((sum, s) => sum + (s.duration || 1500), 0) / 60);
      result.totalMinutes += totalMin;
      const entry = { text: task.text, sessionCount: sessions.length, totalMinutes: totalMin, category: classifyTask(task), createdAt: task.createdAt };
      if (task.done) result.completedTasks.push(entry);
      else result.incompleteTasks.push(entry);
    });
    return result;
  }

  function formatWeekRange(weekId) {
    const m = new Date(weekId);
    const sun = new Date(m);
    sun.setDate(sun.getDate() + 6);
    const fmt = d => `${d.getMonth()+1}月${d.getDate()}日`;
    return `${fmt(m)} - ${fmt(sun)}`;
  }

  return {
    dayOfWeek: now.getDay(),
    currentWeek: { weekId: currentWeekId, weekRange: formatWeekRange(currentWeekId), ...summarizeWeek(currentWeekId) },
    previousWeek: { weekId: prevWeekId, weekRange: formatWeekRange(prevWeekId), ...summarizeWeek(prevWeekId) },
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let lastHeartbeat = Date.now();
setInterval(() => {
  if (Date.now() - lastHeartbeat > 20000) {
    console.log('浏览器已关闭，自动停止服务');
    process.exit(0);
  }
}, 10000);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API: Load data
  if (url.pathname === '/api/load' && req.method === 'GET') {
    const data = readData();
    if (data) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    }
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'no data' }));
  }

  // API: Save data
  if (url.pathname === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        writeData(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Import via form (绕过 CORS，兼容 file:// 协议)
  if (url.pathname === '/api/import' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = new URLSearchParams(body);
        const json = params.get('json');
        if (!json) throw new Error('missing json field');
        writeData(JSON.parse(json));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><script>window.close()</script><p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#2ecc71;font-size:18px">导入成功！可以关闭此页面</p></body></html>`);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body><p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#e94560;font-size:18px">导入失败: ${e.message}</p></body></html>`);
      }
    });
    return;
  }

  // API: Weekly summary
  if (url.pathname === '/api/weekly-summary' && req.method === 'GET') {
    const data = readData();
    if (!data) { res.writeHead(404); return res.end(JSON.stringify({ error: 'no data' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(computeWeeklySummary(data)));
  }

  // API: Weekly analysis (分类总结)
  if (url.pathname === '/api/weekly-analysis' && req.method === 'GET') {
    const data = readData();
    if (!data) { res.writeHead(404); return res.end(JSON.stringify({ error: 'no data' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(computeWeeklyAnalysis(data)));
  }

  // API: Set category for a task (identified by createdAt)
  if (url.pathname === '/api/set-category' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { createdAt, category } = JSON.parse(body);
        if (!createdAt || !category) throw new Error('missing createdAt or category');
        if (!['dev','meeting','doc','uncategorized'].includes(category)) throw new Error('invalid category');
        const data = readData();
        if (!data) { res.writeHead(404); return res.end(JSON.stringify({ error: 'no data' })); }
        const task = (data.tasks || []).find(t => t.createdAt === createdAt);
        if (!task) { res.writeHead(404); return res.end(JSON.stringify({ error: 'task not found' })); }
        task.category = category;
        writeData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: Heartbeat (浏览器存活信号)
  if (url.pathname === '/api/heartbeat' && req.method === 'GET') {
    lastHeartbeat = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // API: Shutdown (关闭浏览器时停止服务)
  if (url.pathname === '/api/shutdown' && req.method === 'POST') {
    console.log('收到关闭请求，1秒后停止服务...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  // Serve static files
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'pomodoro.html' : url.pathname);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

function tryListen(port, maxAttempts) {
  server.removeAllListeners('error');
  server.removeAllListeners('listening');
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      const next = port + 1;
      if (next - PORT < maxAttempts) {
        console.log(`端口 ${port} 被占用，尝试端口 ${next} ...`);
        tryListen(next, maxAttempts);
      } else {
        console.error(`❌ 尝试了 ${MAX_PORT_ATTEMPTS} 个端口均被占用，无法启动服务`);
        process.exit(1);
      }
    } else {
      console.error('启动失败:', e.message);
      process.exit(1);
    }
  });
  server.once('listening', () => {
    const url = `http://localhost:${port}`;
    console.log(`🍅 番茄钟服务已启动: ${url}`);
    console.log(`📁 数据文件: ${DATA_FILE}`);
    console.log('按 Ctrl+C 停止服务');
    exec(`start ${url}`, () => {});
  });
  server.listen(port);
}

tryListen(PORT, MAX_PORT_ATTEMPTS);
