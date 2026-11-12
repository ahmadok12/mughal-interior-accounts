// Print details (proprietor, address, WhatsApp, partner name) come from the business record, with the original values as defaults.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const ORIGINAL_CONTACT='<div class="business-contact"><p class="business-address"><b>Proprietor Ali Raza Mughal</b><span>Akbar Road Basti Iqbal Nagar,<br>Near Potato Society, Okara</span></p><a class="business-whatsapp" href="https://wa.me/923024441235" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp 03024441235"><img src="assets/whatsapp.svg" width="25" height="25" alt="WhatsApp"><span><small>WhatsApp</small><b>03024441235</b></span></a></div>';

function setup(t){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://test.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,ctx=dom.getInternalVMContext();w.scrollTo=()=>{};
  const run=code=>vm.runInContext(code,ctx);
  run(fs.readFileSync(path.join(root,'app-mobile.js'),'utf8').replace(/boot\(\);\s*$/,''));
  w.fixture=structuredClone(require('./project-statement-fixture.cjs'));
  run('Object.assign(state,fixture);');
  run(fs.readFileSync(path.join(root,'reports-mobile.js'),'utf8'));
  return{w,d:w.document,run};
}

test('without saved details, printed contact block is exactly as before',t=>{
  const h=setup(t);
  h.run("state.business={name:'Mughal Interior'};");
  assert.equal(h.run('businessContact()'),ORIGINAL_CONTACT);
  assert.equal(h.run('partnerName()'),'Banam Ali');
});

test('saved details replace the defaults and are escaped',t=>{
  const h=setup(t);
  h.run(`state.business={name:'Mughal Interior',document_proprietor:'Usman <Mughal>',document_address:'Main Bazaar\\nOkara',document_whatsapp:'0300-1112223',partner_name:'Banam Raza'};`);
  const html=h.run('businessContact()');
  assert.match(html,/Proprietor Usman &lt;Mughal&gt;/);
  assert.match(html,/Main Bazaar<br>Okara/);
  assert.match(html,/href="https:\/\/wa\.me\/923001112223"/);
  assert.match(html,/<b>0300-1112223<\/b>/);
  h.run('render()');
  for(const node of h.d.querySelectorAll('[data-partner-name]'))assert.equal(node.value??node.textContent,'Banam Raza');
  assert.equal(h.d.querySelectorAll('[data-partner-name]').length,3);
});

test('the print details editor loads and saves every field',async t=>{
  const h=setup(t);
  h.run("state.business={name:'Mughal Interior'};store.updateBusiness=async changes=>(window.saved=changes,{...state.business,...changes});");
  h.run('openDisclaimerEditor()');
  assert.equal(h.d.getElementById('printProprietor').value,'Ali Raza Mughal');
  assert.equal(h.d.getElementById('printPartnerName').value,'Banam Ali');
  h.d.getElementById('printWhatsapp').value='03111234567';
  h.d.getElementById('printPartnerName').value='Banam Hamza';
  h.d.getElementById('disclaimerForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));
  await new Promise(r=>setTimeout(r,50));
  const saved=h.w.saved;
  assert.equal(saved.document_whatsapp,'03111234567');assert.equal(saved.partner_name,'Banam Hamza');
  assert.equal(saved.document_proprietor,'Ali Raza Mughal');assert.ok(saved.document_disclaimer);
  assert.equal(h.run('partnerName()'),'Banam Hamza');
});
