import{S as C}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as u,a as D}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as U,g as P,dh as L,di as G,av as f,au as F,C as S,D as W,bE as X,m as Y}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const n={RING_COUNT:{min:16,max:256},EXPANSION_SPEED:{min:1.5,max:5},WAVE_INTENSITY:{min:.6,max:2},MAX_RADIUS_MULTIPLIER:{min:1.5,max:10},GLOW_INTENSITY:{min:.5,max:2},TIME_SPEED:{min:.8,max:1.3}};class V{group;concentricRings=[];params;rng;planetRadius;cosmicOffset;constructor(t,e={}){this.planetRadius=t;const i=e.seed||Math.floor(Math.random()*1e6);this.rng=new C(i),this.params={color:e.color||[.3,1,.2],ringCount:e.ringCount||Math.floor(this.rng.random()*(n.RING_COUNT.max-n.RING_COUNT.min)+n.RING_COUNT.min),expansionSpeed:e.expansionSpeed||this.rng.random()*(n.EXPANSION_SPEED.max-n.EXPANSION_SPEED.min)+n.EXPANSION_SPEED.min,waveIntensity:e.waveIntensity||this.rng.random()*(n.WAVE_INTENSITY.max-n.WAVE_INTENSITY.min)+n.WAVE_INTENSITY.min,maxRadius:e.maxRadius||t*(this.rng.random()*(n.MAX_RADIUS_MULTIPLIER.max-n.MAX_RADIUS_MULTIPLIER.min)+n.MAX_RADIUS_MULTIPLIER.min),glowIntensity:e.glowIntensity||this.rng.random()*(n.GLOW_INTENSITY.max-n.GLOW_INTENSITY.min)+n.GLOW_INTENSITY.min,cosmicOriginTime:e.cosmicOriginTime||u,timeSpeed:e.timeSpeed||this.rng.random()*(n.TIME_SPEED.max-n.TIME_SPEED.min)+n.TIME_SPEED.min,seed:i},this.cosmicOffset=i%100*.1,this.group=new U,this.createConcentricRings()}createConcentricRings(){const t=this.params.ringCount,e=this.params.maxRadius;for(let i=0;i<t;i++){const s=i/(t-1),r=this.planetRadius*1.02+(e-this.planetRadius*1.02)*Math.pow(s,.8),c=64,g=[];for(let a=0;a<c;a++){const l=a/c*Math.PI*2,w=Math.cos(l)*r,O=Math.sin(l)*r,M=this.planetRadius*.005,A=Math.sin(l*7+i*2)*.5*.01*this.planetRadius,b=M+A;g.push(new P(w,b,O))}const E=new L(g,!0),R=this.planetRadius*.006,y=4,x=c,o=new G(E,x,R,y,!0),T=o.attributes.position.array,_=o.attributes.uv.array,m=T.length/3,h=new Float32Array(m),v=new Float32Array(m),I=new Float32Array(m);for(let a=0;a<m;a++){const l=_[a*2];h[a]=i*.6+l*Math.PI*4,v[a]=(r-this.planetRadius*1.02)/(e-this.planetRadius*1.02),I[a]=(i*7+a*3)%100/100}o.setAttribute("phase",new f(h,1)),o.setAttribute("distance",new f(v,1)),o.setAttribute("randomOffset",new f(I,1));const N=new F({transparent:!0,depthWrite:!1,depthTest:!0,blending:X,side:W,uniforms:{time:{value:0},color:{value:new S(this.params.color[0],this.params.color[1],this.params.color[2])},expansionSpeed:{value:this.params.expansionSpeed},waveIntensity:{value:this.params.waveIntensity},glowIntensity:{value:this.params.glowIntensity},ringIndex:{value:i},totalRings:{value:t}},vertexShader:`
          attribute float phase;
          attribute float distance;
          attribute float randomOffset;
          
          uniform float time;
          uniform float expansionSpeed;
          uniform float waveIntensity;
          uniform float ringIndex;
          uniform float totalRings;
          
          varying vec2 vUv;
          varying float vIntensity;
          varying float vDistance;
          
          void main() {
            vUv = uv;
            vDistance = distance;

            float wave1 = sin(phase + time * expansionSpeed) * 0.5 + 0.5;
            float wave2 = sin(phase * 2.0 - time * expansionSpeed * 1.3 + ringIndex * 0.8) * 0.3 + 0.7;
            float wave3 = cos(phase * 0.5 + time * expansionSpeed * 0.7 - ringIndex * 1.2) * 0.2 + 0.8;

            float expansionWave = sin(distance * 15.0 - time * expansionSpeed * 2.0) * 0.4 + 0.6;

            float globalPulse = sin(time * expansionSpeed * 0.5 + ringIndex * 0.3) * 0.2 + 0.8;

            vIntensity = wave1 * wave2 * wave3 * expansionWave * globalPulse * waveIntensity;

            float distanceFalloff = 1.0 - pow(distance, 1.2);
            vIntensity *= distanceFalloff;

            vIntensity *= (0.8 + randomOffset * 0.4);

            vec3 pos = position;
            pos.y += sin(phase + time * expansionSpeed * 0.5) * 2.0 * (1.0 - distance);
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float glowIntensity;
          uniform float time;
          uniform float expansionSpeed;
          
          varying vec2 vUv;
          varying float vIntensity;
          varying float vDistance;
          
          void main() {
            float centerDistance = abs(vUv.y - 0.5) * 2.0;
            float tubeFalloff = 1.0 - smoothstep(0.0, 1.0, centerDistance);

            float fragmentPulse = sin(time * expansionSpeed * 1.5) * 0.1 + 0.9;

            float finalIntensity = vIntensity * glowIntensity * fragmentPulse * tubeFalloff;

            vec3 finalColor = color;

            if (finalIntensity > 0.7) {
              finalColor = mix(color, vec3(0.5, 1.0, 0.1), (finalIntensity - 0.7) * 2.0);
            }

            finalColor *= finalIntensity;

            float alpha = max(finalIntensity * 0.7, finalIntensity * vDistance * 0.3);
            
            gl_FragColor = vec4(finalColor, alpha);
          }
        `}),d=new Y(o,N);d.renderOrder=1e3+i,this.concentricRings.push(d),this.group.add(d)}}update(t){const s=(D(this.params.cosmicOriginTime||u)+this.cosmicOffset)*(this.params.timeSpeed||1)%1e4;this.concentricRings.forEach(r=>{const c=r.material;c.uniforms.time.value=s}),this.group.rotation.y=s*.05}getObject3D(){return this.group}addToScene(t,e){e&&this.group.position.copy(e),t.add(this.group)}removeFromScene(t){t.remove(this.group)}dispose(){this.concentricRings.forEach(t=>{t.geometry.dispose(),t.material.dispose()}),this.group.clear()}setEnabled(t){this.group.visible=t}updateParams(t){if(Object.assign(this.params,t),t.color){const e=new S(t.color[0],t.color[1],t.color[2]);this.concentricRings.forEach(i=>{const s=i.material;s.uniforms.color.value=e})}t.expansionSpeed!==void 0&&this.concentricRings.forEach(e=>{const i=e.material;i.uniforms.expansionSpeed.value=t.expansionSpeed}),t.waveIntensity!==void 0&&this.concentricRings.forEach(e=>{const i=e.material;i.uniforms.waveIntensity.value=t.waveIntensity}),t.glowIntensity!==void 0&&this.concentricRings.forEach(e=>{const i=e.material;i.uniforms.glowIntensity.value=t.glowIntensity})}}function H(p,t,e){const s={seed:(e||Math.floor(Math.random()*1e6))+42424,color:t.color||[.3,1,.2],cosmicOriginTime:t?.timing?.cosmic_origin_time||t?.cosmicOriginTime||u};return new V(p,s)}export{V as R,H as c};
