import {test,afterEach} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {mobileTopHTML,mobileNavHTML,mobileIdentityHTML,installMobileShell} from '../src/mobile-shell.js';
let dom;afterEach(()=>dom?.window.close());
test('phone shell has separate home/catalog/menu destinations and private identity stays private',()=>{
 const home=mobileTopHTML({page:'home',lang:'ru'}),catalog=mobileTopHTML({page:'catalog',lang:'ru'}),nav=mobileNavHTML({page:'catalog',lang:'ru'});
 dom=new JSDOM(home+nav);assert.equal(dom.window.document.querySelectorAll('.mobile-topbar [data-shell=search]').length,1);assert.equal(dom.window.document.querySelectorAll('.mobile-bottom-nav>*').length,3);assert.equal(dom.window.document.querySelector('.mobile-bottom-nav>[aria-current]').dataset.nav,'catalog');
 assert.match(catalog,/data-mobile-back/);assert.match(catalog,/data-mobile-panel="filters"/);assert.match(catalog,/data-mobile-panel="sort"/);
 const identity=mobileIdentityHTML({user:{email:'secret@example.com'},name:'<Alice>',avatar:'',lang:'ru'});assert.ok(!identity.includes('secret@example.com'));assert.ok(identity.includes('&lt;Alice&gt;'));assert.match(identity,/data-nav="profile"/);
});
test('mobile catalog panels reuse original controls, preserve selection and restore them on desktop resize',()=>{
 dom=new JSDOM(`<body>${mobileTopHTML({page:'catalog',lang:'ru'})}<section class="catalog-v2"><div class="section-head"><label class="catalog-field"><select id="sort"><option value="picked">Popular</option><option value="latest">Latest</option></select></label></div><aside class="catalog-filter-panel"><select id="genre-filter"><option>A</option></select></aside></section></body>`,{url:'https://test.example/#catalog'});
 const win=dom.window,doc=win.document,media=new win.EventTarget();media.matches=true;win.matchMedia=()=>media;win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};
 installMobileShell({win,doc});const select=doc.querySelector('#sort'),parent=select.parentNode,original=parent.parentNode;let changes=0;select.addEventListener('change',()=>changes++);
 doc.querySelector('[data-mobile-panel=sort]').click();assert.equal(doc.querySelector('dialog #sort'),select);assert.equal(doc.querySelectorAll('#sort').length,1);select.value='latest';select.dispatchEvent(new win.Event('change',{bubbles:true}));doc.querySelector('[data-mobile-close]').click();assert.equal(parent.parentNode,original);assert.equal(select.value,'latest');assert.equal(changes,1);
 doc.querySelector('[data-mobile-panel=filters]').click();assert.ok(doc.querySelector('dialog #genre-filter'));media.matches=false;media.dispatchEvent(new win.Event('change'));assert.equal(doc.querySelector('dialog'),null);assert.ok(doc.querySelector('.catalog-v2 #genre-filter'));
 doc.querySelector('[data-mobile-panel=filters]').click();assert.equal(doc.querySelector('dialog'),null);
});
test('navigation while a filter sheet is open cannot reinsert old controls into the new page',()=>{
 dom=new JSDOM(`<body>${mobileTopHTML({page:'catalog',lang:'ru'})}<main><aside class="catalog-filter-panel"><input value="old"></aside></main></body>`,{url:'https://test.example/#catalog'});const win=dom.window,doc=win.document;win.matchMedia=()=>({matches:true,addEventListener(){}});win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};installMobileShell({win,doc});doc.querySelector('[data-mobile-panel=filters]').click();doc.querySelector('main').innerHTML='<p>New page</p>';doc.dispatchEvent(new win.Event('yomiku:navigation'));assert.equal(doc.querySelector('dialog'),null);assert.equal(doc.querySelector('input'),null);assert.equal(doc.querySelector('main').textContent,'New page');
});
