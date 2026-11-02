import{i as S,av as x,au as I,bA as W,g as w,cU as E,cv as F,j as O,cT as R}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";let z=0;function j(s){z=s}function D(s){return Date.now()/1e3-s+z}function G(s,t=1,i=0){const e=D(s);return i+e*t}const T=51408e4;class C{seed;constructor(t){this.seed=t}next(){return this.seed=this.seed*16807%2147483647,(this.seed-1)/2147483646}uniform(t,i){return t+(i-t)*this.next()}choice(t){return t[Math.floor(this.next()*t.length)]}}class B{ringSystem;concentricLines;material;linesMaterial;params;planetRadius;actualInnerRadius=0;actualOuterRadius=0;scale=1;tiltAngle=0;constructor(t,i){this.planetRadius=t,this.params=i,this.createRingSystemFromAPI(i),this.createConcentricLines()}weightedChoice(t,i,e){const n=e.uniform(0,1);let a=0;for(let l=0;l<i.length;l++)if(a+=i[l],n<a)return t[l];return t[t.length-1]}createRingSystemFromAPI(t){const{inner_radius:i,outer_radius:e,tilt_factor:n,planet_radius:a,shape_seed:l,num_particles_per_band:p,bands:c}=t;if(!c||c.length===0)return;this.scale=this.planetRadius/(a||200),this.tiltAngle=Math.asin((n||.2)*.5),this.actualInnerRadius=(i||200)*this.scale,this.actualOuterRadius=(e||400)*this.scale;const r=new C(l||12345),v=Math.floor((p||800)*1.5),y=c.length*v*2,u=new S,h=new Float32Array(y*3),d=new Float32Array(y*3),P=new Float32Array(y),M=[.4,.3,.2,.1],L=[.5,1,1.5,2];let o=0;for(const _ of c){for(let b=0;b<v;b++){const f=r.uniform(Math.PI,2*Math.PI),m=r.uniform(_.inner,_.outer)*this.scale,g=r.uniform(20,50)/255,A=this.weightedChoice(L,M,r);h[o*3]=m*Math.cos(f),h[o*3+1]=m*Math.sin(this.tiltAngle)*Math.sin(f)-this.planetRadius*.07,h[o*3+2]=m*Math.cos(this.tiltAngle)*Math.sin(f),d[o*3]=g,d[o*3+1]=g,d[o*3+2]=g,P[o]=A*.25,o++}for(let b=0;b<v;b++){const f=r.uniform(0,Math.PI),m=r.uniform(_.inner,_.outer)*this.scale,g=r.uniform(20,50)/255,A=this.weightedChoice(L,M,r);h[o*3]=m*Math.cos(f),h[o*3+1]=m*Math.sin(this.tiltAngle)*Math.sin(f)-this.planetRadius*.07,h[o*3+2]=m*Math.cos(this.tiltAngle)*Math.sin(f),d[o*3]=g,d[o*3+1]=g,d[o*3+2]=g,P[o]=A*.25,o++}}u.setAttribute("position",new x(h,3)),u.setAttribute("color",new x(d,3)),u.setAttribute("size",new x(P,1)),this.material=new I({uniforms:{brightness:{value:4.4},lightDirection:{value:new w(1,0,0)},ambientLight:{value:.15},planetRadius:{value:this.planetRadius},planetWorldPos:{value:new w(0,0,0)}},vertexShader:`
        attribute float size;
        varying vec3 vColor;
        varying float vDistance;
        varying vec3 vWorldPosition;

        void main() {
          vColor = color;

          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDistance = -mvPosition.z;

          gl_PointSize = size * (120.0 / vDistance);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,fragmentShader:`
        uniform float brightness;
        uniform vec3 lightDirection;
        uniform float ambientLight;
        uniform float planetRadius;
        uniform vec3 planetWorldPos;
        varying vec3 vColor;
        varying float vDistance;
        varying vec3 vWorldPosition;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);

          if (dist > 0.5) discard;

          float alpha = (1.0 - dist * 2.0);
          alpha = smoothstep(0.0, 1.0, alpha);

          float glow = 1.0 - dist;
          glow = pow(glow, 1.5);

          vec3 toLight = normalize(lightDirection);

          vec3 relPos = vWorldPosition - planetWorldPos;

          float behindPlanet = -dot(relPos, toLight);

          vec3 onAxis = -toLight * behindPlanet;
          float distFromAxis = length(relPos - onAxis);

          float isBehind = step(0.0, behindPlanet);

          float coneExpansion = 0.4;
          float shadowRadius = planetRadius + behindPlanet * coneExpansion;

          float gradientStart = shadowRadius * 1.5;
          float gradientEnd = shadowRadius;

          float shadow = smoothstep(gradientEnd, gradientStart, distFromAxis);

          shadow = mix(1.0, shadow, isBehind);

          float ambientInShadow = 0.35;
          float totalLight = mix(ambientInShadow, 1.0, shadow);

          vec3 finalColor = vColor * brightness * glow * totalLight;

          float depthAlpha = clamp(200.0 / vDistance, 0.3, 1.0);

          gl_FragColor = vec4(finalColor, alpha * depthAlpha);
        }
      `,transparent:!0,vertexColors:!0,depthWrite:!1,blending:W}),this.ringSystem=new E(u,this.material),this.ringSystem.position.set(0,0,0),this.ringSystem.renderOrder=1}createConcentricLines(){if(this.actualInnerRadius===0||this.actualOuterRadius===0)return;this.concentricLines=new F;const t=this.params.shape_seed||12345,i=25,e=128;this.linesMaterial=new I({uniforms:{brightness:{value:3},intensity:{value:1},lightDirection:{value:new w(1,0,0)},planetRadius:{value:this.planetRadius},planetWorldPos:{value:new w(0,0,0)}},vertexShader:`
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform float brightness;
        uniform float intensity;
        uniform vec3 lightDirection;
        uniform float planetRadius;
        uniform vec3 planetWorldPos;
        varying vec3 vWorldPosition;

        void main() {
          vec3 toLight = normalize(lightDirection);

          vec3 relPos = vWorldPosition - planetWorldPos;
          float behindPlanet = -dot(relPos, toLight);
          vec3 onAxis = -toLight * behindPlanet;
          float distFromAxis = length(relPos - onAxis);
          float isBehind = step(0.0, behindPlanet);

          float coneExpansion = 0.4;
          float shadowRadius = planetRadius + behindPlanet * coneExpansion;
          float gradientStart = shadowRadius * 1.5;
          float gradientEnd = shadowRadius;

          float shadow = smoothstep(gradientEnd, gradientStart, distFromAxis);
          shadow = mix(1.0, shadow, isBehind);

          float ambientInShadow = 0.35;
          float totalLight = mix(ambientInShadow, 1.0, shadow);

          vec3 lineColor = vec3(0.2) * intensity * brightness * totalLight;
          gl_FragColor = vec4(lineColor, 0.6 * intensity);
        }
      `,transparent:!0,depthWrite:!1,blending:W});for(let n=0;n<i;n++){const a=new C(t+n*31);if(a.uniform(0,1)<.1)continue;const l=n/(i-1),p=this.actualInnerRadius+(this.actualOuterRadius-this.actualInnerRadius)*l,c=[];for(let u=0;u<=e;u++){const h=u/e*Math.PI*2,d=p*Math.cos(h),P=p*Math.sin(h),M=P*Math.sin(this.tiltAngle)-this.planetRadius*.07,L=P*Math.cos(this.tiltAngle);c.push(d,M,L)}const r=new S;r.setAttribute("position",new O(c,3));const v=this.linesMaterial.clone();v.uniforms.intensity={value:a.uniform(.4,1)};const y=new R(r,v);this.concentricLines.add(y)}}addToScene(t,i){if(!this.ringSystem)return;const e=i||new w(0,0,0);this.ringSystem.position.copy(e),this.material?.uniforms.planetWorldPos&&this.material.uniforms.planetWorldPos.value.copy(e),this.concentricLines&&(this.concentricLines.position.copy(e),this.concentricLines.children.forEach(n=>{if(n instanceof R){const a=n.material;a.uniforms?.planetWorldPos&&a.uniforms.planetWorldPos.value.copy(e)}})),t.add(this.ringSystem),this.concentricLines&&t.add(this.concentricLines)}update(t,i){if(!this.ringSystem||!i)return;const e=i.rotation_period_seconds||86400,n=i.cosmicOriginTime||T,a=i.initialAngleRotation||0,l=D(n),p=2*Math.PI/e,c=(a+l*p)%(2*Math.PI);this.ringSystem.rotation.y=c,this.concentricLines&&(this.concentricLines.rotation.y=c)}getObject3D(){return this.ringSystem}updateLightDirection(t){const i=t.clone().normalize();this.material?.uniforms.lightDirection&&this.material.uniforms.lightDirection.value.copy(i),this.concentricLines&&this.concentricLines.children.forEach(e=>{if(e instanceof R){const n=e.material;n.uniforms?.lightDirection&&n.uniforms.lightDirection.value.copy(i)}})}updateFromThreeLight(t){const i=new w().subVectors(t.position,t.target.position).normalize();this.material?.uniforms.lightDirection&&this.material.uniforms.lightDirection.value.copy(i),this.concentricLines&&this.concentricLines.children.forEach(e=>{if(e instanceof R){const n=e.material;n.uniforms?.lightDirection&&n.uniforms.lightDirection.value.copy(i)}})}dispose(){this.material&&this.material.dispose(),this.linesMaterial&&this.linesMaterial.dispose(),this.concentricLines&&this.concentricLines.children.forEach(t=>{t instanceof R&&(t.geometry.dispose(),t.material.dispose())})}}function U(s,t){const i={inner_radius:s.inner_radius,outer_radius:s.outer_radius,tilt_factor:s.tilt_factor,planet_radius:s.planet_radius,shape_seed:s.shape_seed,num_particles_per_band:s.num_particles_per_band,bands:s.bands};return new B(t,i)}export{T as D,B as R,D as a,U as c,G as g,j as s};
