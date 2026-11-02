import{S as y}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as v,a as w}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as _,d5 as f,au as u,B as O,bE as h,C as d,m as p,da as P,D as I,g as E}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const r={CLOUD_LAYER_COUNT:{min:3,max:6},ATMOSPHERIC_BELT_COUNT:{min:2,max:5},GAS_SWIRL_COUNT:{min:8,max:20},COLOR_SHIFT_SPEED:{min:.5,max:2},FLOW_SPEED:{min:.3,max:1.2},CONSCIOUSNESS_PULSE_COUNT:{min:5,max:12}};class M{group;cloudLayers=[];atmosphericBelts=[];gasSwirls=[];consciousnessPulses=[];params;rng;planetRadius;cosmicOffset;constructor(i,o={}){this.planetRadius=i;const e=o.seed||Math.floor(Math.random()*1e6);this.rng=new y(e),this.params={color:o.color||[.6,.8,.4],cloudLayerCount:o.cloudLayerCount||Math.floor(this.rng.random()*(r.CLOUD_LAYER_COUNT.max-r.CLOUD_LAYER_COUNT.min)+r.CLOUD_LAYER_COUNT.min),atmosphericBeltCount:o.atmosphericBeltCount||Math.floor(this.rng.random()*(r.ATMOSPHERIC_BELT_COUNT.max-r.ATMOSPHERIC_BELT_COUNT.min)+r.ATMOSPHERIC_BELT_COUNT.min),gasSwirlCount:o.gasSwirlCount||Math.floor(this.rng.random()*(r.GAS_SWIRL_COUNT.max-r.GAS_SWIRL_COUNT.min)+r.GAS_SWIRL_COUNT.min),colorShiftSpeed:o.colorShiftSpeed||this.rng.random()*(r.COLOR_SHIFT_SPEED.max-r.COLOR_SHIFT_SPEED.min)+r.COLOR_SHIFT_SPEED.min,flowSpeed:o.flowSpeed||this.rng.random()*(r.FLOW_SPEED.max-r.FLOW_SPEED.min)+r.FLOW_SPEED.min,consciousnessPulseCount:o.consciousnessPulseCount||Math.floor(this.rng.random()*(r.CONSCIOUSNESS_PULSE_COUNT.max-r.CONSCIOUSNESS_PULSE_COUNT.min)+r.CONSCIOUSNESS_PULSE_COUNT.min),cosmicOriginTime:o.cosmicOriginTime||v,seed:e},this.cosmicOffset=e%100*.1,this.group=new _,this.createCloudLayers(),this.createAtmosphericBelts(),this.createGasSwirls(),this.createConsciousnessPulses()}createCloudLayers(){const i=this.params.cloudLayerCount;for(let o=0;o<i;o++){const e=this.planetRadius+.1+o*.15,t=new f(e,32,16),s=new u({uniforms:{time:{value:0},baseColor:{value:new d(this.params.color[0],this.params.color[1],this.params.color[2])},layerIndex:{value:o},colorShiftSpeed:{value:this.params.colorShiftSpeed},opacity:{value:.3-o*.04}},vertexShader:`
          uniform float time;
          uniform float layerIndex;
          varying vec3 vPosition;
          varying vec3 vNormal;
          varying float vDistortion;
          
          float noise(vec3 p) {
            return sin(p.x * 4.0 + time * 0.5) * sin(p.y * 4.0 + time * 0.7) * sin(p.z * 4.0 + time * 0.3) * 0.5 + 0.5;
          }
          
          void main() {
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);
            
            vec3 noisePos = position * 2.0 + time * 0.2;
            float distortion = noise(noisePos) * 0.1;
            vDistortion = distortion;
            
            vec3 pos = position + normal * distortion;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 baseColor;
          uniform float time;
          uniform float layerIndex;
          uniform float colorShiftSpeed;
          uniform float opacity;
          varying vec3 vPosition;
          varying vec3 vNormal;
          varying float vDistortion;
          
          vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
          }
          
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
            
            float colorCycle = sin(time * colorShiftSpeed + layerIndex * 2.0 + vPosition.x * 0.5) * 0.5 + 0.5;
            float hueShift = colorCycle * 0.3 + layerIndex * 0.1;
            
            vec3 shiftedColor = hsv2rgb(vec3(hueShift, 0.7, 0.9));
            vec3 finalColor = mix(baseColor, shiftedColor, colorCycle);
            
            float alpha = fresnel * opacity * (0.8 + vDistortion * 2.0);
            
            gl_FragColor = vec4(finalColor, alpha);
          }
        `,transparent:!0,blending:h,side:O,depthWrite:!1}),n=new p(t,s);n.userData={layerIndex:o,rotationSpeed:(this.rng.random()-.5)*.01},this.cloudLayers.push(n),this.group.add(n)}}createAtmosphericBelts(){const i=this.params.atmosphericBeltCount;for(let o=0;o<i;o++){const e=this.planetRadius+.3+o*.4,t=this.planetRadius*.15,s=new P(e,e,t,64,8,!0),n=new u({uniforms:{time:{value:0},baseColor:{value:new d(this.params.color[0]*.8,this.params.color[1]*1.2,this.params.color[2]*.9)},beltIndex:{value:o},flowSpeed:{value:this.params.flowSpeed}},vertexShader:`
          uniform float time;
          uniform float beltIndex;
          uniform float flowSpeed;
          varying vec2 vUv;
          varying vec3 vPosition;
          varying float vFlow;
          
          void main() {
            vUv = uv;
            vPosition = position;
            
            float flow = sin(time * flowSpeed + beltIndex * 3.0 + position.x * 0.1) * 0.5 + 0.5;
            vFlow = flow;
            
            vec3 pos = position;
            pos.y += sin(time * 2.0 + uv.x * 20.0) * 0.05;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 baseColor;
          uniform float time;
          uniform float beltIndex;
          varying vec2 vUv;
          varying vec3 vPosition;
          varying float vFlow;
          
          void main() {
            float stripPattern = sin(vUv.x * 40.0 + time * 3.0) * 0.5 + 0.5;
            float flowPattern = sin(vUv.x * 10.0 + time * 5.0 + beltIndex * 2.0) * 0.3 + 0.7;
            
            float edgeFade = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
            
            vec3 gasColor = baseColor * (1.0 + stripPattern * 0.5) * flowPattern;
            float alpha = edgeFade * vFlow * 0.6;
            
            gl_FragColor = vec4(gasColor, alpha);
          }
        `,transparent:!0,blending:h,side:I,depthWrite:!1}),a=new p(s,n),c=this.rng.random()*Math.PI*.4+Math.PI*.3,m=this.rng.random()*Math.PI*2,l=(this.rng.random()-.5)*.3;a.rotation.x=Math.PI/2+l,a.rotation.y=m,a.rotation.z=c,a.userData={beltIndex:o,inclination:c,longitudeOfAscendingNode:m,tiltAngle:l,orbitalSpeed:this.rng.random()*.3+.1,rotationSpeed:(this.rng.random()-.5)*.02},this.atmosphericBelts.push(a),this.group.add(a)}}createGasSwirls(){const i=this.params.gasSwirlCount;for(let o=0;o<i;o++){const e=this.planetRadius+.05+this.rng.random()*.8,t=this.rng.random()*Math.PI,s=this.rng.random()*Math.PI*2,n=this.rng.random()*Math.PI*2,a=this.calculateOrbitalPosition(e,t,s,n),c=new f(this.planetRadius*(.08+this.rng.random()*.06),16,12),m=new u({uniforms:{time:{value:0},color:{value:new d(this.params.color[0],this.params.color[1]*1.1,this.params.color[2]*.8)},swirlIndex:{value:o},swirlSpeed:{value:2+this.rng.random()*3}},vertexShader:`
          uniform float time;
          uniform float swirlIndex;
          uniform float swirlSpeed;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying float vSwirl;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            
            float swirl = sin(time * swirlSpeed + swirlIndex * 2.0) * 0.5 + 0.5;
            vSwirl = swirl;
            
            vec3 pos = position;
            float twist = atan(pos.y, pos.x) + time * 2.0 + swirlIndex;
            pos.x += sin(twist) * 0.05 * swirl;
            pos.y += cos(twist) * 0.05 * swirl;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float swirlIndex;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying float vSwirl;
          
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
            float gasPattern = sin(vPosition.x * 8.0 + time * 4.0) * sin(vPosition.y * 6.0 + time * 3.0) * 0.3 + 0.7;
            
            float alpha = fresnel * gasPattern * vSwirl * 0.7;
            vec3 gasColor = color * (1.0 + gasPattern * 0.5);
            
            gl_FragColor = vec4(gasColor, alpha);
          }
        `,transparent:!0,blending:h,depthWrite:!1}),l=new p(c,m);l.position.set(a.x,a.y,a.z),l.userData={distance:e,inclination:t,longitudeOfAscendingNode:s,initialAngle:n,orbitalSpeed:this.rng.random()*.5+.3,swirlIndex:o},this.gasSwirls.push(l),this.group.add(l)}}createConsciousnessPulses(){const i=this.params.consciousnessPulseCount;for(let o=0;o<i;o++){const e=this.planetRadius+.6+this.rng.random()*.5,t=this.rng.random()*Math.PI,s=this.rng.random()*Math.PI*2,n=this.rng.random()*Math.PI*2,a=this.calculateOrbitalPosition(e,t,s,n),c=new f(this.planetRadius*.04,8,6),m=new u({uniforms:{time:{value:0},color:{value:new d(this.params.color[0]*1.2,this.params.color[1],this.params.color[2]*1.3)},pulseIndex:{value:o},pulseSpeed:{value:3+this.rng.random()*2}},vertexShader:`
          uniform float time;
          uniform float pulseIndex;
          uniform float pulseSpeed;
          varying float vIntensity;
          
          void main() {
            float pulse = sin(time * pulseSpeed + pulseIndex * 1.5) * 0.5 + 0.5;
            vIntensity = pulse;
            
            vec3 pos = position * (1.0 + pulse * 0.3);
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          varying float vIntensity;
          
          void main() {
            float consciousness = sin(time * 8.0) * 0.2 + 0.8;
            
            gl_FragColor = vec4(color * consciousness, vIntensity * 0.9);
          }
        `,transparent:!0,blending:h,depthWrite:!1}),l=new p(c,m);l.position.set(a.x,a.y,a.z),l.userData={distance:e,inclination:t,longitudeOfAscendingNode:s,initialAngle:n,orbitalSpeed:this.rng.random()*.3+.1,pulseIndex:o},this.consciousnessPulses.push(l),this.group.add(l)}}calculateOrbitalPosition(i,o,e,t){const s=i*Math.cos(t),n=i*Math.sin(t),a=0,c=s,m=n*Math.cos(o)-a*Math.sin(o),l=n*Math.sin(o)+a*Math.cos(o),S=c*Math.cos(e)-m*Math.sin(e),C=c*Math.sin(e)+m*Math.cos(e),x=l;return new E(S,C,x)}update(i){const e=w(this.params.cosmicOriginTime||v)+this.cosmicOffset;this.cloudLayers.forEach(t=>{const s=t.userData;t.rotation.y+=s.rotationSpeed,t.rotation.z+=s.rotationSpeed*.7;const n=t.material;n.uniforms.time.value=e}),this.atmosphericBelts.forEach(t=>{const s=t.userData,n=s.longitudeOfAscendingNode+e*s.orbitalSpeed*.1;t.rotation.x=Math.PI/2+s.tiltAngle+Math.sin(e*.5+s.beltIndex)*.1,t.rotation.y=n,t.rotation.z=s.inclination+Math.cos(e*.3+s.beltIndex)*.05;const a=t.material;a.uniforms.time.value=e}),this.gasSwirls.forEach(t=>{const s=t.userData,n=s.initialAngle+e*s.orbitalSpeed*.1,a=this.calculateOrbitalPosition(s.distance,s.inclination,s.longitudeOfAscendingNode,n);t.position.set(a.x,a.y,a.z),t.rotation.x+=.02,t.rotation.y+=.015;const c=t.material;c.uniforms.time.value=e}),this.consciousnessPulses.forEach(t=>{const s=t.userData,n=s.initialAngle+e*s.orbitalSpeed*.05,a=this.calculateOrbitalPosition(s.distance,s.inclination,s.longitudeOfAscendingNode,n);t.position.set(a.x,a.y,a.z);const c=t.material;c.uniforms.time.value=e})}getObject3D(){return this.group}addToScene(i,o){o&&this.group.position.copy(o),i.add(this.group)}removeFromScene(i){i.remove(this.group)}dispose(){this.cloudLayers.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.atmosphericBelts.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.gasSwirls.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.consciousnessPulses.forEach(i=>{i.geometry.dispose(),i.material.dispose()}),this.group.clear()}setEnabled(i){this.group.visible=i}updateParams(i){if(Object.assign(this.params,i),i.color){const o=new d(i.color[0],i.color[1],i.color[2]);this.cloudLayers.forEach(e=>{const t=e.material;t.uniforms.baseColor.value=o}),this.atmosphericBelts.forEach(e=>{const t=e.material;t.uniforms.baseColor.value=new d(o.r*.8,o.g*1.2,o.b*.9)}),this.gasSwirls.forEach(e=>{const t=e.material;t.uniforms.color.value=new d(o.r,o.g*1.1,o.b*.8)}),this.consciousnessPulses.forEach(e=>{const t=e.material;t.uniforms.color.value=new d(o.r*1.2,o.g,o.b*1.3)})}}}function U(g,i,o){const t={seed:(o||Math.floor(Math.random()*1e6))+80004,color:i.color||[.6,.8,.4],cosmicOriginTime:i?.timing?.cosmic_origin_time||i?.cosmicOriginTime||v};return new M(g,t)}export{M as L,U as c};
