/* Two observer panels: rescue response and local coordination.
   Inspired by Tempo's explanatory diagrams; all visuals use HIVE's live snapshots. */
'use strict';
class MissionProofPanels {
  constructor(studio){
    this.studio=studio;this.previous=null;this.taskId=null;this.explainedStage=null;this.initialRescued=null;this.optionsSignature='';this.lastStageKey='';
    this.stages=['Found','Shared','Assigned','Travelling','Safe'];
    $('rescue-journey').innerHTML=this.stages.map((name,i)=>`<button class="journey-stage" data-rescue-stage="${i}" aria-label="Explain ${name.toLowerCase()} stage"><span class="journey-symbol">${['⌖','⇄','⚑','→','✓'][i]}</span><span class="journey-stage-name">${name}</span></button>`).join('');
    $('rescue-journey').addEventListener('click',e=>{const button=e.target.closest('[data-rescue-stage]');if(button&&!button.disabled){this.explainedStage=Number(button.dataset.rescueStage);this.renderRescue(this.studio.capture());}});
    $('proof-task-select').onchange=e=>{this.taskId=e.target.value;selectedTask=this.taskId;this.explainedStage=null;renderIncident();missionMap?.selectTask(this.taskId);this.renderRescue(this.studio.capture());};
    $('proof-show-task').onclick=()=>{const id=this.taskId||selectedTask;selectedTask=id;renderIncident();missionMap?.selectTask(id);missionMap?.focusTask(id);};
    $('proof-inspect-bid').onclick=()=>openDetail(this.taskId||selectedTask,'task');
    $('proof-toggle-links').onclick=()=>{if(!this.studio.replaying)blackout();};
    $('proof-topology').addEventListener('click',e=>{const button=e.target.closest('[data-proof-actor]');if(button)openDetail(button.dataset.proofActor,'actor');});
    $('proof-topology').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-proof-actor]')){e.preventDefault();openDetail(e.target.dataset.proofActor,'actor');}});
  }
  reset(){this.previous=null;this.taskId=null;this.explainedStage=null;this.initialRescued=null;this.optionsSignature='';this.lastStageKey='';}
  render(s){
    if(this.initialRescued===null)this.initialRescued=s.rescued;
    document.querySelector('.mission-proof').classList.toggle('is-running',!s.paused||this.studio.playing);
    this.renderRescue(s);this.renderConnections(s);this.previous=s;
  }
  groups(s){const seen=new Set(),groups=[];for(const a of s.actors){if(seen.has(a.id))continue;const group=[],queue=[a.id];seen.add(a.id);while(queue.length){const id=queue.shift();group.push(id);for(const other of s.actors){if(other.id!==id&&!seen.has(other.id)&&s.links[[id,other.id].sort().join('-')]){seen.add(other.id);queue.push(other.id);}}}groups.push(group);}return groups;}
  has(s,actorId,taskId){return s.knowledge[actorId]?.includes(taskId);}
  renderRescue(s){
    if(this.initialRescued===null)this.initialRescued=s.rescued;
    const signature=s.tasks.map(t=>t.id+':'+t.title).join('|');
    if(signature!==this.optionsSignature){this.optionsSignature=signature;$('proof-task-select').innerHTML=s.tasks.map(t=>`<option value="${t.id}">${t.id} · ${escapeHTML(t.title)}</option>`).join('');}
    if(this.taskId!==s.selectedTask&&s.tasks.some(t=>t.id===s.selectedTask)){this.taskId=s.selectedTask;this.explainedStage=null;}
    const task=s.tasks.find(t=>t.id===this.taskId)||s.tasks[0];
    if(!task){$('rescue-proof-summary').textContent='No incidents yet. Survivors appear as the flood spreads.';$('rescue-proof-badge').textContent='WAITING';$('rescue-journey').querySelectorAll('[data-rescue-stage]').forEach(b=>{b.disabled=true;b.classList.remove('reached','current','explained');});$('rescue-stage-explanation').innerHTML='<strong>Nothing to follow yet.</strong> Start the mission; drones begin searching straight away.';$('rescue-proof-outcome').innerHTML='';return;}
    this.taskId=task.id;$('proof-task-select').value=task.id;
    const owner=s.actors.find(a=>a.id===task.owner)||{name:'No team yet'},drone=s.actors.find(a=>a.id===task.detector)||{name:'No drone yet'},received=!!task.owner&&this.has(s,task.owner,task.id);
    const current=task.status==='Rescued'?4:task.status==='Travelling'?3:received?1:0,unreported=task.status==='Unreported';
    if(this.explainedStage!==null&&this.explainedStage>current)this.explainedStage=null;
    const show=this.explainedStage??current;
    const summaries=[unreported?`Nobody in the swarm knows about these ${task.people} people yet.`:`${drone.name} found ${task.people} people. The discovery has not reached a rescue team yet.`,`${owner.name} has received the discovery and can plan a response.`,`${owner.name} won the local allocation.`,`${owner.name} is travelling to ${task.people} people.`,`${task.people} people from this incident are now safe.`];
    $('rescue-proof-summary').textContent=summaries[current];$('rescue-proof-badge').textContent=task.status==='Rescued'?'PEOPLE SAFE':unreported?'NOT YET FOUND':!received?'AWAITING DELIVERY':'RESPONSE IN PROGRESS';$('rescue-proof-badge').classList.toggle('attention',!received);
    $('rescue-journey').querySelectorAll('[data-rescue-stage]').forEach((button,i)=>{button.disabled=i>current;button.classList.toggle('reached',i<=current);button.classList.toggle('current',i===current);button.classList.toggle('explained',i===show);button.setAttribute('aria-pressed',String(i===show));});
    const explanations=[unreported?`<strong>Not yet found.</strong> The observer can see these ${task.people} people, but no actor can until a drone’s sensor passes over them or their text reaches a drone.`:`<strong>${drone.name} detected the incident.</strong> The task is identified as ${task.id}; it represents ${task.people} people, not ${task.people} separate tasks.`,`<strong>The rescue team knows about it.</strong> Peer delivery made ${task.id} available to ${owner.name}. An isolated drone cannot send a new discovery to a team.`,`<strong>A local owner is recorded.</strong> ${owner.name} won the CBBA allocation in the actors’ own stores. Inspect the bids to see what each actor believes.`,`<strong>A plan became movement.</strong> ${owner.name} is moving toward the incident, one cell per tick command. The people count changes only when the simulator records a rescue.`,`<strong>A rescue was recorded once.</strong> ${task.people} people from ${task.id} count toward the mission total. Replaying the dashboard does not rescue them again.`];
    const stageKey=task.id+':'+show+':'+task.status;
    if(stageKey!==this.lastStageKey){this.lastStageKey=stageKey;$('rescue-stage-explanation').innerHTML=explanations[show];$('rescue-stage-explanation').animate?.([{opacity:.3,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:300});}
    const total=missionTotal(),pending=Math.max(0,total-s.rescued),during=Math.max(0,s.rescued-this.initialRescued);
    $('rescue-proof-outcome').innerHTML=`<div class="people-counter"><strong>${s.rescued}<span> / ${total} people safe</span></strong><span>${pending} not yet rescued</span></div><div class="people-strip" role="img" aria-label="${s.rescued} of ${total} scenario survivors rescued">${Array.from({length:total},(_,i)=>`<span class="person-mark ${i<s.rescued?'safe':''}" aria-hidden="true"><svg viewBox="0 0 10 18"><circle cx="5" cy="3" r="2.2"/><path d="M2 8a3 3 0 0 1 6 0v5H6v5H4v-5H2Z"/></svg></span>`).join('')}</div><p>+${during} during this recording · ${this.initialRescued} were already safe at the start</p>`;
  }
  deliveries(s){
    if(!this.previous||s.tick<=this.previous.tick||s.paused&&!this.studio.playing)return[];
    const result=[];for(const [a,b]of pairs){if(!s.links[[a,b].sort().join('-')])continue;for(const [from,to]of [[a,b],[b,a]]){const learned=(s.knowledge[to]||[]).some(id=>!this.has(this.previous,to,id)&&this.has(this.previous,from,id));if(learned)result.push({from,to});}}return result;
  }
  renderConnections(s){
    const groups=this.groups(s),linksUp=Object.values(s.links).filter(Boolean).length,split=groups.length>1,solo=groups.filter(g=>g.length===1),capable=groups.filter(g=>g.some(id=>s.actors.find(a=>a.id===id).type==='drone')&&g.some(id=>s.actors.find(a=>a.id===id).type==='team'));
    $('connection-proof-badge').textContent=split?`${groups.length} SEPARATE GROUPS`:'ONE CONNECTED SWARM';$('connection-proof-badge').classList.toggle('attention',split);
    $('connection-proof-summary').textContent=!split?'Discoveries can reach every rescue team.':capable.length===groups.length?'The network is split. Every local group can still search and rescue.':solo.length?`${solo.length} isolated actor${solo.length===1?' has':'s have'} to rely on local knowledge.`:'Some groups cannot pass new drone discoveries to a rescue team.';
    const pos=actorLayout(400,52,143,46),delivered=this.deliveries(s);
    const groupBoxes=groups.length>1?groups.map((group,i)=>{const xs=group.map(id=>pos[id][0]),ys=group.map(id=>pos[id][1]);return`<rect x="${Math.min(...xs)-46}" y="${Math.min(...ys)-32}" width="${Math.max(...xs)-Math.min(...xs)+92}" height="${Math.max(...ys)-Math.min(...ys)+72}" rx="12" class="proof-island"/><text x="${Math.min(...xs)-38}" y="${Math.min(...ys)-22}" class="island-label">${group.length===1?'ISOLATED':'ISLAND '+String.fromCharCode(65+i)}</text>`;}).join(''):'';
    const signature=s.actors.map(a=>a.id).join()+Object.values(s.links).join();
    if(this.topologySignature!==signature){this.topologySignature=signature;$('proof-topology').innerHTML=`<svg viewBox="0 0 400 195" role="group" aria-label="Who can share discoveries? ${s.actors.length} actors and their available peer links">${groupBoxes}${pairs.map(([a,b])=>`<line x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}" class="proof-peer ${s.links[[a,b].sort().join('-')]?'up':'down'}"/>`).join('')}<g id="proof-deliveries"></g>${s.actors.map(a=>`<g data-proof-actor="${a.id}" role="button" tabindex="0" aria-label="Inspect ${a.name}" transform="translate(${pos[a.id][0]} ${pos[a.id][1]})"><circle r="20" class="proof-actor-halo ${a.type}"/><text y="6" text-anchor="middle" class="proof-actor-symbol">${a.type==='drone'?'✳':'▣'}</text><rect x="-38" y="23" width="76" height="19" rx="4" class="proof-actor-label-bg"/><text y="36" text-anchor="middle" class="proof-actor-label">${a.name}</text></g>`).join('')}</svg>`;}
    $('proof-deliveries').innerHTML=delivered.map(({from,to})=>`<circle r="3" fill="#466559" class="delivery-packet"><animate attributeName="cx" from="${pos[from][0]}" to="${pos[to][0]}" dur=".8s" fill="freeze"/><animate attributeName="cy" from="${pos[from][1]}" to="${pos[to][1]}" dur=".8s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" dur="1s" fill="freeze"/></circle>`).join('');
    $('connection-proof-explanation').innerHTML=!split?`<strong>${linksUp} peer links are available.</strong> Lines show communication reachability; a moving dot appears when an actor learns a new task from a peer.`:capable.length===groups.length?`<strong>Each island has a drone and a rescue team.</strong> They can act on local discoveries without reaching the other island. Existing tasks can still be completed.`:`<strong>Connectivity alone is not enough.</strong> A group needs both discovery and rescue capability to respond to new drone sightings. Isolated actors can finish suitable work they already know.`;
    $('proof-toggle-links').textContent=linksUp<pairs.length?'Restore connections →':'Try a blackout →';$('proof-toggle-links').disabled=this.studio.replaying;
  }
}
window.MissionProofPanels=MissionProofPanels;
