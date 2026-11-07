'use strict';
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
const baseActors=[
 {id:'D1',name:'Drone 01',role:'Search & detection',type:'drone',x:230,y:190,home:[230,190],target:[360,180],battery:84,action:'Scanning sector B3',color:'#284c3f'},
 {id:'D2',name:'Drone 02',role:'Search & detection',type:'drone',x:740,y:220,home:[740,220],target:[810,320],battery:76,action:'Surveying sector F3',color:'#284c3f'},
 {id:'T1',name:'Rescue 01',role:'Rescue team',type:'team',x:350,y:410,home:[350,410],target:[375,275],battery:92,action:'En route to RSC-012',color:'#ecaf56'},
 {id:'T2',name:'Rescue 02',role:'Rescue team',type:'team',x:730,y:450,home:[730,450],target:[800,365],battery:88,action:'En route to RSC-014',color:'#ecaf56'}
];
let actors,tasks,links,knowledge,tick,elapsed,rescued,score,paused,selectedTask,phase,recoveryStart,duplicates,eventCounter,events,view,mapMode='schematic',zoom=1,missionMap=null,toastTimer;
const pairs=[['D1','D2'],['D1','T1'],['D1','T2'],['D2','T1'],['D2','T2'],['T1','T2']];
const key=(a,b)=>[a,b].sort().join('-');
function makeTask(id,title,x,y,people,detector,owner,quote){return{id,title,x,y,people,detector,owner,quote,status:'Travelling',location:x<500?'Greengate · Sector C4':'Ancoats · Sector F5',age:0};}
function reset(){
 window.HiveStudio?.reset();
 window.HiveSwarmTelemetry?.reset();window.HiveSwarmTelemetry?.seed();window.HiveSwarm?.reset();
 actors=baseActors.map(a=>({...a,home:[...a.home],target:[...a.target]}));
 tasks=[makeTask('RSC-012','Family on rooftop',375,275,3,'D1','T1','“stuck on roof w/ 2 kids near the Irwell, water rising, please”'),makeTask('RSC-014','Residents awaiting evacuation',800,365,2,'D2','T2','“two of us upstairs, ground floor flooded”')];
 links=Object.fromEntries(pairs.map(([a,b])=>[key(a,b),true]));knowledge=Object.fromEntries(actors.map(a=>[a.id,new Set(tasks.map(t=>t.id))]));
 tick=260;elapsed=0;rescued=12;score=840;paused=false;selectedTask='RSC-012';phase='connected';recoveryStart=null;duplicates=0;eventCounter=14;
 events=[{actor:'Rescue 01',text:'won local bid for RSC-012 · score 8.4',tick:259},{actor:'Drone 01',text:'shared rooftop detection with 3 peers',tick:257},{actor:'Drone 02',text:'discovered 2 residents in sector F5',tick:254}];
 missionMap?.reset();zoom=1;$('simulation-map').style.transform='scale(1)';document.body.classList.remove('paused');render();setView('operations');
}
function actor(id){return actors.find(a=>a.id===id);}
function addEvent(who,text){events.unshift({actor:who,text,tick});events=events.slice(0,60);}
function traceWorkflow(actorId,workflow,record={}){window.HiveSwarmTelemetry?.emit({actorId,workflow,tick,...record});}
function tracePeerLinks(){for(const a of actors){const available=actors.filter(b=>b.id!==a.id&&links[key(a.id,b.id)]).map(b=>b.id);traceWorkflow(a.id,'Gossip',{type:'link-change',status:available.length<3?'blocked':'queued',trigger:'Demo link control',summary:available.length<3?`${3-available.length} peer route(s) unavailable; ${available.length} remain reachable.`:'All peer routes restored; next demo tick can deliver missing tasks.',details:{reachablePeers:available,unavailablePeers:actors.filter(b=>b.id!==a.id&&!available.includes(b.id)).map(b=>b.id)}});}}

