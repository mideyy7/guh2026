/* Geographic presentation only. The simulation remains owned by app.js. */
'use strict';
class HiveMap {
  constructor(callbacks) {
    this.callbacks=callbacks;this.map=null;this.ready=false;this.active=true;
    this.state=null;this.positions={};this.previous={};this.trails={};this.markers=new Map();
    this.visibility={actors:true,incidents:true,flood:true,routes:true,communication:false,trees:true};
    this.followId='';this.tilted=false;this.selected=null;this.frame=null;this.lastTick=null;this.sourceCache={};
    this.motionOK=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  static coordinate(x,y){return [-2.267+x/1000*.025,53.492-y/610*.014];}
  static collection(features=[]){return {type:'FeatureCollection',features};}
  static feature(type,coordinates,properties={}){return {type:'Feature',geometry:{type,coordinates},properties};}
  init(){
    if(!window.maplibregl){this.fallback('Map library unavailable. Offline schematic is active.');return;}
    try {
      this.map=new maplibregl.Map({container:'street-map',style:'https://tiles.openfreemap.org/styles/positron',center:[-2.247,53.4835],zoom:13.6,pitch:0,bearing:0,maxPitch:60,minZoom:11,maxZoom:18.5,attributionControl:{compact:true},renderWorldCopies:false});
      this.map.addControl(new maplibregl.ScaleControl({maxWidth:90,unit:'metric'}),'bottom-right');
      this.map.on('load',()=>{
        clearTimeout(this.loadTimer);this.styleBasemap();this.addLayers();this.ready=true;
        this.notice('Real geography · all operations and flooding are simulated',false);
        this.fit(0);this.update(this.state);this.animate();if(window.HiveVegetation){this.vegetation=new HiveVegetation(this.map);this.vegetation.add();}this.perspective(true);
      });
      this.map.on('error',()=>{if(!this.ready)this.notice('Map data is taking longer to load. Offline schematic is available.',true);else this.notice('Some map data could not load. Use offline schematic if needed.',true);});
      this.map.on('dragstart',()=>this.stopFollowing());
      window.addEventListener('resize',()=>{
        clearTimeout(this.resizeTimer);
        this.resizeTimer=setTimeout(()=>{this.resize();if(this.active&&!this.followId&&!this.selected)this.fit(0);},180);
      });
      this.map.on('click',e=>{
        if(!this.ready)return;
        const available=['hive-incidents','hive-actors'].filter(id=>this.map.getLayer(id));
        const hits=this.map.queryRenderedFeatures(e.point,{layers:available});
        if(!hits.length){this.selected=null;this.selectionCard();this.draw(performance.now());return;}
        const hit=hits[0];if(hit.layer.id==='hive-incidents'){this.callbacks.onTask(hit.properties.id);}else{this.callbacks.onActor(hit.properties.id);}
      });
      for(const id of ['hive-incidents','hive-actors']){
        this.map.on('mouseenter',id,()=>{this.map.getCanvas().style.cursor='pointer';});
        this.map.on('mouseleave',id,()=>{this.map.getCanvas().style.cursor='';});
      }
      this.loadTimer=setTimeout(()=>{if(!this.ready)this.fallback('Geographic map could not load. Offline schematic is active.');},18000);
    } catch(error){this.fallback('WebGL map unavailable on this browser. Offline schematic is active.');}
  }
  notice(text,warning){const el=document.getElementById('map-notice');el.textContent=text;el.classList.toggle('warning',warning);el.hidden=false;}
  fallback(message){this.active=false;this.notice(message,true);setTimeout(()=>this.callbacks.onFallback(),0);}
  styleBasemap(){
    for(const layer of this.map.getStyle().layers){
      const id=layer.id.toLowerCase();
      if(layer.type==='symbol'&&(/poi|housenumber|airport|aerodrome|transit|railway|shield/.test(id))){this.map.setLayoutProperty(layer.id,'visibility','none');continue;}
      if(layer.type==='background')this.map.setPaintProperty(layer.id,'background-color','#d8d7be');
      if(layer.type==='fill'&&/water/.test(id))this.map.setPaintProperty(layer.id,'fill-color','#638b80');
      if(layer.type==='fill'&&/park|wood/.test(id))this.map.setPaintProperty(layer.id,'fill-color',/wood/.test(id)?'#809260':'#a8b585');
      if(layer.type==='fill'&&/building/.test(id)){this.map.setPaintProperty(layer.id,'fill-color','#bdbea9');this.map.setPaintProperty(layer.id,'fill-opacity',.8);}
      if(layer.type==='symbol'&&/place|road|water|label_|highway-name/.test(id)){this.map.setPaintProperty(layer.id,'text-color',/water/.test(id)?'#c0d4ca':'#404e3b');this.map.setPaintProperty(layer.id,'text-halo-color','#e4e5cf');}
    }
    const building=this.map.getStyle().layers.find(l=>l.type==='fill'&&l['source-layer']==='building');
    if(building){
      const before=this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;
      this.map.addLayer({id:'hive-buildings-3d',type:'fill-extrusion',source:building.source,'source-layer':'building',minzoom:13,layout:{visibility:'none'},paint:{'fill-extrusion-color':['interpolate',['linear'],['coalesce',['get','render_height'],8],0,'#d3cfb0',16,'#babba4',45,'#8c9d91',100,'#728e88'],'fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.95}},before);
    }
  }
  source(name){this.map.addSource(name,{type:'geojson',data:HiveMap.collection()});}
  addLayers(){
    for(const name of ['flood','routes','trails','links','packets','actors','incidents','selection','islands'])this.source('hive-'+name);
    const add=layer=>this.map.addLayer(layer);
    add({id:'hive-flood-fill',type:'fill',source:'hive-flood',paint:{'fill-color':'#2563c9','fill-opacity':.18}});
    add({id:'hive-flood-edge',type:'line',source:'hive-flood',paint:{'line-color':'#2563c9','line-width':1.5,'line-dasharray':[3,3],'line-opacity':.65}});
    add({id:'hive-islands',type:'line',source:'hive-islands',paint:{'line-color':['get','color'],'line-width':1.7,'line-dasharray':[4,5],'line-opacity':.65}});
    add({id:'hive-routes',type:'line',source:'hive-routes',layout:{'line-cap':'round'},paint:{'line-color':'#ecaf56','line-width':2,'line-dasharray':[2,3],'line-opacity':.7}});
    add({id:'hive-trails',type:'line',source:'hive-trails',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':3,'line-opacity':.32}});
    add({id:'hive-links',type:'line',source:'hive-links',paint:{'line-color':['case',['get','up'],'#466559','#ecaf56'],'line-width':1.25,'line-dasharray':[3,5],'line-opacity':.55}});
    add({id:'hive-packets',type:'circle',source:'hive-packets',paint:{'circle-color':'#284c3f','circle-radius':3,'circle-stroke-color':'#ffffff','circle-stroke-width':1}});
    add({id:'hive-selection',type:'circle',source:'hive-selection',paint:{'circle-radius':26,'circle-color':'#ecaf56','circle-opacity':.1,'circle-stroke-color':'#985f3c','circle-stroke-width':1.5,'circle-stroke-opacity':.5}});
    add({id:'hive-incidents',type:'circle',source:'hive-incidents',paint:{'circle-radius':9,'circle-color':['case',['get','rescued'],'#74ca7e','#ecaf56'],'circle-stroke-color':'#ffffff','circle-stroke-width':3}});
    add({id:'hive-actors',type:'circle',source:'hive-actors',paint:{'circle-radius':15,'circle-color':['get','color'],'circle-stroke-color':'#ffffff','circle-stroke-width':3,'circle-opacity':0}});
    this.layer('communication',false);
  }
  update(state){
    if(!state)return;this.state=state;
    if(this.lastTick!==state.tick){
      const time=performance.now();
      for(const actor of state.actors){
        this.previous[actor.id]=this.positions[actor.id]||HiveMap.coordinate(actor.x,actor.y);
        const trail=this.trails[actor.id]||(this.trails[actor.id]=[]);trail.push(HiveMap.coordinate(actor.x,actor.y));if(trail.length>70)trail.shift();
      }
      this.started=time;this.lastTick=state.tick;
    }
    if(this.ready){this.syncMarkers();this.selectionCard();this.draw(performance.now());}
  }
  marker(kind,id){
    const key=kind+id;if(this.markers.has(key))return this.markers.get(key);
    const el=document.createElement('button');el.type='button';el.className='geo-marker '+kind;
    el.addEventListener('click',e=>{e.stopPropagation();if(kind==='actor')this.callbacks.onActor(id);else this.callbacks.onTask(id);});
    const marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([0,0]).addTo(this.map);
    this.markers.set(key,marker);return marker;
  }
  syncMarkers(){
    const keep=new Set();
    for(const a of this.state.actors){
      const marker=this.marker('actor',a.id),el=marker.getElement();keep.add('actor'+a.id);
      el.classList.toggle('rescue',a.type==='team');el.setAttribute('aria-label',`Inspect ${a.name}: ${a.action}`);
      // DOM content is stable between ticks, retaining focus and hover state.
      if(!el.firstChild){el.innerHTML=`<span class="geo-marker-symbol">${a.type==='drone'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8M9 12h6M12 9v6"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-2 8H6ZM7 10V5h10v5M12 5V2M3 21l3-1 3 1 3-1 3 1 3-1 3 1"/></svg>'}</span><span class="geo-marker-label">${a.name}</span>`;}
      el.hidden=!this.visibility.actors;
    }
    for(const t of this.state.tasks){const marker=this.marker('incident',t.id),el=marker.getElement();keep.add('incident'+t.id);el.classList.toggle('complete',t.status==='Rescued');el.classList.toggle('selected',t.id===this.selected);el.innerHTML=`<span>${t.status==='Rescued'?'✓':'!'}</span><span class="geo-incident-label">${t.id} <b>${t.people}p</b></span>`;el.setAttribute('aria-label',`${t.title}, ${t.people} people, ${t.status}`);marker.setLngLat(HiveMap.coordinate(t.x,t.y));el.hidden=!this.visibility.incidents;}
    for(const [key,marker]of this.markers){if(!keep.has(key)){marker.remove();this.markers.delete(key);}}
  }
  data(id,features){const data=HiveMap.collection(features),signature=JSON.stringify(data);if(this.sourceCache[id]===signature)return;this.sourceCache[id]=signature;this.map.getSource('hive-'+id)?.setData(data);}
  draw(now){
    if(!this.ready||!this.state||!this.active)return;
    const {actors,tasks,links,pairs,paused,tick}=this.state;
    const ratio=this.motionOK&&!paused?Math.min(1,(now-(this.started||now))/950):1;
    for(const a of actors){const end=HiveMap.coordinate(a.x,a.y),start=this.previous[a.id]||end;this.positions[a.id]=end.map((v,i)=>start[i]+(v-start[i])*ratio);this.markers.get('actor'+a.id)?.setLngLat(this.positions[a.id]);}
    this.data('actors',actors.map(a=>HiveMap.feature('Point',this.positions[a.id],{id:a.id,color:a.color})));
    this.data('incidents',tasks.map(t=>HiveMap.feature('Point',HiveMap.coordinate(t.x,t.y),{id:t.id,rescued:t.status==='Rescued'})));
    this.data('routes',actors.filter(a=>a.type==='team'&&Math.hypot(a.x-a.target[0],a.y-a.target[1])>5).map(a=>HiveMap.feature('LineString',[this.positions[a.id],HiveMap.coordinate(...a.target)],{id:a.id})));
    this.data('trails',actors.filter(a=>(this.trails[a.id]?.length||0)>1).map(a=>HiveMap.feature('LineString',[...this.trails[a.id].slice(0,-1),this.positions[a.id]],{color:a.color})));
    this.data('links',pairs.map(([a,b])=>HiveMap.feature('LineString',[this.positions[a],this.positions[b]],{up:!!links[[a,b].sort().join('-')]})));
    this.data('packets',!paused&&this.motionOK?pairs.filter(([a,b])=>links[[a,b].sort().join('-')]).map(([a,b],i)=>{const ratio=((now/2000+i*.17)%1);return HiveMap.feature('Point',this.positions[a].map((v,j)=>v+(this.positions[b][j]-v)*ratio));}):[]);
    const flood=[[-2.263,53.491],[-2.257,53.492],[-2.249,53.487],[-2.25,53.483],[-2.245,53.477],[-2.249,53.476],[-2.256,53.482],[-2.261,53.486],[-2.263,53.491]];
    this.data('flood',[HiveMap.feature('Polygon',[flood])]);
    const groups=this.connectedGroups(actors,pairs,links);
    this.data('islands',groups.length>1?groups.filter(g=>g.length>1).map((g,i)=>{
      const points=g.map(id=>this.positions[id]),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),pad=.002;
      const x0=Math.min(...xs)-pad,x1=Math.max(...xs)+pad,y0=Math.min(...ys)-pad*.6,y1=Math.max(...ys)+pad*.6;
      return HiveMap.feature('LineString',[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]],{color:i%2?'#7896b3':'#b3955b'});
    }):[]);
    const selection=tasks.find(t=>t.id===this.selected);this.data('selection',selection?[HiveMap.feature('Point',HiveMap.coordinate(selection.x,selection.y))]:[]);
    if(this.followId&&this.positions[this.followId]&&!this.map.isEasing())this.map.jumpTo({center:this.positions[this.followId]});
    this.lastDrawTick=tick;
  }
  connectedGroups(actors,pairs,links){
    const groups=[],seen=new Set();for(const a of actors){if(seen.has(a.id))continue;const group=[],queue=[a.id];seen.add(a.id);while(queue.length){const id=queue.shift();group.push(id);for(const [x,y]of pairs){const next=x===id?y:y===id?x:null;if(next&&!seen.has(next)&&links[[x,y].sort().join('-')]){seen.add(next);queue.push(next);}}}groups.push(group);}return groups;
  }
  animate(){
    if(this.frame)return;
    let last=0;const loop=now=>{this.frame=requestAnimationFrame(loop);if(now-last<45||document.hidden||!this.active||!this.ready||document.getElementById('operations-view').hidden)return;last=now;this.draw(now);};this.frame=requestAnimationFrame(loop);
  }
  layer(name,visible){
    this.visibility[name]=visible;if(name==='trees')this.vegetation?.setVisible(visible&&this.tilted);
    const ids={flood:['hive-flood-fill','hive-flood-edge'],routes:['hive-routes','hive-trails'],communication:['hive-links','hive-packets','hive-islands'],actors:['hive-actors'],incidents:['hive-incidents','hive-selection']};
    if(this.map)for(const id of ids[name]||[]){if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',visible?'visible':'none');}
    for(const [key,marker]of this.markers){if((name==='actors'&&key.startsWith('actor'))||(name==='incidents'&&key.startsWith('incident')))marker.getElement().hidden=!visible;}
  }
  perspective(tilted){
    if(!this.ready)return;this.tilted=tilted;this.vegetation?.setVisible(tilted&&this.visibility.trees);
    for(const [id,value]of [['perspective-2d',!tilted],['perspective-3d',tilted]]){const el=document.getElementById(id);el.classList.toggle('active',value);el.setAttribute('aria-pressed',String(value));}
    if(this.map.getLayer('hive-buildings-3d'))this.map.setLayoutProperty('hive-buildings-3d','visibility',tilted?'visible':'none');
    this.map.easeTo({pitch:tilted?52:0,bearing:tilted?-18:0,zoom:this.map.getZoom(),duration:this.motionOK?900:0});
    this.notice(tilted?'3D buildings · illustrated vegetation · simulated flooding':'Real geography · all operations and flooding are simulated',false);
  }
  follow(id){this.followId=id;if(id&&this.ready){const a=this.state.actors.find(a=>a.id===id);if(a)this.map.easeTo({center:HiveMap.coordinate(a.x,a.y),zoom:15,duration:this.motionOK?650:0});}}
  stopFollowing(){this.followId='';document.getElementById('follow-actor').value='';}
  fit(duration=700){if(!this.ready||!this.state)return;this.stopFollowing();const points=[...this.state.actors,...this.state.tasks].map(a=>HiveMap.coordinate(a.x,a.y));if(!points.length)return;const bounds=new maplibregl.LngLatBounds();points.forEach(p=>bounds.extend(p));
    // Live missions span a real ~4 km area; never zoom out past the level where 3D buildings render.
    const cam=this.map.cameraForBounds(bounds,{padding:{top:85,bottom:115,left:70,right:70},maxZoom:15.5});if(!cam)return;this.map.easeTo({center:cam.center,zoom:Math.max(14.1,cam.zoom),duration:this.motionOK?duration:0});}
  focusTask(id){const t=this.state?.tasks.find(t=>t.id===id);if(t&&this.ready){this.stopFollowing();this.map.easeTo({center:HiveMap.coordinate(t.x,t.y),zoom:15.6,duration:this.motionOK?750:0});}}
  selectTask(id){this.selected=id;if(this.ready)this.syncMarkers();this.selectionCard();this.draw(performance.now());}
  selectionCard(){
    const el=document.getElementById('map-selection'),t=this.state?.tasks.find(t=>t.id===this.selected);el.hidden=!t;if(!t)return;
    const owner=this.state.actors.find(a=>a.id===t.owner);
    el.innerHTML=`<span class="selection-kicker">SELECTED INCIDENT · ${t.id}</span><strong>${t.title}</strong><span>${t.people} people · ${t.status} · ${owner?.name||'Unassigned'}</span><div><button data-inspect-task="${t.id}">Inspect decision →</button><button data-clear-selection aria-label="Clear selected incident">✕</button></div>`;
    el.querySelector('[data-inspect-task]').onclick=()=>this.inspectTask(t.id);
    el.querySelector('[data-clear-selection]').onclick=()=>{this.selected=null;this.selectionCard();this.draw(performance.now());};
  }
  inspectTask(id){document.getElementById('inspect-button').click();}
  zoomBy(amount){if(this.ready)this.map.easeTo({zoom:this.map.getZoom()+amount,duration:this.motionOK?250:0});}
  setActive(active){this.active=active;document.getElementById('map-selection').hidden=!active||!this.selected;}
  resize(){this.map?.resize();}
  reset(){this.positions={};this.previous={};this.trails={};this.lastTick=null;this.selected=null;this.stopFollowing();if(this.ready){this.perspective(true);setTimeout(()=>this.fit(0),0);}}
}
window.HiveMap=HiveMap;
