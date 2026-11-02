import{d5 as Z,C as d,au as z,B as G,bE as Y,m as W,i as j,cU as q,av as C,cv as J,aJ as X,g as f,M as $,o as B,f as H,bA as K}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";import{g as Q,D as tt,a as et}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";class S{seed;constructor(t){this.seed=t}random(){return this.seed=(this.seed*9301+49297)%233280,this.seed/233280}uniform(t,e){return t+this.random()*(e-t)}randint(t,e){return Math.floor(this.random()*(e-t+1))+t}spherePosition(t){const e=this.random()*Math.PI*2,o=Math.acos(this.random()*2-1);return{x:t*Math.sin(o)*Math.cos(e),y:t*Math.sin(o)*Math.sin(e),z:t*Math.cos(o)}}colorVariation(t,e=.4){return{r:t.r*(.8+this.random()*e),g:t.g*(.8+this.random()*e),b:t.b*(.8+this.random()*e)}}}class N{mesh;material;geometry;params;static vertexShader=`
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `;static fragmentShader=`
    uniform vec3 atmosphereColor;
    uniform float atmosphereOpacity;
    uniform float fresnelPower;
    
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    
    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      float fresnel = pow(1.0 - abs(dot(normal, viewDir)), fresnelPower);
      
      vec3 color = atmosphereColor;
      
      float alpha = fresnel * atmosphereOpacity;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;constructor(t,e={}){this.params={type:e.type||"Thin",color:e.color||[.7,.7,.7,.2],width:e.width||12,opacity:e.opacity||.2,density:e.density||1};const o=t*(1+this.params.width/100);this.geometry=new Z(o,32,32);const i=new d(this.params.color[0],this.params.color[1],this.params.color[2]);this.material=new z({vertexShader:N.vertexShader,fragmentShader:N.fragmentShader,uniforms:{atmosphereColor:{value:i},atmosphereOpacity:{value:this.params.opacity},fresnelPower:{value:2}},transparent:!0,blending:Y,side:G,depthWrite:!1}),this.mesh=new W(this.geometry,this.material)}addToScene(t,e){e&&this.mesh.position.copy(e),t.add(this.mesh)}update(t){}updateParams(t){if(this.params={...this.params,...t},t.color){const e=new d(t.color[0],t.color[1],t.color[2]);this.material.uniforms.atmosphereColor.value=e}t.opacity!==void 0&&(this.material.uniforms.atmosphereOpacity.value=t.opacity),t.density!==void 0&&(this.material.uniforms.atmosphereOpacity.value=(this.params.opacity||.3)*t.density)}getObject3D(){return this.mesh}dispose(){this.geometry.dispose(),this.material.dispose()}}function at(E,t){let e=[.7,.7,.7,.15],o=12;if(t){if(t.color&&Array.isArray(t.color)){const r=t.color;e=[r[0],r[1],r[2],(r[3]||.15)*.7]}t.width&&(o=t.width)}const i={type:t?.type||"Thin",color:e,width:o,opacity:e[3],density:1};return new N(E,i)}const a={PARTICLE_COUNT:{min:25,max:150},SPEED:{min:.05,max:.5},SIZE:{min:.3,max:1.5},OPACITY:{min:.1,max:.3},TURBULENCE:{min:.1,max:.5},ROTATION_SPEED:{min:.01,max:.05},MOVEMENT_AMPLITUDE:{min:.005,max:.05},TIME_SPEED:{min:.1,max:3}};class U{particleSystem;material;geometry;params;particleCount;startTime;static vertexShader=`
    attribute float size;
    attribute vec3 customColor;
    attribute float speed;
    attribute float phase;
    
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSize;
    
    uniform float time;
    uniform float turbulence;
    uniform float movementAmplitude;
    
    void main() {
      vColor = customColor;
      vSize = size;
      
      vec3 pos = position;
      float timeWithPhase = time * speed + phase;
      
      pos.x += sin(timeWithPhase) * movementAmplitude * turbulence;
      pos.y += cos(timeWithPhase * 0.7) * (movementAmplitude * 0.5) * turbulence;
      pos.z += sin(timeWithPhase * 0.5) * (movementAmplitude * 0.8) * turbulence;
      
      float distanceFromCenter = length(pos.xy) / 2.0;
      vAlpha = (1.0 - distanceFromCenter) * (0.5 + 0.5 * sin(timeWithPhase * 2.0));
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;static fragmentShader=`
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSize;
    
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float dist = length(uv);
      
      float streak = 1.0 - smoothstep(0.0, 0.5, dist);
      float elongation = 1.0 - smoothstep(0.0, 0.3, abs(uv.x));
      streak *= elongation;
      
      float sizeVariation = vSize > 1.5 ? 1.2 : 0.8;
      streak *= sizeVariation;
      
      gl_FragColor = vec4(vColor, streak * vAlpha);
    }
  `;constructor(t,e={}){const o=e.seed||Math.floor(Math.random()*1e6),i=new S(o);this.startTime=e.startTime||o%1e4/1e3,this.params={color:e.color||new d(16777215),particleCount:e.particleCount||Math.floor(i.uniform(a.PARTICLE_COUNT.min,a.PARTICLE_COUNT.max)),speed:e.speed||i.uniform(a.SPEED.min,a.SPEED.max),size:e.size||i.uniform(a.SIZE.min,a.SIZE.max),opacity:e.opacity||i.uniform(a.OPACITY.min,a.OPACITY.max),turbulence:e.turbulence||i.uniform(a.TURBULENCE.min,a.TURBULENCE.max),rotationSpeed:e.rotationSpeed||i.uniform(a.ROTATION_SPEED.min,a.ROTATION_SPEED.max),movementAmplitude:e.movementAmplitude||i.uniform(a.MOVEMENT_AMPLITUDE.min,a.MOVEMENT_AMPLITUDE.max),timeSpeed:e.timeSpeed||i.uniform(a.TIME_SPEED.min,a.TIME_SPEED.max),seed:o,startTime:this.startTime},this.particleCount=this.params.particleCount,this.geometry=new j,this.material=this.createMaterial(),this.generateParticles(t),this.particleSystem=new q(this.geometry,this.material)}generateParticles(t){const e=new Float32Array(this.particleCount*3),o=new Float32Array(this.particleCount*3),i=new Float32Array(this.particleCount),r=new Float32Array(this.particleCount),m=new Float32Array(this.particleCount),u=this.params.color instanceof d?this.params.color:new d(this.params.color),h=this.params.seed||Math.floor(Math.random()*1e6),l=new S(h);for(let s=0;s<this.particleCount;s++){const p=l.spherePosition(t*l.uniform(1,1.1));e[s*3]=p.x,e[s*3+1]=p.y,e[s*3+2]=p.z;const v=l.colorVariation({r:u.r,g:u.g,b:u.b});o[s*3]=v.r,o[s*3+1]=v.g,o[s*3+2]=v.b,i[s]=this.params.size*l.uniform(.75,1.25),r[s]=this.params.speed*l.uniform(.6,1.4),m[s]=l.random()*Math.PI*2}this.geometry.setAttribute("position",new C(e,3)),this.geometry.setAttribute("customColor",new C(o,3)),this.geometry.setAttribute("size",new C(i,1)),this.geometry.setAttribute("speed",new C(r,1)),this.geometry.setAttribute("phase",new C(m,1))}createMaterial(){return new z({vertexShader:U.vertexShader,fragmentShader:U.fragmentShader,uniforms:{time:{value:0},turbulence:{value:this.params.turbulence},movementAmplitude:{value:this.params.movementAmplitude}},transparent:!0,blending:Y,depthWrite:!1})}addToScene(t,e){e&&this.particleSystem.position.copy(e),t.add(this.particleSystem)}update(t){const o=Q(tt,this.params.timeSpeed,this.startTime);this.material.uniforms.time.value=o,this.particleSystem.rotation.y=o*this.params.rotationSpeed}updateParams(t){this.params={...this.params,...t},t.turbulence!==void 0&&(this.material.uniforms.turbulence.value=t.turbulence)}getObject3D(){return this.particleSystem}dispose(){this.geometry.dispose(),this.material.dispose()}}function nt(E,t,e){const o=t.streaks||{},i=e||Math.floor(Math.random()*1e6),r=new S(i+3e3),m=o.count||Math.floor(r.uniform(a.PARTICLE_COUNT.min,a.PARTICLE_COUNT.max)),u=o.speed||r.uniform(a.SPEED.min,a.SPEED.max),h=r.uniform(a.SIZE.min,a.SIZE.max),l=r.uniform(a.OPACITY.min,a.OPACITY.max),s=r.uniform(a.TURBULENCE.min,a.TURBULENCE.max),p=r.uniform(a.ROTATION_SPEED.min,a.ROTATION_SPEED.max),v=r.uniform(a.MOVEMENT_AMPLITUDE.min,a.MOVEMENT_AMPLITUDE.max),T=r.uniform(a.TIME_SPEED.min,a.TIME_SPEED.max),A={color:o.color?new d().setRGB(o.color[0],o.color[1],o.color[2]):new d(16777215),particleCount:m,speed:u,size:h,opacity:l,turbulence:s,seed:i,rotationSpeed:p,movementAmplitude:v,timeSpeed:T};return new U(E,A)}const n={CLOUD_COUNT:{min:15,max:30},SIZE:{min:3.8,max:5.5},OPACITY:{min:.4,max:.9},DENSITY:{min:.5,max:2},ROTATION_SPEED:{min:.002,max:.008},MOVEMENT_AMPLITUDE:{min:.003,max:.02},PUFFINESS:{min:1,max:1.4},TIME_SPEED:{min:.1,max:3}};class x{cloudSystem;material;params;cloudCount;clouds=[];cosmicOriginTime;cosmicOffset;static vertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    uniform float time;
    uniform float movementAmplitude;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;

      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      vec3 pos = position;

      float slowTime = time * 0.01;
      pos += sin(slowTime + worldPosition.x * 0.01) * movementAmplitude * 0.1;
      pos += cos(slowTime * 0.8 + worldPosition.z * 0.01) * movementAmplitude * 0.1;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;static fragmentShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    uniform float time;
    uniform float opacity;
    uniform vec3 cloudColor;
    uniform float density;
    uniform vec2 noiseOffset;
    uniform float shapeVariation;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      
      vec2 u = f * f * (3.0 - 2.0 * f);
      
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    
    float fbm(vec2 st) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 0.0;
      
      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }
    
    void main() {

      vec2 center = vec2(0.5);
      float distFromCenter = length(vUv - center);

      float circularMask = 1.0 - smoothstep(0.1, 0.5, distFromCenter);

      float animSpeed1 = time * 0.002;
      float animSpeed2 = time * 0.001;
      float animSpeed3 = time * 0.0005;
      
      vec2 noiseUv1 = vUv * 4.0 + noiseOffset + vec2(animSpeed1, animSpeed1 * 0.7);
      float noise1 = fbm(noiseUv1) * 0.7;
      
      vec2 noiseUv2 = vUv * 8.0 + noiseOffset * 1.3 + vec2(animSpeed2, animSpeed2 * 0.8);
      float noise2 = fbm(noiseUv2) * 0.5;
      
      vec2 noiseUv3 = vUv * 16.0 + noiseOffset * 2.1 + vec2(animSpeed3, animSpeed3 * 0.9);
      float noise3 = fbm(noiseUv3) * 0.3;

      float cloudNoise = noise1 + noise2 + noise3;
      cloudNoise = smoothstep(0.2, 1.0, cloudNoise);

      float baseCloud = cloudNoise * circularMask * density;

      float densityFalloff = pow(circularMask, 1.5);

      float finalCloud = baseCloud * densityFalloff;

      finalCloud = pow(finalCloud, 0.8);

      vec3 finalColor = cloudColor;

      float colorVariation = 1.0 - distFromCenter * 0.3;
      finalColor *= colorVariation;

      float lightIntensity = dot(vNormal, normalize(vec3(0.8, 1.0, 0.6))) * 0.15 + 0.85;
      finalColor *= lightIntensity;

      float alpha = finalCloud * opacity;
      alpha *= (1.0 - distFromCenter * 0.5);

      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }

      vec3 planetNormal = normalize(vWorldPosition);
      float dotNL = dot(planetNormal, lightDir);

      float lightFactor = smoothstep(-0.2, 0.2, dotNL);
      alpha *= mix(0.3, 1.0, lightFactor);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;constructor(t,e={}){const o=e.seed||Math.floor(Math.random()*1e6),i=new S(o);this.cosmicOriginTime=e.cosmicOriginTime||51408e4,this.cosmicOffset=o%3600*10,this.params={color:e.color||new d(16777215),cloudCount:e.cloudCount||Math.floor(i.uniform(n.CLOUD_COUNT.min,n.CLOUD_COUNT.max)),size:e.size||i.uniform(n.SIZE.min,n.SIZE.max),opacity:e.opacity||i.uniform(n.OPACITY.min,n.OPACITY.max),density:e.density||i.uniform(n.DENSITY.min,n.DENSITY.max),rotationSpeed:e.rotationSpeed||i.uniform(n.ROTATION_SPEED.min,n.ROTATION_SPEED.max),movementAmplitude:e.movementAmplitude||i.uniform(n.MOVEMENT_AMPLITUDE.min,n.MOVEMENT_AMPLITUDE.max),puffiness:e.puffiness||i.uniform(n.PUFFINESS.min,n.PUFFINESS.max),timeSpeed:e.timeSpeed||i.uniform(n.TIME_SPEED.min,n.TIME_SPEED.max),seed:o,cosmicOriginTime:this.cosmicOriginTime},this.cloudCount=this.params.cloudCount,this.cloudSystem=new J,this.material=this.createMaterial(),this.generateClouds(t)}generateClouds(t){const e=this.params.color instanceof d?this.params.color:new d(this.params.color),o=this.params.seed||Math.floor(Math.random()*1e6),i=new S(o),r=this.cosmicOriginTime+this.cosmicOffset,m=this.params.cloudsFromPython;for(let u=0;u<this.cloudCount;u++){let h,l,s,p=e,v=this.params.size*i.uniform(.8,1.2);if(m&&u<m.length){const c=m[u];h=c.position[0]*t*1.05,l=c.position[1]*t*1.05,s=c.position[2]*t*1.05,c.color&&(p=new d().setRGB(c.color[0],c.color[1],c.color[2])),v=c.radius*t*.8}else{const c=i.uniform(0,2*Math.PI),R=i.uniform(-1,1),w=Math.acos(R),D=t*i.uniform(1.03,1.07);h=D*Math.sin(w)*Math.cos(c),l=D*Math.sin(w)*Math.sin(c),s=D*Math.cos(w)}const T=v*i.uniform(.3,.8),A=Math.max(8,Math.floor(T*15)),P=new X(T*2,T*2,A,A),b=new f(h,l,s);new f(0,0,0);const g=b.clone().normalize(),O=new f,F=new f;Math.abs(g.y)<.99?O.crossVectors(g,new f(0,1,0)).normalize():O.crossVectors(g,new f(1,0,0)).normalize(),F.crossVectors(g,O).normalize();const V=new $;V.makeBasis(O,F,g);const I=P.attributes.position,L=new f,k=Math.sqrt(h*h+l*l+s*s);P.applyMatrix4(V);for(let c=0;c<I.count;c++){L.fromBufferAttribute(I,c);const _=L.clone().add(b).clone().normalize().multiplyScalar(k).sub(b);I.setXYZ(c,_.x,_.y,_.z)}I.needsUpdate=!0,P.computeVertexNormals(),P.translate(h,l,s);const y=this.material.clone();y.uniforms.cloudColor.value=p,y.uniforms.density.value=this.params.density*i.uniform(.8,1.2),y.uniforms.noiseOffset.value=new B((r+i.uniform(0,100))%100,(r+i.uniform(0,100))%100),y.uniforms.shapeVariation.value=i.uniform(-1,1),y.uniforms.lightDirection.value=this.material.uniforms.lightDirection.value.clone(),y.uniforms.lightPosition.value=this.material.uniforms.lightPosition.value.clone();const M=new W(P,y);M.renderOrder=2,M.userData.isAtmosphericCloud=!0,M.userData.planetNormal=g.clone(),this.clouds.push(M),this.cloudSystem.add(M)}}createMaterial(){return new z({vertexShader:x.vertexShader,fragmentShader:x.fragmentShader,uniforms:{time:{value:0},opacity:{value:this.params.opacity},movementAmplitude:{value:this.params.movementAmplitude},cloudColor:{value:new d(16777215)},density:{value:this.params.density},noiseOffset:{value:new B(0,0)},shapeVariation:{value:0},lightDirection:{value:new f(1,1,1).normalize()},lightPosition:{value:new f(0,0,0)}},transparent:!0,blending:K,depthWrite:!1,side:H})}addToScene(t,e){e&&this.cloudSystem.position.copy(e),t.add(this.cloudSystem)}update(t,e){const i=(et(this.cosmicOriginTime)+this.cosmicOffset)*this.params.timeSpeed,r=i%1e4;this.clouds.forEach(m=>{const u=m.material;u.uniforms.time.value=r}),this.cloudSystem.rotation.y=i*this.params.rotationSpeed}updateParams(t){this.params={...this.params,...t},this.clouds.forEach(e=>{const o=e.material;t.opacity!==void 0&&(o.uniforms.opacity.value=t.opacity),t.movementAmplitude!==void 0&&(o.uniforms.movementAmplitude.value=t.movementAmplitude)})}updateLightPosition(t){this.clouds.forEach(e=>{const o=e.material;o.uniforms.lightPosition&&o.uniforms.lightPosition.value.copy(t)})}updateLightDirection(t){this.clouds.forEach(e=>{const o=e.material;o.uniforms.lightDirection&&o.uniforms.lightDirection.value.copy(t)})}updateFromThreeLight(t){this.updateLightPosition(t.position);const e=t.target.position.clone().sub(t.position).normalize();this.updateLightDirection(e)}getObject3D(){return this.cloudSystem}dispose(){this.clouds.forEach(t=>{t.geometry.dispose(),t.material.dispose()}),this.clouds=[],this.cloudSystem.clear()}}function rt(E,t,e,o){const i=t.clouds||[];if(i.length===0){const h=e||Math.floor(Math.random()*1e6),l=new S(h+4e3),s={color:new d(1,1,1),cloudCount:15,size:.6,opacity:.7,density:.8,seed:h,rotationSpeed:.005,movementAmplitude:.02,puffiness:1.5,timeSpeed:l.uniform(n.TIME_SPEED.min,n.TIME_SPEED.max),cosmicOriginTime:o};return new x(E,s)}const r=e||Math.floor(Math.random()*1e6),m=new S(r+4e3),u={color:new d(16777215),cloudCount:i.length,size:m.uniform(n.SIZE.min,n.SIZE.max),opacity:m.uniform(n.OPACITY.min,n.OPACITY.max),density:m.uniform(n.DENSITY.min,n.DENSITY.max),seed:r,rotationSpeed:m.uniform(n.ROTATION_SPEED.min,n.ROTATION_SPEED.max),movementAmplitude:m.uniform(n.MOVEMENT_AMPLITUDE.min,n.MOVEMENT_AMPLITUDE.max),puffiness:m.uniform(n.PUFFINESS.min,n.PUFFINESS.max),timeSpeed:m.uniform(n.TIME_SPEED.min,n.TIME_SPEED.max),cosmicOriginTime:o,cloudsFromPython:i};return new x(E,u)}export{U as A,S,x as a,rt as b,nt as c,N as d,at as e};
