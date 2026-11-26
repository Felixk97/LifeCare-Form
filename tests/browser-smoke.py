from playwright.sync_api import sync_playwright
from pathlib import Path
import re,json,os
root=Path(__file__).resolve().parents[1]/'public'
# Test actual HTML/scripts in an inline page; network navigation blocked in environment.
def html(name):
 s=(root/name).read_text()
 s=re.sub(r'<script src="(/vendor/[^\"]+\.js)"></script>', lambda m:'<script>'+ (root/m.group(1).lstrip('/')).read_text().replace('</script','<\\/script')+'</script>' if (root/m.group(1).lstrip('/')).exists() else '',s)
 stub="""<script>for(const k of ['localStorage','sessionStorage']){const m=new Map;Object.defineProperty(window,k,{value:{getItem:x=>m.get(x)||null,setItem:(x,v)=>m.set(x,String(v)),removeItem:x=>m.delete(x)}})};if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('')});window.alert=msg=>{window.lastAlert=msg};window.confirm=()=>true;</script>"""
 return s.replace('<head>','<head>'+stub,1)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],timeout=6000)
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e: errors.append(str(e)));page.set_content(html('admin.html'),wait_until='domcontentloaded',timeout=6000)
 print('admin loaded',page.title(),errors)
 page.evaluate("""()=>{const c={id:'form-a',name:'Sample form',cfg:{q:[{id:'s1',type:'section',label:'Section A'},{id:'q1',type:'yesno',label:'Continue?'},{id:'q2',type:'date',label:'Date'},{id:'s2',type:'section',label:'Section B'},{id:'q3',type:'text',label:'Details'}],description:'Hello'},settings:{}};D.companies=[c];editCfg(c)}""")
 page.locator('#cfDescription').fill('New intro description');page.locator('#cfSection').click();page.locator('#cfType').select_option('text');page.locator('#cfAdd').click();assert page.locator('#cfList .editorCard').count()==7
 page.locator('#cfIntroPdf').click();assert page.locator('#cfIntroList .editorCard').count()==1
 page.locator('#cfIntroList .lb').fill('Guidelines');page.locator('#cfList .editorCard[data-id="q2"] .gp').select_option('A');page.locator('#cfList .editorCard[data-id="q3"] .gp').select_option('A');assert 'Q' in page.locator('#cfList .editorCard[data-id="q2"] .linkedInfo').inner_text()
 page.locator('#cfList .editorCard[data-id="q1"] .go').nth(1).select_option('s2');assert page.evaluate("CFL.find(q=>q.id==='q1').go.No")== 's2'
 assert page.evaluate('document.querySelector("#cfPanel").scrollWidth<=document.querySelector("#cfPanel").clientWidth+2')
 page.screenshot(path='/tmp/lc18_admin.png');print('admin interactions passed', errors)
 # respondent: initialize sample form manually; original init normally requires real URL
 page2=b.new_page(viewport={'width':390,'height':844});err2=[];page2.on('pageerror',lambda e:err2.append(str(e)))
 src=html('index.html').replace('if(!CID){$(\'formCard\').innerHTML=\'<p>\'+t(\'nolink\')+\'</p>\';return}', 'if(!CID)return')
 page2.set_content(src,wait_until='domcontentloaded',timeout=6000)
 page2.evaluate("""()=>{FORM={nameRequired:false,sectionMode:'paged'};coName='Sample form';L();applyCfg({description:'Read before answering.',linkedRequired:true,q:[{id:'s1',type:'section',label:'Section A'},{id:'gate',type:'yesno',label:'Continue?',opts:['Yes','No'],go:{No:'s2'}},{id:'q1',type:'number',label:'Quantity',group:'A'},{id:'q2',type:'text',label:'Details',group:'A'},{id:'s2',type:'section',label:'Section B'},{id:'date',type:'date',label:'Date'}]})}""")
 assert page2.locator('#formDescription').inner_text()=='Read before answering.'
 page2.locator('input[name=q_gate][value=Yes]').check();page2.locator('#q_q1').fill('0');assert 'linked-required' in page2.locator('.qw[data-q=q2] .row').get_attribute('class')
 page2.locator('input[name=q_gate][value=No]').check();assert 'hide' in page2.locator('.qw[data-q=q1]').get_attribute('class')
 page2.locator('#sectionNext').click();assert page2.locator('#q_date').is_visible();assert page2.locator('#q_date').get_attribute('type')=='date';page2.screenshot(path='/tmp/lc18_respondent.png');print('respondent interactions passed',err2)
 assert not errors and not err2
 b.close()
