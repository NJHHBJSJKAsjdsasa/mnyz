import{S as b}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{a as F,D as N}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{C as n,cv as W,g as r,aJ as _,M as G,m as H,au as O,f as U,bE as z,cR as k}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const t={FLOW_COUNT:{min:20,max:35},FLOW_LENGTH:{min:.4,max:1.2},FLOW_WIDTH:{min:.015,max:.08},FLOW_INTENSITY:{min:1.5,max:3},FLOW_SPEED:{min:.05,max:.3},PULSE_SPEED:{min:.5,max:1.2},TURBULENCE:{min:.8,max:2},EMISSIVE_INTENSITY:{min:3,max:5},GLOW_RADIUS:{min:1.1,max:1.3},TIME_SPEED:{min:.1,max:2},EMERGENCE_HEIGHT:{min:.01,max:.03}};class d{lavaGroup;lavaFlows=[];material;params;startTime;static vertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying float vEmergence;
    
    uniform float time;
    uniform float flowSpeed;
    uniform float turbulence;
    uniform float emergenceHeight;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      
      vec3 pos = position;
      
      float flowProgress = vUv.x;
      
      float emergenceWave = sin((flowProgress * 3.14159 * 2.0) - time * flowSpeed * 2.0);
      
      emergenceWave += sin((flowProgress * 6.28318) + time * flowSpeed) * 0.3;
      
      float edgeFade = smoothstep(0.0, 0.1, flowProgress) * smoothstep(1.0, 0.9, flowProgress);
      emergenceWave *= edgeFade;
      
      float maxEmergence = emergenceHeight * (1.0 + sin(worldPosition.x * 10.0) * 0.5);
      
      float emergence = emergenceWave * maxEmergence;
      vEmergence = emergence;
      
      float flowNoise = sin(time * flowSpeed + worldPosition.x * 2.0) * 0.05;
      flowNoise += cos(time * flowSpeed * 1.3 + worldPosition.z * 1.5) * 0.03;
      
      float turbulentMotion = sin(time * turbulence + worldPosition.y * 3.0) * 0.02;
      turbulentMotion += cos(time * turbulence * 0.7 + length(worldPosition.xz) * 4.0) * 0.015;
      
      pos += normal * (emergence + flowNoise + turbulentMotion);
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;static fragmentShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying float vEmergence;
    
    uniform float time;
    uniform float flowIntensity;
    uniform float pulseSpeed;
    uniform vec3 coreColor;
    uniform vec3 hotColor;
    uniform vec3 coolColor;
    uniform float emissiveIntensity;
    uniform float glowRadius;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    
    float random3D(vec3 st) {
      return fract(sin(dot(st.xyz, vec3(12.9898, 78.233, 54.321))) * 43758.5453123);
    }

    float noise3D(vec3 st) {
      vec3 i = floor(st);
      vec3 f = fract(st);

      f = f * f * (3.0 - 2.0 * f);

      float a = random3D(i);
      float b = random3D(i + vec3(1.0, 0.0, 0.0));
      float c = random3D(i + vec3(0.0, 1.0, 0.0));
      float d = random3D(i + vec3(1.0, 1.0, 0.0));
      float e = random3D(i + vec3(0.0, 0.0, 1.0));
      float f2 = random3D(i + vec3(1.0, 0.0, 1.0));
      float g = random3D(i + vec3(0.0, 1.0, 1.0));
      float h = random3D(i + vec3(1.0, 1.0, 1.0));

      return mix(
        mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
        mix(mix(e, f2, f.x), mix(g, h, f.x), f.y),
        f.z
      );
    }

    float fbm3D(vec3 st, int octaves) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;

      for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        value += amplitude * noise3D(st * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    float voronoi(vec3 p) {
      vec3 n = floor(p);
      vec3 f = fract(p);

      float minDist = 1.0;

      for(int i = -1; i <= 1; i++) {
        for(int j = -1; j <= 1; j++) {
          for(int k = -1; k <= 1; k++) {
            vec3 neighbor = vec3(float(i), float(j), float(k));
            vec3 point = neighbor + random3D(n + neighbor) - f;
            float dist = length(point);
            minDist = min(minDist, dist);
          }
        }
      }

      return minDist;
    }
    
    void main() {
      vec3 flowPos = vWorldPosition;
      vec3 flowDirection = vec3(time * 0.1, time * 0.05, 0.0);

      float lavaTexture1 = fbm3D(flowPos * 6.0 + flowDirection, 6);
      float lavaTexture2 = fbm3D(flowPos * 12.0 + flowDirection * 1.5, 5);
      float lavaTexture3 = fbm3D(flowPos * 24.0 + flowDirection * 2.0, 4);
      float lavaTexture4 = fbm3D(flowPos * 48.0 + flowDirection * 2.5, 3);

      float combinedTexture = lavaTexture1 * 0.4 + lavaTexture2 * 0.3 + lavaTexture3 * 0.2 + lavaTexture4 * 0.1;

      float cracks = voronoi(flowPos * 20.0);
      cracks = smoothstep(0.05, 0.15, cracks);

      float temperaturePulse = sin(time * pulseSpeed + flowPos.x * 2.0) * 0.3 + 0.7;
      temperaturePulse *= sin(time * pulseSpeed * 0.7 + flowPos.y * 1.5) * 0.2 + 0.8;

      float hotspots = smoothstep(0.85, 0.95, noise3D(flowPos * 10.0 + vec3(time * 0.05)));

      float emergenceGlow = abs(vEmergence) * 8.0;

      float heatIntensity = combinedTexture + temperaturePulse * 0.2 + emergenceGlow + hotspots * 0.3;

      float crackGlow = (1.0 - cracks) * 0.6;
      heatIntensity += crackGlow;

      vec3 baseColor;
      float coolToHot = smoothstep(0.3, 0.5, heatIntensity);
      float hotToCore = smoothstep(0.65, 0.85, heatIntensity);

      vec3 coolToHotMix = mix(coolColor, hotColor, coolToHot);
      baseColor = mix(coolToHotMix, coreColor, hotToCore);

      float crustTexture = fbm3D(flowPos * 40.0, 6);
      vec3 crustColor = coolColor * (0.4 + crustTexture * 0.3);
      float crustFactor = smoothstep(0.5, 0.3, heatIntensity);
      baseColor = mix(baseColor, crustColor, crustFactor * cracks);

      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }

      float lambertian = max(dot(vNormal, lightDir), 0.0);
      float dayNight = smoothstep(-0.3, 0.1, lambertian);

      vec3 diffuse = baseColor * (0.2 + lambertian * 0.8);

      float emissiveStrength = smoothstep(0.4, 0.8, heatIntensity);
      vec3 emissive = baseColor * emissiveIntensity * emissiveStrength * (0.7 + temperaturePulse * 0.3);

      float emissiveFactor = mix(0.4, 1.0, dayNight);
      emissiveFactor += emergenceGlow * 0.15;
      emissiveFactor += crackGlow * 0.2;
      emissiveFactor = min(1.0, emissiveFactor);

      vec3 result = diffuse + (emissive * emissiveFactor);

      vec2 center = vec2(0.5);
      float distFromCenter = length(vUv - center);
      float edgeFade = smoothstep(0.5, 0.2, distFromCenter);
      float alpha = heatIntensity * flowIntensity * edgeFade * (0.7 + emissiveStrength * 0.3);

      gl_FragColor = vec4(result, alpha);
    }
  `;constructor(o,e={}){const a=e.seed||Math.floor(Math.random()*1e6),i=new b(a);this.startTime=e.startTime||a%1e4/1e3;const s=new n(16747520),l={h:0,s:0,l:0};s.getHSL(l),this.params={flowCount:e.flowCount||Math.floor(i.uniform(t.FLOW_COUNT.min,t.FLOW_COUNT.max)),flowLength:e.flowLength||i.uniform(t.FLOW_LENGTH.min,t.FLOW_LENGTH.max),flowWidth:e.flowWidth||i.uniform(t.FLOW_WIDTH.min,t.FLOW_WIDTH.max),flowIntensity:e.flowIntensity||i.uniform(t.FLOW_INTENSITY.min,t.FLOW_INTENSITY.max),flowSpeed:e.flowSpeed||i.uniform(t.FLOW_SPEED.min,t.FLOW_SPEED.max),pulseSpeed:e.pulseSpeed||i.uniform(t.PULSE_SPEED.min,t.PULSE_SPEED.max),turbulence:e.turbulence||i.uniform(t.TURBULENCE.min,t.TURBULENCE.max),coreColor:e.coreColor instanceof n?e.coreColor:new n().setHSL(l.h,1,.6),hotColor:e.hotColor instanceof n?e.hotColor:new n().setHSL(l.h+.05,.9,.5),coolColor:e.coolColor instanceof n?e.coolColor:new n().setHSL(l.h-.05,.8,.3),emissiveIntensity:e.emissiveIntensity||i.uniform(t.EMISSIVE_INTENSITY.min,t.EMISSIVE_INTENSITY.max),glowRadius:e.glowRadius||i.uniform(t.GLOW_RADIUS.min,t.GLOW_RADIUS.max),sparkleIntensity:e.sparkleIntensity||1,emergenceHeight:e.emergenceHeight||i.uniform(t.EMERGENCE_HEIGHT.min,t.EMERGENCE_HEIGHT.max),seed:a,startTime:this.startTime,timeSpeed:e.timeSpeed||i.uniform(t.TIME_SPEED.min,t.TIME_SPEED.max)},this.lavaGroup=new W,this.material=this.createMaterial(),this.generateLavaFlows(o,i)}generateLavaFlows(o,e){const a=this.params.flowCount;for(let i=0;i<a;i++){const s=e.uniform(0,2*Math.PI),l=e.uniform(-1,1),g=Math.acos(l),x=new r(Math.sin(g)*Math.cos(s),Math.sin(g)*Math.sin(s),Math.cos(g)),E=this.params.flowLength*e.uniform(.7,1.3),I=this.params.flowWidth*e.uniform(.8,1.2),y=Math.max(16,Math.floor(E*32)),m=new _(E*o*2,I*o*2,y,8),c=x.clone().normalize(),u=new r,S=new r;Math.abs(c.y)<.99?u.crossVectors(c,new r(0,1,0)).normalize():u.crossVectors(c,new r(1,0,0)).normalize(),S.crossVectors(c,u).normalize();const T=new G;T.makeBasis(u,S,c),m.applyMatrix4(T);const v=m.attributes.position,D=new r,f=x.clone().multiplyScalar(o);for(let h=0;h<v.count;h++){D.fromBufferAttribute(v,h);const L=D.clone().add(f).clone().normalize(),M=e.uniform(-.002,.008)*o,p=L.multiplyScalar(o+M).sub(f);v.setXYZ(h,p.x,p.y,p.z)}v.needsUpdate=!0,m.computeVertexNormals(),m.translate(f.x,f.y,f.z);const C=this.material.clone(),w=new H(m,C);w.renderOrder=3,this.lavaFlows.push(w),this.lavaGroup.add(w)}}createMaterial(){return new O({vertexShader:d.vertexShader,fragmentShader:d.fragmentShader,uniforms:{time:{value:0},flowSpeed:{value:this.params.flowSpeed},pulseSpeed:{value:this.params.pulseSpeed},turbulence:{value:this.params.turbulence},flowIntensity:{value:this.params.flowIntensity},emergenceHeight:{value:this.params.emergenceHeight},coreColor:{value:this.params.coreColor},hotColor:{value:this.params.hotColor},coolColor:{value:this.params.coolColor},emissiveIntensity:{value:this.params.emissiveIntensity},glowRadius:{value:this.params.glowRadius},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)}},transparent:!0,blending:z,depthWrite:!1,side:U})}addToScene(o,e){e&&this.lavaGroup.position.copy(e),o.add(this.lavaGroup)}update(o){const a=(this.startTime+F(N)*this.params.timeSpeed)%1e3;this.lavaFlows.forEach(i=>{const s=i.material;s.uniforms.time.value=a})}updateLightPosition(o){this.lavaFlows.forEach(e=>{const a=e.material;a.uniforms.lightPosition&&a.uniforms.lightPosition.value.copy(o)})}updateLightDirection(o){this.lavaFlows.forEach(e=>{const a=e.material;a.uniforms.lightDirection&&a.uniforms.lightDirection.value.copy(o)})}updateFromThreeLight(o){this.updateLightPosition(o.position);const e=o.target.position.clone().sub(o.position).normalize();this.updateLightDirection(e)}getObject3D(){return this.lavaGroup}dispose(){this.lavaFlows.forEach(o=>{o.geometry.dispose(),o.material instanceof k&&o.material.dispose()}),this.lavaFlows=[],this.lavaGroup.clear()}}function B(P,o,e){const i={flowCount:28,flowLength:.8,flowWidth:.04,flowIntensity:2.5,flowSpeed:.15,turbulence:1.5,emergenceHeight:.02,emissiveIntensity:4,seed:(e||Math.floor(Math.random()*1e6))+7e3};return new d(P,i)}export{d as L,B as c};
