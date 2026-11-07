/* Read-only telemetry store. Records are inferred by the live observer from proxy delivery records,
   simulator receipts and actor-store changes. They are never presented as n8n execution logs. */
'use strict';
class SwarmTelemetryStore {
  constructor(){this.reset();this.actorLinks={};}
  reset(){this.records=[];this.sequence=0;}
  emit(record){
    const workflows=['Perceive','Interpret','Bid','Gossip','Merge','Act'];
    if(!workflows.includes(record.workflow)||!/^(drone|team)-\d+$/.test(record.actorId||''))return null;
    const item={id:`rec-${++this.sequence}`,sequence:this.sequence,source:'live',status:'observed',type:'observation',trigger:'Simulation tick',summary:'',details:{},...record};
    if(!Number.isFinite(item.tick))return null;
    // Keep telemetry detached from mutable simulation state.
    this.records.push(JSON.parse(JSON.stringify(item)));if(this.records.length>1600)this.records.shift();return item;
  }
  at(tick){return this.records.filter(record=>record.tick<=tick);}
  seed(){ /* live mode: no fixture records */ }
  setActorLinks(actorId,{editorUrl,workflows={}}={}){
    if(!/^(drone|team)-\d+$/.test(actorId||''))throw new Error('Unknown actor');
    const safe=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}};
    this.actorLinks[actorId]={editorUrl:safe(editorUrl),workflows:Object.fromEntries(Object.entries(workflows).map(([name,url])=>[name,safe(url)]))};
  }
}
window.HiveSwarmTelemetry=new SwarmTelemetryStore();
