import {test} from 'node:test';import assert from 'node:assert/strict';import {badges,text} from '../src/activity/badges.js';import {historyAgo} from '../src/history-display.js';import {styles} from '../src/appearance.js';
test('66 unique badge definitions cover every existing theme and retain legacy awards explicitly',()=>{
 assert.equal(badges.length,66);assert.equal(new Set(badges.map(b=>b[0])).size,66);
 for(const lang of ['ru','en','ja'])for(const b of badges){assert.ok(text(b[2],lang));assert.ok(text(b[3],lang));}
 for(const style of styles)assert.ok(badges.some(b=>b[0]==='theme_'+style));
 for(const b of badges.filter(b=>b[0].startsWith('hour_')))assert.match(b[3][0],/Архив/);
});
test('history relative times support each language, future clocks and invalid dates',()=>{
 const now=Date.UTC(2026,10,8,12);assert.match(historyAgo(now-120000,'ru',now),/2 минуты назад/);assert.match(historyAgo(now-7200000,'en',now),/2 hours ago/);assert.ok(historyAgo(now-86400000,'ja',now));assert.equal(historyAgo('bad','ru',now),'');assert.equal(historyAgo(now+1000,'en',now),'now');
});
