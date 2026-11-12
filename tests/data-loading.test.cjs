// Regression tests for complete data loading (no silent 1,000-row cut-off) and session refresh.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const BASE='https://db.test.invalid';

function setup(t,handler){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://test.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,ctx=dom.getInternalVMContext(),calls=[];
  w.scrollTo=()=>{};
  w.MUGHAL_CONFIG={supabaseUrl:BASE,supabasePublishableKey:'sb_publishable_test'};
  w.fetch=async(url,options={})=>{calls.push({url:String(url),options});return handler(String(url),options,calls);};
  w.Response=Response;w.Headers=Headers;
  const run=code=>vm.runInContext(code,ctx);
  run(fs.readFileSync(path.join(root,'app-mobile.js'),'utf8').replace(/boot\(\);\s*$/,''));
  return{w,run,calls};
}

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});
const rows=(from,to)=>Array.from({length:Math.max(0,to-from+1)},(_,i)=>({id:`r${from+i}`}));

test('requestAll pages past the server row cap and returns every row',async t=>{
  const TOTAL=2350,CAP=1000;
  const h=setup(t,(url,options)=>{
    const q=new URL(url).searchParams,from=Number(q.get('offset')),end=Math.min(from+Number(q.get('limit'))-1,from+CAP-1,TOTAL-1);
    return json(rows(from,end),206,{'Content-Range':`${from}-${end}/${TOTAL}`});
  });
  h.run("state.token='t';");
  const result=await h.run("store.requestAll('/rest/v1/payments?select=*&order=payment_date.desc,id.asc')");
  assert.equal(result.length,TOTAL);
  assert.equal(new Set(result.map(r=>r.id)).size,TOTAL);
  assert.deepEqual(h.calls.map(c=>new URL(c.url).searchParams.get('offset')),['0','1000','2000']);
  assert.ok(h.calls.every(c=>c.url.includes('order=payment_date.desc,id.asc&limit=1000')));
  assert.ok(h.calls.every(c=>c.options.headers.Prefer==='count=exact'));
});

test('requestAll still completes when the server hides the total count',async t=>{
  const TOTAL=1500;
  const h=setup(t,(url,options)=>{
    const from=Number(new URL(url).searchParams.get('offset'));
    if(from>=TOTAL)return new Response('',{status:416});
    const end=Math.min(from+999,TOTAL-1);
    return json(rows(from,end),206,{'Content-Range':`${from}-${end}/*`});
  });
  h.run("state.token='t';");
  const result=await h.run("store.requestAll('/rest/v1/parties?select=*')");
  assert.equal(result.length,TOTAL);
});

test('every table loaded at start-up uses paging with a stable id tie-breaker',async t=>{
  const urls=[];
  const h=setup(t,url=>{urls.push(url);if(url.includes('business_members'))return json([{business_id:'b1',role:'owner'}]);return json([],200,{'Content-Range':'*/0'});});
  h.run("state.token='t';state.userId='u1';");
  await h.run('store.load()');
  const tables=h.run('SYNC_TABLES.map(t=>t.table)');
  assert.equal(tables.length,20);
  for(const table of tables){
    const url=urls.find(u=>u.includes(`/rest/v1/${table}?`));
    assert.ok(url,table);assert.match(url,/&order=[^&]*,id\.asc&limit=1000&offset=0$/,url);
  }
});

test('an expired access token is refreshed once and the request is retried',async t=>{
  let refreshes=0;
  const h=setup(t,(url,options)=>{
    if(url.includes('grant_type=refresh_token')){refreshes++;assert.equal(JSON.parse(options.body).refresh_token,'old-refresh');return json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600,user:{id:'u1'}});}
    if(options.headers.Authorization==='Bearer old-access')return json({message:'JWT expired'},401);
    return json([{id:'ok'}]);
  });
  h.run("state.token='old-access';state.refreshToken='old-refresh';state.expiresAt=Math.floor(Date.now()/1000)+3600;state.userId='u1';");
  const result=await h.run("store.request('/rest/v1/parties?select=*')");
  assert.deepEqual(result,[{id:'ok'}]);
  assert.equal(refreshes,1);
  const saved=JSON.parse(h.w.localStorage.getItem('mi_mobile_session'));
  assert.equal(saved.token,'new-access');assert.equal(saved.refreshToken,'new-refresh');assert.ok(saved.expiresAt>Date.now()/1000);
});

