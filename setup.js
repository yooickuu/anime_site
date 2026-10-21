const config = window.YORU_CONFIG || {};
const status = document.querySelector('#status');
async function copy(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = 'Скопировано';
    setTimeout(() => { button.textContent = button.dataset.label; }, 2000);
  } catch {
    status.textContent = 'Браузер не разрешил копирование. Открой «Посмотреть SQL», выдели текст и нажми ⌘C / Ctrl+C.';
  }
}
const sqlButton = document.querySelector('#copy-sql');
sqlButton.dataset.label = sqlButton.textContent;
fetch('setup.sql').then(response => {
  if (!response.ok) throw Error();
  return response.text();
}).then(sql => {
  document.querySelector('#sql').value = sql;
  sqlButton.disabled = false;
  sqlButton.addEventListener('click', () => copy(sql, sqlButton));
}).catch(() => { status.textContent = 'Не найден setup.sql. В папке проекта выполни npm run build и обнови страницу.'; });
try {
  const project = new URL(config.supabaseUrl).hostname;
  if (/^[a-z0-9]+\.supabase\.co$/.test(project)) {
    document.querySelector('#sql-editor').href = 'https://supabase.com/dashboard/project/' + project.split('.')[0] + '/sql/new';
  }
} catch {}
const redirects = new Set(['https://yooickuu.github.io/anime_site/','http://127.0.0.1:4173/', 'http://127.0.0.1:4173/index.html', 'http://localhost:4173/', 'http://localhost:4173/index.html', 'http://127.0.0.1:5500/yoru/dist/index.html', 'http://localhost:5500/yoru/dist/index.html']);
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  redirects.add(new URL('index.html', location.href).href);
}
for (const url of redirects) {
  const row = document.createElement('div');
  row.className = 'actions';
  const text = document.createElement('code');
  text.textContent = url;
  const button = document.createElement('button');
  button.textContent = button.dataset.label = 'Копировать';
  button.setAttribute('aria-label', 'Скопировать ' + url);
  button.addEventListener('click', () => copy(url, button));
  row.append(text, button);
  document.querySelector('#redirects').append(row);
}
document.querySelector('#check').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = 'Проверяем связь с проектом…';
  try {
    if (!config.supabaseUrl || !config.supabaseKey) throw Error('Сначала добавь Project URL и Publishable key в dist/config.js.');
    const opts = () => ({ headers: { apikey: config.supabaseKey }, signal: AbortSignal.timeout(15000) });
    const auth = await fetch(config.supabaseUrl + '/auth/v1/settings', opts());
    if (!auth.ok) throw Error('Supabase не принял публичный ключ. Проверь Project URL и Publishable key.');
    const settings = await auth.json();
    const database = await fetch(config.supabaseUrl + '/rest/v1/yoru_state?select=user_id&limit=0', opts());
    const data = await database.json();
    if (data.code === 'PGRST205' || data.code === '42P01') throw Error('Связь с Supabase есть, но таблица ещё не создана. Выполни шаг 1 в SQL Editor.');
    if (!database.ok && data.code !== '42501') throw Error('Не удалось проверить таблицу (HTTP ' + database.status + '). Пришли этот текст для проверки.');
    status.textContent = 'Проект доступен. Таблица найдена. ' + (settings.external?.email && !settings.disable_signup ? 'Регистрация по email включена.' : 'Регистрация по email отключена в настройках проекта.') + '\nТеперь проверь регистрацию, подтверждение письма и сохранение списка на самом сайте.';
  } catch (error) { status.textContent = error.message || 'Не удалось подключиться. Проверь интернет и повтори.'; }
  finally { button.disabled = false; }
});

for(const button of document.querySelectorAll('[data-copy-file]'))button.addEventListener('click',async()=>{
  try{button.dataset.label=button.textContent;const response=await fetch(button.dataset.copyFile);if(!response.ok)throw Error();await copy(await response.text(),button);}catch{status.textContent='Не удалось загрузить файл. Обнови страницу и повтори.';}
});
