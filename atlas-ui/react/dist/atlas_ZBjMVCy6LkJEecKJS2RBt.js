import{S as z}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{a as ve,D as de}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as Me,g as v,C as q,au as pe,D as Ie,bE as be,m as we,i as Ee,j as K}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const t={LAKE_COUNT:{min:8,max:12},LAKE_SIZE:{min:.15,max:.55},LAKE_SIZE_VARIATION:{min:.6,max:1.4},HEAT_INTENSITY:{min:.8,max:1.5},FLOW_SPEED:{min:.002,max:.008},BUBBLE_ACTIVITY:{min:.6,max:1},GLOW_INTENSITY:{min:.8,max:1},TIME_SPEED:{min:.1,max:.3},SHAPE_COMPLEXITY:{min:3,max:8},SHAPE_IRREGULARITY:{min:.2,max:.6}};class Y{magmaGroup;magmaLakes=[];magmaFlows=[];params;cosmicOriginTime;cosmicOffset;static magmaVertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float timeSpeed;
    uniform float flowSpeed;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      
      vec3 pos = position;
      float slowTime = time * timeSpeed;
      
      float localRadius = length(pos.xy);
      float localAngle = atan(pos.y, pos.x);
      
      float radialFlow = sin(slowTime * 0.8 + localAngle * 4.0) * flowSpeed * 0.3;
      float angularFlow = cos(slowTime * 0.6 + localRadius * 20.0) * flowSpeed * 0.2;
      
      if (localRadius > 0.0) {
        vec2 radialDir = normalize(pos.xy);
        pos.xy += radialDir * radialFlow;
      }
      
      vec2 tangentialDir = vec2(-sin(localAngle), cos(localAngle));
      pos.xy += tangentialDir * angularFlow;
      
      float bubbleHeight = sin(slowTime * 1.5 + localRadius * 15.0 + localAngle * 3.0) * flowSpeed * 0.05;
      pos.z += bubbleHeight;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;static magmaFragmentShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    
    uniform float time;
    uniform float heatIntensity;
    uniform float bubbleActivity;
    uniform float glowIntensity;
    uniform vec3 magmaColor;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    uniform float flowSpeed;
    
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
      
      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(st);
        st *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }
    
    void main() {
      vec2 magmaUv1 = vUv * 4.0 + time * flowSpeed * vec2(0.5, 0.2);
      vec2 magmaUv2 = vUv * 7.0 + time * flowSpeed * vec2(-0.3, 0.4);
      vec2 magmaUv3 = vUv * 12.0 + time * flowSpeed * vec2(0.2, -0.6);
      vec2 magmaUv4 = vUv * 20.0 + time * flowSpeed * vec2(-0.1, 0.3);
      
      float magmaNoise1 = fbm(magmaUv1);
      float magmaNoise2 = fbm(magmaUv2);
      float magmaNoise3 = fbm(magmaUv3) * 0.5;
      float detailNoise = fbm(magmaUv4) * 0.3;
      
      vec2 flowDir = normalize(vUv - vec2(0.5));
      float flowPattern = fbm(vUv * 8.0 + flowDir * time * flowSpeed * 2.0) * 0.4;
      
      float combinedNoise = magmaNoise1 * 0.4 + magmaNoise2 * 0.25 + magmaNoise3 * 0.15 + detailNoise * 0.1 + flowPattern * 0.1;
      
      vec3 baseColor = magmaColor;
      
      float heatVariation = combinedNoise * heatIntensity;
      
      vec3 veryHotMagma = vec3(1.4, 1.0, 0.6);
      vec3 hotMagma = vec3(1.2, 0.8, 0.3);
      vec3 warmMagma = vec3(1.0, 0.5, 0.1);
      vec3 mediumMagma = vec3(0.9, 0.3, 0.05);
      vec3 coolMagma = vec3(0.7, 0.15, 0.0);
      vec3 coldMagma = vec3(0.4, 0.08, 0.0);
      
      vec3 finalColor = baseColor;
      
      if (heatVariation > 0.85) {
        finalColor = mix(finalColor, veryHotMagma, (heatVariation - 0.85) * 6.0);
      } else if (heatVariation > 0.65) {
        finalColor = mix(finalColor, hotMagma, (heatVariation - 0.65) * 4.0);
      } else if (heatVariation > 0.45) {
        finalColor = mix(finalColor, warmMagma, (heatVariation - 0.45) * 3.0);
      } else if (heatVariation > 0.25) {
        finalColor = mix(finalColor, mediumMagma, (heatVariation - 0.25) * 2.5);
      } else if (heatVariation > 0.1) {
        finalColor = mix(finalColor, coolMagma, (heatVariation - 0.1) * 2.0);
      } else {
        finalColor = mix(finalColor, coldMagma, (0.1 - heatVariation) * 3.0);
      }
      
      float flowTemperature = flowPattern * 0.3;
      if (flowTemperature > 0.15) {
        finalColor = mix(finalColor, hotMagma, flowTemperature);
      }
      
      float bubblePattern1 = sin(vUv.x * 18.0 + time * 3.2) * sin(vUv.y * 22.0 + time * 2.8);
      float bubblePattern2 = sin(vUv.x * 35.0 + time * 4.1) * sin(vUv.y * 28.0 + time * 3.5);
      float bubbleNoise1 = noise(vUv * 30.0 + time * 1.2) * bubbleActivity;
      float bubbleNoise2 = noise(vUv * 45.0 + time * 0.6) * bubbleActivity * 0.7;
      
      if (bubblePattern1 * bubbleNoise1 > 0.35) {
        finalColor = mix(finalColor, veryHotMagma, 0.5);
      }
      
      if (bubblePattern2 * bubbleNoise2 > 0.4) {
        finalColor = mix(finalColor, hotMagma, 0.3);
      }
      
      float convectionPattern = fbm(vUv * 6.0 + time * flowSpeed * 0.5);
      if (convectionPattern > 0.6) {
        finalColor = mix(finalColor, warmMagma, 0.2);
      }
      
      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      vec3 normal = normalize(vWorldNormal);
      float dotNL = dot(normal, lightDir);
      
      float dayNight = smoothstep(-0.3, 0.1, dotNL);
      
      float rimLight = 1.0 - abs(dotNL);
      rimLight = pow(rimLight, 3.0) * 0.1;
      
      float ambientStrength = 0.6;
      float lightIntensity = 0.4;
      
      float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
      
      float emission = glowIntensity * (0.8 + heatVariation * 0.4);
      
      finalColor *= totalLight;
      finalColor += finalColor * emission * 0.3;
      
      float alpha = 0.95;
      
      float distance = length(vUv - vec2(0.5));
      alpha *= smoothstep(0.5, 0.3, distance);
      
      alpha *= 0.9 + heatVariation * 0.1;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;constructor(i,e={}){const o=e.seed||123456789;this.cosmicOriginTime=e.cosmicOriginTime||51408e4,this.cosmicOffset=o%3600*10;const a=new z(o);this.params={heatIntensity:e.heatIntensity||a.uniform(t.HEAT_INTENSITY.min,t.HEAT_INTENSITY.max),flowSpeed:e.flowSpeed||a.uniform(t.FLOW_SPEED.min,t.FLOW_SPEED.max),bubbleActivity:e.bubbleActivity||a.uniform(t.BUBBLE_ACTIVITY.min,t.BUBBLE_ACTIVITY.max),glowIntensity:e.glowIntensity||a.uniform(t.GLOW_INTENSITY.min,t.GLOW_INTENSITY.max),timeSpeed:e.timeSpeed||a.uniform(t.TIME_SPEED.min,t.TIME_SPEED.max),seed:o,cosmicOriginTime:this.cosmicOriginTime,magmaLakes:e.magmaLakes||[]},this.magmaGroup=new Me,this.generateMagmaFlows(i)}generateMagmaFlows(i){const e=this.params.seed||123456789,o=new z(e),a=this.params.magmaLakes;if(a&&a.length>0)this.generateMagmaFromPython(i,a,o);else{const u=Math.floor(o.uniform(t.LAKE_COUNT.min,t.LAKE_COUNT.max));this.generateProceduralMagma(i,u,o)}}generateMagmaFromPython(i,e,o){e.forEach(a=>{this.createMagmaLake(i,a,o)})}generateProceduralMagma(i,e,o){for(let a=0;a<e;a++){const u=o.uniform(0,2*Math.PI),c=o.uniform(-1,1),p=Math.acos(c),d=o.uniform(0,1);let l;d<.3?l=[1,.8,.3,1]:d<.6?l=[.85,.27,0,1]:d<.85?l=[.7,.15,0,1]:l=[.6,.1,.2,1];const n={position_3d:[Math.sin(p)*Math.cos(u),Math.sin(p)*Math.sin(u),Math.cos(p)],radius:o.uniform(t.LAKE_SIZE.min,t.LAKE_SIZE.max),color:l,temperature:o.uniform(1500,2e3),bubble_activity:o.uniform(.6,1),glow_intensity:o.uniform(.8,1)};this.createMagmaLake(i,n,o)}}createMagmaLake(i,e,o){const a=e.position_3d||[0,0,1],u=e.radius||o.uniform(t.LAKE_SIZE.min,t.LAKE_SIZE.max),c=o.uniform(t.LAKE_SIZE_VARIATION.min,t.LAKE_SIZE_VARIATION.max),p=e.radius?.8*c:1.2*c,d=u*i*p,l={complexity:Math.floor(o.uniform(t.SHAPE_COMPLEXITY.min,t.SHAPE_COMPLEXITY.max)),irregularity:o.uniform(t.SHAPE_IRREGULARITY.min,t.SHAPE_IRREGULARITY.max),elongation:o.uniform(.6,1.5),rotation:o.uniform(0,Math.PI*2),seed:o.uniform(0,1e6)},n=new v(a[0],a[1],a[2]).normalize(),S=this.createMagmaLakeGeometry(d,o,i,n,l);let L=new q(.85,.27,0);e.color&&Array.isArray(e.color)&&(L=new q(e.color[0],e.color[1],e.color[2]));const D=new pe({vertexShader:Y.magmaVertexShader,fragmentShader:Y.magmaFragmentShader,uniforms:{time:{value:0},timeSpeed:{value:this.params.timeSpeed},heatIntensity:{value:this.params.heatIntensity},bubbleActivity:{value:e.bubble_activity||this.params.bubbleActivity},glowIntensity:{value:e.glow_intensity||this.params.glowIntensity},magmaColor:{value:L},flowSpeed:{value:this.params.flowSpeed},lightDirection:{value:new v(1,1,1).normalize()},lightPosition:{value:new v(0,0,0)}},transparent:!0,blending:be,depthWrite:!1,side:Ie}),w=new we(S,D);w.position.set(0,0,0),w.renderOrder=8,this.magmaLakes.push(w),this.magmaGroup.add(w)}createMagmaLakeGeometry(i,e,o,a,u){const c=Math.floor(i*60),p=Math.floor(e.uniform(-4,4)),d=Math.max(24,c+p),l=u||{complexity:Math.floor(e.uniform(t.SHAPE_COMPLEXITY.min,t.SHAPE_COMPLEXITY.max)),irregularity:e.uniform(t.SHAPE_IRREGULARITY.min,t.SHAPE_IRREGULARITY.max),elongation:e.uniform(.6,1.5),rotation:e.uniform(0,Math.PI*2),seed:Math.floor(e.uniform(0,1e6))},n=new z(l.seed),S=[],L=[],D=[],w=[],Q=i/o;let G=0;const y=[],m={noiseScale:10+n.uniform(-2,2),noise1:n.uniform(0,Math.PI*2),noise2:n.uniform(0,Math.PI*2),noise3:n.uniform(0,Math.PI*2),flowDirection:n.uniform(0,Math.PI*2),channel1:n.uniform(0,Math.PI*2),channel2:n.uniform(0,Math.PI*2),edge1:n.uniform(0,Math.PI*2),edge2:n.uniform(0,Math.PI*2),edge3:n.uniform(0,Math.PI*2),edge4:n.uniform(0,Math.PI*2),edge5:n.uniform(0,Math.PI*2),finger:n.uniform(0,Math.PI*2),perp:n.uniform(0,Math.PI*2)},$=s=>{let r=1;const M=s-l.rotation,f=Math.cos(M),h=Math.sin(M);r*=Math.sqrt(1/(f*f/(l.elongation*l.elongation)+h*h));for(let g=0;g<l.complexity;g++){const I=g/l.complexity*Math.PI*2+n.uniform(-.3,.3),R=n.uniform(.1,.3)*l.irregularity,U=n.uniform(.3,.6);let E=s-I;for(;E>Math.PI;)E-=Math.PI*2;for(;E<-Math.PI;)E+=Math.PI*2;const N=Math.exp(-(E*E)/(2*U*U));r+=R*N}const T=8,A=.05*l.irregularity;return r+=Math.sin(s*T+n.uniform(0,Math.PI*2))*A,r+=Math.sin(s*T*1.7+n.uniform(0,Math.PI*2))*A*.5,Math.max(.3,Math.min(1.5,r))};for(let s=0;s<=d;s++){y[s]=[];for(let r=0;r<=d;r++){const M=s/d*2-1,f=r/d*2-1,h=Math.sqrt(M*M+f*f),T=Math.atan2(f,M),A=$(T);if(h<=A){const g=h*Q,I=Math.atan2(f,M),R=Math.sin(g)*Math.cos(I),U=Math.sin(g)*Math.sin(I),E=Math.cos(g),N=new v(R,U,E),C=a.clone().normalize(),O=new v,Z=new v;Math.abs(C.z)<.9?O.crossVectors(C,new v(0,0,1)).normalize():O.crossVectors(C,new v(1,0,0)).normalize(),Z.crossVectors(O,C).normalize();const V=new v;V.addScaledVector(O,N.x),V.addScaledVector(Z,N.y),V.addScaledVector(C,N.z);const P=V.normalize();let H=0;const ee=(1-h)*.003,oe=Math.sin(g*m.noiseScale+I*3+m.noise1)*8e-4,te=Math.cos(g*7+I*m.noiseScale+m.noise2)*5e-4,ie=Math.sin(g*15+m.noise3)*Math.cos(I*12)*3e-4,ae=Math.sin(I*4+m.flowDirection)*4e-4;H=ee+oe+te+ie+ae,Math.sin(g*6+m.channel1)*Math.sin(I*8+m.channel2)>.3&&h>.3&&(H+=.0012);const x=P.multiplyScalar(o+o*(.002+H));S.push(x.x,x.y,x.z),L.push(P.x,P.y,P.z);const ne=.5+M*.5,se=.5+f*.5;D.push(ne,se),y[s][r]=G,G++;const W=A*.65;if(h>W){const b=Math.atan2(f,M),re=Math.sin(b*6+m.edge1)*.04+Math.sin(b*3+m.edge2)*.06,le=Math.sin(b*15+m.edge3)*.02+Math.sin(b*22+m.edge4)*.015,me=Math.sin(b*4+g*8+m.edge5)*.03,ce=Math.sin(b*12+m.finger)*.5+.5>.7?n.uniform(.15,.25):0,X=Math.pow((h-W)/(A-W),2),B=((re+le+me)*X+ce*X)*n.uniform(.12,.2)*l.irregularity,F=new v,j=new v;Math.abs(P.z)<.9?F.crossVectors(P,new v(0,0,1)).normalize():F.crossVectors(P,new v(1,0,0)).normalize(),j.crossVectors(P,F).normalize();const fe=Math.cos(b)*B*o,he=Math.sin(b)*B*o,ue=Math.sin(b*7+g*12+m.perp)*B*.3,ge=F.clone().multiplyScalar(fe+ue).add(j.clone().multiplyScalar(he));x.add(ge);const k=(G-1)*3;S[k]=x.x,S[k+1]=x.y,S[k+2]=x.z}}else y[s][r]=null}}for(let s=0;s<d;s++)for(let r=0;r<d;r++){const M=y[s][r],f=y[s+1][r],h=y[s][r+1],T=y[s+1][r+1];M!==null&&f!==null&&h!==null&&w.push(M,f,h),f!==null&&h!==null&&T!==null&&w.push(f,T,h)}const _=new Ee;return _.setAttribute("position",new K(S,3)),_.setAttribute("normal",new K(L,3)),_.setAttribute("uv",new K(D,2)),_.setIndex(w),_}addToScene(i,e){e&&this.magmaGroup.position.copy(e),i.add(this.magmaGroup)}update(i,e){const u=(ve(this.cosmicOriginTime||de)+this.cosmicOffset)*this.params.timeSpeed%1e4;[...this.magmaLakes,...this.magmaFlows].forEach(c=>{const p=c.material;p.uniforms.time.value=u}),e!==void 0&&(this.magmaGroup.rotation.y=e)}updateLightPosition(i){[...this.magmaLakes,...this.magmaFlows].forEach(e=>{const o=e.material;o.uniforms.lightPosition&&o.uniforms.lightPosition.value.copy(i)})}updateLightDirection(i){[...this.magmaLakes,...this.magmaFlows].forEach(e=>{const o=e.material;o.uniforms.lightDirection&&o.uniforms.lightDirection.value.copy(i)})}updateFromThreeLight(i){this.updateLightPosition(i.position);const e=i.target.position.clone().sub(i.position).normalize();this.updateLightDirection(e)}getObject3D(){return this.magmaGroup}dispose(){[...this.magmaLakes,...this.magmaFlows].forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.magmaLakes=[],this.magmaFlows=[],this.magmaGroup.clear()}}function Ne(J,i,e,o){const a=i.magma_lakes;if(!a||a.length===0)return null;const u=e||123456789,c=new z(u+9e3),p={heatIntensity:c.uniform(t.HEAT_INTENSITY.min,t.HEAT_INTENSITY.max),flowSpeed:c.uniform(t.FLOW_SPEED.min,t.FLOW_SPEED.max),bubbleActivity:c.uniform(t.BUBBLE_ACTIVITY.min,t.BUBBLE_ACTIVITY.max),glowIntensity:c.uniform(t.GLOW_INTENSITY.min,t.GLOW_INTENSITY.max),timeSpeed:c.uniform(t.TIME_SPEED.min,t.TIME_SPEED.max),seed:u+9e3,cosmicOriginTime:o,magmaLakes:a};return new Y(J,p)}export{Y as M,Ne as c};
