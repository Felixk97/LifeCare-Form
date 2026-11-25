/* LifeCare printable poster, shared by preview and all exports. */
(function(g){
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const raster=v=>/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(v||'')?v:'';
function qrGraphic({url,centerLogo,pattern='square',color='#000000'}){
 const logo=raster(centerLogo);if(centerLogo&&!logo)throw Error('Invalid QR logo');
 if(!['square','rounded','dots'].includes(pattern))throw Error('Unknown QR pattern');
 if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid QR colour');
 const rgb=color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 if(1.05/(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]+.05)<7)throw Error('Choose a darker QR colour for reliable scanning.');
 const q=g.qrcode(0,logo||pattern!=='square'?'H':'M');q.addData(url);q.make();const n=q.getModuleCount(),m=Math.floor(442/(n+8)),full=(n+8)*m;
 let path='',styled='',logoSvg='';
 let hole=0,start=0;
 if(logo){for(let k=Math.min(7,Math.floor(n*.19));k>=3;k--){if(k%2===0)continue;const a=(n-k)/2;if(q.functionModules.slice(a,a+k).every(row=>row.slice(a,a+k).every(x=>!x))){hole=k;start=a;break}}if(!hole)throw Error('Centre logo conflicts with QR reference marks. Choose no centre logo.');}
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c)){
  if(hole&&r>=start&&r<start+hole&&c>=start&&c<start+hole)continue;
  if(pattern==='square'||q.functionModules[r][c])path+=`M${c} ${r}h1v1h-1z`;
  else if(pattern==='dots')styled+=`<circle cx="${c+.5}" cy="${r+.5}" r=".45"/>`;
  else styled+=`<rect x="${c+.035}" y="${r+.035}" width=".93" height=".93" rx=".22"/>`;
 }
 if(hole)logoSvg=`<rect x="${start}" y="${start}" width="${hole}" height="${hole}" rx=".35" fill="#fff"/><image x="${start+.35}" y="${start+.35}" width="${hole-.7}" height="${hole-.7}" href="${esc(logo)}" xlink:href="${esc(logo)}" preserveAspectRatio="xMidYMid meet"/>`;
 return {full,m,body:`<g transform="translate(${4*m} ${4*m}) scale(${m})"><path d="${path}" fill="${color}" shape-rendering="crispEdges"/><g fill="${color}">${styled}</g>${logoSvg}</g>`};
}
g.lifeCareQRPoster=function({title,url,logo,centerLogo,pattern='square',color='#000000',measure}){
 const topLogo=raster(logo);if(logo&&!topLogo)throw Error('Invalid poster logo');
 const {full,body}=qrGraphic({url,centerLogo,pattern,color});
 const size=39,max=640,lines=[];let line='';const width=measure||((s)=>Array.from(s).length*21);
 for(const word of String(title||'Form').trim().split(/\s+/)){let next=line?line+' '+word:word;if(width(next)<=max){line=next;continue}if(line){lines.push(line);line=''}for(const ch of Array.from(word)){if(line&&width(line+ch)>max){lines.push(line);line=''}line+=ch}}if(line)lines.push(line);if(!lines.length)lines.push('Form');
 const titleY=topLogo?226:130,qrY=titleY+(lines.length-1)*49+61,bottom=qrY+full+44,H=bottom+130,W=800,left=(W-full)/2;
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-qr-x="${left}" data-qr-y="${qrY}" data-qr-size="${full}" role="img" aria-label="${esc(title)} QR poster"><rect width="800" height="${H}" fill="#fff"/><rect x="22" y="22" width="756" height="${H-44}" rx="28" fill="#fff" stroke="#d9e2ee" stroke-width="2"/><path d="M50 22H750Q778 22 778 50V68H22V50Q22 22 50 22" fill="#233f82"/><path d="M22 68H232" stroke="#cf303f" stroke-width="5"/>${topLogo?`<image x="225" y="94" width="350" height="83" href="${esc(topLogo)}" xlink:href="${esc(topLogo)}" preserveAspectRatio="xMidYMid meet"/><path d="M305 193H495" stroke="#d9e2ee" stroke-width="2"/>`:''}${lines.map((s,i)=>`<text x="400" y="${titleY+i*49}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${size}" fill="#20365d">${esc(s)}</text>`).join('')}<rect x="${left-14}" y="${qrY-14}" width="${full+28}" height="${full+28}" rx="18" fill="#f3f6fa" stroke="#dce5ee" stroke-width="2"/><rect x="${left}" y="${qrY}" width="${full}" height="${full}" fill="#fff"/><g transform="translate(${left} ${qrY})">${body}</g><rect x="48" y="${bottom}" width="704" height="86" rx="16" fill="#edf3fa"/><text x="400" y="${bottom+37}" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="#233f82">Scan to Complete This Form</text><text x="400" y="${bottom+64}" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="#526984">Open your phone camera and scan the QR code</text></svg>`;
};
})(typeof window!=='undefined'?window:globalThis);
