import{S as C}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{a as Y,D as k}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as T,g as s,d5 as J,au as W,C as q,m as Q}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const i={ERUPTION_INTENSITY:{min:.5,max:1.5},ERUPTION_FREQUENCY:{min:3,max:8},PROJECTILE_COUNT:{min:3,max:8},PROJECTILE_SIZE:{min:.001,max:.004},ARC_HEIGHT:{min:.01,max:.04},FLARE_LENGTH:{min:.08,max:.25},TIME_SPEED:{min:.8,max:1.2}};class I{eruptionsGroup;projectilesGroup;trailsGroup;splashGroup;eruptionPatterns=[];params;planetRadius;cosmicOriginTime;cosmicOffset;rng;projectilePool=[];trailPool=[];splashPool=[];static projectileVertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float temperature;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      
      vec3 pos = position;
      float deform = sin(time * 10.0 + position.x * 5.0) * 0.02;
      pos += normal * deform;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;static projectileFragmentShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float temperature;
    uniform vec3 baseColor;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    uniform float glowIntensity;
    
    void main() {
      vec3 coolColor = vec3(0.4, 0.08, 0.0);
      vec3 warmColor = vec3(0.9, 0.3, 0.05);
      vec3 hotColor = vec3(1.0, 0.8, 0.3);
      vec3 veryHotColor = vec3(1.2, 1.0, 0.8);
      
      vec3 color;
      if (temperature > 0.75) {
        color = mix(hotColor, veryHotColor, (temperature - 0.75) * 4.0);
      } else if (temperature > 0.5) {
        color = mix(warmColor, hotColor, (temperature - 0.5) * 4.0);
      } else if (temperature > 0.25) {
        color = mix(coolColor, warmColor, (temperature - 0.25) * 4.0);
      } else {
        color = coolColor;
      }
      
      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      vec3 normal = normalize(vWorldNormal);
      float dotNL = dot(normal, lightDir);
      float lighting = smoothstep(-0.3, 0.1, dotNL) * 0.3 + 0.7;
      
      float emission = glowIntensity * (0.8 + temperature * 0.4);
      color *= lighting;
      color += color * emission;
      
      float fresnel = pow(1.0 - abs(dot(normalize(vPosition), vNormal)), 2.0);
      color += veryHotColor * fresnel * 0.3 * temperature;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;static trailVertexShader=`
    varying vec2 vUv;
    varying float vAlpha;
    attribute float alpha;
    
    void main() {
      vUv = uv;
      vAlpha = alpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;static trailFragmentShader=`
    varying vec2 vUv;
    varying float vAlpha;
    
    uniform vec3 color;
    uniform float time;
    
    void main() {
      float fade = 1.0 - vUv.y;
      float alpha = fade * vAlpha * 0.6;
      
      vec3 finalColor = color * (0.5 + fade * 0.5);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;constructor(t,o={}){this.planetRadius=t;const e=o.seed||Math.floor(Math.random()*1e6);this.cosmicOriginTime=o.cosmicOriginTime||51408e4,this.cosmicOffset=e%3600*10,this.rng=new C(e),this.params={eruptionIntensity:o.eruptionIntensity||this.rng.uniform(i.ERUPTION_INTENSITY.min,i.ERUPTION_INTENSITY.max),eruptionFrequency:o.eruptionFrequency||this.rng.uniform(i.ERUPTION_FREQUENCY.min,i.ERUPTION_FREQUENCY.max),projectileCount:o.projectileCount||Math.floor(this.rng.uniform(i.PROJECTILE_COUNT.min,i.PROJECTILE_COUNT.max)),projectileSize:o.projectileSize||this.rng.uniform(i.PROJECTILE_SIZE.min,i.PROJECTILE_SIZE.max),arcHeight:o.arcHeight||this.rng.uniform(i.ARC_HEIGHT.min,i.ARC_HEIGHT.max),timeSpeed:o.timeSpeed||this.rng.uniform(i.TIME_SPEED.min,i.TIME_SPEED.max),seed:e,cosmicOriginTime:this.cosmicOriginTime,magmaLakes:o.magmaLakes||[]},this.eruptionsGroup=new T,this.projectilesGroup=new T,this.trailsGroup=new T,this.splashGroup=new T,this.eruptionsGroup.add(this.projectilesGroup),this.eruptionsGroup.add(this.trailsGroup),this.eruptionsGroup.add(this.splashGroup),this.generateEruptionPatterns(),this.initializeObjectPools()}generateEruptionPatterns(){let t=[];if(this.params.magmaLakes&&this.params.magmaLakes.length>0)t=this.params.magmaLakes.map(o=>{const e=o.position_3d||[0,0,1];return new s(e[0],e[1],e[2]).normalize().multiplyScalar(this.planetRadius*1.002)});else{const o=Math.floor(this.rng.uniform(3,8));for(let e=0;e<o;e++){const r=this.rng.uniform(0,2*Math.PI),l=this.rng.uniform(-1,1),n=Math.acos(l);t.push(new s(Math.sin(n)*Math.cos(r),Math.sin(n)*Math.sin(r),Math.cos(n)).multiplyScalar(this.planetRadius*1.002))}}this.eruptionPatterns=t.map((o,e)=>({id:e,position:o.clone(),intervalSeconds:this.rng.uniform(12,35),phaseOffset:this.rng.uniform(0,Math.PI*2),intensity:this.rng.uniform(.7,1.3)}))}initializeObjectPools(){for(let t=0;t<50;t++){const o=new J(this.params.projectileSize*this.planetRadius,8,6),e=new W({vertexShader:I.projectileVertexShader,fragmentShader:I.projectileFragmentShader,uniforms:{time:{value:0},temperature:{value:1},baseColor:{value:new q(1,.5,.1)},lightDirection:{value:new s(1,1,1).normalize()},lightPosition:{value:new s(0,0,0)},glowIntensity:{value:1}}}),r=new Q(o,e);r.visible=!1,this.projectilePool.push(r),this.projectilesGroup.add(r)}}createTrailSegment(t,o){}createSplash(t,o){}update(t,o){const r=(Y(this.cosmicOriginTime||k)+this.cosmicOffset)*this.params.timeSpeed,l=r%1e4;this.calculateCurrentProjectiles(r),this.projectilePool.forEach(n=>{const m=n.material;m.uniforms.time.value=l}),o!==void 0&&(this.eruptionsGroup.rotation.y=o)}calculateCurrentProjectiles(t){this.projectilePool.forEach(e=>{e.visible=!1});let o=0;for(const e of this.eruptionPatterns){const r=e.intervalSeconds,l=e.phaseOffset/(Math.PI*2)*r,n=t-l;if(n<0)continue;const m=Math.floor(n/r),p=3;for(let c=Math.max(0,m-p);c<=m;c++){const u=c*r+l,f=this.params.seed+e.id*1e3+c*13,h=new C(f),E=Math.floor(this.params.projectileCount*e.intensity*h.uniform(.8,1.2));for(let a=0;a<E;a++){const v=u+h.uniform(0,1),d=h.uniform(4,8)*e.intensity,P=v+d;if(t>=v&&t<=P&&o<this.projectilePool.length){const g=this.projectilePool[o];o++,this.renderProjectileAtTime(g,e,h,t,v,d,a)}}}}}renderProjectileAtTime(t,o,e,r,l,n,m){const p=e.uniform(0,Math.PI*2),c=e.uniform(i.FLARE_LENGTH.min,i.FLARE_LENGTH.max),u=o.position.clone().normalize(),f=new s,h=new s;Math.abs(u.z)<.9?f.crossVectors(u,new s(0,0,1)).normalize():f.crossVectors(u,new s(1,0,0)).normalize(),h.crossVectors(f,u).normalize();const E=(r-l)/n,a=Math.max(0,Math.min(1,E)),v=new s().addScaledVector(f,Math.cos(p)).addScaledVector(h,Math.sin(p)),d=c*this.planetRadius*a,P=v.clone().multiplyScalar(d),g=o.position.clone().add(P).normalize().multiplyScalar(this.planetRadius),y=this.params.arcHeight*this.planetRadius*o.intensity*e.uniform(.8,1.2);let S;a<.3?S=Math.sin(a*Math.PI/.3)*(a/.3):S=Math.exp(-(a-.3)*3)*Math.sin(a*Math.PI);const R=2+e.uniform(0,3),x=y*.3,N=e.uniform(0,Math.PI*2),j=Math.sin(a*R*Math.PI+N)*x*a,_=Math.cos(a*R*Math.PI*1.3+N)*x*.5*a,w=g.clone().normalize(),L=f.clone().multiplyScalar(j),z=h.clone().multiplyScalar(_),G=w.clone().multiplyScalar(y*S),M=g.clone().add(G).add(L).add(z);t.position.copy(M),t.visible=!0;const U=this.params.projectileSize*e.uniform(.7,1.3)*Math.sqrt(o.intensity);t.scale.setScalar(U/this.params.projectileSize);const F=e.uniform(.8,1)*o.intensity,A=Math.max(.4,F-(r-l)*.05),H=t.material;if(H.uniforms.temperature.value=A,a>.01){const D=Math.max(0,a-.01),b=this.calculateFlarePosition(o,e,D,n,m),V=M.clone().sub(b).normalize();t.lookAt(M.clone().add(V))}}calculateFlarePosition(t,o,e,r,l){const n=o.uniform(0,Math.PI*2),m=o.uniform(i.FLARE_LENGTH.min,i.FLARE_LENGTH.max),p=t.position.clone().normalize(),c=new s,u=new s;Math.abs(p.z)<.9?c.crossVectors(p,new s(0,0,1)).normalize():c.crossVectors(p,new s(1,0,0)).normalize(),u.crossVectors(c,p).normalize();const f=new s().addScaledVector(c,Math.cos(n)).addScaledVector(u,Math.sin(n)),h=m*this.planetRadius*e,E=f.clone().multiplyScalar(h),a=t.position.clone().add(E).normalize().multiplyScalar(this.planetRadius),v=this.params.arcHeight*this.planetRadius*t.intensity*o.uniform(.8,1.2);let d;e<.3?d=Math.sin(e*Math.PI/.3)*(e/.3):d=Math.exp(-(e-.3)*3)*Math.sin(e*Math.PI);const g=a.clone().normalize().clone().multiplyScalar(v*d);return a.clone().add(g)}updateLightPosition(t){this.projectilePool.forEach(o=>{const e=o.material;e.uniforms.lightPosition&&e.uniforms.lightPosition.value.copy(t)})}updateLightDirection(t){this.projectilePool.forEach(o=>{const e=o.material;e.uniforms.lightDirection&&e.uniforms.lightDirection.value.copy(t)})}updateFromThreeLight(t){this.updateLightPosition(t.position);const o=t.target.position.clone().sub(t.position).normalize();this.updateLightDirection(o)}addToScene(t,o){o&&this.eruptionsGroup.position.copy(o),t.add(this.eruptionsGroup)}getObject3D(){return this.eruptionsGroup}dispose(){this.projectilePool.forEach(t=>{t.geometry.dispose(),t.material.dispose()}),this.projectilePool=[],this.eruptionsGroup.clear()}}function K(O,t,o,e){const r=t.magma_lakes;if(!r||r.length===0)return null;const l=o||Math.floor(Math.random()*1e6),n=new C(l+1e4),m={eruptionIntensity:n.uniform(i.ERUPTION_INTENSITY.min,i.ERUPTION_INTENSITY.max),eruptionFrequency:n.uniform(i.ERUPTION_FREQUENCY.min,i.ERUPTION_FREQUENCY.max),projectileCount:Math.floor(n.uniform(i.PROJECTILE_COUNT.min,i.PROJECTILE_COUNT.max)),projectileSize:n.uniform(i.PROJECTILE_SIZE.min,i.PROJECTILE_SIZE.max),arcHeight:n.uniform(i.ARC_HEIGHT.min,i.ARC_HEIGHT.max),timeSpeed:n.uniform(i.TIME_SPEED.min,i.TIME_SPEED.max),seed:l+1e4,cosmicOriginTime:e,magmaLakes:r};return new I(O,m)}export{I as M,K as c};
