import{S}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{D as C,a as E,g as R}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{g as h,C as l,aJ as N,M as _,cn as I,cN as p,au as M,bE as B,d5 as L,B as k,a3 as z,ab as O,Y as G,bB as F,m as H}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const e={STAR_COUNT:{min:4500,max:7500},MIN_BRIGHTNESS:{min:.6,max:.8},MAX_BRIGHTNESS:{min:.9,max:1},MIN_SIZE:{min:8,max:9.6},MAX_SIZE:{min:20,max:32},DISTANCE:{min:2e3,max:3600},TWINKLE_SPEED:{min:1,max:2},PARALLAX_STRENGTH:{min:1,max:3},VARIABLE_CHANCE:{min:.002,max:.005},ORBITAL_PARALLAX_STRENGTH:{min:.15,max:.35}};class m{starSystem;material;geometry;params;starCount;cameraPosition=new h;lastCameraPosition=new h;startTime;attenuationMesh;attenuationMaterial;attenuationGeometry;static vertexShader=`
    attribute vec4 starData;
    attribute float distanceLayer;
    attribute vec3 originalPosition;

    uniform float time;
    uniform float twinkleSpeed;
    uniform vec3 cameraOffset;
    uniform float parallaxStrength;
    uniform vec3 orbitalPosition;
    uniform float orbitalParallaxStrength;

    uniform float atmosphereRadius;
    uniform float uPlanetRadius;
    uniform float atmosphereDensity;

    varying float vBrightness;
    varying float vTwinkle;
    varying float vStarType;
    varying float vAtmoBlur;
    varying vec2 vTangentDir;

    void main() {
      float size = starData.x;
      float brightness = starData.y;
      float twinklePhase = starData.z;
      float starType = starData.w;

      vBrightness = brightness;
      vStarType = starType;
      vAtmoBlur = 0.0;
      vTangentDir = vec2(0.0);

      float baseTwinkle;
      if (starType > 0.5) {
        float pulse = sin(time * twinkleSpeed * 1.0 + twinklePhase);
        baseTwinkle = 0.2 + 0.8 * (pulse * 0.5 + 0.5);
      } else {
        float intensity = 0.05 + 0.05 * brightness;
        baseTwinkle = (1.0 - intensity) + intensity * sin(time * twinkleSpeed + twinklePhase);
      }

      vec3 parallaxOffset = cameraOffset * parallaxStrength * (0.5 / distanceLayer);
      vec3 orbitalParallax = orbitalPosition * orbitalParallaxStrength * (1.0 / distanceLayer);

      vec3 adjustedPosition = originalPosition + parallaxOffset + orbitalParallax;

      vec4 mvPosition = modelViewMatrix * vec4(adjustedPosition, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      float sizeBoost = 1.0;

      if (atmosphereDensity > 0.0) {
        vec3 planetCenter = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 rayDir = normalize(mvPosition.xyz);

        float tClosest = dot(planetCenter, rayDir);
        vec3 closestPoint = tClosest * rayDir;
        float d = length(planetCenter - closestPoint);

        float outerFade = 1.0 - smoothstep(uPlanetRadius, atmosphereRadius, d);
        float innerFade = smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.08, d);
        float atmoFactor = outerFade * innerFade;

        if (atmoFactor > 0.0) {
          float turbulenceStrength = atmoFactor * atmosphereDensity;
          float turb1 = sin(time * 3.7 + twinklePhase * 2.0) * 0.4;
          float turb2 = sin(time * 7.3 + twinklePhase * 4.0) * 0.25;
          float turb3 = sin(time * 13.1 + twinklePhase * 6.0) * 0.15;
          baseTwinkle *= 1.0 + turbulenceStrength * (turb1 + turb2 + turb3);

          vec4 planetClip = projectionMatrix * vec4(planetCenter, 1.0);
          vec2 planetNDC = planetClip.xy / planetClip.w;
          vec2 starNDC = gl_Position.xy / gl_Position.w;
          vec2 refrDir = normalize(starNDC - planetNDC);
          float refrBase = atmoFactor * atmosphereDensity * 0.04;
          float wobble = 0.6 + 0.4 * sin(time * 2.3 + twinklePhase * 3.0);
          gl_Position.xy += refrDir * (refrBase * wobble) * gl_Position.w;

          sizeBoost = 1.0 + atmoFactor * atmosphereDensity * 2.0;
          vAtmoBlur = atmoFactor * atmosphereDensity;

          vTangentDir = vec2(-refrDir.y, refrDir.x) * vAtmoBlur;
        }
      }

      vTwinkle = baseTwinkle;

      float sizeMultiplier = starType > 0.5 ? 1.2 : 1.0;

      // For InstancedMesh, we need to scale the plane
      vec3 scale = vec3(size * sizeMultiplier * sizeBoost * 0.01 * (300.0 / length(mvPosition.xyz)));
      mat4 scaleMatrix = mat4(
        scale.x, 0.0, 0.0, 0.0,
        0.0, scale.y, 0.0, 0.0,
        0.0, 0.0, scale.z, 0.0,
        0.0, 0.0, 0.0, 1.0
      );

      gl_Position = projectionMatrix * modelViewMatrix * scaleMatrix * vec4(adjustedPosition, 1.0);
    }
  `;static fragmentShader=`
    uniform vec3 starColor;

    varying float vBrightness;
    varying float vTwinkle;
    varying float vStarType;
    varying float vAtmoBlur;
    varying vec2 vTangentDir;

    void main() {
      vec2 centered = gl_PointCoord - vec2(0.5);

      float stretchMag = length(vTangentDir);
      if (stretchMag > 0.01) {
        vec2 tDir = vTangentDir / stretchMag;
        vec2 pDir = vec2(-tDir.y, tDir.x);
        float tComp = dot(centered, tDir);
        float pComp = dot(centered, pDir);
        float stretch = 1.0 + stretchMag * 0.6;
        centered = tDir * (tComp / stretch) + pDir * pComp;
      }

      float dist = length(centered);
      if (dist > 0.5) discard;

      float radialFalloff = 1.0 - dist * 2.0;
      radialFalloff = pow(max(radialFalloff, 0.0), max(1.0 - vAtmoBlur * 0.7, 0.3));

      float alpha = radialFalloff * vBrightness * vTwinkle;

      if (vStarType > 0.5) {
        alpha = pow(alpha, 1.0);
        alpha *= 1.5 + 1.5 * vTwinkle;
      } else {
        alpha = pow(alpha, 1.5);
        alpha *= 1.5;
      }

      vec3 finalColor;
      if (vStarType > 0.5) {
        vec3 variableTint = vec3(1.0, 0.6, 0.4);
        finalColor = starColor * variableTint * (0.8 + 0.4 * vTwinkle);
      } else {
        vec3 normalTint = vec3(1.0, 0.9, 0.7);
        finalColor = starColor * normalTint * (0.8 + 0.4 * vTwinkle);
      }

      gl_FragColor = vec4(finalColor, alpha);
    }
  `;static attenuationVertexShader=`
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `;static attenuationFragmentShader=`
    uniform float atmosphereDensity;

    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      float cosAngle = abs(dot(normalize(vNormal), normalize(vViewDir)));
      float edgeFactor = 1.0 - cosAngle;
      float pathEstimate = pow(edgeFactor, 0.6);

      float alpha = (1.0 - exp(-atmosphereDensity * pathEstimate * 3.0));

      gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
    }
  `;starMatrix=[];starData;constructor(a,t={}){const o=t.seed!==void 0?t.seed:Math.floor(Math.random()*1e6),i=new S(o+1e4);this.params={color:t.color||new l(16777215),starCount:t.starCount!==void 0?t.starCount:Math.floor(i.uniform(e.STAR_COUNT.min,e.STAR_COUNT.max)),minBrightness:t.minBrightness!==void 0?t.minBrightness:i.uniform(e.MIN_BRIGHTNESS.min,e.MIN_BRIGHTNESS.max),maxBrightness:t.maxBrightness!==void 0?t.maxBrightness:i.uniform(e.MAX_BRIGHTNESS.min,e.MAX_BRIGHTNESS.max),minSize:t.minSize!==void 0?t.minSize:i.uniform(e.MIN_SIZE.min,e.MIN_SIZE.max),maxSize:t.maxSize!==void 0?t.maxSize:i.uniform(e.MAX_SIZE.min,e.MAX_SIZE.max),distance:t.distance!==void 0?t.distance:i.uniform(e.DISTANCE.min,e.DISTANCE.max),seed:o,twinkleSpeed:t.twinkleSpeed!==void 0?t.twinkleSpeed:i.uniform(e.TWINKLE_SPEED.min,e.TWINKLE_SPEED.max),parallaxStrength:t.parallaxStrength!==void 0?t.parallaxStrength:i.uniform(e.PARALLAX_STRENGTH.min,e.PARALLAX_STRENGTH.max),variableChance:t.variableChance!==void 0?t.variableChance:i.uniform(e.VARIABLE_CHANCE.min,e.VARIABLE_CHANCE.max),cosmicOriginTime:t.cosmicOriginTime,timeSpeed:t.timeSpeed!==void 0?t.timeSpeed:1,orbitalParallaxStrength:t.orbitalParallaxStrength!==void 0?t.orbitalParallaxStrength:i.uniform(e.ORBITAL_PARALLAX_STRENGTH.min,e.ORBITAL_PARALLAX_STRENGTH.max),atmosphereRadius:t.atmosphereRadius,planetRadius:t.planetRadius,atmosphereDensity:t.atmosphereDensity,atmosphereColor:t.atmosphereColor};const s=this.params.cosmicOriginTime||C;this.startTime=E(s),this.starCount=this.params.starCount,this.geometry=new N(1,1),this.material=this.createMaterial(),this.starData=new Float32Array(this.starCount*4),this.starMatrix=new Array(this.starCount).fill(0).map(()=>new _),this.generateStars(a),this.starSystem=new I(this.geometry,this.material,this.starCount),this.starSystem.renderOrder=-100,(this.params.atmosphereDensity||0)>0&&this.params.atmosphereRadius&&this.createAttenuationSphere()}generateStars(a){const t=this.params.seed,o=new S(t+1e4),i=new Float32Array(this.starCount),s=new Float32Array(this.starCount*3);for(let r=0;r<this.starCount;r++){const n=o.uniform(0,2*Math.PI),u=o.uniform(-1,1),d=Math.acos(u),D=this.params.distance,g=o.uniform(.7,1.3),f=D*g,x=f*Math.sin(d)*Math.cos(n),y=f*Math.sin(d)*Math.sin(n),T=f*Math.cos(d);s[r*3]=x,s[r*3+1]=y,s[r*3+2]=T;const A=o.uniform(0,1)<this.params.variableChance,w=A?1:0;i[r]=g;const P=o.uniform(this.params.minSize,this.params.maxSize);let v=o.uniform(this.params.minBrightness,this.params.maxBrightness);const b=o.uniform(0,Math.PI*2);A&&(v=Math.min(1,v+.2)),this.starData[r*4]=P,this.starData[r*4+1]=v,this.starData[r*4+2]=b,this.starData[r*4+3]=w,this.starMatrix[r].makeTranslation(x,y,T)}this.geometry.setAttribute("starData",new p(this.starData,4,!1)),this.geometry.setAttribute("distanceLayer",new p(i,1,!1)),this.geometry.setAttribute("originalPosition",new p(s,3,!1));for(let r=0;r<this.starCount;r++)this.starSystem.setMatrixAt(r,this.starMatrix[r]);this.starSystem.instanceMatrix.needsUpdate=!0}createMaterial(){const a=this.params.color instanceof l?this.params.color:new l(this.params.color);return new M({vertexShader:m.vertexShader,fragmentShader:m.fragmentShader,uniforms:{time:{value:0},starColor:{value:a},twinkleSpeed:{value:this.params.twinkleSpeed},cameraOffset:{value:new h(0,0,0)},parallaxStrength:{value:this.params.parallaxStrength},orbitalPosition:{value:new h(0,0,0)},orbitalParallaxStrength:{value:this.params.orbitalParallaxStrength},atmosphereRadius:{value:this.params.atmosphereRadius||0},uPlanetRadius:{value:this.params.planetRadius||0},atmosphereDensity:{value:this.params.atmosphereDensity||0}},transparent:!0,blending:B,depthWrite:!1,vertexColors:!1})}createAttenuationSphere(){this.attenuationGeometry=new L(this.params.atmosphereRadius,64,64),this.attenuationMaterial=new M({vertexShader:m.attenuationVertexShader,fragmentShader:m.attenuationFragmentShader,uniforms:{atmosphereDensity:{value:this.params.atmosphereDensity||0}},transparent:!0,blending:F,blendEquation:G,blendSrc:O,blendDst:z,depthWrite:!1,depthTest:!0,side:k}),this.attenuationMesh=new H(this.attenuationGeometry,this.attenuationMaterial),this.attenuationMesh.renderOrder=-99}addToScene(a,t){t&&this.starSystem.position.copy(t),a.add(this.starSystem),this.attenuationMesh&&(t&&this.attenuationMesh.position.copy(t),a.add(this.attenuationMesh))}update(a,t,o){const i=this.params.cosmicOriginTime||C,s=R(i,this.params.timeSpeed,this.startTime);if(this.material.uniforms.time.value=s,o){this.cameraPosition.copy(o.position);const r=new h().subVectors(this.cameraPosition,this.lastCameraPosition).multiplyScalar(.3);this.material.uniforms.cameraOffset.value.lerp(r,.1),this.lastCameraPosition.copy(this.cameraPosition)}}updateWithCamera(a,t){this.update(a,void 0,t)}updateParams(a){if(this.params={...this.params,...a},a.color!==void 0){const t=a.color instanceof l?a.color:new l(a.color);this.material.uniforms.starColor.value=t}a.twinkleSpeed!==void 0&&(this.material.uniforms.twinkleSpeed.value=a.twinkleSpeed),a.parallaxStrength!==void 0&&(this.material.uniforms.parallaxStrength.value=a.parallaxStrength),a.orbitalParallaxStrength!==void 0&&(this.material.uniforms.orbitalParallaxStrength.value=a.orbitalParallaxStrength)}updateOrbitalPosition(a){this.material.uniforms.orbitalPosition.value.copy(a)}getObject3D(){return this.starSystem}dispose(){this.geometry.dispose(),this.material.dispose(),this.attenuationGeometry&&this.attenuationGeometry.dispose(),this.attenuationMaterial&&this.attenuationMaterial.dispose()}}function j(c,a,t){const o=a!==void 0?a:Math.floor(Math.random()*1e6),i=new S(o+1e4),s={color:new l(16777215),starCount:Math.floor(i.uniform(e.STAR_COUNT.min,e.STAR_COUNT.max)),minBrightness:i.uniform(e.MIN_BRIGHTNESS.min,e.MIN_BRIGHTNESS.max),maxBrightness:i.uniform(e.MAX_BRIGHTNESS.min,e.MAX_BRIGHTNESS.max),minSize:i.uniform(e.MIN_SIZE.min,e.MIN_SIZE.max),maxSize:i.uniform(e.MAX_SIZE.min,e.MAX_SIZE.max),distance:i.uniform(e.DISTANCE.min,e.DISTANCE.max),seed:o,twinkleSpeed:i.uniform(e.TWINKLE_SPEED.min,e.TWINKLE_SPEED.max),parallaxStrength:i.uniform(e.PARALLAX_STRENGTH.min,e.PARALLAX_STRENGTH.max),variableChance:i.uniform(e.VARIABLE_CHANCE.min,e.VARIABLE_CHANCE.max)};if(t&&t.type&&t.type!=="None"){const r=t.width||12,n=t.color||[.7,.7,.7,.15],u=Array.isArray(n)&&n.length>=4?n[3]:.15;s.atmosphereRadius=c*(1+r/100),s.planetRadius=c,s.atmosphereDensity=u*(r/18),s.atmosphereColor=[Array.isArray(n)?n[0]:.7,Array.isArray(n)?n[1]:.7,Array.isArray(n)?n[2]:.7]}else s.atmosphereDensity=0;return new m(c,s)}export{m as S,j as c};
