import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
import {firstMainEpisode,seasonMenu} from '../src/catalog-seasons.js';
const source=await readFile(new URL('../src/app.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function openPlayer('),source.indexOf('function renderEpisodes()'));
test('opening a sequel keeps its release identity, and explicit episode selection is preserved',async()=>{
 for(const requested of [undefined,2]){
  const a={id:'season-two',episodes:3,type:'TV',year:2025,episodeManifest:[{season:2,ordinal:1},{season:2,ordinal:2},{season:2,ordinal:3}]};
  let played;
  const ctx={playerOpening:false,user:null,ready:true,location:{hash:'#catalog'},authGeneration:0,findWatchRelease:async()=>a,watchView:()=>{},releaseSeasons:async()=>[{id:'season-one',type:'TV',episodeManifest:[{season:1,ordinal:1}]},a],recordProgress(){},$$:()=>[],controlsCleanup:null,playback:null,latestProgress:()=>null,state:{preferences:{},progress:{}},current:null,page:'catalog',playerSeasons:[],knownSeasons:()=>[a],episode:1,firstMainEpisode,seasonMenu,seasonGroup:'main',selectedAudio:'',preferredAudio:()=>'',playerAudioChoices:()=>[],history:{pushState(){},replaceState(){}},render(){},window:{scrollTo(){}},attachVideo(){},renderEpisodes(){},$:()=>null,updateSource:async()=>{played=ctx.current.id;}};
  runInNewContext(code,ctx);await ctx.openPlayer('season-two',requested);assert.equal(played,'season-two');assert.equal(ctx.episode,requested||1);assert.equal(ctx.playerOpening,false);
 }
});
