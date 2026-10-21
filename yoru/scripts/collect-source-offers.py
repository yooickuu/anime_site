"""Resumable batch discovery; actual offers stay quarantined, never auto-approved.
AniLiberty API is joined by explicit MAL/Shikimori fields, not fuzzy names.
No HTTP result or provider label is promoted to playback/language evidence.
"""
import argparse, base64, hashlib, json, re, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse

ROOT=Path('checks/admission');CACHE=ROOT/'source-cache';CACHE.mkdir(parents=True,exist_ok=True)
blocked=set();lock=threading.Lock();UA='yomiku-source-check/1.0'

def fetch(url,payload=None):
    host=urlparse(url).hostname
    with lock:
        if host in blocked: raise RuntimeError('provider cooldown')
    key=hashlib.sha256((url+json.dumps(payload,sort_keys=True)).encode()).hexdigest()
    path=CACHE/(key+'.json')
    if path.exists() and time.time()-path.stat().st_mtime<21600:
        return json.loads(path.read_text())['body']
    data=json.dumps(payload).encode() if payload else None
    headers={'User-Agent':UA,'Accept':'application/json,text/html'}
    if data:headers['Content-Type']='application/json'
    try:
        with urlopen(Request(url,data=data,headers=headers),timeout=12) as response:
            body=response.read(12_000_001)
        if len(body)>12_000_000:raise ValueError('response too large')
        body=body.decode('utf-8');path.write_text(json.dumps({'url':url,'body':body}))
        return body
    except HTTPError as error:
        if error.code in (403,429):
            with lock:blocked.add(host)
        raise

def getjson(url,payload=None):return json.loads(fetch(url,payload))
def batch(jobs,worker):
    out=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks={pool.submit(worker,j):j for j in jobs}
        for future in as_completed(tasks):
            try:out.append(future.result())
            except Exception as error:out.append({'request':str(tasks[future]),'error':str(error)[:180]})
    return out

def save(path,data):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2));temp.replace(path)

