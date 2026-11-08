export function historyAgo(value,lang='ru',now=Date.now()){
 const stamp=Number(value)||Date.parse(value);if(!Number.isFinite(stamp))return '';
 const seconds=Math.max(0,Math.floor((now-stamp)/1000));const [unit,size]=seconds<60?['second',1]:seconds<3600?['minute',60]:seconds<86400?['hour',3600]:['day',86400];
 return new Intl.RelativeTimeFormat(lang,{numeric:'auto'}).format(-Math.floor(seconds/size),unit);
}
