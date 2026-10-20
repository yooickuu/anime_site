import test from 'node:test';
import assert from 'node:assert/strict';
import {hlsRenditions} from '../src/hls-renditions.js';
test('does not mistake 360p I-frame thumbnails for a playable video rendition',()=>{
 const master='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1800112,RESOLUTION=1920x1080,CODECS="avc1,mp4a"\n/main.m3u8\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=49071,RESOLUTION=640x360,URI="iframes.m3u8"';
 assert.deepEqual(hlsRenditions(master,'https://example.test/master.m3u8'),[{width:1920,height:1080,quality:1080,url:'https://example.test/main.m3u8'}]);
 assert.deepEqual(hlsRenditions('<html>Error</html>','https://example.test/'),[]);
 assert.deepEqual(hlsRenditions('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360\njavascript:bad','https://example.test/'),[]);
});