def zoko(job):
    mal,mode=job
    url=f'https://zokoanime.video/stream/mal/{mal}/1/{mode}'
    html=fetch(url);match=re.search(r'window\.__P\s*=\s*["\']([^"\']+)',html)
    if not match:return {'mal':mal,'mode':mode,'status':'no_config'}
    raw=base64.b64decode(match[1]);key=b'otaku-embed-v1'
    config=json.loads(bytes(b^key[i%len(key)] for i,b in enumerate(raw)))
    return {'mal':mal,'mode':mode,'status':'offer' if config.get('src') else 'no_stream',
            'embed':url,'episodeProbed':1,'config':config,
            'verified':False,'blockers':['release_mapping_not_reviewed','full_episode_coverage_not_checked','browser_delivery_not_verified','language_not_listened','subtitle_sync_not_verified']}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=250);parser.add_argument('--zoko',action='store_true');args=parser.parse_args()
    candidates=json.loads((ROOT/'new-candidates.json').read_text())['items'][:max(1,min(args.limit,1000))]
    report={'checkedAt':datetime.now(timezone.utc).isoformat(),'kind':'source-offers-NOT-admitted','candidateCount':len(candidates),'items':[],'errors':[]}
    base='https://api.anilibria.app/api/v1/anime/'
    first=getjson(base+'catalog/releases?limit=50&page=1');pages=first['meta']['pagination']['total_pages']
    catalog=first['data']
    for page in batch(range(2,pages+1),lambda n:getjson(base+f'catalog/releases?limit=50&page={n}')):
        catalog+=page.get('data',[])
        if 'error' in page:report['errors'].append(page)
    bymal={}
    for release in catalog:
        mid=release.get('mal',{}).get('id')
        if mid:bymal.setdefault(int(mid),[]).append(release)
    ids=sorted({r['id'] for a in candidates for r in bymal.get(a['ids'].get('mal'),[])})
    details={}
    for result in batch([ids[i:i+40] for i in range(0,len(ids),40)],lambda ids:getjson(base+'releases/list?limit=50&ids='+','.join(map(str,ids)))):
        for r in result.get('data',[]):details[r['id']]=r
        if 'error' in result:report['errors'].append(result)
    print(json.dumps({'stage':'russian_episode_lists','catalogueRecords':len(catalog),'matchingReleaseLists':len(details)}),flush=True)
    # Shikimori IDs come explicitly from provider records; never assume MAL=id.
    shikiids=sorted({int(r['shikimori']['id']) for r in details.values() if r.get('shikimori',{}).get('id')})
    metadata={}
    for result in batch([shikiids[i:i+50] for i in range(0,len(shikiids),50)],lambda ids:getjson('https://shikimori.io/api/graphql',{'query':'{animes(ids:"'+','.join(map(str,ids))+'",limit:50){id malId name kind status episodes episodesAired}}'})):
        for a in result.get('data',{}).get('animes',[]):metadata[int(a['id'])]=a
        if 'error' in result or 'errors' in result:report['errors'].append(result)
    jimaku={r['candidateId']:r for r in json.loads((ROOT/'jimaku-matches.json').read_text())['items']}
    for a in candidates:
        offers=[]
        for brief in bymal.get(a['ids'].get('mal'),[]):
            r=details.get(brief['id'])
            if not r:continue
            sid=int((r.get('shikimori') or {}).get('id') or 0);m=metadata.get(sid)
            mapped=bool(m and str(m.get('malId'))==str(a['ids'].get('mal')))
            expected=m.get('episodes') if mapped and m.get('status')=='released' else m.get('episodesAired') if mapped else None
            eps=r.get('episodes',[]);numbers=[e.get('ordinal') for e in eps];integer=[n for n in numbers if isinstance(n,(int,float)) and int(n)==n]
            missing=[n for n in range(1,int(expected)+1) if n not in numbers] if expected else None
            offers.append({'provider':'AniLiberty','releaseId':r['id'],'ids':{'mal':a['ids'].get('mal'),'shikimori':sid},'crosswalkMatched':mapped,
                'expectedEpisodes':expected,'episodesReturned':len(eps),'missingEpisodes':missing,'duplicateEpisodeNumbers':len(numbers)!=len(set(numbers)),
                'specialNumbers':[n for n in numbers if n not in integer],
                'episodesWith1080':sum(bool(e.get('hls_1080')) for e in eps),'episodes':eps,
                'verified':False,'blockers':['only_one_RU_dub','subtitle_tracks_missing','video_decode_and_browser_checks_pending','skip_timing_review_pending']})
        report['items'].append({'id':a['id'],'ids':a['ids'],'status':'held','offers':offers,'subtitleDirectory':jimaku.get(a['id']),
          'blockers':['second_RU_dub_missing','EN_and_JA_playback_unverified','RU_EN_JA_subtitle_sync_unverified','artwork_review_pending','assembled_player_review_pending']})
    save(ROOT/'source-offers.json',report)
    if args.zoko:
        jobs=[(a['ids']['mal'],mode) for a in candidates if a['ids'].get('mal') for mode in ['sub','dub']]
        results=[]
        with ThreadPoolExecutor(max_workers=4) as pool:
            tasks={pool.submit(zoko,j):j for j in jobs}
            for future in as_completed(tasks):
                mid,mode=tasks[future]
                try:results.append(future.result())
                except Exception as e:results.append({'mal':mid,'mode':mode,'error':str(e)[:160]})
                if len(results)%25==0:
                    save(ROOT/'zoko-batch.json',{'kind':'episode-one-discovery-NOT-complete-series','items':results})
                    print(json.dumps({'stage':'EN_JA_discovery','requestsCompleted':len(results),'total':len(jobs),'offers':sum(r.get('status')=='offer' for r in results)}),flush=True)
        save(ROOT/'zoko-batch.json',{'kind':'episode-one-discovery-NOT-complete-series','items':results})
        for item in report['items']:item['externalEpisodeOneOffers']=[r for r in results if r['mal']==item['ids'].get('mal')]
        save(ROOT/'source-offers.json',report)
    summary={'candidates':len(candidates),'withRussianLists':sum(bool(i['offers']) for i in report['items']),
      'episodeListsCompared':sum(o['expectedEpisodes'] is not None for i in report['items'] for o in i['offers']),
      'listsWithMissingEpisodes':sum(bool(o['missingEpisodes']) for i in report['items'] for o in i['offers']),
      'listedRussianEpisodes':sum(o['episodesReturned'] for i in report['items'] for o in i['offers']),
      'completeRussianListsWith1080':sum(o['expectedEpisodes'] is not None and not o['missingEpisodes'] and not o['duplicateEpisodeNumbers'] and o['episodesWith1080']==o['episodesReturned'] and o['episodesReturned']>0 for i in report['items'] for o in i['offers']),
      'accepted':0,'published':0}
    report['summary']=summary;save(ROOT/'source-offers.json',report);print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
