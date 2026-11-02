import{S as T}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as f,g as _,a as C}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{C as h,cv as E,g as y,au as g,D as S,bE as w,dh as N,di as R,m as M}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const c={NETWORK_DENSITY:{min:50,max:100},BRANCHING_FACTOR:{min:12,max:15},CHANNEL_WIDTH:{min:.01,max:.03},HEARTBEAT_RATE:{min:30,max:90},PULSE_WAVE_SPEED:{min:1,max:3},PULSE_INTENSITY:{min:1,max:2.5},NETWORK_EMISSION:{min:4,max:8}};class v{networkGroup;nodes=[];connections=[];channelMeshes=[];params;startTime;planetRadius;material;orbitalVisibilityFactor=1;temperatureActivationFactor=1;static channelVertexShader=`
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vDistanceToCenter;
    
    void main() {
      vUv = uv;
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);

      vDistanceToCenter = abs(uv.y - 0.5) * 2.0;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;static channelFragmentShader=`
    uniform float time;
    uniform vec3 arteryColor;
    uniform vec3 veinColor;
    uniform vec3 pulseColor;
    uniform float heartbeatRate;
    uniform float pulseWaveSpeed;
    uniform float pulseIntensity;
    uniform float networkEmission;
    uniform float channelType;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vDistanceToCenter;
    
    void main() {

      float heartbeat = (heartbeatRate / 60.0) * time;
      float pulse = sin(heartbeat * 6.28318) * 0.5 + 0.5;

      float pulseWave = sin((vUv.x * 10.0) - (time * pulseWaveSpeed * 5.0));
      pulseWave = pulseWave * 0.5 + 0.5;

      float totalPulse = mix(pulse, pulseWave, 0.6) * pulseIntensity;

      vec3 baseColor;
      if (channelType > 0.75) {
        baseColor = arteryColor;
      } else if (channelType > 0.25) {
        baseColor = veinColor;
      } else {
        baseColor = veinColor * 0.6;
      }

      vec3 finalColor = mix(baseColor, pulseColor, totalPulse * 0.7);

      float edgeFactor = 1.0 - smoothstep(0.3, 1.0, vDistanceToCenter);

      float emission = networkEmission * (0.5 + channelType * 0.5) * edgeFactor;
      
      gl_FragColor = vec4(finalColor * emission, edgeFactor * 0.9);
    }
  `;constructor(n,e={}){this.planetRadius=n;const s=e.seed||Math.floor(Math.random()*1e6),t=new T(s);this.startTime=e.startTime||s%1e4/1e3;const a=e.arteryColor instanceof h?e.arteryColor:new h(1,.8,.2),i=e.veinColor instanceof h?e.veinColor:new h(1,.3,0),r=e.capillaryColor instanceof h?e.capillaryColor:new h(.8,.2,0),o=e.pulseColor instanceof h?e.pulseColor:new h(1,1,.8);this.params={networkDensity:e.networkDensity||Math.floor(t.uniform(c.NETWORK_DENSITY.min,c.NETWORK_DENSITY.max)),branchingFactor:e.branchingFactor||Math.floor(t.uniform(c.BRANCHING_FACTOR.min,c.BRANCHING_FACTOR.max)),channelWidth:e.channelWidth||t.uniform(c.CHANNEL_WIDTH.min,c.CHANNEL_WIDTH.max),heartbeatRate:e.heartbeatRate||t.uniform(c.HEARTBEAT_RATE.min,c.HEARTBEAT_RATE.max),pulseWaveSpeed:e.pulseWaveSpeed||t.uniform(c.PULSE_WAVE_SPEED.min,c.PULSE_WAVE_SPEED.max),pulseIntensity:e.pulseIntensity||t.uniform(c.PULSE_INTENSITY.min,c.PULSE_INTENSITY.max),networkPattern:e.networkPattern||(t.random()>.5?"organic":"dendritic"),arteryColor:a,veinColor:i,capillaryColor:r,pulseColor:o,networkEmission:e.networkEmission||t.uniform(c.NETWORK_EMISSION.min,c.NETWORK_EMISSION.max),seed:s,startTime:this.startTime,timeSpeed:e.timeSpeed||t.uniform(.5,2),orbitalData:e.orbitalData,currentTime:e.currentTime||0,planetTemperature:e.planetTemperature||0},this.temperatureActivationFactor=this.calculateTemperatureActivation(),this.orbitalVisibilityFactor=this.calculateOrbitalVisibility(),this.networkGroup=new E,this.generateVascularNetwork(t),this.createMaterials(),this.createChannelGeometries()}generateVascularNetwork(n){const e=this.params.networkDensity;for(let s=0;s<e;s++){const t=n.uniform(0,Math.PI*2),a=Math.acos(n.uniform(-1,1)),i=new y(Math.sin(a)*Math.cos(t)*this.planetRadius,Math.sin(a)*Math.sin(t)*this.planetRadius,Math.cos(a)*this.planetRadius);let r;const o=n.random();o<.1?r="artery":o<.4?r="vein":r="capillary",this.nodes.push({position:i,connections:[],nodeType:r,pulsePhase:n.random()*Math.PI*2})}this.connectNetworkNodes(n)}connectNetworkNodes(n){const e=this.planetRadius*.3,s=this.params.branchingFactor;for(let t=0;t<this.nodes.length;t++){const a=this.nodes[t],i=[];for(let o=0;o<this.nodes.length;o++){if(t===o)continue;const l=a.position.distanceTo(this.nodes[o].position);l<e&&i.push({index:o,distance:l})}i.sort((o,l)=>o.distance-l.distance);let r;switch(a.nodeType){case"artery":r=Math.min(s+2,i.length);break;case"vein":r=Math.min(s,i.length);break;case"capillary":r=Math.min(Math.floor(s*.6),i.length);break}for(let o=0;o<r;o++){const l=i[o].index,u=this.nodes[l];if(a.connections.includes(l)||u.connections.includes(t))continue;a.connections.push(l),u.connections.push(t);let d;a.nodeType==="artery"||u.nodeType==="artery"?d="artery":a.nodeType==="vein"||u.nodeType==="vein"?d="vein":d="capillary";const b=this.createCurvedPath(a.position,u.position,n);let p;switch(d){case"artery":p=this.params.channelWidth*this.planetRadius*2;break;case"vein":p=this.params.channelWidth*this.planetRadius*1.2;break;case"capillary":p=this.params.channelWidth*this.planetRadius*.6;break}this.connections.push({from:t,to:l,path:b,connectionType:d,width:p})}}}createCurvedPath(n,e,s){const t=[n.clone()],a=8;for(let i=1;i<a;i++){const r=i/a,o=n.clone().lerp(e,r);o.normalize().multiplyScalar(this.planetRadius);const l=new y((s.random()-.5)*.1,(s.random()-.5)*.1,(s.random()-.5)*.1);o.add(l),o.normalize().multiplyScalar(this.planetRadius),t.push(o)}return t.push(e.clone()),t}createMaterials(){this.material=new g({vertexShader:v.channelVertexShader,fragmentShader:v.channelFragmentShader,uniforms:{time:{value:0},arteryColor:{value:this.params.arteryColor},veinColor:{value:this.params.veinColor},pulseColor:{value:this.params.pulseColor},heartbeatRate:{value:this.params.heartbeatRate},pulseWaveSpeed:{value:this.params.pulseWaveSpeed},pulseIntensity:{value:this.params.pulseIntensity},networkEmission:{value:this.params.networkEmission},channelType:{value:.5}},transparent:!0,blending:w,side:S,depthWrite:!1})}createChannelGeometries(){this.connections.forEach(n=>{const e=new N(n.path),s=new R(e,32,n.width*.5,4,!1),t=this.material.clone();let a;switch(n.connectionType){case"artery":a=1;break;case"vein":a=.5;break;case"capillary":a=0;break}t.uniforms.channelType.value=a;const i=new M(s,t);i.renderOrder=6,this.channelMeshes.push(i),this.networkGroup.add(i)})}calculateTemperatureActivation(){return 1}calculateOrbitalVisibility(){if(!this.params.orbitalData||!this.params.orbitalData.enabled)return 1;const n=this.params.cosmicOriginTime||f,t=C(n)/(365.25*24*3600)%this.params.orbitalData.cycle_duration_years/this.params.orbitalData.cycle_duration_years,a=this.params.orbitalData.visible_duration_years/this.params.orbitalData.cycle_duration_years;if(t<=a){const i=t/a;return i<.1?i/.1:i>.9?(1-i)/.1:1}return 0}update(n,e){const s=this.params.cosmicOriginTime||f,t=_(s,this.params.timeSpeed,this.startTime);this.orbitalVisibilityFactor=this.calculateOrbitalVisibility();const a=this.temperatureActivationFactor*this.orbitalVisibilityFactor;a>0?this.channelMeshes.forEach(i=>{const r=i.material;r.uniforms.time.value=t,r.uniforms.networkEmission.value=this.params.networkEmission*a,r.uniforms.pulseIntensity.value=this.params.pulseIntensity*a,i.visible=!0}):this.channelMeshes.forEach(i=>{i.visible=!1}),e!==void 0&&(this.networkGroup.rotation.y=e)}addToScene(n,e){e&&this.networkGroup.position.copy(e),n.add(this.networkGroup)}getObject3D(){return this.networkGroup}dispose(){this.channelMeshes.forEach(n=>{n.geometry.dispose(),n.material.dispose()}),this.networkGroup.clear(),this.nodes=[],this.connections=[],this.channelMeshes=[]}}function x(m,n,e){const s=m?.seeds?.planet_seed||Math.floor(Math.random()*1e6),t=m?.original_planet_data?.surface_temperature||0,a=m?.timing?.elapsed_time?m.timing.elapsed_time/(365.25*24*3600):0,i=m?.original_planet_data?.orbital_period_seconds?m.original_planet_data.orbital_period_seconds/(365.25*24*3600):1,r=m?.lava_rivers_data||{},o=new T(s+10001),l=r.cycle_duration_years||o.uniform(i*.3,i*.6),u={enabled:!1,cycle_duration_years:l,visible_duration_years:r.visible_duration_years||o.uniform(l*.6,l*.8)},d={seed:s+1e4,planetTemperature:t,orbitalData:u,currentTime:a,cosmicOriginTime:m?.timing?.cosmic_origin_time};return new v(n,d)}export{v as L,x as c};
