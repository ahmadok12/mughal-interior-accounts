// Regression tests for preventing accidental close of any entry dialog with unsaved data.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');

function setup(t){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://test.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>{dom.window.MughalControls?.destroy();dom.window.close();});
  const w=dom.window,d=w.document,ctx=dom.getInternalVMContext();
  w.scrollTo=()=>{};
  let confirmLog=[];
  let confirmReturn=false;
  w.confirm=(msg)=>{
    confirmLog.push(msg);
    return confirmReturn;
  };
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const run=code=>vm.runInContext(code,ctx);
  run(fs.readFileSync(path.join(root,'app-mobile.js'),'utf8').replace(/boot\(\);\s*$/,''));
  w.fixture=structuredClone(require('./project-statement-fixture.cjs'));
  w.fixture.projects[0].closed=false;
  run(`Object.assign(state,fixture);state.labourers=[{id:'l1',name:'Sample worker',daily_wage_rate:1500}];state.paymentAccounts=[{id:'b1',name:'Sample bank',account_type:'Bank',opening_balance:100000},{id:'cash',name:'Cash',account_type:'Cash',opening_balance:100000}];state.materials=[{id:'m1',name:'Plywood',unit:'sheet',default_unit_cost:100}];state.orderItems=[{id:'item1',name:'Door',details:'Wooden door'}];state.walkInOrders=[{id:'o1',order_number:'ORD-1',customer_name:'Sample Buyer',customer_phone:'03000000000',amount:20000,status:'Approved'}];`);
  run(fs.readFileSync(path.join(root,'reports-mobile.js'),'utf8'));
  run('render();');
  run(fs.readFileSync(path.join(root,'mobile-controls.js'),'utf8'));

  const setConfirmResponse=(val)=>{confirmReturn=val;};
  const getConfirmCalls=()=>confirmLog.length;
  const resetConfirmCalls=()=>{confirmLog=[];};
  const getConfirmMessages=()=>[...confirmLog];
  const source=id=>d.getElementById(id);

  return{w,d,run,source,setConfirmResponse,getConfirmCalls,resetConfirmCalls,getConfirmMessages};
}

test('pristine entry forms close immediately without confirmation',t=>{
  const h=setup(t);
  // Party sheet
  h.run('openParty()');
  assert.equal(h.source('partySheet').classList.contains('hidden'),false);
  h.resetConfirmCalls();
  h.source('partySheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),0,'Pristine party form should close without confirm');
  assert.equal(h.source('partySheet').classList.contains('hidden'),true);

  // Project sheet via backdrop
  h.run('openProject()');
  assert.equal(h.source('projectSheet').classList.contains('hidden'),false);
  h.resetConfirmCalls();
  h.source('backdrop').click();
  assert.equal(h.getConfirmCalls(),0,'Pristine project form should close without confirm on backdrop click');
  assert.equal(h.source('projectSheet').classList.contains('hidden'),true);

  // Quote sheet via closeSheets()
  h.run('openQuote()');
  assert.equal(h.source('quoteSheet').classList.contains('hidden'),false);
  h.resetConfirmCalls();
  h.run('closeSheets()');
  assert.equal(h.getConfirmCalls(),0,'Pristine quote form should close without confirm via closeSheets');
  assert.equal(h.source('quoteSheet').classList.contains('hidden'),true);
});

test('entering data in any field triggers confirmation on cancel or return; cancelled dialog stays open',t=>{
  const h=setup(t);
  h.run('openParty()');
  h.source('partyName').value='New Customer Name';
  h.setConfirmResponse(false);
  h.resetConfirmCalls();

  // User clicks Cancel button
  const cancelBtn=h.source('partySheet').querySelector('[data-close]');
  cancelBtn.click();
  assert.equal(h.getConfirmCalls(),1,'Expected 1 confirmation prompt');
  assert.match(h.getConfirmMessages()[0],/unsaved|discard|close/i);
  assert.equal(h.source('partySheet').classList.contains('hidden'),false,'Sheet must remain visible');
  assert.equal(h.source('partyName').value,'New Customer Name','Entered data must be preserved');

  // User accepts confirmation
  h.setConfirmResponse(true);
  h.resetConfirmCalls();
  cancelBtn.click();
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('partySheet').classList.contains('hidden'),true,'Sheet must close on confirmed discard');
});