test('a token close to expiry is refreshed before the request is sent',async t=>{
  const h=setup(t,url=>url.includes('grant_type=refresh_token')?json({access_token:'fresh',refresh_token:'r2',expires_in:3600}):json([]));
  h.run("state.token='stale';state.refreshToken='r1';state.expiresAt=Math.floor(Date.now()/1000)+10;");
  await h.run("store.request('/rest/v1/parties?select=*')");
  assert.ok(h.calls[0].url.includes('grant_type=refresh_token'));
  assert.equal(h.calls[1].options.headers.Authorization,'Bearer fresh');
});

test('parallel requests share a single refresh call',async t=>{
  let refreshes=0;
  const h=setup(t,async url=>{if(url.includes('grant_type=refresh_token')){refreshes++;await new Promise(r=>setTimeout(r,10));return json({access_token:'fresh',refresh_token:'r2',expires_in:3600});}return json([]);});
  h.run("state.token='stale';state.refreshToken='r1';state.expiresAt=1;");
  await h.run("Promise.all([store.request('/a'),store.request('/b'),store.request('/c')])");
  assert.equal(refreshes,1);
});

test('a failed refresh signs the user out with a clear message',async t=>{
  const h=setup(t,url=>url.includes('grant_type=refresh_token')?json({error:'invalid_grant'},400):json({message:'JWT expired'},401));
  h.run("state.token='old';state.refreshToken='revoked';state.expiresAt=Math.floor(Date.now()/1000)+3600;");
  await assert.rejects(h.run("store.request('/rest/v1/parties')"),/session expired/);
  assert.equal(h.run('state.token'),null);assert.equal(h.run('state.refreshToken'),null);
  assert.equal(h.w.localStorage.getItem('mi_mobile_session'),null);
});

test('sign-in stores the refresh token and expiry',async t=>{
  const h=setup(t,()=>json({access_token:'a1',refresh_token:'r1',expires_at:4102444800,user:{id:'u9'}}));
  await h.run("store.signIn('owner@example.com','pw')");
  assert.deepEqual(JSON.parse(h.w.localStorage.getItem('mi_mobile_session')),{token:'a1',refreshToken:'r1',expiresAt:4102444800,userId:'u9'});
});

// In-memory stand-in for Supabase with updated_at stamps and a deletion log, like migration 20261110000000.
function fakeDatabase({withSyncLog=true}={}){
  let clock=Date.parse('2026-11-10T10:00:00Z');
  const tick=()=>new Date(clock+=1000).toISOString();
  const tables={},deletions=[];
  const db={
    tables,deletions,requests:[],
    insert(table,row){(tables[table]??=[]).push({business_id:'b1',updated_at:tick(),...row});},
    update(table,id,changes){Object.assign(tables[table].find(r=>r.id===id),changes,{updated_at:tick()});},
    remove(table,id){tables[table]=tables[table].filter(r=>r.id!==id);deletions.push({id:deletions.length+1,business_id:'b1',table_name:table,row_id:id});},
    handler(url){
      db.requests.push(url);const u=new URL(url),name=u.pathname.split('/').pop(),q=u.searchParams;
      if(name==='business_members')return json([{business_id:'b1',role:'owner'}]);
      if(name==='businesses')return json([{id:'b1',name:'Mughal Interior'}]);
      let rows;
      if(name==='sync_deletions'){if(!withSyncLog)return json({message:'relation does not exist'},404);rows=deletions.filter(d=>d.id>Number((q.get('id')||'gt.0').slice(3)));if(q.get('order')==='id.desc')rows=[...rows].reverse();}
      else{rows=[...(tables[name]||[])];if(q.get('active'))rows=rows.filter(r=>r.active!==false);const since=q.get('updated_at');if(since)rows=rows.filter(r=>r.updated_at>=since.slice(4));}
      const limit=Number(q.get('limit')||1000),offset=Number(q.get('offset')||0),page=rows.slice(offset,offset+limit);
      return json(page,200,{'Content-Range':`${offset}-${offset+page.length-1}/${rows.length}`});
    },
  };
  return db;
}

