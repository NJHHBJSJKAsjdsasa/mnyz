import{S as C}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{a as _}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as z,aJ as L,g as u,M as V,o as A,m as Y,au as R,f as B,bA as W}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const o={CLOUD_COUNT:{min:15,max:25},SIZE:{min:3.8,max:5.5},OPACITY:{min:.4,max:.8},DENSITY:{min:.5,max:1.5},ROTATION_SPEED:{min:.002,max:.008},MOVEMENT_AMPLITUDE:{min:.003,max:.02},TURBULENCE:{min:1,max:2},TIME_SPEED:{min:.1,max:3}};class E{cloudSystem;material;params;cloudCount;clouds=[];cosmicOriginTime;cosmicOffset;static vertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    uniform float time;
    uniform float movementAmplitude;
    uniform float turbulence;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      vec3 pos = position;
      float slowTime = time * 0.015;

      pos += sin(slowTime + worldPosition.x * 0.02) * movementAmplitude * turbulence * 0.2;
      pos += cos(slowTime * 1.3 + worldPosition.z * 0.015) * movementAmplitude * turbulence * 0.15;
      pos += sin(slowTime * 0.7 + worldPosition.y * 0.018) * movementAmplitude * turbulence * 0.1;
      
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
    uniform float turbulence;
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

    float fbm(vec2 st, int octaves) {
      float value = 0.0;
      float amplitude = 0.5;
      
      for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        value += amplitude * noise(st);
        st *= 2.0 + turbulence * 0.1;
        amplitude *= 0.5;
      }
      return value;
    }
    
    void main() {
      vec2 center = vec2(0.5);
      float distFromCenter = length(vUv - center);

      float circularMask = 1.0 - smoothstep(0.05, 0.6, distFromCenter);

      float animSpeed1 = time * 0.003;
      float animSpeed2 = time * 0.0015;
      float animSpeed3 = time * 0.001;
      float animSpeed4 = time * 0.0008;

      vec2 noiseUv1 = vUv * 3.0 + noiseOffset + vec2(animSpeed1, animSpeed1 * 0.8);
      float noise1 = fbm(noiseUv1, 4) * 0.8;
      
      vec2 noiseUv2 = vUv * 6.0 + noiseOffset * 1.5 + vec2(animSpeed2, animSpeed2 * 1.2);
      float noise2 = fbm(noiseUv2, 5) * 0.6;
      
      vec2 noiseUv3 = vUv * 12.0 + noiseOffset * 2.5 + vec2(animSpeed3, animSpeed3 * 0.9);
      float noise3 = fbm(noiseUv3, 3) * 0.4;

      vec2 noiseUv4 = vUv * 24.0 + noiseOffset * 3.5 + vec2(animSpeed4, animSpeed4 * 1.5);
      float noise4 = fbm(noiseUv4, 2) * 0.3;

      float cloudNoise = noise1 + noise2 * turbulence * 0.5 + noise3 * turbulence * 0.3 + noise4 * turbulence * 0.2;
      cloudNoise = smoothstep(0.15, 1.2, cloudNoise);

      float baseCloud = cloudNoise * circularMask * density;

      float densityFalloff = pow(circularMask, 2.0);
      float finalCloud = baseCloud * densityFalloff;

      finalCloud = pow(finalCloud, 0.9);

      vec3 finalColor = cloudColor * 0.85;

      float colorVariation = 1.0 - distFromCenter * 0.5;
      finalColor *= colorVariation;

      float lightIntensity = dot(vNormal, normalize(vec3(0.7, 1.0, 0.5))) * 0.25 + 0.75;
      finalColor *= lightIntensity;

      float alpha = finalCloud * opacity;
      alpha *= (1.0 - pow(distFromCenter, 1.5) * 0.7);

      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      vec3 planetNormal = normalize(vWorldPosition);
      float dotNL = dot(planetNormal, lightDir);

      float lightFactor = smoothstep(-0.3, 0.3, dotNL);
      alpha *= mix(0.2, 1.0, lightFactor);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;constructor(e,i){const t=i.seed||Math.floor(Math.random()*1e6),n=new C(t+5e3);this.cosmicOriginTime=i.cosmicOriginTime||51408e4,this.cosmicOffset=t%3600*15,this.params={baseColor:i.baseColor,cloudCount:i.cloudCount||Math.floor(n.uniform(o.CLOUD_COUNT.min,o.CLOUD_COUNT.max)),size:i.size||n.uniform(o.SIZE.min,o.SIZE.max),opacity:i.opacity||n.uniform(o.OPACITY.min,o.OPACITY.max),density:i.density||n.uniform(o.DENSITY.min,o.DENSITY.max),rotationSpeed:i.rotationSpeed||n.uniform(o.ROTATION_SPEED.min,o.ROTATION_SPEED.max),movementAmplitude:i.movementAmplitude||n.uniform(o.MOVEMENT_AMPLITUDE.min,o.MOVEMENT_AMPLITUDE.max),turbulence:i.turbulence||n.uniform(o.TURBULENCE.min,o.TURBULENCE.max),timeSpeed:i.timeSpeed||n.uniform(o.TIME_SPEED.min,o.TIME_SPEED.max),seed:t,cosmicOriginTime:this.cosmicOriginTime,cloudsFromPython:i.cloudsFromPython},this.cloudCount=this.params.cloudCount,this.cloudSystem=new z,this.material=this.createMaterial(),this.generateClouds(e)}generateClouds(e){const i=this.params.seed||Math.floor(Math.random()*1e6),t=new C(i+5e3),n=this.cosmicOriginTime+this.cosmicOffset,m=this.params.cloudsFromPython;for(let c=0;c<this.cloudCount;c++){let s,l,r,x=this.params.baseColor.clone().multiplyScalar(.85),d=this.params.size*t.uniform(.8,1.2);if(m&&c<m.length){const a=m[c];if(!a.position||a.position.length!==3||(s=a.position[0]*e*1.05,l=a.position[1]*e*1.05,r=a.position[2]*e*1.05,!isFinite(s)||!isFinite(l)||!isFinite(r)))continue;d=a.radius*e*.8}else{const a=t.uniform(0,2*Math.PI),w=t.uniform(-1,1),T=Math.acos(w),M=e*1.05;if(s=M*Math.sin(T)*Math.cos(a),l=M*Math.sin(T)*Math.sin(a),r=M*Math.cos(T),!isFinite(s)||!isFinite(l)||!isFinite(r))continue}(!isFinite(d)||d<=0)&&(d=1);const h=d*t.uniform(.3,.8);if(!isFinite(h)||h<=0)continue;const b=Math.max(8,Math.floor(h*15)),p=new L(h*24,h*24,b,b),O=new u(s,l,r);new u(0,0,0);const v=O.clone().normalize(),y=new u,N=new u;Math.abs(v.y)<.99?y.crossVectors(v,new u(0,1,0)).normalize():y.crossVectors(v,new u(1,0,0)).normalize(),N.crossVectors(v,y).normalize();const U=new V;U.makeBasis(y,N,v);const g=p.attributes.position,I=new u,F=Math.sqrt(s*s+l*l+r*r);p.applyMatrix4(U);for(let a=0;a<g.count;a++){I.fromBufferAttribute(g,a);const P=I.clone().add(O).clone().normalize().multiplyScalar(F).sub(O);g.setXYZ(a,P.x,P.y,P.z)}g.needsUpdate=!0,p.computeVertexNormals(),p.translate(s,l,r);const f=this.material.clone();f.uniforms.cloudColor.value=x,f.uniforms.density.value=this.params.density*t.uniform(.8,1.2),f.uniforms.turbulence.value=this.params.turbulence*t.uniform(.8,1.2),f.uniforms.noiseOffset.value=new A((n+t.uniform(0,100))%100,(n+t.uniform(0,100))%100),f.uniforms.lightDirection.value=this.material.uniforms.lightDirection.value.clone(),f.uniforms.lightPosition.value=this.material.uniforms.lightPosition.value.clone();const S=new Y(p,f);S.renderOrder=3,S.userData.isSecondaryCloud=!0,S.userData.planetNormal=v.clone(),this.clouds.push(S),this.cloudSystem.add(S)}}createMaterial(){return new R({vertexShader:E.vertexShader,fragmentShader:E.fragmentShader,uniforms:{time:{value:0},opacity:{value:this.params.opacity},movementAmplitude:{value:this.params.movementAmplitude},turbulence:{value:this.params.turbulence},cloudColor:{value:this.params.baseColor.clone().multiplyScalar(.85)},density:{value:this.params.density},noiseOffset:{value:new A(0,0)},lightDirection:{value:new u(1,1,1).normalize()},lightPosition:{value:new u(0,0,0)}},transparent:!0,blending:W,depthWrite:!1,side:B})}addToScene(e,i){i&&this.cloudSystem.position.copy(i),e.add(this.cloudSystem)}update(e,i){const n=(_(this.cosmicOriginTime)+this.cosmicOffset)*this.params.timeSpeed,m=n%1e4;this.clouds.forEach(c=>{const s=c.material;s.uniforms.time.value=m}),this.cloudSystem.rotation.y=n*this.params.rotationSpeed,this.cloudSystem.rotation.x=n*this.params.rotationSpeed*.3}updateParams(e){this.params={...this.params,...e},this.clouds.forEach(i=>{const t=i.material;e.opacity!==void 0&&(t.uniforms.opacity.value=e.opacity),e.movementAmplitude!==void 0&&(t.uniforms.movementAmplitude.value=e.movementAmplitude),e.turbulence!==void 0&&(t.uniforms.turbulence.value=e.turbulence)})}updateLightPosition(e){this.clouds.forEach(i=>{const t=i.material;t.uniforms.lightPosition&&t.uniforms.lightPosition.value.copy(e)})}updateLightDirection(e){this.clouds.forEach(i=>{const t=i.material;t.uniforms.lightDirection&&t.uniforms.lightDirection.value.copy(e)})}updateFromThreeLight(e){this.updateLightPosition(e.position);const i=e.target.position.clone().sub(e.position).normalize();this.updateLightDirection(i)}getObject3D(){return this.cloudSystem}dispose(){this.clouds.forEach(e=>{e.geometry.dispose(),e.material.dispose()}),this.clouds=[],this.cloudSystem.clear()}}function G(D,e,i,t,n){const m=e.secondary_clouds||[];if(m.length===0){const r=t||Math.floor(Math.random()*1e6),x=new C(r+5e3),d={baseColor:i,cloudCount:20,size:.6,opacity:.6,density:.8,seed:r,rotationSpeed:.005,movementAmplitude:.02,turbulence:1.2,timeSpeed:x.uniform(o.TIME_SPEED.min,o.TIME_SPEED.max),cosmicOriginTime:n};return new E(D,d)}const c=t||Math.floor(Math.random()*1e6),s=new C(c+5e3),l={baseColor:i,cloudCount:m.length,size:s.uniform(o.SIZE.min,o.SIZE.max),opacity:s.uniform(o.OPACITY.min,o.OPACITY.max),density:s.uniform(o.DENSITY.min,o.DENSITY.max),seed:c,rotationSpeed:s.uniform(o.ROTATION_SPEED.min,o.ROTATION_SPEED.max),movementAmplitude:s.uniform(o.MOVEMENT_AMPLITUDE.min,o.MOVEMENT_AMPLITUDE.max),turbulence:s.uniform(o.TURBULENCE.min,o.TURBULENCE.max),timeSpeed:s.uniform(o.TIME_SPEED.min,o.TIME_SPEED.max),cosmicOriginTime:n,cloudsFromPython:m};return new E(D,l)}export{G as c};
