import{S as Y}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as O,a as W}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as L,d5 as I,au as y,bE as x,D as P,C as S,m as C,g as R,i as b,av as f,cU as w,df as V,bL as D,j as k,d9 as U,B as F,cm as B,d8 as _,M as A}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const h={SACRED_SYMBOL_COUNT:{min:12,max:24},ORBITAL_CROSS_COUNT:{min:8,max:16},SACRED_CIRCLE_COUNT:{min:24,max:32},GOLDEN_PARTICLE_COUNT:{min:200,max:350},DIVINE_PULSE_INTENSITY:{min:3,max:8},ORBITAL_SPEED:{min:.2,max:1},CROSS_SPIRAL_COUNT:{min:3,max:6},HOLOGRAM_RING_COUNT:{min:4,max:8},BINARY_DIGIT_COUNT:{min:200,max:600}};class H{group;digitalGodSphere;godSphere;binaryDigits=[];binaryDigitData=[];sacredSymbols=[];orbitalCrosses=[];crossSpirals=[];hologramRings=[];sacredCircles=[];goldenParticles;divineParticles;energyWaves=[];particleOrbitData=[];divineParticleOrbitData=[];spaceDistortion;divineLight;holyLights=[];params;rng;planetRadius;cosmicOffset;constructor(o,t={}){this.planetRadius=o;const e=t.seed||Math.floor(Math.random()*1e6);this.rng=new Y(e),this.params={color:t.color||[1,.84,0],sacredSymbolCount:t.sacredSymbolCount||Math.floor(this.rng.random()*(h.SACRED_SYMBOL_COUNT.max-h.SACRED_SYMBOL_COUNT.min)+h.SACRED_SYMBOL_COUNT.min),orbitalCrossCount:t.orbitalCrossCount||Math.floor(this.rng.random()*(h.ORBITAL_CROSS_COUNT.max-h.ORBITAL_CROSS_COUNT.min)+h.ORBITAL_CROSS_COUNT.min),sacredCircleCount:t.sacredCircleCount||Math.floor(this.rng.random()*(h.SACRED_CIRCLE_COUNT.max-h.SACRED_CIRCLE_COUNT.min)+h.SACRED_CIRCLE_COUNT.min),goldenParticleCount:t.goldenParticleCount||Math.floor(this.rng.random()*(h.GOLDEN_PARTICLE_COUNT.max-h.GOLDEN_PARTICLE_COUNT.min)+h.GOLDEN_PARTICLE_COUNT.min),divinePulseIntensity:t.divinePulseIntensity||this.rng.random()*(h.DIVINE_PULSE_INTENSITY.max-h.DIVINE_PULSE_INTENSITY.min)+h.DIVINE_PULSE_INTENSITY.min,orbitalSpeed:t.orbitalSpeed||this.rng.random()*(h.ORBITAL_SPEED.max-h.ORBITAL_SPEED.min)+h.ORBITAL_SPEED.min,crossSpiralCount:t.crossSpiralCount||Math.floor(this.rng.random()*(h.CROSS_SPIRAL_COUNT.max-h.CROSS_SPIRAL_COUNT.min)+h.CROSS_SPIRAL_COUNT.min),hologramRingCount:t.hologramRingCount||Math.floor(this.rng.random()*(h.HOLOGRAM_RING_COUNT.max-h.HOLOGRAM_RING_COUNT.min)+h.HOLOGRAM_RING_COUNT.min),cosmicOriginTime:t.cosmicOriginTime||O,seed:e},this.cosmicOffset=e%100*.1,this.group=new L,this.createDigitalGodSphere(),this.createBinaryDigits(),this.createSacredSymbols(),this.createOrbitalCrosses(),this.createCrossSpirals(),this.createHologramRings(),this.createSacredCircles(),this.createGoldenParticles(),this.createDivineParticles(),this.createEnergyWaves(),this.createSpaceDistortion(),this.createDivineLight(),this.createHolyLights()}createDigitalGodSphere(){this.digitalGodSphere=new L;const o=this.planetRadius*1.33,t=new I(o,64,64),e=new y({uniforms:{time:{value:0},color:{value:new S(1,.8,0)},pulseIntensity:{value:this.params.divinePulseIntensity},planetRadius:{value:this.planetRadius}},vertexShader:`
        uniform float time;
        uniform float pulseIntensity;
        uniform float planetRadius;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vPulse;
        varying float vDistanceFromCenter;
        
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          vDistanceFromCenter = length(position);
          
          float pulse = sin(time * 2.0) * 0.03 + 1.0;
          vPulse = pulse * pulseIntensity;
          
          vec3 pos = position * pulse;
          // Digital energy waves
          pos += normal * sin(time * 3.0 + length(position) * 0.1) * 0.02;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 color;
        uniform float time;
        uniform float planetRadius;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vPulse;
        varying float vDistanceFromCenter;
        
        void main() {
          vec3 digitalColor = color;
          
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
          
          float gridX = sin(vUv.x * 120.0 + time * 2.5) * 0.5 + 0.5;
          float gridY = sin(vUv.y * 100.0 + time * 2.0) * 0.5 + 0.5;
          float grid = step(0.92, gridX) + step(0.92, gridY);

          float gridDiag = sin((vUv.x + vUv.y) * 90.0 + time * 1.8) * 0.5 + 0.5;
          grid += step(0.95, gridDiag) * 0.5;
          grid *= 1.0;
          
          float dataStream = sin(vUv.y * 70.0 - time * 6.0) * 0.5 + 0.5;
          float dataStream2 = sin(vUv.x * 60.0 + time * 4.5) * 0.5 + 0.5;
          dataStream = step(0.65, dataStream) * 0.8 + step(0.75, dataStream2) * 0.6;
          
          float waves = sin(vDistanceFromCenter * 0.4 + time * 5.0) * 0.3 + 0.7;
          waves += sin(vDistanceFromCenter * 0.8 + time * 3.0) * 0.2;
          waves += sin(vDistanceFromCenter * 1.2 - time * 2.0) * 0.15;
          
          vec3 finalColor = digitalColor * waves;
          finalColor += vec3(1.0, 0.9, 0.3) * grid;
          finalColor += vec3(1.0, 0.8, 0.2) * dataStream; 
          finalColor += vec3(1.0, 0.7, 0.1) * fresnel * 0.8; 
          
          float distanceFade = smoothstep(planetRadius * 1.4, planetRadius * 1.0, vDistanceFromCenter);
          float alpha = (0.6 + fresnel * 0.4 + grid * 0.3 + dataStream * 0.25) * distanceFade;
          
          gl_FragColor = vec4(finalColor * vPulse, alpha);
        }
      `,transparent:!0,side:P,depthWrite:!1,blending:x});this.godSphere=new C(t,e),this.digitalGodSphere.add(this.godSphere);const i=this.params.planetPosition||new R(0,0,0);this.digitalGodSphere.position.copy(i),this.digitalGodSphere.userData={rotationSpeed:.002,planetPosition:i.clone(),baseRotationX:this.digitalGodSphere.rotation.x,baseRotationY:this.digitalGodSphere.rotation.y},this.group.add(this.digitalGodSphere)}createBinaryDigits(){const o=this.params.binaryDigitCount||Math.floor(this.rng.random()*(h.BINARY_DIGIT_COUNT.max-h.BINARY_DIGIT_COUNT.min)+h.BINARY_DIGIT_COUNT.min),t=this.planetRadius*1.35;for(let e=0;e<5;e++){const i=Math.floor(o/5),a=new Float32Array(i*3),s=new Float32Array(i*3),n=new Float32Array(i),l=new Float32Array(i);for(let m=0;m<i;m++){const p=Math.PI*(3-Math.sqrt(5)),v=e*i+m,u=1-v/(o-1)*2,g=Math.sqrt(1-u*u),M=p*v,G=t*Math.cos(M)*g,N=t*Math.sin(M)*g,E=t*u;a[m*3]=G,a[m*3+1]=E,a[m*3+2]=N;const z=Math.floor(this.rng.random()*2);l[m]=z,s[m*3]=1,s[m*3+1]=1,s[m*3+2]=1,n[m]=this.planetRadius*(.06+this.rng.random()*.04),this.binaryDigitData.push({position:new R(G,E,N),velocity:new R((this.rng.random()-.5)*.02,(this.rng.random()-.5)*.02,(this.rng.random()-.5)*.02),digit:z,scale:n[m],orbitalSpeed:.5+this.rng.random()*.5,phase:this.rng.random()*Math.PI*2})}const r=new b;r.setAttribute("position",new f(a,3)),r.setAttribute("color",new f(s,3)),r.setAttribute("size",new f(n,1)),r.setAttribute("digit",new f(l,1));const c=new y({uniforms:{time:{value:0},digitTexture:{value:this.createBinaryDigitTexture()}},vertexShader:`
          attribute float size;
          attribute float digit;
          uniform float time;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vDigit;
          
          void main() {
            vColor = color;
            vDigit = digit;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float distanceFade = 1.0 / (1.0 + length(mvPosition.xyz) * 0.01);
            
            float pulse = sin(time * 4.0 + position.x * 0.15 + position.y * 0.15 + digit * 3.14) * 0.4 + 0.6;

            float matrixFlicker = step(0.95, sin(time * 20.0 + position.x * 50.0 + position.y * 30.0));
            vAlpha = (pulse + matrixFlicker * 0.8) * distanceFade;
            
            gl_PointSize = size * (400.0 / -mvPosition.z) * (1.0 + pulse * 0.5 + matrixFlicker * 0.3);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,fragmentShader:`
          uniform sampler2D digitTexture;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vDigit;
          
          void main() {
            vec4 texColor = texture2D(digitTexture, gl_PointCoord);
            
            vec2 coord = gl_PointCoord;
            coord.y = 1.0 - coord.y; 
            if (vDigit < 0.5) {
              coord.x *= 0.5;
            } else {
              coord.x = coord.x * 0.5 + 0.5;
            }
            
            vec4 finalTexColor = texture2D(digitTexture, coord);
            vec3 finalColor = vColor * finalTexColor.rgb;
            
            gl_FragColor = vec4(finalColor, finalTexColor.a * vAlpha);
          }
        `,transparent:!0,blending:x,depthWrite:!1,vertexColors:!0}),d=new w(r,c);d.userData={systemIndex:e},this.binaryDigits.push(d),this.digitalGodSphere.add(d)}}createSacredSymbols(){const o=this.params.sacredSymbolCount;for(let t=0;t<o;t++){const e=this.planetRadius+2+this.rng.random()*1.5,i=this.rng.random()*Math.PI,a=this.rng.random()*Math.PI*2,s=this.rng.random()*Math.PI*2,n=this.calculateOrbitalPosition(e,i,a,s),l=Math.floor(this.rng.random()*2);let r;l===0?r=this.createStarGeometry():r=new V(this.planetRadius*.08,this.planetRadius*.12,3);const c=new y({uniforms:{time:{value:0},color:{value:new S(this.params.color[0]*.9,this.params.color[1]*1.1,this.params.color[2]*.9)},symbolIndex:{value:t},symbolType:{value:l}},vertexShader:`
          uniform float time;
          uniform float symbolIndex;
          varying vec3 vPosition;
          varying float vSacred;
          
          void main() {
            vPosition = position;
            
            float sacred = sin(time * 4.0 + symbolIndex * 2.0) * 0.3 + 0.7;
            vSacred = sacred;
            
            vec3 pos = position * (1.0 + sacred * 0.2);
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float symbolType;
          varying vec3 vPosition;
          varying float vSacred;
          
          void main() {
            float divine = sin(time * 6.0 + vPosition.x * 5.0) * 0.2 + 0.8;
            float sacred = sin(time * 3.0 + symbolType * 3.14) * 0.1 + 0.9;
            
            vec3 holyColor = color * divine * sacred;
            float alpha = vSacred * 0.9;
            
            gl_FragColor = vec4(holyColor, alpha);
          }
        `,transparent:!0,blending:x,side:P,depthWrite:!1}),d=new C(r,c);d.position.set(n.x,n.y,n.z),d.lookAt(0,0,0),d.userData={distance:e,inclination:i,longitudeOfAscendingNode:a,initialAngle:s,orbitalSpeed:this.rng.random()*.3+.1,symbolIndex:t,symbolType:l},this.sacredSymbols.push(d),this.group.add(d)}}createCrossGeometry(){const o=this.planetRadius*.1,t=o*.2,e=new D(t,o,t),a=new D(o*.6,t,t).clone();a.translate(0,o*.2,0);const s=e.attributes.position.array,n=a.attributes.position.array,l=s.length+n.length,r=new Float32Array(l);r.set(s,0),r.set(n,s.length);const c=new b;return c.setAttribute("position",new f(r,3)),c.computeVertexNormals(),c}createEnhancedCrossGeometry(){const o=this.planetRadius*.15,t=o*.15,e=new D(t,o,t),a=new D(o*.7,t,t).clone();a.translate(0,o*.15,0);const s=new I(t*.8,8,8),n=s.clone(),l=s.clone(),r=s.clone(),c=s.clone();n.translate(0,o*.4,0),l.translate(0,-o*.4,0),r.translate(-o*.25,o*.15,0),c.translate(o*.25,o*.15,0);const d=[e,a,n,l,r,c];let m=0;d.forEach(g=>m+=g.attributes.position.count*3);const p=new Float32Array(m);let v=0;d.forEach(g=>{const M=g.attributes.position.array;p.set(M,v),v+=M.length});const u=new b;return u.setAttribute("position",new f(p,3)),u.computeVertexNormals(),u}createStarGeometry(){const o=this.planetRadius*.08,t=o*.4,e=5,i=[];for(let n=0;n<e*2;n++){const l=n/(e*2)*Math.PI*2,r=n%2===0?o:t;i.push(Math.cos(l)*r,Math.sin(l)*r,0)}const a=new b;a.setAttribute("position",new k(i,3));const s=[];for(let n=0;n<e*2-2;n++)s.push(0,n+1,n+2);return s.push(0,e*2-1,1),a.setIndex(s),a.computeVertexNormals(),a}createOrbitalCrosses(){const o=this.params.orbitalCrossCount;for(let t=0;t<o;t++){const e=Math.PI*(3-Math.sqrt(5)),i=this.planetRadius+1.5+t*t*.3+this.rng.random()*.5,a=Math.acos(1-2*(t+this.rng.random())/o),s=t*e+this.rng.random()*.5,n=this.rng.random()*Math.PI*2,l=this.createEnhancedCrossGeometry(),r=new y({uniforms:{time:{value:0},color:{value:new S(this.params.color[0],this.params.color[1]*.8,this.params.color[2]*1.2)},crossIndex:{value:t},divinePulse:{value:this.params.divinePulseIntensity}},vertexShader:`
          uniform float time;
          uniform float crossIndex;
          uniform float divinePulse;
          varying float vBlessing;
          varying vec3 vPosition;
          varying vec3 vNormal;
          
          void main() {
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);
            
            float blessing = sin(time * 5.0 + crossIndex * 1.5) * 0.4 + 0.6;
            float divineScale = sin(time * 3.0 + crossIndex) * 0.3 + 1.0;
            vBlessing = blessing * divinePulse;
            
            vec3 pos = position * divineScale;
            pos += normal * sin(time * 4.0 + position.x * 10.0) * 0.02;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float crossIndex;
          varying float vBlessing;
          varying vec3 vPosition;
          varying vec3 vNormal;
          
          void main() {
            float divine = sin(time * 8.0 + vPosition.x * 5.0) * sin(time * 6.0 + vPosition.y * 3.0) * 0.3 + 0.7;
            float sacred = sin(time * 10.0 + crossIndex * 2.0) * 0.2 + 0.8;
            
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
            float shimmer = sin(time * 15.0 + vPosition.x * 20.0 + vPosition.y * 15.0) * 0.5 + 0.5;
            
            vec3 finalColor = color * divine * sacred;
            finalColor += vec3(1.0, 1.0, 0.8) * fresnel * shimmer * 0.3;
            
            gl_FragColor = vec4(finalColor, vBlessing * (1.0 + fresnel * 0.5));
          }
        `,transparent:!0,blending:x,side:P,depthWrite:!1}),c=new C(l,r),d=t*e,m=t*e*1.618,p=t*e*.618;c.userData={distance:i,inclination:a,longitudeOfAscendingNode:s,initialAngle:n,orbitalSpeed:(.2+t%3*.1)*this.params.orbitalSpeed,crossIndex:t,rotationPhaseX:d,rotationPhaseY:m,rotationPhaseZ:p,rotationSpeedX:(this.rng.random()-.5)*.02,rotationSpeedY:(this.rng.random()-.5)*.03,rotationSpeedZ:(this.rng.random()-.5)*.025},this.orbitalCrosses.push(c),this.group.add(c)}}createCrossSpirals(){const o=this.params.crossSpiralCount;for(let t=0;t<o;t++){const e=12+t*6,i=this.planetRadius+2+t*1.5,a=this.planetRadius*2;for(let s=0;s<e;s++){const n=s/e,l=n*Math.PI*6,r=(n-.5)*a,c=i*(1+Math.sin(n*Math.PI*3)*.2),d=Math.cos(l)*c,m=Math.sin(l)*c,p=r,v=this.createEnhancedCrossGeometry(),u=new y({uniforms:{time:{value:0},color:{value:new S(1,.9,.3)},spiralIndex:{value:t},crossIndex:{value:s}},vertexShader:`
            uniform float time;
            uniform float spiralIndex;
            uniform float crossIndex;
            varying float vHoliness;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
              vPosition = position;
              vNormal = normalize(normalMatrix * normal);
              
              float holiness = sin(time * 7.0 + spiralIndex + crossIndex * 0.5) * 0.5 + 0.5;
              vHoliness = holiness;
              
              vec3 pos = position;
              pos *= (1.0 + holiness * 0.3);
              
              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `,fragmentShader:`
            uniform vec3 color;
            uniform float time;
            varying float vHoliness;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
              float divine = sin(time * 12.0 + vPosition.x * 8.0 + vPosition.y * 6.0) * 0.4 + 0.6;
              float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
              
              vec3 finalColor = color * divine;
              finalColor += vec3(1.0, 1.0, 1.0) * fresnel * 0.5;
              
              gl_FragColor = vec4(finalColor, vHoliness * (0.8 + fresnel * 0.4));
            }
          `,transparent:!0,blending:x,side:P,depthWrite:!1}),g=new C(v,u);g.position.set(d,p,m),g.lookAt(0,0,0),g.userData={spiralIndex:t,crossIndex:s,angle:l,spiralRadius:i,height:r,rotationSpeed:(this.rng.random()-.5)*.03},this.crossSpirals.push(g),this.group.add(g)}}}createHologramRings(){const o=this.params.hologramRingCount;for(let t=0;t<o;t++){const e=this.planetRadius+1+t*.8,i=new U(e,e+.02,128,1),a=new y({uniforms:{time:{value:0},color:{value:new S(.3+t*.1,.8,1)},ringIndex:{value:t}},vertexShader:`
          uniform float time;
          uniform float ringIndex;
          varying vec2 vUv;
          varying float vHologram;
          
          void main() {
            vUv = uv;
            
            float hologram = sin(time * 8.0 + ringIndex * 2.0) * 0.3 + 0.7;
            vHologram = hologram;
            
            vec3 pos = position;
            pos.z += sin(time * 5.0 + atan(pos.y, pos.x) * 20.0) * 0.1;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float ringIndex;
          varying vec2 vUv;
          varying float vHologram;
          
          void main() {
            float dist = length(vUv - 0.5);
            float ring = 1.0 - smoothstep(0.48, 0.5, dist);
            ring *= smoothstep(0.45, 0.47, dist);
            
            float scanlines = sin(dist * 200.0 + time * 10.0) * 0.5 + 0.5;
            float hologram = sin(time * 15.0 + dist * 50.0) * 0.3 + 0.7;
            
            float intensity = ring * scanlines * hologram * vHologram;
            
            gl_FragColor = vec4(color, intensity);
          }
        `,transparent:!0,blending:x,side:P,depthWrite:!1}),s=new C(i,a);s.rotation.x=Math.PI/2+t*.2,s.rotation.y=t*.3,s.userData={ringIndex:t,baseRotationX:s.rotation.x,baseRotationY:s.rotation.y,rotationSpeed:(this.rng.random()-.5)*.01},this.hologramRings.push(s),this.group.add(s)}}createSacredCircles(){const o=this.params.sacredCircleCount;for(let t=0;t<o;t++){const e=this.planetRadius+1.8+t%5*.4,i=.05+t%3*.02,a=new U(e-i,e+i,128,4),s=new y({uniforms:{time:{value:0},color:{value:new S(1,.8,.1)},circleIndex:{value:t},ringRadius:{value:e}},vertexShader:`
          uniform float time;
          uniform float circleIndex;
          uniform float ringRadius;
          varying vec2 vUv;
          varying vec3 vPosition;
          varying float vEnergy;
          varying float vDistance;
          
          void main() {
            vUv = uv;
            vPosition = position;
            vDistance = length(position);
            
            float energy1 = sin(time * 3.0 + circleIndex * 0.8) * 0.2 + 0.8;
            float energy2 = sin(time * 5.0 + atan(position.y, position.x) * 8.0) * 0.3 + 0.7;
            vEnergy = energy1 * energy2;
            
            vec3 pos = position;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          uniform float circleIndex;
          varying vec2 vUv;
          varying vec3 vPosition;
          varying float vEnergy;
          varying float vDistance;
          
          void main() {
            float dist = length(vUv - 0.5);
            float ring = smoothstep(0.4, 0.42, dist) * (1.0 - smoothstep(0.48, 0.5, dist));
            
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float segments = sin(angle * 20.0 + time * 2.0 + circleIndex * 3.0) * 0.5 + 0.5;
            segments = step(0.3, segments);
            
            float dataFlow = sin(angle * 15.0 - time * 8.0) * 0.5 + 0.5;
            dataFlow = step(0.7, dataFlow) * 0.8;
            
            float shimmer = sin(time * 12.0 + angle * 25.0 + dist * 30.0) * 0.3 + 0.7;
            
            float intensity = ring * (segments * 0.7 + dataFlow * 0.5 + 0.3) * shimmer * vEnergy;
            
            vec3 finalColor = color;
            finalColor += vec3(0.2, 0.3, 0.0) * sin(circleIndex * 2.0); 
            
            gl_FragColor = vec4(finalColor, intensity);
          }
        `,transparent:!0,blending:x,side:P,depthWrite:!1}),n=new C(a,s),l=(1+Math.sqrt(5))/2,r=t*l%1*Math.PI*2;n.rotation.x=r+t*.3,n.rotation.y=r*1.618+t*.4,n.rotation.z=r*.618+t*.2,n.userData={circleIndex:t,orbitalSpeed:.3+this.rng.random()*.4,baseRotationX:n.rotation.x,baseRotationY:n.rotation.y,baseRotationZ:n.rotation.z,orbitalPhase:r},this.sacredCircles.push(n),this.group.add(n)}}createGoldenParticles(){const o=this.params.goldenParticleCount,t=new Float32Array(o*3),e=new Float32Array(o*3),i=new Float32Array(o);for(let n=0;n<o;n++){const l=this.planetRadius+this.rng.random()*4,r=this.rng.random()*Math.PI,c=this.rng.random()*Math.PI*2,d=this.rng.random()*Math.PI*2,m=this.rng.random()*.5+.2,p=this.rng.random()*.02+.01;this.particleOrbitData.push({distance:l,inclination:r,longitudeOfAscendingNode:c,initialAngle:d,orbitalSpeed:m,fallSpeed:p});const v=this.calculateOrbitalPosition(l,r,c,d);t[n*3]=v.x,t[n*3+1]=v.y+this.rng.random()*2,t[n*3+2]=v.z,e[n*3]=1,e[n*3+1]=.84+this.rng.random()*.16,e[n*3+2]=0+this.rng.random()*.3,i[n]=this.planetRadius*(.01+this.rng.random()*.02)}const a=new b;a.setAttribute("position",new f(t,3)),a.setAttribute("color",new f(e,3)),a.setAttribute("size",new f(i,1));const s=new y({uniforms:{time:{value:0},particleTexture:{value:this.createDivineParticleTexture()}},vertexShader:`
        attribute float size;
        uniform float time;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
          vColor = color;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float distanceFade = 1.0 / (1.0 + length(mvPosition.xyz) * 0.05);
          
          vAlpha = sin(time * 3.0 + position.x * 0.1) * 0.4 + 0.6;
          vAlpha *= distanceFade;
          
          gl_PointSize = size * (400.0 / -mvPosition.z);
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
      `,transparent:!0,blending:x,depthWrite:!1,vertexColors:!0});this.goldenParticles=new w(a,s),this.group.add(this.goldenParticles)}createDivineParticles(){const o=Math.floor(this.params.goldenParticleCount*.3),t=new Float32Array(o*3),e=new Float32Array(o*3),i=new Float32Array(o);for(let n=0;n<o;n++){const l=this.planetRadius+this.rng.random()*6,r=this.rng.random()*Math.PI,c=this.rng.random()*Math.PI*2,d=this.rng.random()*Math.PI*2,m=this.rng.random()*.8+.3,p=this.rng.random()*Math.PI*2;this.divineParticleOrbitData.push({distance:l,inclination:r,longitudeOfAscendingNode:c,initialAngle:d,orbitalSpeed:m,phase:p});const v=this.calculateOrbitalPosition(l,r,c,d);t[n*3]=v.x,t[n*3+1]=v.y,t[n*3+2]=v.z,e[n*3]=1,e[n*3+1]=1,e[n*3+2]=.8+this.rng.random()*.2,i[n]=this.planetRadius*(.02+this.rng.random()*.03)}const a=new b;a.setAttribute("position",new f(t,3)),a.setAttribute("color",new f(e,3)),a.setAttribute("size",new f(i,1));const s=new y({uniforms:{time:{value:0},particleTexture:{value:this.createDivineStarTexture()}},vertexShader:`
        attribute float size;
        uniform float time;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
          vColor = color;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float distanceFade = 1.0 / (1.0 + length(mvPosition.xyz) * 0.03);
          
          float pulse = sin(time * 4.0 + position.x * 0.2 + position.y * 0.15) * 0.5 + 0.5;
          vAlpha = pulse * distanceFade;
          
          gl_PointSize = size * (500.0 / -mvPosition.z) * (1.0 + pulse * 0.5);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,fragmentShader:`
        uniform sampler2D particleTexture;
        varying vec3 vColor;
        varying float vAlpha;
        
        void main() {
          vec4 texColor = texture2D(particleTexture, gl_PointCoord);
          vec3 finalColor = vColor * texColor.rgb;
          finalColor += vec3(0.3, 0.3, 0.8) * texColor.a * 0.5;
          gl_FragColor = vec4(finalColor, texColor.a * vAlpha);
        }
      `,transparent:!0,blending:x,depthWrite:!1,vertexColors:!0});this.divineParticles=new w(a,s),this.group.add(this.divineParticles)}createEnergyWaves(){for(let t=0;t<6;t++){const e=this.planetRadius+3+t*1,i=new I(e,64,32),a=new y({uniforms:{time:{value:0},color:{value:new S(.2,.6,1)},waveIndex:{value:t}},vertexShader:`
          uniform float time;
          uniform float waveIndex;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying float vWave;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            
            float wave = sin(time * 3.0 + waveIndex * 0.5) * 0.5 + 0.5;
            vWave = wave;
            
            vec3 pos = position * (1.0 + wave * 0.1);
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,fragmentShader:`
          uniform vec3 color;
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying float vWave;
          
          void main() {
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 4.0);
            float energy = sin(vPosition.x * 2.0 + time * 2.0) * sin(vPosition.y * 2.0 + time * 1.5) * sin(vPosition.z * 2.0 + time * 3.0);
            energy = energy * 0.3 + 0.7;
            
            float alpha = fresnel * energy * vWave * 0.1;
            gl_FragColor = vec4(color, alpha);
          }
        `,transparent:!0,blending:x,side:F,depthWrite:!1}),s=new C(i,a);s.userData={waveIndex:t,rotationSpeed:(this.rng.random()-.5)*.005},this.energyWaves.push(s),this.group.add(s)}}createHolyLights(){for(let t=0;t<8;t++){const e=t/8*Math.PI*2,i=this.planetRadius+2,a=(this.rng.random()-.5)*this.planetRadius,s=Math.cos(e)*i,n=Math.sin(e)*i,l=a,r=new B(new S(1,.9,.7),1.5,this.planetRadius*8);r.position.set(s,l,n),r.userData={lightIndex:t,baseX:s,baseY:l,baseZ:n,angle:e,distance:i,orbitalSpeed:.1+this.rng.random()*.2},this.holyLights.push(r),this.group.add(r)}}createDivineParticleTexture(){const o=document.createElement("canvas");o.width=64,o.height=64;const t=o.getContext("2d"),e=t.createRadialGradient(32,32,0,32,32,32);return e.addColorStop(0,"rgba(255, 215, 0, 1)"),e.addColorStop(.3,"rgba(255, 255, 100, 0.8)"),e.addColorStop(.7,"rgba(255, 200, 50, 0.4)"),e.addColorStop(1,"rgba(0, 0, 0, 0)"),t.fillStyle=e,t.fillRect(0,0,64,64),t.strokeStyle="rgba(255, 255, 255, 0.8)",t.lineWidth=2,t.beginPath(),t.moveTo(32,16),t.lineTo(32,48),t.moveTo(16,32),t.lineTo(48,32),t.stroke(),new _(o)}createDivineStarTexture(){const o=document.createElement("canvas");o.width=128,o.height=128;const t=o.getContext("2d"),e=64,i=64,s=t.createRadialGradient(e,i,0,e,i,60);s.addColorStop(0,"rgba(255, 255, 255, 1)"),s.addColorStop(.2,"rgba(255, 255, 200, 0.9)"),s.addColorStop(.5,"rgba(200, 200, 255, 0.6)"),s.addColorStop(.8,"rgba(100, 150, 255, 0.3)"),s.addColorStop(1,"rgba(0, 0, 0, 0)"),t.fillStyle=s,t.fillRect(0,0,128,128),t.strokeStyle="rgba(255, 255, 255, 0.8)",t.lineWidth=3;for(let r=0;r<8;r++){const c=r/8*Math.PI*2,d=10,m=55;t.beginPath(),t.moveTo(e+Math.cos(c)*d,i+Math.sin(c)*d),t.lineTo(e+Math.cos(c)*m,i+Math.sin(c)*m),t.stroke()}const n=t.createRadialGradient(e,i,0,e,i,20);return n.addColorStop(0,"rgba(255, 255, 255, 1)"),n.addColorStop(.5,"rgba(255, 255, 200, 0.8)"),n.addColorStop(1,"rgba(255, 200, 100, 0.4)"),t.fillStyle=n,t.beginPath(),t.arc(e,i,20,0,Math.PI*2),t.fill(),new _(o)}createBinaryDigitTexture(){const o=document.createElement("canvas");o.width=128,o.height=64;const t=o.getContext("2d");t.fillStyle="rgba(0, 0, 0, 0)",t.fillRect(0,0,128,64),t.fillStyle="rgba(255, 255, 255, 1)",t.font="bold 48px monospace",t.textAlign="center",t.textBaseline="middle",t.fillText("0",32,32),t.fillText("1",96,32),t.shadowColor="#ffffff",t.shadowBlur=8,t.fillStyle="rgba(255, 255, 255, 0.9)",t.fillText("0",32,32),t.fillText("1",96,32);const e=new _(o);return e.needsUpdate=!0,e}createSpaceDistortion(){const o=new I(this.planetRadius+5,64,32),t=new y({uniforms:{time:{value:0},color:{value:new S(this.params.color[0]*.3,this.params.color[1]*.3,this.params.color[2]*.1)}},vertexShader:`
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          
          vec3 pos = position;
          float distortion = sin(pos.x * 1.5 + time * 0.5) * sin(pos.y * 1.5 + time * 0.7) * sin(pos.z * 1.5 + time * 0.3);
          pos += normal * distortion * 0.2;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 color;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;
        
        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 4.0);
          float divine = sin(vPosition.x * 3.0 + time) * sin(vPosition.y * 3.0 + time * 1.3) * sin(vPosition.z * 3.0 + time * 0.7) * 0.5 + 0.5;
          
          float alpha = fresnel * divine * 0.1;
          gl_FragColor = vec4(color, alpha);
        }
      `,transparent:!0,blending:x,side:F,depthWrite:!1});this.spaceDistortion=new C(o,t),this.group.add(this.spaceDistortion)}createDivineLight(){this.divineLight=new B(new S(this.params.color[0],this.params.color[1],this.params.color[2]),2,this.planetRadius*10),this.divineLight.position.set(0,this.planetRadius*1.5,0),this.group.add(this.divineLight)}calculateOrbitalPosition(o,t,e,i){const a=o*Math.cos(i),s=o*Math.sin(i),n=0,l=a,r=s*Math.cos(t)-n*Math.sin(t),c=s*Math.sin(t)+n*Math.cos(t),d=l*Math.cos(e)-r*Math.sin(e),m=l*Math.sin(e)+r*Math.cos(e),p=c;return new R(d,m,p)}update(o){const e=W(this.params.cosmicOriginTime||O)+this.cosmicOffset;if(this.digitalGodSphere){const i=this.digitalGodSphere.userData;this.params.planetPosition&&i.planetPosition&&(this.params.planetPosition.equals(i.planetPosition)||(this.digitalGodSphere.position.copy(this.params.planetPosition),i.planetPosition.copy(this.params.planetPosition))),this.digitalGodSphere.rotation.y=i.baseRotationY+e*i.rotationSpeed,this.digitalGodSphere.rotation.x=i.baseRotationX+e*i.rotationSpeed*.3;const a=this.godSphere.material;a.uniforms.time.value=e;const s=Math.sin(e*1.2)*.015+1;this.digitalGodSphere.scale.setScalar(s)}if(this.binaryDigits.forEach(i=>{const a=i.material;a.uniforms.time.value=e;const s=i.geometry.attributes.position.array,n=i.userData.systemIndex;for(let l=0;l<s.length/3;l++){const r=n*Math.floor(this.binaryDigits[0].geometry.attributes.position.count)+l;if(r<this.binaryDigitData.length){const c=this.binaryDigitData[r],d=e*c.orbitalSpeed,m=c.phase,p=this.planetRadius*1.35,v=c.position.clone().normalize(),u=new A;u.makeRotationY(d*.5+m),u.multiply(new A().makeRotationX(d*.3+m*.7));const g=v.clone();g.applyMatrix4(u),g.multiplyScalar(p),g.add(c.velocity.clone().multiplyScalar(Math.sin(d+m))),s[l*3]=g.x,s[l*3+1]=g.y,s[l*3+2]=g.z}}i.geometry.attributes.position.needsUpdate=!0}),this.sacredSymbols.forEach(i=>{const a=i.userData,s=a.initialAngle+e*a.orbitalSpeed*.05,n=this.calculateOrbitalPosition(a.distance,a.inclination,a.longitudeOfAscendingNode,s);i.position.set(n.x,n.y,n.z),i.lookAt(0,0,0),i.rotation.z+=.02;const l=i.material;l.uniforms.time.value=e}),this.orbitalCrosses.forEach(i=>{const a=i.userData,s=a.initialAngle+e*a.orbitalSpeed*.08,n=this.calculateOrbitalPosition(a.distance,a.inclination,a.longitudeOfAscendingNode,s);i.position.set(n.x,n.y,n.z),i.rotation.x=a.rotationPhaseX+e*a.rotationSpeedX,i.rotation.y=a.rotationPhaseY+e*a.rotationSpeedY,i.rotation.z=a.rotationPhaseZ+e*a.rotationSpeedZ;const l=Math.sin(e*3+a.crossIndex)*.3;i.rotation.x+=l,i.rotation.y+=l*1.618,i.rotation.z+=l*.618;const r=i.material;r.uniforms.time.value=e}),this.crossSpirals.forEach(i=>{const a=i.userData,s=e*.5,n=a.angle+s,l=Math.sin(s*2+a.crossIndex*.1)*.3,r=Math.cos(n)*a.spiralRadius*(1+l),c=Math.sin(n)*a.spiralRadius*(1+l),d=a.height+Math.sin(s*3+a.crossIndex)*.5;i.position.set(r,d,c),i.lookAt(0,0,0),i.rotation.z+=a.rotationSpeed;const m=i.material;m.uniforms.time.value=e}),this.hologramRings.forEach(i=>{const a=i.userData;i.rotation.x=a.baseRotationX+e*a.rotationSpeed,i.rotation.y=a.baseRotationY+e*a.rotationSpeed*.7,i.rotation.z+=a.rotationSpeed*.5;const s=i.material;s.uniforms.time.value=e}),this.sacredCircles.forEach(i=>{const a=i.userData,s=e*a.orbitalSpeed*.1+a.orbitalPhase;i.rotation.x=a.baseRotationX,i.rotation.y=a.baseRotationY,i.rotation.z=a.baseRotationZ;const n=new A;n.makeRotationY(s),i.applyMatrix4(n);const l=i.material;l.uniforms.time.value=e}),this.goldenParticles){const i=this.goldenParticles.material;i.uniforms.time.value=e;const a=this.goldenParticles.geometry.attributes.position.array;for(let s=0;s<a.length/3;s++){const n=this.particleOrbitData[s],l=n.initialAngle+e*n.orbitalSpeed*.03,r=this.calculateOrbitalPosition(n.distance,n.inclination,n.longitudeOfAscendingNode,l),c=Math.sin(e*n.fallSpeed+s*.1)*.5;a[s*3]=r.x,a[s*3+1]=r.y+c,a[s*3+2]=r.z}this.goldenParticles.geometry.attributes.position.needsUpdate=!0}if(this.divineParticles){const i=this.divineParticles.material;i.uniforms.time.value=e;const a=this.divineParticles.geometry.attributes.position.array;for(let s=0;s<a.length/3;s++){const n=this.divineParticleOrbitData[s],l=n.initialAngle+e*n.orbitalSpeed*.05,r=this.calculateOrbitalPosition(n.distance,n.inclination,n.longitudeOfAscendingNode,l),c=Math.sin(e*2+n.phase)*1,d=Math.sin(e*1+s*.1)*.3;a[s*3]=r.x+d,a[s*3+1]=r.y+c,a[s*3+2]=r.z+d}this.divineParticles.geometry.attributes.position.needsUpdate=!0}if(this.energyWaves.forEach(i=>{const a=i.userData;i.rotation.x+=a.rotationSpeed,i.rotation.y+=a.rotationSpeed*1.3,i.rotation.z+=a.rotationSpeed*.7;const s=i.material;s.uniforms.time.value=e;const n=Math.sin(e*2+a.waveIndex*.5)*.1+1;i.scale.setScalar(n)}),this.holyLights.forEach(i=>{const a=i.userData,s=a.angle+e*a.orbitalSpeed*.1,n=Math.sin(e*1.5+a.lightIndex)*a.distance*.5,l=Math.cos(s)*a.distance,r=Math.sin(s)*a.distance,c=a.baseY+n;i.position.set(l,c,r);const d=Math.sin(e*4+a.lightIndex*.8)*.8+1.2;i.intensity=d}),this.spaceDistortion){const i=this.spaceDistortion.material;i.uniforms.time.value=e,this.spaceDistortion.rotation.x+=.001,this.spaceDistortion.rotation.y+=.0015}if(this.divineLight){const i=Math.sin(e*2)*.5+1.5;this.divineLight.intensity=i}}getObject3D(){return this.group}addToScene(o,t){t&&this.group.position.copy(t),o.add(this.group)}removeFromScene(o){o.remove(this.group)}dispose(){this.digitalGodSphere&&this.godSphere&&(this.godSphere.geometry.dispose(),this.godSphere.material.dispose()),this.binaryDigits.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.sacredSymbols.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.orbitalCrosses.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.crossSpirals.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.hologramRings.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.sacredCircles.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.goldenParticles&&(this.goldenParticles.geometry.dispose(),this.goldenParticles.material.dispose()),this.divineParticles&&(this.divineParticles.geometry.dispose(),this.divineParticles.material.dispose()),this.energyWaves.forEach(o=>{o.geometry.dispose(),o.material.dispose()}),this.holyLights.forEach(()=>{}),this.spaceDistortion&&(this.spaceDistortion.geometry.dispose(),this.spaceDistortion.material.dispose()),this.group.clear()}setEnabled(o){this.group.visible=o}updateParams(o){if(Object.assign(this.params,o),o.color){const t=new S(o.color[0],o.color[1],o.color[2]);if(this.godSphere){const e=this.godSphere.material;e.uniforms.color.value=t}this.divineLight&&(this.divineLight.color=t)}}updatePlanetPosition(o){this.params.planetPosition=o,this.digitalGodSphere&&(this.digitalGodSphere.position.copy(o),this.digitalGodSphere.userData.planetPosition&&this.digitalGodSphere.userData.planetPosition.copy(o))}}function q(T,o,t){const i={seed:(t||Math.floor(Math.random()*1e6))+90005,color:o.color||[1,.84,0],cosmicOriginTime:o?.timing?.cosmic_origin_time||o?.cosmicOriginTime||O};return new H(T,i)}export{H as L,q as c};
