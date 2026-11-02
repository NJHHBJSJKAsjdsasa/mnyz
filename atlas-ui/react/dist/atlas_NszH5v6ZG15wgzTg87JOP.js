import{S as C}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{a as H,D as U}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{C as E,cv as A,g as m,au as N,D as V,bA as D,m as z,M as L,i as O,j as b}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const r={PATCH_COUNT:{min:20,max:40},DENSITY:{min:.8,max:1.5},SIZE:{min:.08,max:.25},OPACITY:{min:.7,max:.95},TREE_HEIGHT:{min:.015,max:.035},TIME_SPEED:{min:.05,max:.2}};class T{vegetationGroup;vegetationPatches=[];treeLayers=[];params;cosmicOriginTime;cosmicOffset;static vegetationVertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float timeSpeed;
    uniform float treeHeight;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      
      // Posición del mundo para efectos de ruido y iluminación
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      
      // Movimiento sutil simulando viento en la vegetación
      vec3 pos = position;
      float slowTime = time * timeSpeed;
      
      // Movimiento más pronunciado en las partes altas (árboles)
      float heightFactor = smoothstep(0.0, 1.0, vUv.y);
      
      pos.x += sin(slowTime + worldPosition.z * 0.1) * treeHeight * 0.1 * heightFactor;
      pos.z += cos(slowTime * 0.7 + worldPosition.x * 0.1) * treeHeight * 0.08 * heightFactor;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;static vegetationFragmentShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float opacity;
    uniform vec3 vegetationColor;
    uniform float density;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    uniform float treeHeight;
    
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
      
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    
    float fbm(vec2 st) {
      float value = 0.0;
      float amplitude = 0.5;
      
      for (int i = 0; i < 3; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }
    
    void main() {
      vec2 center = vec2(0.5);
      float distFromCenter = length(vUv - center);
      
      vec2 noiseUv1 = vUv * 12.0 + time * 0.008;
      float vegetationNoise1 = fbm(noiseUv1);
      
      vec2 noiseUv2 = vUv * 6.0 + time * 0.005;
      float vegetationNoise2 = fbm(noiseUv2);
      
      vec2 noiseUv3 = vUv * 20.0 + time * 0.012;
      float vegetationNoise3 = fbm(noiseUv3) * 0.5;
      
      float combinedNoise = vegetationNoise1 * 0.6 + vegetationNoise2 * 0.3 + vegetationNoise3 * 0.1;
      
      vec3 baseColor = vegetationColor;
      
      float colorVariation = 0.7 + combinedNoise * 0.6;
      
      float leafPattern = sin(vUv.x * 15.0) * sin(vUv.y * 12.0) * 0.15;
      colorVariation += leafPattern;
      
      vec3 finalColor = baseColor * colorVariation;
      
      vec3 darkGreen = vec3(0.15, 0.35, 0.12);
      vec3 lightGreen = vec3(0.25, 0.50, 0.18);
      vec3 brownTone = vec3(0.35, 0.25, 0.15);
      
      if (combinedNoise < 0.3) {
        finalColor = mix(finalColor, darkGreen, 0.4);
      } else if (combinedNoise > 0.7) {
        finalColor = mix(finalColor, lightGreen, 0.3);
      }
      
      if (vegetationNoise3 > 0.8) {
        finalColor = mix(finalColor, brownTone, 0.2);
      }
      
      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      vec3 planetNormal = normalize(vWorldPosition);
      float dotNL = dot(planetNormal, lightDir);
      
      float lighting = smoothstep(-0.3, 0.8, dotNL);
      lighting = mix(0.3, 1.0, lighting);
      
      float subsurface = pow(max(0.0, dot(vWorldNormal, lightDir)), 0.8) * 0.4;
      lighting += subsurface;
      
      float ambientOcclusion = 1.0 - (combinedNoise * 0.2);
      lighting *= ambientOcclusion;
      
      finalColor *= lighting;
      
      float alpha = opacity * density;
      
      float organicMask = smoothstep(0.2, 1.0, combinedNoise);
      
      float radialFade = 1.0 - smoothstep(0.3, 0.9, distFromCenter);
      
      alpha *= organicMask * radialFade;
      
      alpha *= (0.8 + sin(vUv.x * 25.0) * sin(vUv.y * 30.0) * 0.15);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;constructor(t,e={}){const o=e.seed||Math.floor(Math.random()*1e6);this.cosmicOriginTime=e.cosmicOriginTime||51408e4,this.cosmicOffset=o%3600*10;const n=new C(o);this.params={density:e.density||n.uniform(r.DENSITY.min,r.DENSITY.max),color:e.color||new E(2972221),opacity:e.opacity||n.uniform(r.OPACITY.min,r.OPACITY.max),size:e.size||n.uniform(r.SIZE.min,r.SIZE.max),treeHeight:e.treeHeight||n.uniform(r.TREE_HEIGHT.min,r.TREE_HEIGHT.max),timeSpeed:e.timeSpeed||n.uniform(r.TIME_SPEED.min,r.TIME_SPEED.max),seed:o,cosmicOriginTime:this.cosmicOriginTime,vegetationPatches:e.vegetationPatches||[]},this.vegetationGroup=new A,this.generateVegetation(t)}generateVegetation(t){const e=this.params.seed||Math.floor(Math.random()*1e6),o=new C(e),n=this.params.vegetationPatches;let i=0;n&&n.length>0?(i=n.length,this.generateVegetationFromPython(t,n,o)):(i=Math.floor(o.uniform(r.PATCH_COUNT.min,r.PATCH_COUNT.max)),this.generateProceduralVegetation(t,i,o))}generateVegetationFromPython(t,e,o){e.forEach((n,i)=>{this.createVegetationPatch(t,n,o,i)})}generateProceduralVegetation(t,e,o){for(let n=0;n<e;n++){const i=o.uniform(0,2*Math.PI),s=o.uniform(-1,1),a=Math.acos(s),c={position_3d:[Math.sin(a)*Math.cos(i),Math.sin(a)*Math.sin(i),Math.cos(a)],size:o.uniform(r.SIZE.min,r.SIZE.max),color:[o.uniform(.1,.4),o.uniform(.4,.8),o.uniform(.1,.3)]};this.createVegetationPatch(t,c,o,n)}}createVegetationPatch(t,e,o,n){const i=e.position_3d||e.position||[0,0,1],s=(e.size||this.params.size)*t;let a=this.params.color instanceof E?this.params.color:new E(this.params.color);e.color&&Array.isArray(e.color)&&(a=new E(e.color[0],e.color[1],e.color[2]));const c=new m(i[0],i[1],i[2]).normalize();this.createVegetationBase(t,c,s,a,o),this.createTreeLayer(t,c,s,a,o)}createVegetationBase(t,e,o,n,i){const s=this.createOrganicVegetationGeometry(t,e,o,i),a=new N({vertexShader:T.vegetationVertexShader,fragmentShader:T.vegetationFragmentShader,uniforms:{time:{value:0},timeSpeed:{value:this.params.timeSpeed},opacity:{value:this.params.opacity},vegetationColor:{value:n},density:{value:this.params.density},treeHeight:{value:this.params.treeHeight},lightDirection:{value:new m(1,1,1).normalize()},lightPosition:{value:new m(0,0,0)}},transparent:!0,blending:D,depthWrite:!1,side:V}),c=new z(s,a);c.renderOrder=3,this.vegetationPatches.push(c),this.vegetationGroup.add(c)}createTreeLayer(t,e,o,n,i){const s=Math.floor(i.uniform(8,20));for(let a=0;a<s;a++){const c=i.uniform(0,Math.PI*2),y=i.uniform(0,o*.8),x=Math.cos(c)*y,M=Math.sin(c)*y,f=new m,g=new m;Math.abs(e.y)<.99?f.crossVectors(e,new m(0,1,0)).normalize():f.crossVectors(e,new m(1,0,0)).normalize(),g.crossVectors(e,f).normalize();const v=e.clone().multiplyScalar(t*1.002);v.addScaledVector(f,x),v.addScaledVector(g,M);const p=i.uniform(.008,.02)*t,l=this.createSingleTreeGeometry(p,i),h=v.clone().normalize(),d=new L,u=new m,P=new m;Math.abs(h.y)<.99?u.crossVectors(h,new m(0,1,0)).normalize():u.crossVectors(h,new m(1,0,0)).normalize(),P.crossVectors(h,u).normalize(),d.makeBasis(u,P,h),l.applyMatrix4(d),l.translate(v.x,v.y,v.z);const w=n.clone().multiplyScalar(i.uniform(.6,.9)),I=new N({vertexShader:T.vegetationVertexShader,fragmentShader:T.vegetationFragmentShader,uniforms:{time:{value:0},timeSpeed:{value:this.params.timeSpeed},opacity:{value:this.params.opacity*i.uniform(.7,.9)},vegetationColor:{value:w},density:{value:this.params.density*i.uniform(.8,1.2)},treeHeight:{value:this.params.treeHeight},lightDirection:{value:new m(1,1,1).normalize()},lightPosition:{value:new m(0,0,0)}},transparent:!0,blending:D,depthWrite:!1,side:V}),S=new z(l,I);S.renderOrder=4,this.treeLayers.push(S),this.vegetationGroup.add(S)}}createOrganicVegetationGeometry(t,e,o,n){const i=[],s=[],a=[],c=new m,y=new m;Math.abs(e.y)<.99?c.crossVectors(e,new m(0,1,0)).normalize():c.crossVectors(e,new m(1,0,0)).normalize(),y.crossVectors(e,c).normalize();const x=e.clone().multiplyScalar(t*1.0005);let M=0;const f=Math.floor(n.uniform(20,40)),g=[];for(let l=0;l<f;l++){const h=l/f*Math.PI*2,d=h*3,u=Math.sin(d+n.uniform(0,Math.PI*2))*.3+1,P=n.uniform(.6,1)*u,w=o*P,I=Math.cos(h)*w,S=Math.sin(h)*w;g.push({x:I,y:S,u:(I/o+1)*.5,v:(S/o+1)*.5})}i.push(x.x,x.y,x.z),a.push(.5,.5);const v=M++;for(const l of g){const d=x.clone().addScaledVector(c,l.x).addScaledVector(y,l.y).clone().normalize(),u=this.noise2D(l.x*5,l.y*5,n)*2e-4,P=d.multiplyScalar(t*(1.0005+u));i.push(P.x,P.y,P.z),a.push(l.u,l.v),M++}for(let l=0;l<g.length;l++){const h=(l+1)%g.length,d=l+1,u=h+1;s.push(v,d,u)}const p=new O;return p.setAttribute("position",new b(i,3)),p.setAttribute("uv",new b(a,2)),p.setIndex(s),p.computeVertexNormals(),p}createSingleTreeGeometry(t,e){const o=t*e.uniform(.8,1.5),n=t*e.uniform(.4,.8),i=[-n/2,0,0,n/2,0,0,-n/2,o,0,n/2,0,0,n/2,o,0,-n/2,o,0],s=[0,0,1,0,0,1,1,0,1,1,0,1],a=new O;return a.setAttribute("position",new b(i,3)),a.setAttribute("uv",new b(s,2)),a.computeVertexNormals(),a}noise2D(t,e,o){const n=this.params.seed||0,i=(l,h)=>{const d=l*12.9898+h*78.233+n;return Math.sin(d)*43758.5453%1},s=Math.floor(t),a=Math.floor(e),c=t-s,y=e-a,x=Math.abs(i(s,a)),M=Math.abs(i(s+1,a)),f=Math.abs(i(s,a+1)),g=Math.abs(i(s+1,a+1)),v=x*(1-c)+M*c,p=f*(1-c)+g*c;return v*(1-y)+p*y}addToScene(t,e){e&&this.vegetationGroup.position.copy(e),t.add(this.vegetationGroup)}update(t,e){const i=(H(this.cosmicOriginTime||U)+this.cosmicOffset)*this.params.timeSpeed%1e4;[...this.vegetationPatches,...this.treeLayers].forEach(s=>{const a=s.material;a.uniforms.time.value=i}),e!==void 0&&(this.vegetationGroup.rotation.y=e)}updateLightPosition(t){[...this.vegetationPatches,...this.treeLayers].forEach(e=>{const o=e.material;o.uniforms.lightPosition&&o.uniforms.lightPosition.value.copy(t)})}updateLightDirection(t){[...this.vegetationPatches,...this.treeLayers].forEach(e=>{const o=e.material;o.uniforms.lightDirection&&o.uniforms.lightDirection.value.copy(t)})}updateFromThreeLight(t){this.updateLightPosition(t.position);const e=t.target.position.clone().sub(t.position).normalize();this.updateLightDirection(e)}updateParams(t){this.params={...this.params,...t},[...this.vegetationPatches,...this.treeLayers].forEach(e=>{const o=e.material;t.opacity!==void 0&&(o.uniforms.opacity.value=t.opacity),t.density!==void 0&&(o.uniforms.density.value=t.density),t.timeSpeed!==void 0&&(o.uniforms.timeSpeed.value=t.timeSpeed)})}getObject3D(){return this.vegetationGroup}dispose(){[...this.vegetationPatches,...this.treeLayers].forEach(t=>{t.geometry.dispose(),t.material.dispose()}),this.vegetationPatches=[],this.treeLayers=[],this.vegetationGroup.clear()}}function W(G,t,e,o){const n=t.vegetation,i=e||Math.floor(Math.random()*1e6),s=new C(i+8e3),a={color:new E(2972221),density:s.uniform(r.DENSITY.min,r.DENSITY.max),opacity:s.uniform(r.OPACITY.min,r.OPACITY.max),size:s.uniform(r.SIZE.min,r.SIZE.max),treeHeight:s.uniform(r.TREE_HEIGHT.min,r.TREE_HEIGHT.max),timeSpeed:s.uniform(r.TIME_SPEED.min,r.TIME_SPEED.max),seed:i+8e3,cosmicOriginTime:o,vegetationPatches:n};return new T(G,a)}export{T as V,W as c};