function components(){const groups=[];const seen=new Set();for(const a of actors){if(seen.has(a.id))continue;let group=[],queue=[a.id];seen.add(a.id);while(queue.length){const id=queue.shift();group.push(id);for(const other of actors){if(!seen.has(other.id)&&links[key(id,other.id)]){seen.add(other.id);queue.push(other.id);}}}groups.push(group);}return groups;}
function connectedCount(){return Object.values(links).filter(Boolean).length;}
function knownTogether(){return tasks.every(t=>actors.every(a=>knowledge[a.id].has(t.id)));}
function groupLabel(id){const groups=components();return groups.length>1?`Island ${String.fromCharCode(65+groups.findIndex(g=>g.includes(id)))}`:'Connected';}
function timeLabel(value){return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4200);}
function startRecovery(){if(components().length===1){phase='recovering';recoveryStart=tick;addEvent('Swarm','links restored · exchanging missing observations');}else phase='partitioned';}
function blackout(){if(connectedCount()<6){pairs.forEach(([a,b])=>links[key(a,b)]=true);startRecovery();toast('Links restored. Local memories are now reconciling.');}else{pairs.forEach(([a,b])=>links[key(a,b)]=(['D1','T1'].includes(a)&&['D1','T1'].includes(b))||(['D2','T2'].includes(a)&&['D2','T2'].includes(b)));phase='partitioned';recoveryStart=null;addEvent('Chaos proxy','4 cross-group links cut · 2 local islands remain');toast('Two islands. Each group can still search and rescue locally.');}tracePeerLinks();render();}
function injectIncident(){
 if(tasks.length>=10){toast('Demo incident limit reached. Reset to replay.');return;}
 eventCounter++;const detector=eventCounter%2?'D1':'D2';const left=detector==='D1';const team=left?'T1':'T2';const t=makeTask(`RSC-${String(eventCounter+1).padStart(3,'0')}`,left?'People at flooded crossing':'Residents on upper floor',left?180+eventCounter%3*55:660+eventCounter%3*60,left?320:150+eventCounter%3*45,2,detector,team,'“water is rising, we need help getting out”');
 t.status='Detected';tasks.push(t);knowledge[detector].add(t.id);actor(detector).action=`Detected ${t.id}`;addEvent(actor(detector).name,`discovered ${t.people} people · ${t.id}`);selectedTask=t.id;traceWorkflow(detector,'Perceive',{type:'discovery',taskId:t.id,summary:`Detected ${t.people} people; created a local rescue task.`,details:{people:t.people,location:t.location}});render();toast(`${t.id} detected by ${actor(detector).name}. Watch the knowledge spread.`);
}
function step(){
 if(paused)return;tick++;elapsed++;
 // One-hop gossip: take a snapshot so information does not jump multiple hops in one tick.
 const snapshot=Object.fromEntries(actors.map(a=>[a.id,new Set(knowledge[a.id])]));let received=0;
 for(const [a,b] of pairs){if(!links[key(a,b)])continue;for(const id of snapshot[a]){if(!knowledge[b].has(id)){knowledge[b].add(id);received++;traceWorkflow(a,'Gossip',{type:'delivery',peerId:b,taskId:id,summary:`Shared ${id} with ${actor(b).name}.`,trigger:'Demo peer sync',details:{delivered:true}});traceWorkflow(b,'Merge',{type:'received',peerId:a,taskId:id,summary:`Received ${id} from ${actor(a).name}.`,trigger:'Demo gossip receipt',details:{knownTasks:[...knowledge[b]]}});}}for(const id of snapshot[b]){if(!knowledge[a].has(id)){knowledge[a].add(id);received++;traceWorkflow(b,'Gossip',{type:'delivery',peerId:a,taskId:id,summary:`Shared ${id} with ${actor(a).name}.`,trigger:'Demo peer sync',details:{delivered:true}});traceWorkflow(a,'Merge',{type:'received',peerId:b,taskId:id,summary:`Received ${id} from ${actor(b).name}.`,trigger:'Demo gossip receipt',details:{knownTasks:[...knowledge[a]]}});}}}
 if(received)addEvent('Peer gossip',`${received} missing task observations delivered`);
 for(const t of tasks){t.age++;if(t.status==='Detected'&&knowledge[t.owner].has(t.id)){t.status='Travelling';const team=actor(t.owner);if(!tasks.some(other=>other!==t&&other.owner===t.owner&&other.status==='Travelling')){team.target=[t.x,t.y];team.action=`En route to ${t.id}`;}addEvent(team.name,`won local bid · travelling to ${t.id}`);traceWorkflow(team.id,'Bid',{type:'allocation',taskId:t.id,summary:'Demo fixture assigned this team; example winning bid 8.4.',trigger:'New local task',details:{winningBid:8.4,alternativeBid:5.1,fixture:true}});}}
 for(const a of actors){
   if(a.type==='drone'){a.x=a.home[0]+Math.sin(elapsed/15+(a.id==='D2'?2:0))*38;a.y=a.home[1]+Math.cos(elapsed/18)*18;}
   else {let dx=a.target[0]-a.x,dy=a.target[1]-a.y,dist=Math.hypot(dx,dy);if(dist>4){a.x+=dx/dist*3.5;a.y+=dy/dist*3.5;}else{const task=tasks.find(t=>t.owner===a.id&&t.status==='Travelling'&&Math.hypot(t.x-a.x,t.y-a.y)<9);if(task){task.status='Rescued';rescued+=task.people;score+=task.people*65;a.action=`Completed ${task.id}`;addEvent(a.name,`rescued ${task.people} people · ${task.id}`);traceWorkflow(a.id,'Act',{type:'rescue',taskId:task.id,summary:`Simulator recorded ${task.people} people rescued.`,details:{people:task.people,uniqueRescue:true}});const next=tasks.find(t=>t.owner===a.id&&t.status!=='Rescued'&&knowledge[a.id].has(t.id));if(next){a.target=[next.x,next.y];a.action=`En route to ${next.id}`;}}}}
 }
 for(const a of actors){if(a.type==='drone')traceWorkflow(a.id,'Perceive',{type:'search',summary:'Simulated search tick; local observations remain actor-specific.',details:{position:{x:Math.round(a.x),y:Math.round(a.y)}}});traceWorkflow(a.id,'Act',{type:'movement',summary:a.action,details:{position:{x:Math.round(a.x),y:Math.round(a.y)},target:a.target}});}
 if(phase==='partitioned'&&elapsed%14===0&&tasks.length<7)injectIncident();
 if(phase==='recovering'&&knownTogether()&&tick-recoveryStart>=4){phase='connected';addEvent('Swarm','shared task views agree · local execution histories remain distinct');toast('Shared task knowledge agrees across all four actors.');}
 render();
}
function render(){renderMetrics();renderMap();renderNetwork();renderIncident();renderActors();renderFeed();renderBeliefs();if(view==='network')renderTopology();if(missionMap)missionMap.update({actors,tasks,links,pairs,paused,tick,selectedTask});$('sim-time').textContent=timeLabel(tick);$('pause-button').innerHTML=`<i data-icon="${paused?'play':'pause'}"></i>${paused?'Resume simulation':'Pause simulation'}`;renderIcons();window.HiveStudio?.render();window.HiveSwarm?.update(window.HiveStudio?.capture());}
function renderMetrics(){const count=connectedCount(),groups=components(),total=24+tasks.slice(2).reduce((sum,t)=>sum+t.people,0);$('rescued-value').textContent=rescued;$('rescued-total').textContent=`/ ${total}`;$('score-value').textContent=score;$('rescue-progress').style.width=`${Math.min(100,rescued/total*100)}%`;$('rescue-percent').textContent=`${Math.round(rescued/total*100)}% of ${total} scenario survivors`;$('rescued-badge').textContent=rescued>12?`+${rescued-12} this run`:'+2 before demo';$('link-value').textContent=Math.round(count/6*100);$('connection-tag').textContent=phase==='recovering'?'Reconciling':groups.length>1?`${groups.length} islands`:'Connected';$('connection-tag').classList.toggle('warning',phase!=='connected');$('link-caption').textContent=`${count} of 6 bidirectional peer links available`;}
function renderMap(){
 const groups=components();$('map-status').textContent=groups.length>1?`${groups.length} disconnected groups`:phase==='recovering'?'Reconciling local views':'All actors connected';
 $('island-shapes').innerHTML=groups.length===2&&groups.some(g=>g.includes('D1')&&g.includes('T1'))?`<rect x="95" y="100" width="385" height="410" rx="90" fill="#e2b769" fill-opacity=".05" stroke="#b99b65" stroke-dasharray="6 9"/><text x="125" y="125" fill="#9c8455" font-size="11" letter-spacing="2">ISLAND A</text><rect x="600" y="100" width="310" height="420" rx="90" fill="#729ab6" fill-opacity=".05" stroke="#8aadb3" stroke-dasharray="6 9"/><text x="630" y="125" fill="#7396a2" font-size="11" letter-spacing="2">ISLAND B</text>`:'';
 $('route-layer').innerHTML=actors.filter(a=>a.type==='team').map(a=>`<path d="M${a.x},${a.y} L${a.target[0]},${a.target[1]}" stroke="#ecaf56" stroke-width="2" stroke-dasharray="4 5" fill="none" opacity=".65"/>`).join('');
 $('link-layer').innerHTML=pairs.map(([aId,bId],i)=>{const a=actor(aId),b=actor(bId),up=links[key(aId,bId)],pct=((tick+i*3)%10)/10;return`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="peer-link ${up?'':'cut'}"/>${up&&!paused?`<circle class="message-packet" cx="${a.x+(b.x-a.x)*pct}" cy="${a.y+(b.y-a.y)*pct}" r="3"/>`:''}`;}).join('');
 $('incident-layer').innerHTML=tasks.map(t=>`<g class="svg-marker" data-task="${t.id}" tabindex="0" role="button" aria-label="Inspect ${escapeHTML(t.title)} ${t.id}" transform="translate(${t.x} ${t.y})"><circle r="22" fill="${t.status==='Rescued'?'#74ca7e':'#ecaf56'}" opacity=".15"/><circle r="11" fill="${t.status==='Rescued'?'#74ca7e':'#ecaf56'}" stroke="#ffffff" stroke-width="3"/><text text-anchor="middle" y="4" font-size="11" fill="white">${t.status==='Rescued'?'✓':'!'}</text><rect x="-37" y="24" width="74" height="18" rx="4" fill="#ffffff" stroke="#d5d3d1"/><text class="incident-svg-label" text-anchor="middle" y="36">${t.id} · ${t.people}p</text></g>`).join('');
 $('actor-layer').innerHTML=actors.map(a=>`<g class="svg-marker" data-actor="${a.id}" tabindex="0" role="button" aria-label="Inspect ${a.name}" transform="translate(${a.x} ${a.y})">${a.type==='drone'?'<circle r="35" fill="#284c3f" opacity=".06"/><circle r="25" fill="none" stroke="#284c3f" stroke-opacity=".12"/>':''}<${a.type==='drone'?'circle r="16"':'rect x="-15" y="-15" width="30" height="30" rx="7"'} fill="${a.color}" stroke="#fafaf8" stroke-width="3" filter="url(#marker-shadow)"/><text y="6" text-anchor="middle" font-size="23" fill="#fffce9">${a.type==='drone'?'✳':'▣'}</text><rect x="-34" y="24" width="68" height="19" rx="4" fill="#ffffff" stroke="#d5d3d1"/><text text-anchor="middle" y="37" class="actor-svg-label">${a.name}</text></g>`).join('');
}
function renderNetwork(){
 const count=connectedCount(),groups=components();$('network-status-title').textContent=phase==='recovering'?'Reconnecting the swarm':groups.length>1?`${groups.length} independent islands`:'One connected swarm';$('network-status-description').textContent=phase==='recovering'?'Missing observations are propagating.':groups.length>1?'Local groups continue making decisions.':'Discoveries travel between all actors.';$('network-light').classList.toggle('warning',phase!=='connected');
 $('blackout-button').innerHTML=`<i data-icon="${count<6?'signal':'bolt'}"></i>${count<6?'Restore all connections':'Simulate network blackout'}`;$('blackout-button').classList.toggle('restoring',count<6);$('network-helper').textContent=count<6?'Restore peer delivery and reconcile separate memories.':'Cuts cross-group links. Each island retains a drone and a team.';
 const pos={D1:[40,22],D2:[180,22],T1:[90,43],T2:[230,43]};$('mini-network').innerHTML=`<svg viewBox="0 0 270 65" aria-label="Four actor peer network">${pairs.map(([a,b])=>`<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" stroke="${links[key(a,b)]?'#466559':'#ecaf56'}" stroke-width="1" ${links[key(a,b)]?'':'stroke-dasharray="3 4"'}/>`).join('')}${actors.map(a=>`<circle cx="${pos[a.id][0]}" cy="${pos[a.id][1]}" r="8" fill="${a.type==='drone'?'#f4fdf6':'#fefcef'}" stroke="${a.type==='drone'?'#adefbc':'#f6db7a'}"/><text x="${pos[a.id][0]}" y="${pos[a.id][1]+3}" font-size="6" fill="#5d5a57" text-anchor="middle">${a.id}</text>`).join('')}</svg>`;
}
function renderIncident(){const t=tasks.find(t=>t.id===selectedTask)||tasks[0];$('incident-title').textContent=t.title;$('incident-location').textContent=t.location;$('incident-people').textContent=`${t.people} people`;$('distress-text').textContent=t.quote;$('task-id').textContent=t.id;$('incident-owner').textContent=t.status==='Detected'?'Not allocated':actor(t.owner).name;const stage=t.status==='Rescued'?4:t.status==='Detected'?0:3;$('rescue-timeline').innerHTML=['Detected','Shared','Allocated','Travelling','Rescued'].map((name,i)=>`<span class="timeline-stage ${i<=stage?'done':''}"><b></b>${name}</span>`).join('');if(window.HiveStudio?.proof)window.HiveStudio.proof.renderRescue(window.HiveStudio.capture());}
function renderActors(){$('actor-cards').innerHTML=actors.map(a=>`<button class="actor-card" data-actor="${a.id}" aria-label="Inspect ${a.name}"><div class="actor-top"><span class="actor-emblem ${a.type}">${a.type==='drone'?'✳':'▣'}</span><div><div class="actor-name">${a.name}</div><div class="actor-role">${a.role}</div></div></div><div class="actor-action">${a.action}</div><div class="actor-bottom"><span>${a.type==='drone'?a.battery+'% battery':'Capacity 4'}</span><span class="island-chip">${groupLabel(a.id)}</span></div></button>`).join('');}
function renderFeed(){$('activity-feed').innerHTML=events.slice(0,8).map(e=>`<div class="activity-entry"><span class="event-dot"></span><span><strong>${escapeHTML(e.actor)}</strong> ${escapeHTML(e.text)}</span><time>${timeLabel(e.tick)}</time></div>`).join('');}
function renderBeliefs(){const agrees=knownTogether();$('agreement-badge').textContent=agrees?'Task knowledge agrees':'Local knowledge differs';$('agreement-badge').classList.toggle('warning',!agrees);$('belief-table').innerHTML=`<thead><tr><th>RESCUE TASK</th>${actors.map(a=>`<th>${a.name.toUpperCase()}<br>${groupLabel(a.id)}</th>`).join('')}</tr></thead><tbody>${tasks.map(t=>`<tr><td>${t.id}<br><small>${escapeHTML(t.title)}</small></td>${actors.map(a=>`<td class="${knowledge[a.id].has(t.id)?'':'unknown'}">${knowledge[a.id].has(t.id)?`Known<br><small>Assigned: ${actor(t.owner).name}</small>`:'Not yet known'}</td>`).join('')}</tr>`).join('')}</tbody>`;}
function renderTopology(){if(window.HiveSwarm)return;const pos={D1:[210,90],D2:[610,90],T1:[210,270],T2:[610,270]};$('topology').innerHTML=`<svg viewBox="0 0 820 370" role="img" aria-label="Interactive peer topology">${pairs.map(([a,b])=>`<line class="topology-visible-link ${links[key(a,b)]?'':'cut'}" x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/><line class="topology-link" tabindex="0" role="button" aria-label="${links[key(a,b)]?'Cut':'Restore'} link ${a} to ${b}" data-link="${key(a,b)}" x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/>`).join('')}${actors.map(a=>`<g class="svg-marker" data-actor="${a.id}" role="button" tabindex="0" aria-label="Inspect ${a.name}" transform="translate(${pos[a.id][0]} ${pos[a.id][1]})"><circle r="34" fill="${a.type==='drone'?'#f4fdf6':'#fefcef'}" stroke="${a.color}" stroke-width="1.5"/><text text-anchor="middle" y="8" font-size="29" fill="${a.color}">${a.type==='drone'?'✳':'▣'}</text><text text-anchor="middle" y="56" font-size="12" fill="#5d5a57">${a.name} · ${groupLabel(a.id)}</text></g>`).join('')}</svg>`;$('recovery-panel').innerHTML=`<span><strong>${connectedCount()}/6</strong> links available</span><span><strong>${components().length}</strong> connected groups</span><span><strong>${tasks.length}</strong> discovered tasks</span><span><strong>${knownTogether()?'Agreed':'Divergent'}</strong> task knowledge</span><span>Demo duplicate commitments: <strong>${duplicates}</strong></span>`;}
function renderBenchmark(){const datasets=[{color:'#284c3f',values:[52,66,77,85,91]},{color:'#ecaf56',values:[21,32,49,71,94]},{color:'#b4b0ac',values:[0,15,35,65,94]}];const x=i=>75+i*190,y=v=>265-v*2.1;$('benchmark-chart').innerHTML=`<svg viewBox="0 0 900 325" role="img" aria-label="Illustrative mission score percentage against available peer links; demo fixtures, not measured results">${[0,25,50,75,100].map(v=>`<line x1="75" y1="${y(v)}" x2="835" y2="${y(v)}" stroke="#f3f3f1"/><text x="57" y="${y(v)+4}" text-anchor="end" font-size="10" fill="#b4b0ac">${v}</text>`).join('')}${datasets.map(d=>`<polyline points="${d.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="${d.color}" stroke-width="3"/>${d.values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="white" stroke="${d.color}" stroke-width="2"/>`).join('')}`).join('')}${[0,25,50,75,100].map((v,i)=>`<text x="${x(i)}" y="289" text-anchor="middle" font-size="10" fill="#77716d">${v}%</text>`).join('')}<text x="455" y="316" text-anchor="middle" font-size="10" fill="#77716d">Available peer links · illustrative outage mapping</text><text x="14" y="170" transform="rotate(-90 14 170)" text-anchor="middle" font-size="10" fill="#77716d">Normalised mission score</text></svg>`;}
let insightsSection='beliefs';
function setInsightsSection(section){
 insightsSection=section;
 for(const name of ['beliefs','benchmark']){
  $(`${name}-view`).hidden=name!==section;
  const button=document.querySelector(`[data-insights-section="${name}"]`);
  button.setAttribute('aria-selected',String(name===section));button.tabIndex=name===section?0:-1;
 }
 if(section==='benchmark')renderBenchmark();
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

function openDetail(id,type){
 if(type==='task'){selectedTask=id;renderIncident();const t=tasks.find(t=>t.id===id);$('dialog-title').textContent=`${t.id} · Allocation decision`;$('dialog-content').innerHTML=`<p>${escapeHTML(t.title)} · ${t.people} people · urgency 5. These bid values are illustrative fixtures; the current task owner is part of the demo scenario.</p><div class="decision-row"><div><strong>${actor(t.owner).name} · local owner</strong><small>Shorter travel · capacity available</small></div><b>8.4</b></div><div class="decision-row"><div><strong>${actor(t.owner==='T1'?'T2':'T1').name}</strong><small>Longer travel · greater current load</small></div><b>5.1</b></div><p><strong>Decision rule:</strong> compare eligible bids; higher score wins and actor ID breaks ties. Each connected actor learns the result through peer updates. Isolated actors cannot see a bid until delivery is possible.</p><p><strong>Current phase:</strong> ${escapeHTML(t.status)}. One canonical task ID identifies this rescue across actors.</p>`;
 }else{const a=actor(id);$('dialog-title').textContent=a.name;$('dialog-content').innerHTML=`<p>${a.role} · ${groupLabel(id)} · demo actor-local memory</p><div class="decision-row"><div><strong>${a.action}</strong><small>Simulation tick ${tick} · observer data is current</small></div><b>${knowledge[id].size}</b></div><p><strong>Known tasks:</strong> ${[...knowledge[id]].join(', ')}.</p><p><strong>Peer delivery:</strong> ${actors.filter(other=>other.id!==id&&links[key(id,other.id)]).map(other=>other.name).join(', ')||'No reachable peers. This actor can only use its own observations and existing memory.'}.</p><p>Production target: an independent n8n instance with durable local state. This mockup uses browser memory to demonstrate the intended interaction.</p>`;}
 $('detail-dialog').showModal();
}
function toggleLink(link){if(window.HiveStudio?.replaying){toast('Return to live before changing links.');return;}links[link]=!links[link];addEvent('Chaos proxy',`${link} ${links[link]?'restored':'cut'}`);startRecovery();tracePeerLinks();render();}
function mapDisplay(mode){
 mapMode=mode;
 if(mode==='street'&&!missionMap){
   missionMap=new HiveMap({onActor:id=>openDetail(id,'actor'),onTask:id=>{selectedTask=id;renderIncident();missionMap.selectTask(id);},onFallback:()=>mapDisplay('schematic')});
   missionMap.init();
 }
 $('map-shell').classList.toggle('street-mode',mode==='street');
 $('schematic-button').classList.toggle('selected',mode==='schematic');$('street-button').classList.toggle('selected',mode==='street');
 $('schematic-button').setAttribute('aria-pressed',String(mode==='schematic'));$('street-button').setAttribute('aria-pressed',String(mode==='street'));
 $('map-mode-label').textContent=mode==='street'?'MANCHESTER · SIMULATED OPERATIONS':'ILLUSTRATIVE GEOGRAPHY';
 document.querySelectorAll('.map-perspective button, #follow-actor').forEach(el=>el.disabled=mode==='schematic');
 if(missionMap){missionMap.setActive(mode==='street');missionMap.resize();missionMap.update({actors,tasks,links,pairs,paused,tick,selectedTask});}
}
document.addEventListener('click',e=>{const task=e.target.closest('[data-task]'),act=e.target.closest('[data-actor]'),nav=e.target.closest('[data-view]'),link=e.target.closest('[data-link]');if(task)openDetail(task.dataset.task,'task');else if(act)openDetail(act.dataset.actor,'actor');else if(nav)setView(nav.dataset.view);else if(link)toggleLink(link.dataset.link);});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('g[role="button"],line[role="button"]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
$('blackout-button').onclick=blackout;$('reset-button').onclick=()=>{reset();toast('Demo reset. All four actors share the starting task knowledge.');};$('pause-button').onclick=()=>{paused=!paused;document.body.classList.toggle('paused',paused);render();};$('inject-button').onclick=injectIncident;$('restore-all').onclick=()=>{pairs.forEach(([a,b])=>links[key(a,b)]=true);startRecovery();tracePeerLinks();render();};$('inspect-button').onclick=()=>openDetail(selectedTask,'task');$('close-dialog').onclick=()=>$('detail-dialog').close();$('detail-dialog').addEventListener('click',e=>{if(e.target===$('detail-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('help-button').onclick=()=>{$('dialog-title').textContent='A working story, with demo data';$('dialog-content').innerHTML='<p>This is an interactive UI prototype for HIVE. Actors, bids, missions and messages are simulated in this browser. There are no live n8n instances or emergency services connected.</p><p><strong>Try it:</strong> cut links on Overview, visit Actor beliefs and inject an incident, then restore links. Inspect actors and incidents to see the information behind the visuals.</p><p>The schematic is an illustrative Manchester layout. Live map uses MapLibre geographic tiles with synthetic actor positions and a simulated flood zone. Toggle 3D for building context; use Layers to show communication. Benchmark numbers are illustrative fixtures. Refreshing the page resets browser memory.</p>';$('detail-dialog').showModal();};
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
reset();mapDisplay('street');setInterval(()=>{for(let n=0;n<(window.HiveStudio?.speed||1);n++)step();},1000);function clock(){$('clock').textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/London'}).format(new Date())+' GMT';}clock();setInterval(clock,1000);

document.querySelectorAll('[data-insights-section]').forEach(button=>button.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=button.dataset.insightsSection==='beliefs'?'benchmark':'beliefs';setView(next);document.querySelector(`[data-insights-section="${next}"]`).focus();}}));
