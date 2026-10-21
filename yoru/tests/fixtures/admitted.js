export const now=Date.parse('2026-10-21T12:00:00Z');
const proof=()=>({passed:true,checkedAt:new Date(now).toISOString()});
export function valid(){return {id:'mal-1',ids:{mal:1,anilist:10},releasedEpisodes:[1,2],ongoing:true,
 updates:{adapter:'fixture',schedule:'hourly',probe:proof()},
 evidence:{identity:proof(),releaseManifest:proof(),playerDesktop:proof(),playerMobile:proof()},
 artwork:{poster:{url:'https://example.test/poster.jpg',width:1000,height:1500,review:proof()},backdrop:{url:'https://example.test/bg.jpg',width:1920,height:1080,review:proof()}},
 episodes:[1,2].map(number=>({number,audio:['ru','ru','en','ja'].map((language,i)=>({id:'track-'+i,dubId:'studio-'+i,language,original:language==='ja',languageReview:proof(),duration:1400,
 sources:[360,480,720,1080].map(quality=>({quality,height:quality,url:`https://example.test/${number}/${i}/${quality}.m3u8`,probe:{...proof(),decoded:true,browserPlayable:true}})),
 subtitles:['ru','en','ja'].map(language=>({language,format:'vtt',url:'https://example.test/'+language+'.vtt',review:{...proof(),synchronized:true}})),opening:{start:20,end:100,review:proof()},ending:{absent:true,review:proof()}}))}))};}
