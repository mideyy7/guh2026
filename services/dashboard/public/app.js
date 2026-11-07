'use strict';
/* HIVE mission studio — LIVE. Same design as mockup/, but every value comes from the running system:
   actor beliefs from each actor's store, positions and survivors from the simulator, links and
   deliveries from the chaos proxy (all via the read-only dashboard API, /api/snapshot).
   The only writes are scenario controls and outage settings. Nothing here allocates tasks or relays
   peer messages. */
const $ = (id) => document.getElementById(id);
const icons = {
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
 network:'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',
 layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
 chart:'<path d="M4 3v17h17M8 15v-4M13 15V7M18 15V4"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
 reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
 people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
 signal:'<path d="M3 10a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="20" r=".6"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7Z"/>',
 water:'<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0c0-5-7-13-7-13ZM8 15a4 4 0 0 0 4 4"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8Z"/>',
 locate:'<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
 plus:'<path d="M12 4v16M4 12h16"/>'
};
function renderIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon]||icons.help}</svg>`;});}

// ── Mission state (same shape the rest of the studio renders from) ──────────
let actors=[],tasks=[],links={},knowledge={},tick=0,elapsed=0,rescued=0,score=0,paused=true,selectedTask=null,phase='connected',recoveryStart=null,duplicates=0,eventCounter=0,events=[],view,mapMode='schematic',zoom=1,missionMap=null,toastTimer;
const pairs=[];            // every actor pair, filled from the live actor list
const linkPairs={};        // link key → [a, b] (actor ids contain '-', so keys can't be split back)
const key=(a,b)=>[a,b].sort().join('-');
const LIVE={config:null,logSince:0,evSince:0,prevViews:{},prevLinks:null,partitioned:false,seed:null,totalPeople:0,bench:null,metrics:null,online:false,syncing:false,injectTurn:0,lastSync:0,convergence:null,errors:{}};
const SVG_W=1000,SVG_H=610;

function shortId(id){return (id.startsWith('drone')?'D':'T')+id.split('-')[1];}
function displayName(id){return (id.startsWith('drone')?'Drone ':'Rescue ')+String(id.split('-')[1]).padStart(2,'0');}
function cellXY(c){const [x,y]=typeof c==='string'?c.split('-').map(Number):[c.x,c.y];return [x,y];}
function toSvg(c){const g=LIVE.config?.grid||8,[x,y]=cellXY(c);return [(x+.5)/g*SVG_W,(y+.5)/g*SVG_H];}
function districtOfCell(c){const [x,y]=cellXY(c);return LIVE.config?.districts.find(d=>x>=d.x[0]&&x<=d.x[1]&&y>=d.y[0]&&y<=d.y[1])?.name||'';}
function missionTotal(){return LIVE.totalPeople;}

// Diagram layout for N actors: drones along the top, each team under the drones of its demo island,
// so the BLACKOUT islands draw as separate boxes.
function actorLayout(width,yTop,yBottom,pad=60){
 const ids=actors.map(a=>a.id),drones=ids.filter(i=>i.startsWith('drone')),teams=ids.filter(i=>i.startsWith('team'));
 const pos={},step=drones.length>1?(width-2*pad)/(drones.length-1):0;
 drones.forEach((id,i)=>pos[id]=[drones.length>1?pad+i*step:width/2,yTop]);
 const islands=LIVE.config?.islands?.['blackout-3']||[];
 teams.forEach((id,i)=>{const isl=islands.find(g=>g.includes(id))||[];const ds=isl.filter(d=>pos[d]);pos[id]=[ds.length?ds.reduce((s,d)=>s+pos[d][0],0)/ds.length:pad+i*((width-2*pad)/Math.max(1,teams.length-1)),yBottom];});
 return pos;
}

function actor(id){return actors.find(a=>a.id===id);}
function nameOf(id){return actor(id)?.name||(id?displayName(id):'Unassigned');}
function addEvent(who,text){events.unshift({actor:who,text,tick});events=events.slice(0,60);}
function traceWorkflow(actorId,workflow,record={}){window.HiveSwarmTelemetry?.emit({actorId,workflow,tick,source:'live',...record});}

function components(){const groups=[];const seen=new Set();for(const a of actors){if(seen.has(a.id))continue;let group=[],queue=[a.id];seen.add(a.id);while(queue.length){const id=queue.shift();group.push(id);for(const other of actors){if(!seen.has(other.id)&&links[key(id,other.id)]){seen.add(other.id);queue.push(other.id);}}}groups.push(group);}return groups;}
function connectedCount(){return Object.values(links).filter(Boolean).length;}
function knownTogether(){return tasks.every(t=>actors.every(a=>knowledge[a.id]?.has(t.id)));}
function groupLabel(id){const groups=components();if(groups.length===1)return 'Connected';const g=groups.find(g=>g.includes(id));return g.length===1?'Isolated':`Island ${String.fromCharCode(65+groups.indexOf(g))}`;}
function timeLabel(value){const secs=Math.round((value||0)*((LIVE.config?.tick_ms||2000)/1000));return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}

// ── Live API ────────────────────────────────────────────────────────────────
async function api(method,path,body){
 try{const r=await fetch(path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok){toast(`Could not ${path.split('/').pop()}: ${j.error||r.status}`);return null;}return j;}
 catch(e){toast('Dashboard server unreachable.');return null;}
}
function liveOnly(){if(window.HiveStudio?.replaying){toast('Return to live before changing the mission.');return false;}return true;}
function blackout(){if(!liveOnly())return;const anyCut=connectedCount()<pairs.length;api('POST','/api/proxy/preset',{name:anyCut?'all-up':'blackout-3'}).then(r=>{if(!r)return;toast(anyCut?'Links restored. Local memories are now reconciling.':'Three islands. Each still has a drone and a rescue team.');sync();});}
function restoreAll(){if(!liveOnly())return;api('POST','/api/proxy/preset',{name:'all-up'}).then(r=>{if(r){toast('All peer links restored.');sync();}});}
function toggleLink(link){if(!liveOnly())return;const ab=linkPairs[link];if(!ab)return;api('POST','/api/proxy/toggle',{a:ab[0],b:ab[1]}).then(r=>{if(r)sync();});}
const INJECT_TEXTS=['water coming in fast, 2 of us upstairs','stuck on roof w/ 2 kids, water rising','elderly neighbour trapped, ground floor flooded','we r 3 ppl in an attic, phone dying'];
function injectIncident(){
 if(!liveOnly())return;
 // A new person in distress appears next to a drone, so a drone can actually hear the text.
 const drones=actors.filter(a=>a.type==='drone');if(!drones.length)return;
 const d=drones[LIVE.injectTurn++%drones.length],g=LIVE.config.grid,[x,y]=cellXY(d.cell);
 const cell=`${Math.min(g-1,Math.max(0,x+(x<g/2?1:-1)))}-${Math.min(g-1,Math.max(0,y+(y<g/2?1:-1)))}`;
 const text=INJECT_TEXTS[LIVE.injectTurn%INJECT_TEXTS.length];
 api('POST','/api/sim/control/inject',{cell,people:2+LIVE.injectTurn%3,urgency:4,text}).then(r=>{if(r){selectedTask=`T-${r.survivor_id}`;toast(`New distress text from ${r.district}. It sends only when a drone is in range.`);sync();}});
}
function setRunning(run){if(!liveOnly())return;api('POST',run?'/api/sim/control/start':'/api/sim/control/pause').then(r=>{if(r)sync();});}
function resetMission(){api('POST','/api/reset',{seed:LIVE.seed||1}).then(r=>{if(!r)return;clearLocal();api('POST','/api/sim/control/start').then(()=>{toast('Mission reset. Same scenario seed, all links up.');sync();});});}
function clearLocal(){events=[];LIVE.prevViews={};LIVE.prevLinks=null;LIVE.partitioned=false;LIVE.logSince=0;LIVE.evSince=0;tick=0;window.HiveStudio?.reset();window.HiveSwarmTelemetry?.reset();window.HiveSwarm?.reset();missionMap?.reset();}

// ── Snapshot → mission state ────────────────────────────────────────────────
function actionText(reachable,v,w){
 if(!reachable)return 'Store unreachable';
 if(!v)return w.target?`Moving to ${districtOfCell(w.target)}`:'Waiting · n8n workflows not running yet';
 const t=v.target?districtOfCell(v.target):'';
 return ({searching:`Searching ${t||'its sector'}`,travelling:`En route to ${v.bundle?.[0]||t}`,rescuing:`Rescuing ${v.bundle?.[0]||''}`,idle:'Holding position'})[v.action]||String(v.action||'');
}
function ingest(s){
 const C=LIVE.config,w=s.world;
 LIVE.online=!!w;LIVE.errors=s.errors||{};LIVE.convergence=s.convergence;
 if(!w)return;
 if(LIVE.seed!==null&&(w.seed!==LIVE.seed||w.tick<tick-1))clearLocal(); // scenario was reset elsewhere
 LIVE.seed=w.seed;tick=w.tick;elapsed=w.tick;paused=!w.running;LIVE.metrics=s.metrics;
 const obs=Object.fromEntries(s.actors.map(a=>[a.actor_id,a]));
 // Actors: positions from the simulator, beliefs from each actor's own store.
 const perCell={};
 actors=C.actors.map(id=>{
  const wa=w.actors.find(a=>a.id===id),o=obs[id]||{},v=o.view||null,type=id.startsWith('drone')?'drone':'team';
  const cell=`${wa.pos.x}-${wa.pos.y}`,i=(perCell[cell]=(perCell[cell]||0)+1)-1;
  let [x,y]=toSvg(cell);x+=((i%3)-1)*26;y+=(Math.floor(i/3)-0.5)*24;
  const target=wa.target?toSvg(wa.target):[x,y];
  return {id,name:displayName(id),short:shortId(id),role:type==='drone'?'Search & detection':'Rescue team',type,x,y,home:[x,y],target,cell,color:type==='drone'?'#284c3f':'#ecaf56',action:actionText(o.reachable!==false,v,wa),view:v,stale:!!o.stale,reachable:o.reachable!==false,conflicts:o.conflicts};
 });
 // Peer links between every pair of actors, from the proxy.
 if(!pairs.length)for(let i=0;i<C.actors.length;i++)for(let j=i+1;j<C.actors.length;j++){const p=[C.actors[i],C.actors[j]];pairs.push(p);linkPairs[key(...p)]=p;}
 const allowed=s.links?.allowed||{};
 links=Object.fromEntries(pairs.map(([a,b])=>[key(a,b),!!(allowed[a]?.[b]&&allowed[b]?.[a])]));
 // Local knowledge: the tasks each actor's own store says it knows.
 knowledge=Object.fromEntries(actors.map(a=>[a.id,new Set(a.view?.known??Object.keys(a.view?.owners||{}))]));
 // Incidents: survivors that have appeared (observer ground truth), with what the swarm believes.
 const texts=Object.fromEntries((w.distress||[]).map(m=>[m.survivor_id,m]));
 const cellCount={};
 tasks=w.survivors.filter(sv=>sv.state!=='not_yet').map(sv=>{
  const id=`T-${sv.id}`,i=(cellCount[sv.cell]=(cellCount[sv.cell]||0)+1)-1;
  let [x,y]=toSvg(sv.cell);x+=((i%3)-1)*30;y+=-18+Math.floor(i/3)*26;
  const knowers=actors.filter(a=>knowledge[a.id].has(id)).map(a=>a.id);
  const votes={};for(const a of actors){const o=a.view?.owners?.[id];if(o)votes[o]=(votes[o]||0)+1;}
  const owner=sv.state==='rescued'?sv.rescued_by:Object.entries(votes).sort((p,q)=>q[1]-p[1])[0]?.[0]||null;
  const m=texts[sv.id];
  return {id,survivorId:sv.id,title:m?'Distress call':'Stranded survivors',x,y,people:sv.people,urgency:sv.urgency,detector:knowers.find(k=>k.startsWith('drone'))||knowers[0]||null,owner,
   quote:m?`“${m.text}”`:'No message sent. Only a drone’s sensor can find them.',textState:m?.state||null,
   status:sv.state==='rescued'?'Rescued':owner?'Travelling':knowers.length?'Detected':'Unreported',location:`${sv.district} · cell ${sv.cell}`,age:tick-sv.appear_tick};
 });
 if(!tasks.some(t=>t.id===selectedTask))selectedTask=(tasks.find(t=>t.status!=='Rescued')||tasks[0])?.id||null;
 rescued=w.survivors.filter(sv=>sv.state==='rescued').reduce((n,sv)=>n+sv.people,0);
 LIVE.totalPeople=w.survivors.filter(sv=>sv.state!=='not_yet').reduce((n,sv)=>n+sv.people,0);
 score=s.metrics?Math.round(s.metrics.score*10)/10:0;duplicates=s.metrics?.duplicate_attempts||0;
 // Phase: partitioned → recovering (links back, views still differ) → connected (views agree).
 const groups=components(),haveViews=actors.some(a=>a.view?.digest);
 if(groups.length>1){phase='partitioned';LIVE.partitioned=true;recoveryStart=null;}
 else if(LIVE.partitioned&&haveViews&&!s.convergence?.converged){if(phase!=='recovering'){phase='recovering';recoveryStart=tick;addEvent('Swarm','links restored · exchanging missing observations');}}
 else{if(LIVE.partitioned&&phase==='recovering'){addEvent('Swarm','shared task views agree · local histories stay distinct');toast('Shared task knowledge agrees across the swarm.');}phase='connected';LIVE.partitioned=false;}
 ingestRecords(s);
}
function ingestRecords(s){
 // Link changes (from whoever changed them: these buttons, the demo script, a judge).
 if(LIVE.prevLinks){const changed=pairs.filter(([a,b])=>LIVE.prevLinks[key(a,b)]!==links[key(a,b)]);
  if(changed.length){const cut=changed.filter(([a,b])=>!links[key(a,b)]).length,n=components().length;addEvent('Chaos proxy',changed.length>2?`${cut} links cut · ${changed.length-cut} restored · ${n} group${n>1?'s':''}`:changed.map(([a,b])=>`${shortId(a)}↔${shortId(b)} ${links[key(a,b)]?'restored':'cut'}`).join(' · '));
   for(const a of actors){const avail=actors.filter(b=>b.id!==a.id&&links[key(a.id,b.id)]).map(b=>b.id);traceWorkflow(a.id,'Gossip',{type:'link-change',status:avail.length<actors.length-1?'blocked':'queued',trigger:'Chaos proxy link change',summary:avail.length<actors.length-1?`${actors.length-1-avail.length} peer route(s) unavailable; ${avail.length} reachable.`:'All peer routes available.',details:{reachablePeers:avail}});}}}
 LIVE.prevLinks={...links};
 // Proxy delivery records → Gossip (sender) / Merge (receiver).
 let refused=0;
 for(const e of s.log||[]){LIVE.logSince=Math.max(LIVE.logSince,e.n);if(e.rpc)continue;
  if(e.status==='delivered'){traceWorkflow(e.from,'Gossip',{type:'delivery',peerId:e.to,status:'observed',trigger:'Proxy delivery record',summary:`Delivered ${e.bytes} bytes to ${nameOf(e.to)}.`,details:{bytes:e.bytes,proxyEntry:e.n}});traceWorkflow(e.to,'Merge',{type:'received',peerId:e.from,trigger:'Incoming gossip',summary:`Received gossip from ${nameOf(e.from)}.`,details:{bytes:e.bytes}});}
  else if(e.status==='refused'||e.status==='dropped'){refused++;traceWorkflow(e.from,'Gossip',{type:'delivery',peerId:e.to,status:'blocked',trigger:'Proxy delivery record',summary:`${e.status==='refused'?'Refused: link to':'Dropped on the way to'} ${nameOf(e.to)}.`,details:{status:e.status,reason:e.reason||null}});}}
 if(refused)addEvent('Chaos proxy',`${refused} message${refused>1?'s':''} blocked by cut links`);
 // Simulator events → Interpret / Act.
 for(const e of s.events||[]){LIVE.evSince=Math.max(LIVE.evSince,e.n);const t=e.tick;
  if(e.kind==='distress_delivered'){addEvent(nameOf(e.to),`received a distress text: “${e.text}”`);traceWorkflow(e.to,'Interpret',{tick:t,type:'discovery',trigger:'Distress text received',summary:`Text received: “${e.text}”`,details:{msg_id:e.msg_id}});}
  else if(e.kind==='distress_injected')addEvent('Distress',`new text from ${e.district}: “${e.text}” · sending until a drone is in range`);
  else if(e.kind==='distress_retry')addEvent('Distress',`delivery to ${nameOf(e.to)} failed · still sending`);
  else if(e.kind==='rescue_attempt'){const sv=tasks.find(x=>x.survivorId===e.survivor_id);addEvent(nameOf(e.actor),e.result==='rescued'?`rescued ${sv?.people??''} people · T-${e.survivor_id}`:`arrived at T-${e.survivor_id}: ${e.result.replace('_',' ')}`);traceWorkflow(e.actor,'Act',{tick:t,type:'rescue',taskId:`T-${e.survivor_id}`,status:e.result==='rescued'?'observed':'blocked',trigger:'Simulator rescue receipt',summary:e.result==='rescued'?'Simulator recorded a unique rescue.':`Rescue attempt: ${e.result.replace('_',' ')}.`,details:{result:e.result}});}
  else if(e.kind==='horizon_reached')addEvent('Simulator','mission horizon reached · run complete');}
 // Actor beliefs that changed since the last snapshot → Perceive / Merge / Bid records.
 for(const a of actors){const v=a.view,p=LIVE.prevViews[a.id];if(!v){LIVE.prevViews[a.id]=v;continue;}
  const before=new Set(p?.known??Object.keys(p?.owners||{}));
  for(const id of knowledge[a.id])if(!before.has(id))traceWorkflow(a.id,a.type==='drone'?'Perceive':'Merge',{type:a.type==='drone'?'discovery':'received',taskId:id,trigger:'Actor store changed',summary:`${a.name} now knows ${id}.`});
  for(const [id,o] of Object.entries(v.owners||{}))if(o&&p?.owners?.[id]!==o){traceWorkflow(a.id,'Bid',{type:'allocation',taskId:id,trigger:'Actor store changed',summary:`${a.name} believes ${nameOf(o)} owns ${id}.`,details:{owner:o,bid:v.bids?.[id]??null}});if(o===a.id)addEvent(a.name,`won the bid for ${id}`);}
  if(p&&p.action!==v.action)addEvent(a.name,a.action.charAt(0).toLowerCase()+a.action.slice(1));
  LIVE.prevViews[a.id]=v;}
}
async function sync(){
 if(window.HiveStudio?.replaying)return;
 // A click during an in-flight snapshot must not be lost: queue one fresh snapshot right after it.
 if(LIVE.syncing){LIVE.resync=true;return;}LIVE.syncing=true;
 try{const r=await fetch(`/api/snapshot?log_since=${LIVE.logSince}&events_since=${LIVE.evSince}`,{cache:'no-store',signal:AbortSignal.timeout(4000)});ingest(await r.json());LIVE.lastSync=Date.now();render();}
 catch(e){LIVE.online=false;$('map-status').textContent=e.name==='TimeoutError'?'Dashboard slow to answer · retrying':'Dashboard server unreachable';}
 finally{LIVE.syncing=false;if(LIVE.resync){LIVE.resync=false;setTimeout(sync,0);}}
}

// ── Rendering (mockup design, generalised to every live actor) ─────────────
function render(){renderMetrics();renderMap();renderNetwork();renderIncident();renderActors();renderFeed();renderBeliefs();if(view==='network')renderTopology();if(missionMap)missionMap.update({actors,tasks,links,pairs,paused,tick,selectedTask});$('sim-time').textContent=timeLabel(tick);renderIcons();window.HiveStudio?.render();window.HiveSwarm?.update(window.HiveStudio?.capture());}
function renderMetrics(){const count=connectedCount(),groups=components(),total=missionTotal();$('rescued-value').textContent=rescued;$('rescued-total').textContent=`/ ${total}`;$('score-value').textContent=score;$('rescue-progress').style.width=`${total?Math.min(100,rescued/total*100):0}%`;$('rescue-percent').textContent=`${total?Math.round(rescued/total*100):0}% of ${total} people found so far`;$('rescued-badge').textContent=`${LIVE.metrics?.rescued??0} rescues`;$('link-value').textContent=pairs.length?Math.round(count/pairs.length*100):0;$('connection-tag').textContent=phase==='recovering'?'Reconciling':groups.length>1?`${groups.length} islands`:'Connected';$('connection-tag').classList.toggle('warning',phase!=='connected');$('link-caption').textContent=`${count} of ${pairs.length} bidirectional peer links available`;}
function islandBoxes(pos,pad,labelDy){const groups=components();if(groups.length<2)return'';return groups.map((g,i)=>{const pts=g.map(id=>pos(id)).filter(Boolean);if(!pts.length)return'';const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const x0=Math.min(...xs)-pad,y0=Math.min(...ys)-pad,w=Math.max(...xs)-Math.min(...xs)+2*pad,h=Math.max(...ys)-Math.min(...ys)+2*pad;const warm=i%2===0;return`<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${Math.min(90,pad*1.4)}" fill="${warm?'#e2b769':'#729ab6'}" fill-opacity=".05" stroke="${warm?'#b99b65':'#8aadb3'}" stroke-dasharray="6 9"/><text x="${x0+18}" y="${y0+labelDy}" fill="${warm?'#9c8455':'#7396a2'}" font-size="11" letter-spacing="2">${g.length===1?'ISOLATED':'ISLAND '+String.fromCharCode(65+i)}</text>`;}).join('');}
function renderMap(){
 const groups=components();$('map-status').textContent=!LIVE.online?'Simulator offline':groups.length>1?`${groups.length} disconnected groups`:phase==='recovering'?'Reconciling local views':'All actors connected';
 $('island-shapes').innerHTML=islandBoxes(id=>{const a=actor(id);return a&&[a.x,a.y];},70,24);
 $('route-layer').innerHTML=actors.filter(a=>a.type==='team'&&Math.hypot(a.target[0]-a.x,a.target[1]-a.y)>4).map(a=>`<path d="M${a.x},${a.y} L${a.target[0]},${a.target[1]}" stroke="#ecaf56" stroke-width="2" stroke-dasharray="4 5" fill="none" opacity=".65"/>`).join('');
 $('link-layer').innerHTML=pairs.map(([aId,bId],i)=>{const a=actor(aId),b=actor(bId);if(!a||!b)return'';const up=links[key(aId,bId)],pct=((tick+i*3)%10)/10;return`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="peer-link ${up?'':'cut'}"/>${up&&!paused?`<circle class="message-packet" cx="${a.x+(b.x-a.x)*pct}" cy="${a.y+(b.y-a.y)*pct}" r="3"/>`:''}`;}).join('');
 $('incident-layer').innerHTML=tasks.map(t=>{const done=t.status==='Rescued',fill=done?'#74ca7e':t.status==='Unreported'?'#c9a27a':'#ecaf56';return`<g class="svg-marker" data-task="${t.id}" tabindex="0" role="button" aria-label="Inspect ${escapeHTML(t.title)} ${t.id}" transform="translate(${t.x} ${t.y})"><circle r="22" fill="${fill}" opacity=".15"/><circle r="11" fill="${fill}" stroke="#ffffff" stroke-width="3"/><text text-anchor="middle" y="4" font-size="11" fill="white">${done?'✓':'!'}</text><rect x="-37" y="24" width="74" height="18" rx="4" fill="#ffffff" stroke="#d5d3d1"/><text class="incident-svg-label" text-anchor="middle" y="36">${t.id} · ${t.people}p</text></g>`;}).join('');
 $('actor-layer').innerHTML=actors.map(a=>`<g class="svg-marker" data-actor="${a.id}" tabindex="0" role="button" aria-label="Inspect ${a.name}" transform="translate(${a.x} ${a.y})">${a.type==='drone'?'<circle r="35" fill="#284c3f" opacity=".06"/><circle r="25" fill="none" stroke="#284c3f" stroke-opacity=".12"/>':''}<${a.type==='drone'?'circle r="16"':'rect x="-15" y="-15" width="30" height="30" rx="7"'} fill="${a.color}" stroke="#fafaf8" stroke-width="3" filter="url(#marker-shadow)"/><text y="6" text-anchor="middle" font-size="23" fill="#fffce9">${a.type==='drone'?'✳':'▣'}</text><rect x="-34" y="24" width="68" height="19" rx="4" fill="#ffffff" stroke="#d5d3d1"/><text text-anchor="middle" y="37" class="actor-svg-label">${a.name}</text></g>`).join('');
}
function renderNetwork(){
 const count=connectedCount(),groups=components(),anyCut=count<pairs.length;$('network-status-title').textContent=phase==='recovering'?'Reconnecting the swarm':groups.length>1?`${groups.length} independent islands`:'One connected swarm';$('network-status-description').textContent=phase==='recovering'?'Missing observations are propagating.':groups.length>1?'Local groups continue making decisions.':'Discoveries travel between all actors.';$('network-light').classList.toggle('warning',phase!=='connected');
 $('blackout-button').innerHTML=`<i data-icon="${anyCut?'signal':'bolt'}"></i>${anyCut?'Restore all connections':'Simulate network blackout'}`;$('blackout-button').classList.toggle('restoring',anyCut);$('network-helper').textContent=anyCut?'Restore peer delivery and reconcile separate memories.':'Splits the swarm into three islands. Each keeps a drone and a team.';
 const pos=actorLayout(270,18,47,24);$('mini-network').innerHTML=`<svg viewBox="0 0 270 65" aria-label="${actors.length} actor peer network">${pairs.map(([a,b])=>pos[a]&&pos[b]?`<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" stroke="${links[key(a,b)]?'#466559':'#ecaf56'}" stroke-width="1" ${links[key(a,b)]?'':'stroke-dasharray="3 4"'}/>`:'').join('')}${actors.map(a=>`<circle cx="${pos[a.id][0]}" cy="${pos[a.id][1]}" r="8" fill="${a.type==='drone'?'#f4fdf6':'#fefcef'}" stroke="${a.type==='drone'?'#adefbc':'#f6db7a'}"/><text x="${pos[a.id][0]}" y="${pos[a.id][1]+3}" font-size="6" fill="#5d5a57" text-anchor="middle">${a.short}</text>`).join('')}</svg>`;
}
function renderIncident(){
 const t=tasks.find(t=>t.id===selectedTask)||tasks[0];
 if(!t){$('incident-title').textContent='No incidents yet';$('incident-location').textContent='Waiting for the scenario';$('incident-people').textContent='–';$('distress-text').textContent='';$('task-id').textContent='–';$('incident-owner').textContent='–';$('rescue-timeline').innerHTML='';return;}
 $('incident-title').textContent=t.title;$('incident-location').textContent=t.location;$('incident-people').textContent=`${t.people} people · urgency ${t.urgency}`;$('distress-text').textContent=t.quote+(t.textState==='sending'?'  · still sending':'');$('task-id').textContent=t.id;$('incident-owner').textContent=t.owner?nameOf(t.owner):t.status==='Unreported'?'Unknown to the swarm':'Not allocated';
 const stage=t.status==='Rescued'?4:t.status==='Travelling'?3:t.status==='Detected'?1:0;
 $('rescue-timeline').innerHTML=['Detected','Shared','Allocated','Travelling','Rescued'].map((name,i)=>`<span class="timeline-stage ${t.status!=='Unreported'&&i<=stage?'done':''}"><b></b>${name}</span>`).join('');
 if(window.HiveStudio?.proof)window.HiveStudio.proof.renderRescue(window.HiveStudio.capture());
}
function renderActors(){$('actor-cards').innerHTML=actors.map(a=>`<button class="actor-card" data-actor="${a.id}" aria-label="Inspect ${a.name}"><div class="actor-top"><span class="actor-emblem ${a.type}">${a.type==='drone'?'✳':'▣'}</span><div><div class="actor-name">${a.name}</div><div class="actor-role">${a.role}</div></div></div><div class="actor-action">${escapeHTML(a.action)}</div><div class="actor-bottom"><span>${a.stale?'Stale state':`${knowledge[a.id]?.size||0} tasks known`}</span><span class="island-chip">${groupLabel(a.id)}</span></div></button>`).join('');const c=$('actors-count');if(c)c.textContent=`${actors.length} actors`;}
function renderFeed(){$('activity-feed').innerHTML=events.slice(0,8).map(e=>`<div class="activity-entry"><span class="event-dot"></span><span><strong>${escapeHTML(e.actor)}</strong> ${escapeHTML(e.text)}</span><time>${timeLabel(e.tick)}</time></div>`).join('')||'<div class="activity-entry"><span class="event-dot"></span><span>No events yet. Start the mission or try a blackout.</span></div>';}
function renderBeliefs(){
 const haveViews=actors.some(a=>a.view),agrees=LIVE.convergence?.converged;
 $('agreement-badge').textContent=!haveViews?'No actor state yet':agrees?'Task knowledge agrees':'Local knowledge differs';$('agreement-badge').classList.toggle('warning',haveViews&&!agrees);
 const rows=tasks.filter(t=>t.status!=='Unreported'||!haveViews).slice(0,40);
 $('belief-table').innerHTML=`<thead><tr><th>RESCUE TASK</th>${actors.map(a=>`<th>${a.name.toUpperCase()}<br>${groupLabel(a.id)}</th>`).join('')}</tr></thead><tbody>${rows.map(t=>`<tr><td>${t.id}<br><small>${escapeHTML(t.location)}</small></td>${actors.map(a=>{const known=knowledge[a.id]?.has(t.id),own=a.view?.owners?.[t.id];return`<td class="${known?'':'unknown'}">${known?`Known<br><small>Owner: ${own?nameOf(own):'none yet'}</small>`:'Not yet known'}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${actors.length+1}">No tasks known yet.</td></tr>`}</tbody>`;
}
function renderTopology(){if(window.HiveSwarm)return;}
function renderBenchmark(){
 const b=LIVE.bench,tag=$('bench-tag'),note=$('bench-note');
 const MODES=[['hive','#284c3f'],['central-strong','#ecaf56'],['central-naive','#b4b0ac']];
 if(!b){tag.textContent='NO RESULTS YET';$('bench-subtitle').textContent='Measured HIVE against both central baselines, once the benchmark has been run';note.textContent='Run node bench/matrix.mjs to measure HIVE against both central baselines. Nothing on this page is a fixture.';$('benchmark-chart').innerHTML='<p class="section-note">No benchmark results found.</p>';$('bench-cards').innerHTML='';return;}
 const stub=/STUB/.test(b.core);tag.textContent=stub?'STUB CORE · NOT HIVE RESULTS':`MEASURED · ${b.seeds.length} SEEDS`;
 $('bench-subtitle').textContent=`${b.seeds.length} seeds per setting (${b.seeds[0]}–${b.seeds.at(-1)}) · identical scenarios, scoring and outages in every mode`;
 note.textContent=stub?'These numbers come from a placeholder actor used to test the benchmark harness, not from HIVE. Rerun the matrix once the real core is built.':'Mean of measured runs. Error bars and every individual result are in bench/results/report.html.';
 const pct=[0,25,50,75,100],get=(m,p)=>b.summary.find(s=>s.mode===m&&s.topology==='percent'&&s.percent===p)?.score?.mean??null;
 const max=Math.max(1,...MODES.flatMap(([m])=>pct.map(p=>get(m,p)||0)));
 const x=i=>75+i*190,y=v=>265-v/max*100*2.1;
 $('benchmark-chart').innerHTML=`<svg viewBox="0 0 900 325" role="img" aria-label="Measured mission score against available peer links, by mode">${[0,25,50,75,100].map(v=>`<line x1="75" y1="${265-v*2.1}" x2="835" y2="${265-v*2.1}" stroke="#f3f3f1"/><text x="57" y="${265-v*2.1+4}" text-anchor="end" font-size="10" fill="#b4b0ac">${Math.round(v/100*max)}</text>`).join('')}${MODES.map(([m,c])=>{const pts=pct.map((p,i)=>[x(i),get(m,p)]).filter(q=>q[1]!==null);return`<polyline points="${pts.map(q=>`${q[0]},${y(q[1])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="3"/>${pts.map(q=>`<circle cx="${q[0]}" cy="${y(q[1])}" r="4" fill="white" stroke="${c}" stroke-width="2"><title>${m}: ${q[1]}</title></circle>`).join('')}`;}).join('')}${pct.map((v,i)=>`<text x="${x(i)}" y="289" text-anchor="middle" font-size="10" fill="#77716d">${v}%</text>`).join('')}<text x="455" y="316" text-anchor="middle" font-size="10" fill="#77716d">Available peer links</text><text x="14" y="170" transform="rotate(-90 14 170)" text-anchor="middle" font-size="10" fill="#77716d">Mission score (mean)</text></svg>`;
 const h=b.summary.find(s=>s.mode==='hive'&&s.topology==='blackout-3');
 $('bench-cards').innerHTML=h?`<article><span>Rescued during a blackout</span><strong>${h.rescued.mean} <small>survivors</small></strong><p>HIVE, balanced islands, mean of ${h.runs} seeds</p></article><article><span>Duplicate rescue attempts</span><strong>${h.duplicate_attempts.mean}</strong><p>Counted rather than hidden</p></article><article><span>Time to shared agreement</span><strong>${h.convergence_rounds.mean===null?'–':(h.convergence_rounds.mean*(LIVE.config.gossip_ms/1000)).toFixed(1)} <small>s</small></strong><p>${Math.round((h.converged_fraction||0)*100)}% of seeds agreed within 10 gossip rounds</p></article>`:'';
}
let insightsSection='beliefs';
function setInsightsSection(section){
 insightsSection=section;
 for(const name of ['beliefs','benchmark']){
  $(`${name}-view`).hidden=name!==section;
  const button=document.querySelector(`[data-insights-section="${name}"]`);
  button.setAttribute('aria-selected',String(name===section));button.tabIndex=name===section?0:-1;
 }
 if(section==='benchmark'){fetch('/api/bench').then(r=>r.ok?r.json():null).then(b=>{LIVE.bench=b;renderBenchmark();}).catch(()=>{LIVE.bench=null;renderBenchmark();});}
}
function setView(next){
 if(next==='beliefs'||next==='benchmark'){setInsightsSection(next);next='insights';}
 view=next;
 for(const id of ['operations','network','insights'])$(`${id}-view`).hidden=id!==next;
 document.querySelectorAll('.nav-item').forEach(button=>button.classList.toggle('active',button.dataset.view===next));
 const labels={operations:['Overview','Every second. Every connection.','A shared mission, coordinated independently. Watch the swarm work.'],network:['Swarm','Independent minds. Visible cooperation.','Follow peer exchanges and inspect each actor’s workflows.'],insights:['Insights','Understand what the swarm knows—and achieves.','Inspect local knowledge and compare response strategies.']};
 $('breadcrumb').textContent=labels[next][0];$('page-title').textContent=labels[next][1];$('page-description').textContent=labels[next][2];
 if(next==='network')renderTopology();if(next==='insights')setInsightsSection(insightsSection);
 if(next==='operations'&&missionMap)setTimeout(()=>missionMap.resize(),50);
 window.HiveSwarm?.update(window.HiveStudio?.capture());renderIcons();
}

function editorUrl(id){return `http://${id}.localhost:${(LIVE.config?.n8n_host_base||5671)+(LIVE.config?.actors.indexOf(id)??0)}/`;}
function openDetail(id,type){
 if(type==='task'){selectedTask=id;renderIncident();const t=tasks.find(t=>t.id===id);if(!t)return;
  $('dialog-title').textContent=`${t.id} · Who owns this rescue?`;
  const rows=actors.map(a=>{const known=knowledge[a.id]?.has(t.id),own=a.view?.owners?.[t.id],bid=a.view?.bids?.[t.id];return`<div class="decision-row"><div><strong>${a.name} · ${groupLabel(a.id)}</strong><small>${!a.view?'No state yet (workflows not running)':known?`Believes the owner is ${own?nameOf(own):'nobody yet'}`:'Has not learned about this task'}</small></div><b>${bid!=null?bid:'–'}</b></div>`;}).join('');
  $('dialog-content').innerHTML=`<p>${escapeHTML(t.title)} · ${t.people} people · urgency ${t.urgency} · ${escapeHTML(t.location)}. Each row is that actor’s own belief, read from its store. The number is its recorded winning bid, when it publishes one.</p>${rows}<p><strong>Decision rule:</strong> CBBA. Higher bid wins, actor ID breaks ties, and fresher information wins conflicts. Actors in different islands can disagree until links return.</p><p><strong>Ground truth:</strong> ${t.status==='Rescued'?`rescued by ${nameOf(t.owner)}`:t.status==='Unreported'?'no actor knows about these people yet':t.status.toLowerCase()}. The observer can see this; no actor can.</p>`;
 }else{const a=actor(id);if(!a)return;$('dialog-title').textContent=a.name;
  $('dialog-content').innerHTML=`<p>${a.role} · ${groupLabel(id)} · its own n8n instance and its own store</p><div class="decision-row"><div><strong>${escapeHTML(a.action)}</strong><small>Tick ${tick} · ${a.stale?'state is stale (store not answering)':'state read from its store just now'}</small></div><b>${knowledge[id]?.size||0}</b></div><p><strong>Known tasks:</strong> ${[...(knowledge[id]||[])].join(', ')||'none yet'}.</p><p><strong>Reachable peers:</strong> ${actors.filter(o=>o.id!==id&&links[key(id,o.id)]).map(o=>o.name).join(', ')||'none. This actor can only use its own sensing and memory.'}</p><p><strong>Shared-state digest:</strong> <code>${a.view?.digest||'–'}</code>${LIVE.convergence?.diverged?.includes(id)&&a.view?' · differs from the majority':''}. Store write conflicts: ${a.conflicts??'–'}.</p><p><a href="${editorUrl(id)}" target="_blank" rel="noopener">Open ${a.name}’s n8n editor ↗</a></p>`;}
 $('detail-dialog').showModal();
}
function mapDisplay(mode){
 mapMode=mode;
 if(mode==='street'&&!missionMap){
   missionMap=new HiveMap({onActor:id=>openDetail(id,'actor'),onTask:id=>{selectedTask=id;renderIncident();missionMap.selectTask(id);},onFallback:()=>mapDisplay('schematic')});
   missionMap.init();
 }
 $('map-shell').classList.toggle('street-mode',mode==='street');
 $('schematic-button').classList.toggle('selected',mode==='schematic');$('street-button').classList.toggle('selected',mode==='street');
 $('schematic-button').setAttribute('aria-pressed',String(mode==='schematic'));$('street-button').setAttribute('aria-pressed',String(mode==='street'));
 $('map-mode-label').textContent=mode==='street'?'MANCHESTER · LIVE OPERATIONS':'SCHEMATIC GRID';
 document.querySelectorAll('.map-perspective button, #follow-actor').forEach(el=>el.disabled=mode==='schematic');
 if(missionMap){missionMap.setActive(mode==='street');missionMap.resize();missionMap.update({actors,tasks,links,pairs,paused,tick,selectedTask});}
}
document.addEventListener('click',e=>{const task=e.target.closest('[data-task]'),act=e.target.closest('[data-actor]'),nav=e.target.closest('[data-view]'),link=e.target.closest('[data-link]');if(task)openDetail(task.dataset.task,'task');else if(act)openDetail(act.dataset.actor,'actor');else if(nav)setView(nav.dataset.view);else if(link)toggleLink(link.dataset.link);});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('g[role="button"],line[role="button"]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
$('blackout-button').onclick=blackout;$('reset-button').onclick=resetMission;$('inject-button').onclick=injectIncident;$('restore-all').onclick=restoreAll;$('inspect-button').onclick=()=>openDetail(selectedTask,'task');$('close-dialog').onclick=()=>$('detail-dialog').close();$('detail-dialog').addEventListener('click',e=>{if(e.target===$('detail-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('help-button').onclick=()=>{$('dialog-title').textContent='A live view of the running swarm';$('dialog-content').innerHTML='<p>Everything here comes from the running system: each actor’s beliefs from its own store, positions and survivors from the simulator, links and deliveries from the chaos proxy. The survivors and the flooding are simulated; the streets and buildings are real.</p><p><strong>Try it:</strong> simulate a blackout, add a discovery, then restore links and watch the actors’ separate memories reconcile. Click actors and incidents to see each actor’s own belief.</p><p>This page only observes. It can change outage settings and scenario controls, but it never assigns rescues or carries messages between actors.</p>';$('detail-dialog').showModal();};
$('schematic-button').onclick=()=>mapDisplay('schematic');$('street-button').onclick=()=>mapDisplay('street');
$('zoom-in').onclick=()=>{if(mapMode==='street')missionMap.zoomBy(1);else{zoom=Math.min(2.3,zoom+.2);$('simulation-map').style.transform=`scale(${zoom})`;}};
$('zoom-out').onclick=()=>{if(mapMode==='street')missionMap.zoomBy(-1);else{zoom=Math.max(.7,zoom-.2);$('simulation-map').style.transform=`scale(${zoom})`;}};
$('recenter').onclick=()=>{if(mapMode==='street')missionMap.fit();else{zoom=1;$('simulation-map').style.transform='scale(1)';}};
$('perspective-2d').onclick=()=>missionMap?.perspective(false);$('perspective-3d').onclick=()=>missionMap?.perspective(true);
$('follow-actor').onchange=e=>missionMap?.follow(e.target.value);
$('layers-button').onclick=()=>{const menu=$('map-layer-menu');menu.hidden=!menu.hidden;$('layers-button').setAttribute('aria-expanded',String(!menu.hidden));};
document.querySelectorAll('[data-map-layer]').forEach(el=>el.onchange=()=>{const name=el.dataset.mapLayer;missionMap?.layer(name,el.checked);const ids={actors:['actor-layer'],incidents:['incident-layer'],flood:['flood-layer'],routes:['route-layer'],communication:['link-layer']};for(const id of ids[name]||[])$(id).style.display=el.checked?'':'none';});
$('link-layer').style.display='none';
$('fullscreen-map').onclick=()=>{const panel=document.querySelector('.map-panel');panel.classList.toggle('map-expanded');document.body.classList.toggle('map-is-expanded',panel.classList.contains('map-expanded'));$('fullscreen-map').setAttribute('aria-label',panel.classList.contains('map-expanded')?'Collapse map':'Expand map');setTimeout(()=>{missionMap?.resize();if(mapMode==='street')missionMap?.fit(0);},60);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelector('.map-panel').classList.remove('map-expanded');document.body.classList.remove('map-is-expanded');$('map-layer-menu').hidden=true;$('layers-button').setAttribute('aria-expanded','false');setTimeout(()=>{missionMap?.resize();if(mapMode==='street')missionMap?.fit(0);},60);}});
document.querySelectorAll('[data-insights-section]').forEach(button=>button.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=button.dataset.insightsSection==='beliefs'?'benchmark':'beliefs';setView(next);document.querySelector(`[data-insights-section="${next}"]`).focus();}}));
function clock(){$('clock').textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/London'}).format(new Date())+' GMT';}

// ── Boot: load config, place the grid on the real map, then follow the live system ──
async function boot(){
 clock();setInterval(clock,1000);
 try{LIVE.config=await (await fetch('/api/config')).json();}catch{toast('Dashboard server unreachable.');return;}
 const G=LIVE.config.geo;
 // The 1000×610 drawing space spans the real geographic box the grid is laid over.
 HiveMap.coordinate=(x,y)=>[G.west+x/SVG_W*(G.east-G.west),G.north-y/SVG_H*(G.north-G.south)];
 $('follow-actor').innerHTML='<option value="">None</option>'+LIVE.config.actors.map(id=>`<option value="${id}">${displayName(id)}</option>`).join('');
 for(const id of LIVE.config.actors)window.HiveSwarmTelemetry?.setActorLinks(id,{editorUrl:editorUrl(id)});
 // Schematic labels from the real districts.
 const g=LIVE.config.grid;document.querySelector('.district-labels').innerHTML=LIVE.config.districts.map(d=>`<text x="${(d.x[0]/g)*SVG_W+14}" y="${(d.y[0]/g)*SVG_H+26}">${d.name.toUpperCase()}</text>`).join('');
 await sync();
 // The analyst's opening briefing was written before live data existed: write it again from the first snapshot.
 if(window.HiveStudio){$('analyst-conversation').innerHTML='';HiveStudio.messages=[];HiveStudio.ask('Give me a mission briefing.',true);}
 setView('operations');mapDisplay('street');
 setInterval(sync,1000);
}
boot();