test('editing existing record triggers confirmation only if a field is modified',t=>{
  const h=setup(t);
  // Open existing party
  h.run("openParty('customer-1')");
  assert.equal(h.source('partySheet').classList.contains('hidden'),false);
  const originalName=h.source('partyName').value;
  assert.equal(originalName,'Sample Customer');

  // Untouched edit form closes without confirmation
  h.resetConfirmCalls();
  h.source('partySheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),0,'Unmodified edit form closes without prompt');
  assert.equal(h.source('partySheet').classList.contains('hidden'),true);

  // Open again, edit a field
  h.run("openParty('customer-1')");
  h.source('partyPhone').value='03999999999';
  h.setConfirmResponse(false);
  h.resetConfirmCalls();
  h.source('partySheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),1,'Modified edit form prompts confirm');
  assert.equal(h.source('partySheet').classList.contains('hidden'),false,'Sheet remains open');

  // Reverting to original value clears dirty state
  h.source('partyPhone').value=h.run("party('customer-1')?.phone||''");
  h.resetConfirmCalls();
  h.source('partySheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),0,'Reverting field value makes it clean, closing without prompt');
  assert.equal(h.source('partySheet').classList.contains('hidden'),true);
});

test('clicking backdrop or navigating to another tab prompts confirm when dirty',t=>{
  const h=setup(t);
  h.run('openReceipt()');
  h.source('receiptAmount').value='5000';
  h.setConfirmResponse(false);
  h.resetConfirmCalls();

  // Backdrop click
  h.source('backdrop').click();
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('receiptSheet').classList.contains('hidden'),false,'Backdrop click rejected stays open');

  // Bottom tab click while dirty
  h.resetConfirmCalls();
  const ordersTab=h.d.querySelector('[data-tab="orders"]');
  ordersTab.click();
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('receiptSheet').classList.contains('hidden'),false,'Tab click rejected stays open');

  // Accept confirmation on tab click
  h.setConfirmResponse(true);
  h.resetConfirmCalls();
  ordersTab.click();
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('receiptSheet').classList.contains('hidden'),true,'Sheet closes on confirm');
});

test('dynamic lines (order invoice) track line addition and prompt confirm',t=>{
  const h=setup(t);
  h.run('openOrderInvoice()');
  assert.equal(h.source('orderInvoiceSheet').classList.contains('hidden'),false);

  // Untouched order invoice closes cleanly
  h.resetConfirmCalls();
  h.source('orderInvoiceSheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),0);
  assert.equal(h.source('orderInvoiceSheet').classList.contains('hidden'),true);

  // Reopen and add line
  h.run('openOrderInvoice()');
  h.source('addOrderInvoiceLine').click();
  h.setConfirmResponse(false);
  h.resetConfirmCalls();
  h.source('orderInvoiceSheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),1,'Adding invoice line makes form dirty');
  assert.equal(h.source('orderInvoiceSheet').classList.contains('hidden'),false);

  // Confirm close
  h.setConfirmResponse(true);
  h.resetConfirmCalls();
  h.source('orderInvoiceSheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('orderInvoiceSheet').classList.contains('hidden'),true);
});

test('submitting and saving a form closes without confirmation prompt',async t=>{
  const h=setup(t);
  h.run('openParty()');
  h.source('partyName').value='Auto Saved Party';
  h.resetConfirmCalls();

  const form=h.source('partyForm');
  form.dispatchEvent(new h.w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:form.querySelector('[type="submit"]')}));
  await new Promise(r=>setImmediate(r));

  assert.equal(h.getConfirmCalls(),0,'Form save must never trigger confirmation prompt');
  assert.equal(h.source('partySheet').classList.contains('hidden'),true,'Sheet closed upon save');
  assert.ok(h.run("state.parties.some(p=>p.name==='Auto Saved Party')"));
});

test('Escape key prompts confirmation when dirty',t=>{
  const h=setup(t);
  h.run('openExpenseCategory()');
  h.source('expenseCategoryName').value='New Expense Type';
  h.setConfirmResponse(false);
  h.resetConfirmCalls();

  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('expenseCategorySheet').classList.contains('hidden'),false);

  h.setConfirmResponse(true);
  h.resetConfirmCalls();
  h.d.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(h.getConfirmCalls(),1);
  assert.equal(h.source('expenseCategorySheet').classList.contains('hidden'),true);
});

test('view-only detail sheet closes immediately without confirmation',t=>{
  const h=setup(t);
  h.run("viewParty('customer-1')");
  assert.equal(h.source('detailSheet').classList.contains('hidden'),false);
  h.resetConfirmCalls();

  h.source('detailSheet').querySelector('[data-close]').click();
  assert.equal(h.getConfirmCalls(),0,'Detail sheet closes without confirm');
  assert.equal(h.source('detailSheet').classList.contains('hidden'),true);
});
