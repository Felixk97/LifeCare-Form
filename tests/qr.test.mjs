import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({});context.window=context;for(const name of ['qr.js','qr-poster.js'])vm.runInContext(readFileSync(new URL('../public/vendor/'+name,import.meta.url),'utf8'),context);
const logo='data:image/png;base64,'+readFileSync(new URL('../public/assets/lifecare-logo.png',import.meta.url)).toString('base64');
test('QR customization retains poster structure, actual form title, quiet zone and different destinations',()=>{const a=context.lifeCareQRPoster({title:'Form A',url:'https://example.com/?c=abc123',logo,centerLogo:logo,pattern:'dots',color:'#233f82'}),b=context.lifeCareQRPoster({title:'Form B',url:'https://example.com/?c=def456',logo,pattern:'rounded'});assert.match(a,/Form A/);assert.match(b,/Form B/);assert.match(a,/Scan to Complete This Form/);assert.match(a,/<circle /);assert.match(b,/rx=".22"/);assert.notEqual(a,b);assert.match(a,/data-qr-size=/);assert.equal((a.match(/<image /g)||[]).length,2);assert.equal((b.match(/<image /g)||[]).length,1);});
test('QR settings reject light colours and non-raster logo sources',()=>{const base={title:'Test',url:'https://example.com/?c=test'};assert.throws(()=>context.lifeCareQRPoster({...base,color:'#eeeeee'}),/darker/);assert.throws(()=>context.lifeCareQRPoster({...base,centerLogo:'https://example.com/logo.svg'}),/Invalid/);assert.doesNotMatch(context.lifeCareQRPoster(base),/<image /);});
test('fixed V16 poster has one header logo, title above QR, and two footer illustrations outside the quiet zone',()=>{const base={title:'Corporate event',url:'https://example.com/?c=event',logo};const solo=context.lifeCareQRPoster(base),dual=context.lifeCareQRPoster({...base,partnerLogo:logo});assert.equal(solo,dual);assert.equal((solo.match(/<image /g)||[]).length,1);assert.match(solo,/stroke="#15aaca"/);assert.match(solo,/Scan to Complete This Form/);const y=Number(solo.match(/data-qr-y="(\d+)"/)[1]),size=Number(solo.match(/data-qr-size="(\d+)"/)[1]);assert.ok(Number(solo.match(/<text x="400" y="(\d+)"/)[1])<y);for(const id of ['footer-clipboard','footer-glucose-meter']){const m=solo.match(new RegExp('id="'+id+'" transform="translate\\(\\d+ (\\d+)'));assert.ok(m&&Number(m[1])>y+size);} });

test('approved V16 template removes title divider and keeps logo proportions and font consistent',()=>{const svg=context.lifeCareQRPoster({title:'Corporate Health Assessment',url:'https://example.com/?c=event',logo});assert.doesNotMatch(svg,/M330 175H470/);assert.match(svg,/font-family="Calibri, Carlito, Arial, sans-serif"/);assert.match(svg,/<image x="240" y="79" width="320" height="84"/);assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);});

test('long permanent URLs with centre alignment marks still generate logo QR for every style',()=>{
 for(const host of ['lifecare-forms-screening.netlify.app','health-screening-form-long-domain-name.netlify.app']){
  const url='https://'+host+'/?c=12345678-1234-1234-1234-123456789abc';
  const q=context.qrcode(0,'H');q.addData(url);q.make();const n=q.getModuleCount();
  assert.ok(q.functionModules[(n-1)/2][(n-1)/2]);
  for(const pattern of ['square','rounded','dots']){
   const svg=context.lifeCareQRPoster({title:'Testing',url,logo,centerLogo:logo,pattern});
   const match=svg.match(/data-qr-logo="true" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/);
   assert.ok(match,'logo must not disappear');const [,col,row,k]=match.map(Number);
   const actualN=Number(svg.match(/data-qr-modules="(\d+)"/)[1]);const actual=context.qrcode((actualN-17)/4,'H');actual.addData(url);actual.make();assert.ok(actual.functionModules.slice(row,row+k).every(r=>r.slice(col,col+k).every(x=>!x)),'logo must not cover QR reference modules');assert.equal(row,col);assert.equal(row*2+k,actualN);assert.equal(Number(svg.match(/data-logo-offset="([\d.]+)"/)[1]),0);
  }
 }
});
test('smaller logo retry retains logo and avoids functional modules',()=>{
 const url='https://lifecare-forms-screening.netlify.app/?c=12345678-1234-1234-1234-123456789abc';
 for(const size of [7,5,3]){const svg=context.lifeCareQRPoster({title:'Testing',url,logo,centerLogo:logo,pattern:'dots',maxLogoModules:size});assert.ok(Number(svg.match(/data-logo-modules="(\d+)"/)[1])<=size);assert.match(svg,/data-qr-logo="true"/)}
});

test('removed artistic style is rejected and only three QR styles are exposed in the editor',()=>{const base={title:'Test',url:'https://example.com/?c=test',logo,centerLogo:logo};assert.throws(()=>context.lifeCareQRPoster({...base,pattern:'artistic'}),/Unknown QR pattern/);const html=readFileSync(new URL('../public/admin.html',import.meta.url),'utf8');const options=html.match(/<select id="qrPattern">(.*?)<\/select>/s)[1];assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map(x=>x[1]),['square','rounded','dots']);assert.doesNotMatch(html,/qrArtFile|qrArtBox/);});
