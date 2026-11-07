/* Read-only telemetry boundary for the mockup. Real adapters can later ingest
   normalised n8n records; the browser demo never presents these as n8n runs. */
'use strict';
class SwarmTelemetryStore {
  constructor(){this.reset();this.actorLinks={};}
  reset(){this.records=[];this.sequence=0;}
  emit(record){
    const workflows=['Perceive','Interpret','Bid','Gossip','Merge','Act'];
    if(!workflows.includes(record.workflow)||!['D1','D2','T1','T2'].includes(record.actorId))return null;
    const item={id:`demo-${++this.sequence}`,sequence:this.sequence,source:'browser-demo',status:'observed',type:'observation',trigger:'Simulation tick',summary:'',details:{},...record};
    if(!Number.isFinite(item.tick))return null;
    // Keep telemetry detached from mutable simulation state.
    this.records.push(JSON.parse(JSON.stringify(item)));if(this.records.length>1600)this.records.shift();return item;
  }
  at(tick){return this.records.filter(record=>record.tick<=tick);}
  seed(){
    const base={source:'fixture',status:'observed',trigger:'Starting-scenario fixture'};
    this.emit({...base,actorId:'D1',workflow:'Perceive',tick:254,type:'discovery',taskId:'RSC-012',summary:'Detected three people on a rooftop.',details:{people:3,location:'Greengate · Sector C4'}});
    this.emit({...base,actorId:'D2',workflow:'Perceive',tick:254,type:'discovery',taskId:'RSC-014',summary:'Detected two residents awaiting evacuation.',details:{people:2,location:'Ancoats · Sector F5'}});
    this.emit({...base,actorId:'D1',workflow:'Gossip',tick:257,type:'delivery',peerId:'T1',taskId:'RSC-012',summary:'Starting fixture: discovery shared with Rescue 01.'});
    this.emit({...base,actorId:'T1',workflow:'Merge',tick:257,type:'received',peerId:'D1',taskId:'RSC-012',summary:'Starting fixture: received the rooftop task.'});
    this.emit({...base,actorId:'T1',workflow:'Bid',tick:259,type:'allocation',taskId:'RSC-012',summary:'Fixture owner: Rescue 01, example bid 8.4.',details:{winningBid:8.4,alternativeBid:5.1,fixture:true}});
    this.emit({...base,actorId:'T2',workflow:'Bid',tick:259,type:'allocation',taskId:'RSC-014',summary:'Fixture owner: Rescue 02, example bid 8.4.',details:{winningBid:8.4,alternativeBid:5.1,fixture:true}});
  }
  setActorLinks(actorId,{editorUrl,workflows={}}={}){
    if(!['D1','D2','T1','T2'].includes(actorId))throw new Error('Unknown MVP actor');
    const safe=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
    this.actorLinks[actorId]={editorUrl:safe(editorUrl),workflows:Object.fromEntries(Object.entries(workflows).map(([name,url])=>[name,safe(url)]))};
  }
}
window.HiveSwarmTelemetry=new SwarmTelemetryStore();
