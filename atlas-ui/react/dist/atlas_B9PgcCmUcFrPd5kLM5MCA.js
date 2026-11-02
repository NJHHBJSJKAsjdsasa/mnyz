import{S}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as H,a as Y}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{cv as X,bO as Z,c4 as k,r as q,I as _,C as F,g as m,da as J,au as p,f as K,M as O,m as A,i as Q,av as R,bE as L,cU as ee,B as te,cR as W}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const h={CRYSTAL_COUNT:{min:100,max:400},SIZE:{min:.8,max:1.2},TRANSMISSION:{min:0,max:0},IOR:{min:2.4,max:2.1},ROUGHNESS:{min:0,max:.01},GLOW_INTENSITY:{min:.1,max:2.1},HEIGHT:{min:.01,max:.09}};class ie{constructor(e,t={},a,o){this.planetRadius=e,this.params=t,this.seededRng=a,this.starField=o,this.crystallineGroup=new X,this.crystallineGroup.name="CrystallineSurface",this.animationSpeed=t.timeSpeed||.05,this.createStarfieldCubemap(),this.generateCrystallineFormations(),this.starField&&setTimeout(()=>{this.starField&&this.starField.getObject3D&&this.starField.getObject3D()&&this.createStarFieldReflections()},0)}crystallineGroup;crystallineFormations=[];glowMeshes=[];animationSpeed;envMap=null;starFieldReflections=null;starFieldMaterial=null;crystallineData=[];createStarfieldCubemap(){try{const t=[];for(let a=0;a<6;a++){const o=document.createElement("canvas");o.width=512,o.height=512;const i=o.getContext("2d");if(!i)continue;const n=i.createRadialGradient(512/2,512/2,0,512/2,512/2,512/2);n.addColorStop(0,"#1a1a2e"),n.addColorStop(.5,"#16213e"),n.addColorStop(1,"#0f0f23"),i.fillStyle=n,i.fillRect(0,0,512,512);const s=new S((this.params.seed||42)+a*1e3),d=200+Math.floor(s.random()*100);for(let v=0;v<d;v++){const c=s.random()*512,l=s.random()*512,r=.3+s.random()*.4,g=s.random()*2+.5,u=s.random();u<.4?i.fillStyle=`rgba(${120+60*r}, ${140+80*r}, 255, ${r})`:u<.7?i.fillStyle=`rgba(${200+55*r}, ${200+55*r}, ${200+55*r}, ${r})`:i.fillStyle=`rgba(255, ${180+60*r}, ${120+60*r}, ${r})`,i.beginPath(),i.arc(c,l,g,0,Math.PI*2),i.fill(),r>.6&&s.random()<.1&&(i.fillStyle=`rgba(255, 255, 255, ${r*.2})`,i.beginPath(),i.arc(c,l,g*2,0,Math.PI*2),i.fill())}t.push(o)}t.length===6&&(this.envMap=new Z(t),this.envMap.needsUpdate=!0,this.envMap.mapping=k,this.envMap.format=q,this.envMap.generateMipmaps=!1,this.envMap.minFilter=_,this.envMap.magFilter=_)}catch{}}generateCrystallineFormations(){this.crystallineData=this.params.crystallinePatches||this.generateProceduralCrystals(),this.crystallineData.forEach((e,t)=>{this.createCrystalFormation(e,t)})}generateProceduralCrystals(){const e=this.seededRng||new S(this.params.seed||42),t=e.randint(h.CRYSTAL_COUNT.min,h.CRYSTAL_COUNT.max),a=[],o=this.params.baseColor instanceof F?this.params.baseColor:new F(this.params.baseColor||52479);for(let i=0;i<t;i++){const n=e.random()*Math.PI*2,s=Math.acos(e.random()*2-1),d=[Math.sin(s)*Math.cos(n),Math.sin(s)*Math.sin(n),Math.cos(s)],v=.8+e.random()*.2,c=o.clone().multiplyScalar(v);a.push({position_3d:d,size:e.uniform(h.SIZE.min,h.SIZE.max),color:[c.r,c.g,c.b,.9],height:e.uniform(h.HEIGHT.min,h.HEIGHT.max),sides:6+Math.floor(e.random()*6),transmission:e.uniform(h.TRANSMISSION.min,h.TRANSMISSION.max),ior:e.uniform(h.IOR.min,h.IOR.max),roughness:e.uniform(h.ROUGHNESS.min,h.ROUGHNESS.max),glowIntensity:e.uniform(h.GLOW_INTENSITY.min,h.GLOW_INTENSITY.max)})}return a}createCrystalFormation(e,t){const a=new m(e.position_3d[0],e.position_3d[1],e.position_3d[2]).normalize(),o=e.size*this.planetRadius*.5,i=e.height*this.planetRadius,n=e.sides,s=4,d=new J(o*.8,o,i,n,s),v=new p({uniforms:{color:{value:new F(e.color[0],e.color[1],e.color[2])},envMap:{value:this.envMap},roughness:{value:e.roughness},ior:{value:e.ior},transmission:{value:.2},lightPosition:{value:new m(0,0,0)},lightDirection:{value:new m(1,1,1).normalize()}},vertexShader:`
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vPosition = position;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform vec3 color;
        uniform samplerCube envMap;
        uniform float roughness;
        uniform float ior;
        uniform float transmission;
        uniform vec3 lightPosition;
        uniform vec3 lightDirection;

        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 normal = normalize(vWorldNormal);
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          vec3 lightDir;
          if (length(lightPosition) > 0.0) {
            lightDir = normalize(lightPosition - vWorldPosition);
          } else {
            lightDir = normalize(-lightDirection);
          }

          float NdotL = dot(normal, lightDir);
          float dayNightFactor = smoothstep(-0.3, 0.1, NdotL);

          float NdotV = max(dot(normal, viewDir), 0.0);
          float F0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
          float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 3.0);

          vec3 reflectDir = reflect(-viewDir, normal);
          vec3 envReflection = textureCube(envMap, reflectDir).rgb;

          vec3 perturbedNormal1 = normalize(normal + vec3(0.1, 0.0, 0.0));
          vec3 perturbedNormal2 = normalize(normal + vec3(0.0, 0.1, 0.0));
          vec3 reflectDir1 = reflect(-viewDir, perturbedNormal1);
          vec3 reflectDir2 = reflect(-viewDir, perturbedNormal2);
          
          vec3 envReflection1 = textureCube(envMap, reflectDir1).rgb;
          vec3 envReflection2 = textureCube(envMap, reflectDir2).rgb;

          vec3 totalReflection = envReflection * 0.6 + envReflection1 * 0.2 + envReflection2 * 0.2;
          totalReflection *= (2.0 - roughness);

          vec3 refractDir = refract(-viewDir, normal, 1.0 / ior);
          vec3 envRefraction = vec3(0.0);
          if (length(refractDir) > 0.0) {
            envRefraction = textureCube(envMap, refractDir).rgb;
          }

          vec3 crystalColor = color * 1.2;

          vec3 transmittedColor = mix(crystalColor * 0.8, envRefraction * crystalColor, transmission);

          float dispersion = 0.02;
          vec3 refractR = refract(-viewDir, normal, 1.0 / (ior - dispersion));
          vec3 refractG = refract(-viewDir, normal, 1.0 / ior);
          vec3 refractB = refract(-viewDir, normal, 1.0 / (ior + dispersion));
          
          vec3 dispersedColor = vec3(0.0);
          if (length(refractR) > 0.0) dispersedColor.r = textureCube(envMap, refractR).r;
          if (length(refractG) > 0.0) dispersedColor.g = textureCube(envMap, refractG).g;
          if (length(refractB) > 0.0) dispersedColor.b = textureCube(envMap, refractB).b;

          transmittedColor = mix(transmittedColor, dispersedColor * crystalColor, 0.15);

          float internalGlow = pow(fresnel, 0.5) * (1.0 - roughness);
          vec3 glowColor = crystalColor * internalGlow * 0.3;

          vec3 finalColor = mix(transmittedColor, totalReflection, fresnel);

          finalColor += glowColor;

          float visibilityFactor = 0.15 + 0.85 * dayNightFactor;
          finalColor *= visibilityFactor;

          float alpha = mix(0.3 + transmission * 0.4, 0.85, fresnel);
          alpha = clamp(alpha, 0.3, 0.9);
          alpha *= visibilityFactor;
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,transparent:!0,side:K}),c=a.clone().multiplyScalar(this.planetRadius),l=c.clone().normalize(),r=new m,g=new m;Math.abs(l.y)<.99?r.crossVectors(l,new m(0,1,0)).normalize():r.crossVectors(l,new m(1,0,0)).normalize(),g.crossVectors(l,r).normalize();const u=t*137.5%360*(Math.PI/180),x=r.clone().multiplyScalar(Math.cos(u)).add(g.clone().multiplyScalar(Math.sin(u))),V=new m().crossVectors(l,x).normalize(),y=new O;y.makeRotationX(Math.PI/2),d.applyMatrix4(y);const P=new O;P.makeBasis(x,V,l);const f=d.attributes.position,z=new m;d.applyMatrix4(P);for(let w=0;w<f.count;w++){z.fromBufferAttribute(f,w);const b=z.clone().add(c),N=b.length(),E=b.clone().normalize(),T=this.planetRadius+(N-this.planetRadius)*.5,M=E.multiplyScalar(T).sub(c);f.setXYZ(w,M.x,M.y,M.z)}f.needsUpdate=!0,d.computeVertexNormals(),this.applyProceduralNoise(d,e.size*.3),d.translate(c.x,c.y,c.z);const C=new A(d,v);this.createInnerGlow(C,e,t),this.crystallineFormations.push(C),this.crystallineGroup.add(C)}applyProceduralNoise(e,t){const a=e.getAttribute("position"),o=new m;for(let i=0;i<a.count;i++){o.fromBufferAttribute(a,i);const s=this.simpleNoise(o.x*10,o.y*10,o.z*10)*t*.02;o.multiplyScalar(1+s),a.setXYZ(i,o.x,o.y,o.z)}e.setAttribute("position",a),e.computeVertexNormals()}simpleNoise(e,t,a){return(Math.sin(e*.1)*Math.cos(t*.1)*Math.sin(a*.1)+Math.sin(e*.05)*Math.cos(t*.05)*.5+Math.sin(e*.2)*Math.sin(a*.15)*.3)*.5}createStarFieldReflections(){if(!this.starField||!this.starField.getObject3D)return;const e=this.starField.getObject3D();if(!e.geometry)return;const t=e.geometry.attributes.position,a=e.geometry.attributes.size,o=e.geometry.attributes.brightness;if(!t||!a||!o)return;const i=[];if(this.crystallineData.forEach((l,r)=>{const u=new m(l.position_3d[0],l.position_3d[1],l.position_3d[2]).normalize().clone().multiplyScalar(this.planetRadius),x=u.clone().normalize();this.generateDeterministicFaceNormals(l,r).forEach((y,P)=>{for(let f=0;f<t.count;f++){const z=t.getX(f),C=t.getY(f),w=t.getZ(f),b=o.getX(f),N=a.getX(f);if(b<.6)continue;const I=new m(z,C,w).clone().normalize().clone().negate(),M=I.dot(y),B=I.clone().sub(y.clone().multiplyScalar(2*M)),D=Math.abs(B.dot(x)),j=r*1e4+P*1e3+f,U=new S(j+(this.params.seed||42)).random()<.4;if(D>.3&&M<-.1&&U){const $=u.clone().add(y.clone().multiplyScalar(.001)).clone().normalize().multiplyScalar(this.planetRadius*1.001);i.push({position:$,size:N*.4*D,brightness:b*.5*D,crystalIndex:r})}}})}),i.length===0)return;const n=new Float32Array(i.length*3),s=new Float32Array(i.length),d=new Float32Array(i.length),v=new Float32Array(i.length);i.forEach((l,r)=>{n[r*3]=l.position.x,n[r*3+1]=l.position.y,n[r*3+2]=l.position.z,s[r]=l.size,d[r]=l.brightness,v[r]=l.crystalIndex});const c=new Q;c.setAttribute("position",new R(n,3)),c.setAttribute("size",new R(s,1)),c.setAttribute("brightness",new R(d,1)),c.setAttribute("crystalIndex",new R(v,1)),this.starFieldMaterial=new p({uniforms:{planetRadius:{value:this.planetRadius},lightDirection:{value:new m(1,1,1).normalize()}},vertexShader:`
        attribute float size;
        attribute float brightness;
        attribute float crystalIndex;
        
        uniform float planetRadius;
        uniform vec3 lightDirection;
        
        varying float vBrightness;
        varying float vLightInfluence;
        varying float vCrystalIndex;
        
        void main() {
          vBrightness = brightness;
          vCrystalIndex = crystalIndex;

          vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 normal = normalize(worldPos);
          float lightDot = dot(normal, lightDirection);
          vLightInfluence = max(0.01, lightDot * 0.5 + 0.5);
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * (350.0 / -mvPosition.z) * (0.7 + 0.3 * vLightInfluence);
        }
      `,fragmentShader:`
        varying float vBrightness;
        varying float vLightInfluence;
        varying float vCrystalIndex;
        
        void main() {
          float dist = distance(gl_PointCoord, vec2(0.5));
          if (dist > 0.5) discard;
          
          float alpha = (1.0 - dist * 2.0) * vBrightness * vLightInfluence;
          alpha *= 0.8 * vLightInfluence;

          vec3 baseColor = vec3(0.4, 0.8, 1.0);
          float crystalVariation = sin(vCrystalIndex * 0.7) * 0.1;
          vec3 reflectionColor = baseColor + vec3(crystalVariation, crystalVariation * 0.5, -crystalVariation * 0.3);

          gl_FragColor = vec4(reflectionColor, alpha);
        }
      `,transparent:!0,blending:L,depthWrite:!1}),this.starFieldReflections=new ee(c,this.starFieldMaterial),this.crystallineGroup.add(this.starFieldReflections)}generateDeterministicFaceNormals(e,t){const a=new S((this.params.seed||42)+t*1e3),o=[],i=e.sides||6,n=Math.min(i,8),s=new m(e.position_3d[0],e.position_3d[1],e.position_3d[2]).normalize(),d=new m,v=new m;Math.abs(s.y)<.99?d.crossVectors(s,new m(0,1,0)).normalize():d.crossVectors(s,new m(1,0,0)).normalize(),v.crossVectors(s,d).normalize();for(let c=0;c<n;c++){const l=c/n*Math.PI*2,r=a.uniform(-Math.PI*.3,Math.PI*.3),g=new m().addScaledVector(d,Math.cos(l)).addScaledVector(v,Math.sin(l)).addScaledVector(s,Math.sin(r)).normalize();o.push(g)}return o}createInnerGlow(e,t,a){const o=e.geometry.clone(),i=new p({uniforms:{time:{value:0},glowColor:{value:new F(t.color[0],t.color[1],t.color[2])},glowIntensity:{value:t.glowIntensity||.5},lightPosition:{value:new m(0,0,0)},lightDirection:{value:new m(1,1,1).normalize()}},vertexShader:`
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform float time;
        uniform vec3 glowColor;
        uniform float glowIntensity;
        uniform vec3 lightPosition;
        uniform vec3 lightDirection;

        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        void main() {
          vec3 worldNormal = normalize(vWorldNormal);
          vec3 lightDir;
          if (length(lightPosition) > 0.0) {
            lightDir = normalize(lightPosition - vWorldPosition);
          } else {
            lightDir = normalize(-lightDirection);
          }
          float NdotL = dot(worldNormal, lightDir);
          float dayNightFactor = smoothstep(-0.3, 0.1, NdotL);

          float intensity = pow(0.4 - dot(vNormal, vPositionNormal), 2.0);
          intensity *= (0.8 + 0.2 * sin(time * 2.0));

          float glowVisibility = 0.15 + 0.85 * dayNightFactor;

          vec3 glow = glowColor * intensity * glowIntensity * glowVisibility;
          gl_FragColor = vec4(glow, intensity * 0.6 * glowVisibility);
        }
      `,side:te,blending:L,transparent:!0}),n=new A(o,i);n.position.copy(e.position),n.rotation.copy(e.rotation),n.scale.multiplyScalar(1.05),this.glowMeshes.push(n),this.crystallineGroup.add(n)}update(e,t){const a=this.params.cosmicOriginTime||H,o=Y(a)*this.animationSpeed;this.glowMeshes.forEach(i=>{i.material instanceof p&&(i.material.uniforms.time.value=o)}),t!==void 0&&(this.crystallineGroup.rotation.y=t)}updateLightDirection(e){this.starFieldMaterial&&this.starFieldMaterial.uniforms.lightDirection.value.copy(e),this.crystallineFormations.forEach(t=>{t.material instanceof p&&t.material.uniforms.lightDirection&&t.material.uniforms.lightDirection.value.copy(e)}),this.glowMeshes.forEach(t=>{t.material instanceof p&&t.material.uniforms.lightDirection&&t.material.uniforms.lightDirection.value.copy(e)})}updateLightPosition(e){this.starFieldMaterial&&this.starFieldMaterial.uniforms.lightPosition.value.copy(e),this.crystallineFormations.forEach(t=>{t.material instanceof p&&t.material.uniforms.lightPosition&&t.material.uniforms.lightPosition.value.copy(e)}),this.glowMeshes.forEach(t=>{t.material instanceof p&&t.material.uniforms.lightPosition&&t.material.uniforms.lightPosition.value.copy(e)})}updateFromThreeLight(e){this.updateLightPosition(e.position);const t=e.target.position.clone().sub(e.position).normalize();this.updateLightDirection(t)}setStarField(e){this.starField=e,this.starFieldReflections&&(this.crystallineGroup.remove(this.starFieldReflections),this.starFieldReflections.geometry&&this.starFieldReflections.geometry.dispose(),this.starFieldMaterial&&this.starFieldMaterial.dispose(),this.starFieldReflections=null,this.starFieldMaterial=null),this.starField&&this.crystallineData.length>0&&this.createStarFieldReflections()}addToScene(e,t){this.crystallineGroup.position.copy(t),e.add(this.crystallineGroup)}removeFromScene(e){e.remove(this.crystallineGroup)}dispose(){this.crystallineFormations.forEach(e=>{e.geometry&&e.geometry.dispose(),e.material instanceof W&&e.material.dispose()}),this.glowMeshes.forEach(e=>{e.geometry&&e.geometry.dispose(),e.material instanceof W&&e.material.dispose()}),this.starFieldReflections&&(this.starFieldReflections.geometry&&this.starFieldReflections.geometry.dispose(),this.starFieldMaterial&&this.starFieldMaterial.dispose()),this.envMap&&this.envMap.dispose(),this.crystallineFormations=[],this.glowMeshes=[],this.starFieldReflections=null,this.starFieldMaterial=null}getGroup(){return this.crystallineGroup}getObject3D(){return this.crystallineGroup}}function le(G,e,t,a,o,i){const n=i||new F(0,.8,1);return new ie(G,{seed:t,cosmicOriginTime:a,baseColor:n,transmission:.2,ior:1.6,roughness:.01,glowIntensity:.3,timeSpeed:.05},new S(t),o)}export{ie as C,le as c};