test('after a save only changed rows are fetched, and edits, side effects and deletions all appear',async t=>{
  const db=fakeDatabase();
  db.insert('parties',{id:'p1',name:'Bilal'});db.insert('parties',{id:'p2',name:'Asad'});
  db.insert('payments',{id:'pay1',payment_date:'2026-11-01',amount:500});
  db.insert('materials',{id:'m1',name:'Board',active:true,quantity:10});
  const h=setup(t,url=>db.handler(url));
  h.run("state.token='t';state.userId='u1';");
  await h.run('store.load()');
  assert.equal(h.run('state.parties.length'),2);
  assert.ok(h.run('store.sync').deletionCursor===0);

  // A save and its trigger side effects: new payment, edited party, stock change, archived material, deleted entry.
  db.insert('payments',{id:'pay2',payment_date:'2026-11-05',amount:900});
  db.update('parties','p1',{name:'Bilal Traders'});
  db.insert('parties',{id:'p3',name:'Zain'});
  db.update('materials','m1',{quantity:4});
  db.insert('materials',{id:'m2',name:'Glue',active:true});
  db.update('materials','m2',{active:false});
  db.remove('payments','pay1');
  db.requests.length=0;
  await h.run('store.load()');

  assert.deepEqual(JSON.parse(h.run('JSON.stringify(state.parties.map(p=>p.name))')),['Asad','Bilal Traders','Zain']);
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(state.payments.map(p=>p.id))')),['pay2']);
  assert.equal(h.run('state.materials.length'),1);assert.equal(h.run('state.materials[0].quantity'),4);
  assert.equal(h.run('store.sync').deletionCursor,1);
  // Quick refresh asked for changes only, never re-read business membership.
  assert.ok(!db.requests.some(u=>u.includes('business_members')));
  assert.ok(db.requests.filter(u=>u.includes('/payments?')).every(u=>u.includes('updated_at=gte.')));
});

test('quick refresh matches a full reload exactly',async t=>{
  const db=fakeDatabase();
  for(let i=0;i<30;i++)db.insert('project_entries',{id:`e${i}`,entry_date:`2026-10-${String(1+i%28).padStart(2,'0')}`,created_at:`2026-10-01T00:00:${String(i).padStart(2,'0')}Z`,amount:i});
  const h=setup(t,url=>db.handler(url));
  h.run("state.token='t';state.userId='u1';");
  await h.run('store.load()');
  db.update('project_entries','e3',{entry_date:'2026-11-09',amount:333});
  db.remove('project_entries','e7');
  db.insert('project_entries',{id:'e99',entry_date:'2026-10-15',created_at:'2026-10-20T00:00:00Z',amount:99});
  await h.run('store.load()');
  const quick=h.run('JSON.stringify(state.entries.map(e=>e.id))');
  await h.run('store.fullLoad()');
  const sortedFull=h.run("JSON.stringify([...state.entries].sort(compareByOrder('entry_date.desc,created_at.desc')).map(e=>e.id))");
  assert.equal(quick,sortedFull);
  assert.equal(JSON.parse(quick).length,30);
});

test('without the deletion log every reload stays a full download',async t=>{
  const db=fakeDatabase({withSyncLog:false});
  db.insert('parties',{id:'p1',name:'Bilal'});
  const h=setup(t,url=>db.handler(url));
  h.run("state.token='t';state.userId='u1';");
  await h.run('store.load()');
  assert.equal(h.run('store.sync'),null);
  db.remove('parties','p1');db.requests.length=0;
  await h.run('store.load()');
  assert.equal(h.run('state.parties.length'),0);
  assert.ok(db.requests.some(u=>u.includes('business_members')));
});

test('a failed quick refresh falls back to a full reload',async t=>{
  const db=fakeDatabase();
  db.insert('parties',{id:'p1',name:'Bilal'});
  let failNext=false;
  const h=setup(t,url=>{if(failNext&&url.includes('updated_at=gte')){failNext=false;return json({message:'boom'},500);}return db.handler(url);});
  h.run("state.token='t';state.userId='u1';console.warn=()=>{};");
  await h.run('store.load()');
  db.insert('parties',{id:'p2',name:'Asad'});failNext=true;
  await h.run('store.load()');
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(state.parties.map(p=>p.id).sort())')),['p1','p2']);
});

test('signing out clears the quick-refresh state',async t=>{
  const db=fakeDatabase();
  const h=setup(t,url=>db.handler(url));
  h.run("state.token='t';state.userId='u1';");
  await h.run('store.load()');
  assert.ok(h.run('store.sync'));
  h.run('logout(false)');
  assert.equal(h.run('store.sync'),null);
});
