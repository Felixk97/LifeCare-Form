/* LifeCare printable poster, shared by preview and all exports. */
(function(g){
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const raster=v=>/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v||'')?v:'';
// QR alignment and timing marks must never be covered by a logo. Long URLs
// often create QR versions with an alignment mark exactly at the centre.
// Find the closest safe region instead of rejecting those URLs.
function logoRegion(q,maxHole=7){
 const n=q.getModuleCount(),limit=Math.min(maxHole,Math.floor(n*.19));
 for(let k=limit-(limit%2===0?1:0);k>=3;k-=2){
  const a=(n-k)/2;let best=null;
  for(let dy=-8;dy<=8;dy++)for(let dx=-8;dx<=8;dx++){
   const row=a+dy,col=a+dx;if(row<0||col<0||row+k>n||col+k>n)continue;
   const dist=dx*dx+dy*dy;if(dist>64||(best&&dist>=best.dist))continue;
   if(q.functionModules.slice(row,row+k).every(r=>r.slice(col,col+k).every(x=>!x)))best={row,col,k,dist};
  }
  if(best)return best;
 }
 return null;
}
function qrGraphic({url,centerLogo,pattern='square',color='#000000',maxLogoModules=7}){
 const logo=raster(centerLogo);if(centerLogo&&!logo)throw Error('Invalid QR logo');
 if(!['square','rounded','dots'].includes(pattern))throw Error('Unknown QR pattern');
 if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid QR colour');
 const rgb=color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 if(1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05)<7)throw Error('Choose a darker QR colour for reliable scanning.');
 const q=g.qrcode(0,logo||pattern!=='square'?'H':'M');q.addData(url);q.make();const n=q.getModuleCount(),m=Math.floor(500/(n+8)),full=(n+8)*m;
 let path='',styled='',logoSvg='';
 const region=logo?logoRegion(q,maxLogoModules):null;
 if(logo&&!region)throw Error('No safe logo position for this QR. Try a smaller logo or choose no logo.');
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c)){
  if(region&&r>=region.row&&r<region.row+region.k&&c>=region.col&&c<region.col+region.k)continue;
  if(pattern==='square'||q.functionModules[r][c])path+=`M${c} ${r}h1v1h-1z`;
  else if(pattern==='dots')styled+=`<circle cx="${c+.5}" cy="${r+.5}" r=".45"/>`;
  else styled+=`<rect x="${c+.035}" y="${r+.035}" width=".93" height=".93" rx=".22"/>`;
 }
 if(region){const {row,col,k}=region;logoSvg=`<rect data-qr-logo="true" x="${col}" y="${row}" width="${k}" height="${k}" rx=".35" fill="#fff"/><image x="${col+.35}" y="${row+.35}" width="${k-.7}" height="${k-.7}" href="${esc(logo)}" xlink:href="${esc(logo)}" preserveAspectRatio="xMidYMid meet"/>`;}
 return {full,m,logoOffset:region?Math.sqrt(region.dist):0,logoModules:region?.k||0,body:`<g transform="translate(${4*m} ${4*m}) scale(${m})"><path d="${path}" fill="${color}" shape-rendering="crispEdges"/><g fill="${color}">${styled}</g>${logoSvg}</g>`};
}
g.lifeCareQRPoster=function({title,url,logo,centerLogo,pattern='square',color='#000000',measure,maxLogoModules=7}){
 const topLogo=raster(logo);if(logo&&!topLogo)throw Error('Invalid poster logo');
 const {full,body,logoOffset,logoModules}=qrGraphic({url,centerLogo,pattern,color,maxLogoModules});
 const size=43,max=690,lines=[];let line='';const width=measure||((s)=>Array.from(s).length*24);
 for(const word of String(title||'Form').trim().split(/\s+/)){let next=line?line+' '+word:word;if(width(next)<=max){line=next;continue}if(line){lines.push(line);line=''}for(const ch of Array.from(word)){if(line&&width(line+ch)>max){lines.push(line);line=''}line+=ch}}if(line)lines.push(line);if(!lines.length)lines.push('Form');
 const titleY=topLogo?221:130,qrY=titleY+(lines.length-1)*52+56,bottom=qrY+full+48,H=bottom+146,W=800,left=(W-full)/2;
 const image=(src,x,y,w,h)=>`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(src)}" xlink:href="${esc(src)}" preserveAspectRatio="xMidYMid meet"/>`;
 const header=topLogo?image(topLogo,240,79,320,84):'';
 // Decorative, original vector illustrations. Kept outside QR and its quiet zone.
 const clipboard=`<g id="footer-clipboard" transform="translate(62 ${bottom+5}) scale(.9)" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-12 52 51)"><rect x="22" y="12" width="62" height="80" rx="7" fill="#df927d" stroke="#a66b60" stroke-width="2"/><rect x="29" y="19" width="48" height="65" rx="3" fill="#fffaf0"/><rect x="39" y="7" width="29" height="15" rx="4" fill="#f3c66c" stroke="#d4a14d" stroke-width="1.5"/><path d="M39 34h28M39 41h23M39 48h26" stroke="#bcc8cc" stroke-width="2.3"/><path d="M49 58h9v8h8v9h-8v8h-9v-8h-8v-9h8z" fill="#79ae91"/><g transform="rotate(35 78 33)"><rect x="74" y="8" width="9" height="34" rx="2" fill="#edc369"/><path d="M74 42h9l-4.5 10z" fill="#c5a485"/><path d="M77 47l1.5 5 1.5-5" fill="#39465a"/><rect x="74" y="6" width="9" height="7" rx="2" fill="#db8b80"/></g></g><path d="M12 39C5 52 15 68 28 67S45 54 41 41" fill="none" stroke="#687e91" stroke-width="4"/><path d="M12 39l-2-5M41 41l1-5" stroke="#384a5d" stroke-width="5"/><path d="M28 67v14c0 21 31 23 41 12 9-10 2-23-6-19-8 3-7 17 10 20 14 3 27-6 28-20" fill="none" stroke="#e3b854" stroke-width="4"/><circle cx="101" cy="70" r="8" fill="#e3ebee" stroke="#78939e" stroke-width="2"/><circle cx="101" cy="70" r="3.5" fill="#9cb4bd"/></g>`;
 const meter=`<g id="footer-glucose-meter" transform="translate(641 ${bottom+5}) scale(.9)" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(14 50 50)"><rect x="21" y="6" width="64" height="86" rx="22" fill="#5a9fc4" stroke="#407d9e" stroke-width="2"/><rect x="28" y="13" width="50" height="70" rx="16" fill="#83c3dc"/><rect x="34" y="23" width="38" height="31" rx="5" fill="#f3f8f7" stroke="#49798c" stroke-width="1.5"/><path d="M42 39h5v7h-5zM51 32h6v14h-6zM61 32h5v14h-5z" fill="#426274" opacity=".78"/><path d="M40 29h13" stroke="#a8c2c9" stroke-width="1.7"/><circle cx="42" cy="68" r="6" fill="#eaf3f7" stroke="#568ca7" stroke-width="1.4"/><path d="M39 68h6M42 65v6" stroke="#568ca7" stroke-width="1.5"/><circle cx="64" cy="68" r="6" fill="#eaf3f7" stroke="#568ca7" stroke-width="1.4"/><path d="M61 68h6" stroke="#568ca7" stroke-width="1.5"/><path d="M48 87h11v19H48z" fill="#faf9f1" stroke="#b5c3c8" stroke-width="1.4"/><path d="M51 103h5v6h-5z" fill="#d4a65c"/></g><path d="M90 79c-4 6-8 10-8 14a8 8 0 0 0 16 0c0-4-4-8-8-14z" fill="#d97676" opacity=".9"/></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-qr-x="${left}" data-qr-y="${qrY}" data-qr-size="${full}" data-logo-offset="${logoOffset}" data-logo-modules="${logoModules}" role="img" aria-label="${esc(title)} QR poster"><rect width="800" height="${H}" fill="#fff"/><rect x="22" y="22" width="756" height="${H-44}" rx="28" fill="#fff" stroke="#d9e2ee" stroke-width="2"/><path d="M50 22H750Q778 22 778 50V53H22V50Q22 22 50 22" fill="#10397c"/><path d="M22 53H232" stroke="#eb1833" stroke-width="5"/>${header}${lines.map((s,i)=>`<text x="400" y="${titleY+i*52}" text-anchor="middle" font-family="Calibri, Carlito, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#102d59">${esc(s)}</text>`).join('')}<path d="M24 ${bottom-112}Q400 ${bottom+91} 776 ${bottom-112}L776 ${bottom-73}Q400 ${bottom+110} 24 ${bottom-73}Z" fill="#e1f1f8"/><rect x="${left-12}" y="${qrY-12}" width="${full+24}" height="${full+24}" rx="25" fill="#e0f3fa" stroke="#15aaca" stroke-width="6"/><rect x="${left}" y="${qrY}" width="${full}" height="${full}" fill="#fff"/><g transform="translate(${left} ${qrY})">${body}</g><rect x="48" y="${bottom}" width="704" height="108" rx="18" fill="#e3effa"/>${clipboard}${meter}<text x="400" y="${bottom+45}" text-anchor="middle" font-family="Calibri, Carlito, Arial, sans-serif" font-size="29" font-weight="700" fill="#233f82">Scan to Complete This Form</text><text x="400" y="${bottom+74}" text-anchor="middle" font-family="Calibri, Carlito, Arial, sans-serif" font-size="17" fill="#526984">Open your phone camera and scan the QR code</text></svg>`;
};
})(typeof window!=='undefined'?window:globalThis);
