import {mkdir,copyFile,access,cp} from 'node:fs/promises';
await mkdir('public/vendor',{recursive:true});
const candidates=['node_modules/@zxing/library/umd/index.min.js','node_modules/@zxing/library/umd/index.js'];
let src;for(const p of candidates){try{await access(p);src=p;break}catch{}}
if(!src)throw Error('ZXing UMD bundle missing. Run npm install before npm run build.');
await copyFile(src,'public/vendor/zxing.js');
try{await copyFile('node_modules/@zxing/library/LICENSE','public/vendor/ZXING-LICENSE.txt')}catch{}
console.log('Local barcode scanner bundle copied. QR and Excel engines are already included.');

await mkdir('public/vendor/pdfjs',{recursive:true});
for(const file of ['pdf.min.mjs','pdf.worker.min.mjs'])await copyFile('node_modules/pdfjs-dist/legacy/build/'+file,'public/vendor/pdfjs/'+file);
for(const dir of ['cmaps','standard_fonts'])await cp('node_modules/pdfjs-dist/'+dir,'public/vendor/pdfjs/'+dir,{recursive:true});
await copyFile('node_modules/pdfjs-dist/LICENSE','public/vendor/pdfjs/LICENSE');
console.log('Local PDF.js viewer assets copied.');
