import {queryCatalogue} from '../../src/catalog-query.js';
import {withMetadata} from '../../src/catalog-metadata.js';
// Display/search records never carry episode manifests or video source URLs.
export function catalogueCard(a){
 const keys=['id','ids','title','originalTitle','alt','year','type','genres','description','ongoing','translations','relatedMalIds','franchiseId','airedAt','relations','catalogUpdatedAt','popularity','views','members','audienceRating','rating','score','malId','image','banner','detailsBanner','episodes'];
 return {...Object.fromEntries(keys.filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),catalogApproved:true,catalogOnly:false};
}
export function summaryCard(a){
 const {description,relations,relatedMalIds,relatedCatalogIds,...rest}=catalogueCard(a);
 return {...rest,translations:Object.fromEntries(Object.entries(rest.translations||{}).map(([k,v])=>[k,[v?.[0]||'','']]))};
}
export function prepareChunks(items,metadata={},revision=''){
 const cards=items.map(a=>catalogueCard(withMetadata(a,metadata)));
 const identities=Object.fromEntries(cards.flatMap(a=>[a.ids?.mal,a.ids?.shikimori,a.malId].filter(Boolean).map(id=>[id,a.id])));
 const parent=new Map(cards.map(a=>[a.id,a.id]));
 const root=id=>{let r=id;while(parent.get(r)!==r)r=parent.get(r);while(id!==r){const next=parent.get(id);parent.set(id,r);id=next;}return r;};
 const join=(a,b)=>{if(parent.has(a)&&parent.has(b))parent.set(root(b),root(a));};
 const franchises=new Map();
 for(const a of cards){for(const id of a.relatedMalIds||[])join(a.id,identities[id]);if(a.franchiseId){const key=String(a.franchiseId);if(franchises.has(key))join(a.id,franchises.get(key));else franchises.set(key,a.id);}}
 const groups=new Map();for(const a of cards){const key=root(a.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a.id);}
 for(const a of cards)a.relatedCatalogIds=groups.get(root(a.id));
 const summaries=cards.map(summaryCard),byId=new Map(cards.map(a=>[a.id,a])),orders={};
 for(const sort of ['picked','hiddenGems','latest','topRated','newest','oldest','alphabetical'])orders[sort]=queryCatalogue(summaries,{sort});
 return {cards,orders,identities,bootstrap:{revision,total:cards.length,chunkSize:120,chunks:Math.ceil(cards.length/120),years:[...new Set(cards.map(a=>a.year).filter(Boolean))].sort((a,b)=>b-a),items:orders.picked.slice(0,120).map(a=>({...a,description:String(byId.get(a.id).description||'').slice(0,300),translations:Object.fromEntries(Object.entries(byId.get(a.id).translations||{}).map(([lang,v])=>[lang,[v?.[0]||'',String(v?.[1]||'').slice(0,300)]]))}))}};
}
