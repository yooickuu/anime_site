import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverRenditions} from '../src/media-renditions.js';
import {auditAdmission} from '../src/catalog-admission.js';
import {createApprovedCatalogue} from '../src/approved-catalog.js';
import {detailArtwork} from '../src/detail-artwork.js';
import {valid,now} from './fixtures/admitted.js';

test('1080 alone is allowed without fabricating lower qualities or weakening other requirements',()=>{
 const a=valid();for(const e of a.episodes)for(const t of e.audio)t.sources=t.sources.filter(s=>s.quality===1080);
 const catalogue=createApprovedCatalogue({policyVersion:3,items:[a]},{now});
 assert.deepEqual(catalogue.video(a.id,1,'track-0').sources.map(s=>s.quality),[1080]);
 a.episodes[1].audio[0].subtitles.pop();
 assert.equal(auditAdmission(a,{now,playerSubtitlesReady:true}).passed,false);
 const b=valid();b.episodes[0].audio[0].sources=b.episodes[0].audio[0].sources.filter(s=>s.quality<720);
 assert.equal(auditAdmission(b,{now,playerSubtitlesReady:true}).passed,false);
});
test('HLS ignores seek-only frames; API quality arrays do not create playback proof',()=>{
 const manifest='#EXTM3U\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=90000,RESOLUTION=640x360,URI="seek.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\n1080.m3u8';
 assert.deepEqual(discoverRenditions({manifest,manifestURL:'https://example.test/master.m3u8'}).map(s=>s.quality),[1080]);
 const files=discoverRenditions({api:{url_360:'https://example.test/360.mp4',sources:[{label:'1080p',file:'https://example.test/1080.mp4'},{label:'720p',url:'javascript:bad'}]}});
 assert.deepEqual(files.map(s=>s.quality),[360,1080]);assert.ok(files.every(s=>!s.probe&&!s.height));
});
test('each admitted card uses its own full-resolution backdrop and cannot fall back to a legacy image',()=>{
 const a=valid(),card=createApprovedCatalogue({policyVersion:3,items:[a]},{now}).find(a.id);
 assert.equal(card.banner,a.artwork.backdrop.url);
 assert.equal(detailArtwork(card,{1:{detailsBanner:'https://example.test/wrong.jpg'}}),a.artwork.backdrop.url);
 delete card.artwork.backdrop;assert.equal(detailArtwork(card), '');
 delete a.artwork.backdrop;assert.equal(createApprovedCatalogue({policyVersion:3,items:[a]},{now}).items.length,0);
});

test('720-only fallback is allowed but false resolution and missing tracks remain blocked',()=>{
 const a=valid();for(const e of a.episodes)for(const t of e.audio)t.sources=t.sources.filter(s=>s.quality===720);
 const options={now,playerSubtitlesReady:true};
 assert.equal(auditAdmission(a,options).passed,true);
 a.episodes[1].audio[0].sources[0].height=480;assert.equal(auditAdmission(a,options).passed,false);
 a.episodes[1].audio[0].sources[0].height=720;a.episodes[1].audio.pop();assert.equal(auditAdmission(a,options).passed,false);
});
