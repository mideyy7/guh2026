/* Procedural scenery, sampled inside mapped parks/woodland; not a tree inventory. */
'use strict';
class HiveVegetation {
  constructor(map){this.map=map;this.visible=true;this.built=false;this.count=0;}
  static inside(point,rings){
    const inRing=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x,y]=ring[i],[xx,yy]=ring[j];if((y>point[1])!==(yy>point[1])&&point[0]<(xx-x)*(point[1]-y)/(yy-y)+x)inside=!inside;}return inside;};
    return inRing(rings[0])&&!rings.slice(1).some(inRing);
  }
  sample(){
    const points=[],seen=new Set(),polygons=[];
    for(const layer of ['park','landcover']){
      const features=this.map.querySourceFeatures('openmaptiles',{sourceLayer:layer});
      for(const feature of features){if(layer==='landcover'&&feature.properties.class!=='wood')continue;const g=feature.geometry;if(g.type==='Polygon')polygons.push(g.coordinates);if(g.type==='MultiPolygon')polygons.push(...g.coordinates);}
    }
    let seed=814;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(const rings of polygons){const ring=rings[0];if(!ring?.length)continue;const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);const x0=Math.max(-2.286,Math.min(...xs)),x1=Math.min(-2.217,Math.max(...xs)),y0=Math.max(53.466,Math.min(...ys)),y1=Math.min(53.508,Math.max(...ys));
      for(let x=x0;x<x1;x+=.00021){for(let y=y0;y<y1;y+=.00013){const point=[x+(random()-.5)*.00013,y+(random()-.5)*.00008],key=point.map((v,i)=>Math.round(v/(i?.00011:.00018))).join(':');if(seen.has(key)||!HiveVegetation.inside(point,rings)||random()>.82)continue;seen.add(key);points.push({point,size:8+random()*7,tone:random()});if(points.length>=1800)return points;}}
    }return points;
  }
  add(){
    if(!window.THREE)return;
    this.layer={id:'hive-vegetation',type:'custom',renderingMode:'3d',onAdd:(map,gl)=>{
      this.camera=new THREE.Camera();this.scene=new THREE.Scene();this.scene.add(new THREE.AmbientLight(0xffffff,1.7));const sun=new THREE.DirectionalLight(0xffedc7,2.5);sun.position.set(-300,-150,600);this.scene.add(sun);
      this.renderer=new THREE.WebGLRenderer({canvas:map.getCanvas(),context:gl,antialias:true});this.renderer.autoClear=false;
      this.origin=maplibregl.MercatorCoordinate.fromLngLat([-2.25,53.487],0);this.scale=this.origin.meterInMercatorCoordinateUnits();
    },render:(gl,args)=>{
      if(!this.visible||!this.built)return;
      const raw=args.defaultProjectionData?.mainMatrix||args;
      const projection=new THREE.Matrix4().fromArray(raw),local=new THREE.Matrix4().makeTranslation(this.origin.x,this.origin.y,this.origin.z).scale(new THREE.Vector3(this.scale,-this.scale,this.scale));
      this.camera.projectionMatrix=projection.multiply(local);this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      this.renderer.resetState();this.renderer.render(this.scene,this.camera);this.renderer.resetState();
    },onRemove:()=>{this.scene?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.renderer?.dispose();}};
    const before=this.map.getStyle().layers.find(l=>l.type==='symbol')?.id;this.map.addLayer(this.layer,before);
    this.map.on('idle',()=>{if(!this.built||this.count<50)this.build();});
    this.map.on('sourcedata',e=>{if(e.sourceId==='openmaptiles'&&e.isSourceLoaded&&!this.built)this.build();});
    this.map.on('moveend',()=>{clearTimeout(this.buildTimer);this.buildTimer=setTimeout(()=>this.build(),600);});
    setTimeout(()=>{if(!this.built)this.build();},1800);
  }
  build(){
    if(!this.scene||this.map.getZoom()<12)return;
    const trees=this.sample();if(!trees.length)return;
    this.scene.children.filter(o=>o.isInstancedMesh).forEach(o=>{this.scene.remove(o);o.geometry.dispose();o.material.dispose();});
    const crowns=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),trees.length);
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.55,.8,1,5).rotateX(Math.PI/2),new THREE.MeshLambertMaterial({color:0x685843,flatShading:true}),trees.length);
    const dummy=new THREE.Object3D(),palette=[0x718347,0x839351,0x62783f,0x94a363,0x758e50];
    trees.forEach((tree,i)=>{const p=maplibregl.MercatorCoordinate.fromLngLat(tree.point),x=(p.x-this.origin.x)/this.scale,y=-(p.y-this.origin.y)/this.scale;
      dummy.position.set(x,y,tree.size*.62);dummy.rotation.set(0,0,tree.tone*Math.PI*2);dummy.scale.set(tree.size*.38,tree.size*.34,tree.size*.45);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);crowns.setColorAt(i,new THREE.Color(palette[Math.floor(tree.tone*palette.length)]));
      dummy.position.set(x,y,tree.size*.22);dummy.scale.set(1,1,tree.size*.45);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    });crowns.instanceMatrix.needsUpdate=true;trunks.instanceMatrix.needsUpdate=true;crowns.frustumCulled=false;trunks.frustumCulled=false;this.scene.add(trunks,crowns);this.count=trees.length;this.built=true;this.map.triggerRepaint();
  }
  setVisible(visible){this.visible=visible;this.map.triggerRepaint();}
}
window.HiveVegetation=HiveVegetation;
