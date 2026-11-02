import{S as T}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as E,a as N}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as U,de as G,au as p,D as w,bE as f,C as u,m as y,d5 as _,d9 as B,dh as O,di as S,i as W,av as M,cU as z,d8 as F,d2 as D,cy as P,g as R,B as L}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const c={RING_COUNT:{min:3,max:8},RING_DISTANCE:{min:1.5,max:3.5},WAVE_COUNT:{min:51,max:151},WAVE_AMPLITUDE:{min:.1,max:.2},ORBITAL_SPEED:{min:.2,max:.8},PORTAL_COUNT:{min:21,max:60},ENERGY_BEAM_COUNT:{min:2,max:8},PARTICLE_COUNT:{min:201,max:801}};class V{group;plasmaRings=[];energyWaves=[];dimensionalPortals=[];energyBeams=[];energyParticles;particleOrbitData=[];spaceDistortion;params;rng;planetRadius;cosmicOffset;constructor(i,a={}){this.planetRadius=i;const t=a.seed||Math.floor(Math.random()*1e6);this.rng=new T(t),this.params={color:a.color||[.2,.6,1],ringCount:a.ringCount||Math.floor(this.rng.random()*(c.RING_COUNT.max-c.RING_COUNT.min)+c.RING_COUNT.min),ringDistance:a.ringDistance||this.rng.random()*(c.RING_DISTANCE.max-c.RING_DISTANCE.min)+c.RING_DISTANCE.min,waveCount:a.waveCount||Math.floor(this.rng.random()*(c.WAVE_COUNT.max-c.WAVE_COUNT.min)+c.WAVE_COUNT.min),waveAmplitude:a.waveAmplitude||this.rng.random()*(c.WAVE_AMPLITUDE.max-c.WAVE_AMPLITUDE.min)+c.WAVE_AMPLITUDE.min,orbitalSpeed:a.orbitalSpeed||this.rng.random()*(c.ORBITAL_SPEED.max-c.ORBITAL_SPEED.min)+c.ORBITAL_SPEED.min,portalCount:a.portalCount||Math.floor(this.rng.random()*(c.PORTAL_COUNT.max-c.PORTAL_COUNT.min)+c.PORTAL_COUNT.min),energyBeamCount:a.energyBeamCount||Math.floor(this.rng.random()*(c.ENERGY_BEAM_COUNT.max-c.ENERGY_BEAM_COUNT.min)+c.ENERGY_BEAM_COUNT.min),particleCount:a.particleCount||Math.floor(this.rng.random()*(c.PARTICLE_COUNT.max-c.PARTICLE_COUNT.min)+c.PARTICLE_COUNT.min),cosmicOriginTime:a.cosmicOriginTime||E,seed:t},this.cosmicOffset=t%100*.1,this.group=new U,this.createPlasmaRings(),this.createEnergyWaves(),this.createDimensionalPortals(),this.createEnergyBeams(),this.createEnergyParticles(),this.createSpaceDistortion()}createPlasmaRings(){const i=this.params.ringCount,a=this.planetRadius+this.params.ringDistance;for(let t=0;t<i;t++){const n=a+t*.8,e=this.rng.random()*Math.PI*.5,s=this.rng.random()*Math.PI*2,o=(this.rng.random()-.5)*Math.PI*.3,r=new G(this.planetRadius*.2+t*.1,this.planetRadius*.03,8,32),l=new p({uniforms:{time:{value:0},color:{value:new u(this.params.color[0],this.params.color[1],this.params.color[2])},opacity:{value:.6-t*.08},ringIndex:{value:t},pulseSpeed:{value:2+this.rng.random()*2}},vertexShader:`
          uniform float time;
          uniform float ringIndex;
          uniform float pulseSpeed;
          varying vec2 vUv;
          varying float vIntensity;
          
          void main() {
            vUv = uv;
            float pulse = sin(time * pulseSpeed + ringIndex * 1.5) * 0.3 + 0.7;
            vIntensity = pulse;
            
            vec3 pos = position;
            pos.z += sin(time * 1.5 + ringIndex) * 0.1;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float opacity;
          uniform float time;
          varying vec2 vUv;
          varying float vIntensity;
          
          void main() {
            float plasma = sin(vUv.x * 15.0 + time * 3.0) * sin(vUv.y * 10.0 + time * 2.0) * 0.5 + 0.5;
            float energy = sin(time * 4.0 + vUv.x * 8.0) * 0.3 + 0.7;
            
            float finalIntensity = plasma * energy * vIntensity;
            
            gl_FragColor = vec4(color, finalIntensity * opacity);
          }
        `,transparent:!0,blending:f,side:w,depthWrite:!1}),m=new y(r,l);m.rotation.set(e,0,o),m.userData={distance:n,inclination:e,longitudeOfAscendingNode:s,tiltAngle:o,orbitalSpeed:this.rng.random()*.5+.3,ringIndex:t},this.plasmaRings.push(m),this.group.add(m)}}createEnergyWaves(){const i=this.params.waveCount,a=this.planetRadius+this.params.ringDistance+.5;for(let t=0;t<i;t++){const n=a+this.rng.random()*1,e=this.rng.random()*Math.PI,s=this.rng.random()*Math.PI*2,o=this.rng.random()*Math.PI*2,r=this.calculateOrbitalPosition(n,e,s,o),l=new _(this.planetRadius*.08+this.rng.random()*.04,16,8),m=new p({uniforms:{time:{value:0},color:{value:new u(this.params.color[0]*.8,this.params.color[1]*.9,this.params.color[2])},amplitude:{value:this.params.waveAmplitude},frequency:{value:3+this.rng.random()*4},waveIndex:{value:t}},vertexShader:`
          uniform float time;
          uniform float amplitude;
          uniform float frequency;
          uniform float waveIndex;
          varying vec3 vNormal;
          varying float vWaveIntensity;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            
            float wave = sin(time * frequency + waveIndex * 2.0) * amplitude;
            vec3 pos = position + normal * wave;
            
            vWaveIntensity = (sin(time * 2.0 + waveIndex) + 1.0) * 0.5;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          varying vec3 vNormal;
          varying float vWaveIntensity;
          
          void main() {
            float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            float ethereal = sin(time * 4.0 + fresnel * 10.0) * 0.3 + 0.7;
            
            float finalIntensity = fresnel * ethereal * vWaveIntensity * 0.8;
            gl_FragColor = vec4(color, finalIntensity);
          }
        `,transparent:!0,blending:f,depthWrite:!1}),d=new y(l,m);d.position.set(r.x,r.y,r.z),d.userData={distance:n,inclination:e,longitudeOfAscendingNode:s,initialAngle:o,orbitalSpeed:this.rng.random()*.4+.2,waveIndex:t},this.energyWaves.push(d),this.group.add(d)}}createDimensionalPortals(){const i=this.params.portalCount,a=this.planetRadius+this.params.ringDistance+1.2;for(let t=0;t<i;t++){const n=a+this.rng.random()*.8,e=this.rng.random()*Math.PI,s=this.rng.random()*Math.PI*2,o=this.rng.random()*Math.PI*2,r=this.calculateOrbitalPosition(n,e,s,o),l=new B(this.planetRadius*.12,this.planetRadius*.18,16,1),m=new p({uniforms:{time:{value:0},color:{value:new u(.8,.4,1)},portalIndex:{value:t},activation:{value:0}},vertexShader:`
          uniform float time;
          uniform float portalIndex;
          uniform float activation;
          varying vec2 vUv;
          varying float vActivation;
          
          void main() {
            vUv = uv;
            vActivation = activation;
            
            vec3 pos = position;
            float ripple = sin(time * 4.0 + portalIndex * 2.0) * 0.05 * activation;
            pos += normal * ripple;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float portalIndex;
          varying vec2 vUv;
          varying float vActivation;
          
          void main() {
            vec2 center = vUv - 0.5;
            float dist = length(center);
            
            float portal = smoothstep(0.35, 0.4, dist) * (1.0 - smoothstep(0.45, 0.5, dist));
            
            float spiral = sin(atan(center.y, center.x) * 8.0 + time * 6.0 + dist * 20.0) * 0.5 + 0.5;
            float vortex = sin(time * 10.0 + portalIndex * 3.0) * 0.3 + 0.7;
            
            float intensity = portal * spiral * vortex * vActivation;
            
            vec3 portalColor = mix(color, vec3(1.0, 0.8, 0.9), spiral * 0.3);
            gl_FragColor = vec4(portalColor, intensity);
          }
        `,transparent:!0,blending:f,side:w,depthWrite:!1}),d=new y(l,m);d.position.set(r.x,r.y,r.z),d.lookAt(0,0,0),d.userData={distance:n,inclination:e,longitudeOfAscendingNode:s,initialAngle:o,orbitalSpeed:this.rng.random()*.3+.1,portalIndex:t,activationPhase:this.rng.random()*Math.PI*2},this.dimensionalPortals.push(d),this.group.add(d)}}createEnergyBeams(){const i=this.params.energyBeamCount;for(let a=0;a<i;a++){const t=this.planetRadius+.2,n=this.planetRadius+.4+this.rng.random()*.3,e=this.rng.random()*Math.PI,s=this.rng.random()*Math.PI*2,o=this.rng.random()*Math.PI*2,r=o+(this.rng.random()-.5)*Math.PI,l=this.calculateOrbitalPosition(t,e,s,o),m=this.calculateOrbitalPosition(n,e,s,r),d=this.createCurvedBeamPath(l,m,t,n),v=new O(d),h=this.planetRadius*.015,g=6,x=Math.max(20,d.length*2),I=new S(v,x,h,g,!1),A=new p({uniforms:{time:{value:0},color:{value:new u(.3,.8,1)},beamIndex:{value:a},intensity:{value:0}},vertexShader:`
          uniform float time;
          uniform float beamIndex;
          uniform float intensity;
          varying vec2 vUv;
          varying float vIntensity;
          
          void main() {
            vUv = uv;
            vIntensity = intensity;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          varying vec2 vUv;
          varying float vIntensity;
          
          void main() {
            float centerDistance = abs(vUv.y - 0.5) * 2.0;
            float tubeFalloff = 1.0 - smoothstep(0.0, 1.0, centerDistance);
            
            float glow = sin(time * 8.0 + vUv.x * 10.0) * 0.3 + 0.7;
            float energy = sin(time * 6.0 - vUv.x * 15.0) * 0.2 + 0.8;
            
            float finalIntensity = tubeFalloff * glow * energy * vIntensity;
            gl_FragColor = vec4(color, finalIntensity);
          }
        `,transparent:!0,blending:f,depthWrite:!1}),C=new y(I,A);C.userData={startDistance:t,endDistance:n,inclination:e,longitudeOfAscendingNode:s,startAngle:o,endAngle:r,beamIndex:a,activationPhase:this.rng.random()*Math.PI*2,curve:v,tubeRadius:h,tubularSegments:x,radialSegments:g},this.energyBeams.push(C),this.group.add(C)}}createEnergyParticles(){const i=this.params.particleCount,a=new Float32Array(i*3),t=new Float32Array(i*3),n=new Float32Array(i);for(let o=0;o<i;o++){const r=this.planetRadius+this.params.ringDistance+this.rng.random()*2,l=this.rng.random()*Math.PI,m=this.rng.random()*Math.PI*2,d=this.rng.random()*Math.PI*2,v=this.rng.random()*.5+.2;this.particleOrbitData.push({distance:r,inclination:l,longitudeOfAscendingNode:m,initialAngle:d,orbitalSpeed:v});const h=this.calculateOrbitalPosition(r,l,m,d);a[o*3]=h.x,a[o*3+1]=h.y,a[o*3+2]=h.z;const g=this.rng.random()*.3;t[o*3]=.2+g,t[o*3+1]=.6+g,t[o*3+2]=1,n[o]=this.planetRadius*(.035+this.rng.random()*.045)}const e=new W;e.setAttribute("position",new M(a,3)),e.setAttribute("color",new M(t,3)),e.setAttribute("size",new M(n,1));const s=new p({uniforms:{time:{value:0},particleTexture:{value:this.createParticleTexture()}},vertexShader:`
        attribute float size;
        uniform float time;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
          vColor = color;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float distanceFade = 1.0 / (1.0 + length(mvPosition.xyz) * 0.1);
          
          vAlpha = sin(time * 2.0 + position.x * 0.1) * 0.3 + 0.7;
          vAlpha *= distanceFade;
          
          gl_PointSize = size * (400.0 / -mvPosition.z) * 1.5; // Factor de escala mejorado para 4K
          gl_Position = projectionMatrix * mvPosition;
        }
      `,fragmentShader:`
        uniform sampler2D particleTexture;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
          vec4 texColor = texture2D(particleTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor * texColor.rgb, texColor.a * vAlpha);
        }
      `,transparent:!0,blending:f,depthWrite:!1,vertexColors:!0});this.energyParticles=new z(e,s),this.group.add(this.energyParticles)}createParticleTexture(){const i=document.createElement("canvas");i.width=32,i.height=32;const a=i.getContext("2d"),t=a.createRadialGradient(16,16,0,16,16,16);return t.addColorStop(0,"rgba(255, 255, 255, 1)"),t.addColorStop(.4,"rgba(100, 200, 255, 0.8)"),t.addColorStop(1,"rgba(0, 0, 0, 0)"),a.fillStyle=t,a.fillRect(0,0,32,32),new F(i)}createCurvedBeamPath(i,a,t,n){const e=[],o=new D().setFromVector3(i),r=new D().setFromVector3(a);for(let l=0;l<=15;l++){const m=l/15,d=P.lerp(o.phi,r.phi,m);let v=P.lerp(o.theta,r.theta,m);const h=r.theta-o.theta;Math.abs(h)>Math.PI&&(h>0?v=P.lerp(o.theta,r.theta-2*Math.PI,m):v=P.lerp(o.theta,r.theta+2*Math.PI,m));const x=P.lerp(t,n,m),I=new D(x,d,v),A=new R().setFromSpherical(I);e.push(A)}return e}createSpaceDistortion(){const i=new _(this.planetRadius+this.params.ringDistance+1.5,32,16),a=new p({uniforms:{time:{value:0},color:{value:new u(.1,.3,.6)}},vertexShader:`
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          
          vec3 pos = position;
          float distortion = sin(pos.x * 2.0 + time) * sin(pos.y * 2.0 + time * 1.3) * sin(pos.z * 2.0 + time * 0.7);
          pos += normal * distortion * 0.1;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 color;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
          float distortionPattern = sin(vPosition.x * 5.0 + time * 2.0) * sin(vPosition.y * 5.0 + time * 1.5) * 0.5 + 0.5;
          
          float alpha = fresnel * distortionPattern * 0.15;
          gl_FragColor = vec4(color, alpha);
        }
      `,transparent:!0,blending:f,side:L,depthWrite:!1});this.spaceDistortion=new y(i,a),this.group.add(this.spaceDistortion)}calculateOrbitalPosition(i,a,t,n){const e=i*Math.cos(n),s=i*Math.sin(n),o=0,r=e,l=s*Math.cos(a)-o*Math.sin(a),m=s*Math.sin(a)+o*Math.cos(a),d=r*Math.cos(t)-l*Math.sin(t),v=r*Math.sin(t)+l*Math.cos(t),h=m;return new R(d,v,h)}update(i){const t=(N(this.params.cosmicOriginTime||E)+this.cosmicOffset)*(this.params.orbitalSpeed||1);if(this.plasmaRings.forEach(n=>{const e=n.userData,s=e.longitudeOfAscendingNode+t*e.orbitalSpeed*.05;n.rotation.y=s,n.rotation.z=e.tiltAngle+Math.sin(t*.5+e.ringIndex)*.2;const o=n.material;o.uniforms.time.value=t}),this.energyWaves.forEach(n=>{const e=n.userData,s=e.initialAngle+t*e.orbitalSpeed*.1,o=this.calculateOrbitalPosition(e.distance,e.inclination,e.longitudeOfAscendingNode,s);n.position.set(o.x,o.y,o.z),n.rotation.x+=.01+e.waveIndex*.002,n.rotation.y+=.008+e.waveIndex*.003,n.rotation.z+=.012+e.waveIndex*.001;const r=n.material;r.uniforms.time.value=t}),this.dimensionalPortals.forEach(n=>{const e=n.userData,s=e.initialAngle+t*e.orbitalSpeed*.08,o=this.calculateOrbitalPosition(e.distance,e.inclination,e.longitudeOfAscendingNode,s);n.position.set(o.x,o.y,o.z),n.lookAt(0,0,0);const r=(Math.sin(t*1.5+e.activationPhase)+1)*.5,l=n.material;l.uniforms.time.value=t,l.uniforms.activation.value=r}),this.energyBeams.forEach(n=>{const e=n.userData,s=e.startAngle+t*.1,o=e.endAngle+t*.15,r=this.calculateOrbitalPosition(e.startDistance,e.inclination,e.longitudeOfAscendingNode,s),l=this.calculateOrbitalPosition(e.endDistance,e.inclination,e.longitudeOfAscendingNode,o),m=this.createCurvedBeamPath(r,l,e.startDistance,e.endDistance),d=new O(m);n.geometry.dispose(),n.geometry=new S(d,e.tubularSegments,e.tubeRadius,e.radialSegments,!1);const v=(Math.sin(t*3+e.activationPhase)+1)*.5,h=n.material;h.uniforms.time.value=t,h.uniforms.intensity.value=v}),this.energyParticles){const n=this.energyParticles.material;n.uniforms.time.value=t;const e=this.energyParticles.geometry.attributes.position.array;for(let s=0;s<e.length/3;s++){const o=this.particleOrbitData[s],r=o.initialAngle+t*o.orbitalSpeed*.08,l=this.calculateOrbitalPosition(o.distance,o.inclination,o.longitudeOfAscendingNode,r);e[s*3]=l.x,e[s*3+1]=l.y,e[s*3+2]=l.z}this.energyParticles.geometry.attributes.position.needsUpdate=!0}if(this.spaceDistortion){const n=this.spaceDistortion.material;n.uniforms.time.value=t,this.spaceDistortion.rotation.x+=.002,this.spaceDistortion.rotation.y+=.003}}getObject3D(){return this.group}addToScene(i,a){a&&this.group.position.copy(a),i.add(this.group)}removeFromScene(i){i.remove(this.group)}dispose(){this.plasmaRings.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.energyWaves.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.dimensionalPortals.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.energyBeams.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.energyParticles&&(this.energyParticles.geometry.dispose(),this.energyParticles.material.dispose()),this.spaceDistortion&&(this.spaceDistortion.geometry.dispose(),this.spaceDistortion.material.dispose()),this.group.clear()}setEnabled(i){this.group.visible=i}updateParams(i){if(Object.assign(this.params,i),i.color){const a=new u(i.color[0],i.color[1],i.color[2]);this.plasmaRings.forEach(t=>{const n=t.material;n.uniforms.color.value=a}),this.energyWaves.forEach(t=>{const n=t.material;n.uniforms.color.value=new u(a.r*.8,a.g*.9,a.b)})}}}function q(b,i,a){const n={seed:(a||Math.floor(Math.random()*1e6))+70003,color:i.color||[.2,.6,1],cosmicOriginTime:i?.timing?.cosmic_origin_time||i?.cosmicOriginTime||E};return new V(b,n)}export{V as L,q as c};
