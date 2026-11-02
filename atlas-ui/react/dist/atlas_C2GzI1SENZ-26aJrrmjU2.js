import{C as i,au as l,f as c,g as r,d5 as m,m as d,bA as v,D as h}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";class f{baseMesh;baseMaterial;originalBaseMaterial;effectLayers=[];scene;planetRadius;static baseVertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    
    void main() {
      vPosition = position;
      vNormal = normalMatrix * normal;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;static baseFragmentShader=`
    uniform vec3 baseColor;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    uniform float ambientStrength;
    uniform float lightIntensity;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    
    void main() {
      vec3 normal = normalize(vWorldNormal);
      
      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      float dotNL = dot(normal, lightDir);
      
      float dayNight = smoothstep(-0.3, 0.1, dotNL);
      
      float rimLight = 1.0 - abs(dotNL);
      rimLight = pow(rimLight, 3.0) * 0.1;
      
      vec3 finalColor = baseColor;
      
      float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
      finalColor *= totalLight;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;constructor(e,o=new i(16753920)){this.baseMesh=e;const t=e.geometry;this.planetRadius=t.parameters.radius||1;const a=o instanceof i?o:new i(o);this.baseMaterial=new l({vertexShader:f.baseVertexShader,fragmentShader:f.baseFragmentShader,uniforms:{baseColor:{value:a},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},side:c}),this.baseMesh.material=this.baseMaterial}addEffectLayer(e,o,t=1.001,a){const n=new m(this.planetRadius*t,256,256),s=new d(n,o);return s.position.copy(this.baseMesh.position),s.rotation.copy(this.baseMesh.rotation),this.effectLayers.push({name:e,mesh:s,material:o,layerObject:a}),this.scene&&this.scene.add(s),s}createCloudBandsLayerMaterial(e){const o=`
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vNormal = normal;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,t=`
      uniform float time;
      uniform float seed;
      uniform vec3 bandColor;
      uniform float numBands;
      uniform float rotationAngle;
      uniform float bandPositions[20];
      uniform float bandWidths[20];
      uniform float animationSpeed;
      uniform float turbulence;
      uniform float noiseScale;
      uniform vec3 lightDirection;
      uniform float opacity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      
      float hash(float n) {
        return fract(sin(n + seed) * 43758.5453123);
      }
      
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float n = i.x + i.y * 57.0 + 113.0 * i.z;
        return mix(
          mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
              mix(hash(n + 57.0), hash(n + 58.0), f.x), f.y),
          mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
              mix(hash(n + 170.0), hash(n + 171.0), f.x), f.y), f.z);
      }
      
      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 4; i++) {
          value += amplitude * noise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        
        return value;
      }
      
      float createBandGaps(vec3 pos, float bandIndex) {
        float angle = atan(pos.z, pos.x);
        
        float gapPattern = 1.0;
        
        for(float g = 0.0; g < 4.0; g++) {
          float gapSeed = hash(bandIndex * 100.0 + g * 17.0);
          float gapPosition = gapSeed * 6.28318;
          float gapWidth = 0.3 + gapSeed * 0.4;
          
          float distToGap = abs(angle - gapPosition);
          distToGap = min(distToGap, 6.28318 - distToGap);
          
          if(distToGap < gapWidth) {
            float gapIntensity = smoothstep(0.0, gapWidth, distToGap);
            gapPattern *= gapIntensity;
          }
        }
        
        return gapPattern;
      }
      
      float createCloudBands(vec3 pos) {
        float bands = 0.0;
        
        float currentY = pos.y;
        float currentX = pos.x;
        
        float cosAngle = cos(rotationAngle);
        float sinAngle = sin(rotationAngle);
        float rotatedY = sinAngle * currentX + cosAngle * currentY;
        
        for(int i = 0; i < 20; i++) {
          if(float(i) >= numBands) break;
          
          float bandPosY = bandPositions[i];
          float bandWidth = bandWidths[i];
          
          float distToBand = abs(rotatedY - bandPosY);
          if(distToBand < bandWidth / 2.0) {
            float bandIntensity = 1.0 - (distToBand / (bandWidth / 2.0));
            
            float turbulenceNoise = fbm(pos * noiseScale + vec3(time * animationSpeed * 0.1));
            bandIntensity *= (0.8 + 0.4 * turbulenceNoise * turbulence);
            
            float gapMask = createBandGaps(pos, float(i));
            bandIntensity *= gapMask;
            
            bands += bandIntensity * 0.8;
          }
        }
        
        return clamp(bands, 0.0, 1.0);
      }
      
      void main() {
        vec3 pos = normalize(vPosition);
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(lightDirection);
        
        float dotNL = dot(normal, lightDir);
        float visibility = smoothstep(-0.2, 0.2, dotNL);
        
        float bands = createCloudBands(pos);
        
        float lightIntensity = max(0.3, dotNL);
        
        vec3 color = bandColor * (0.5 + 0.5 * lightIntensity);
        float alpha = bands * opacity;
        
        gl_FragColor = vec4(color, alpha);
      }
    `;return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},seed:{value:e.seed||Math.random()*1e3},bandColor:{value:e.bandColor||new i(16747520)},numBands:{value:e.numBands||8},rotationAngle:{value:e.rotationAngle||0},bandPositions:{value:e.bandPositions||new Array(20).fill(0)},bandWidths:{value:e.bandWidths||new Array(20).fill(.1)},animationSpeed:{value:e.animationSpeed||1},turbulence:{value:e.turbulence||.5},noiseScale:{value:e.noiseScale||3},lightDirection:{value:new r(1,1,1).normalize()},opacity:{value:e.opacity||.4}},transparent:!0,blending:v,side:c,depthWrite:!1})}createMetallicSurfaceLayerMaterial(e){const o=`
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vNormal = normalMatrix * normal;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,t=`
      uniform vec3 metalColor;
      uniform float metalness;
      uniform float roughness;
      uniform float fragmentationIntensity;
      uniform float opacity;
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      uniform float time;
      uniform float noiseScale;
      uniform float noiseIntensity;
      uniform float crystalScale;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975, 397.2973, 491.1871));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      
      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float n = mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        
        return n;
      }
      
      float angularCracks(vec2 uv, float scale, float sharpness) {
        vec2 id = floor(uv * scale);
        vec2 f = fract(uv * scale);
        
        float d = 1.0;
        for(float x = -1.0; x <= 1.0; x++) {
          for(float y = -1.0; y <= 1.0; y++) {
            vec2 neighbor = vec2(x, y);
            vec2 point = hash(vec3(id + neighbor, 0.0)) * vec2(1.0) + neighbor;
            float dist = length(f - point);
            d = min(d, dist);
          }
        }
        
        return pow(1.0 - d, sharpness);
      }
      
      vec3 crystallineFacets(vec2 uv, float scale, vec3 baseNormal) {
        vec2 id = floor(uv * scale);
        vec2 f = fract(uv * scale);
        
        float crystalType = hash(vec3(id, 42.0));
        
        vec3 facetNormal = baseNormal;
        
        float angle1 = hash(vec3(id, 123.0)) * 6.28;
        float angle2 = hash(vec3(id, 456.0)) * 3.14;
        
        if(crystalType < 0.25) {
          float noise1 = hash(vec3(id, 789.0));
          float noise2 = hash(vec3(id, 234.0));
          float irregular1 = sin((f.x + noise1) * 8.0) * cos((f.y + noise2) * 6.0);
          
          vec3 perturbation = vec3(
            cos(angle1 + irregular1) * 0.15,
            sin(angle1 + irregular1) * 0.15,
            irregular1 * 0.1
          );
          
          facetNormal = normalize(baseNormal + perturbation);
          
        } else if(crystalType < 0.5) {
          float facet1 = sin(f.x * 12.0 + angle1) * 0.5 + 0.5;
          float facet2 = cos(f.y * 10.0 + angle2) * 0.5 + 0.5;
          float combined = facet1 * facet2;
          
          vec3 perturbation = vec3(
            (facet1 - 0.5) * 0.2,
            (facet2 - 0.5) * 0.2,
            combined * 0.15
          );
          
          facetNormal = normalize(baseNormal + perturbation);
          
        } else if(crystalType < 0.75) {
          float wave1 = sin((f.x + f.y) * 15.0 + angle1);
          float wave2 = cos((f.x - f.y) * 13.0 + angle2);
          float complex = wave1 * wave2 * 0.5 + 0.5;
          
          vec3 perturbation = vec3(
            wave1 * 0.12,
            wave2 * 0.12,
            complex * 0.08
          );
          
          facetNormal = normalize(baseNormal + perturbation);
          
        } else {
          float dist = length(f - vec2(0.5));
          float angleNoise = atan(f.y - 0.5, f.x - 0.5) + angle1;
          float fractal = sin(angleNoise * 7.0) * cos(dist * 20.0);
          
          vec3 perturbation = vec3(
            cos(angleNoise + fractal) * 0.18,
            sin(angleNoise + fractal) * 0.18,
            fractal * 0.1
          );
          
          facetNormal = normalize(baseNormal + perturbation);
        }
        
        return facetNormal;
      }
      
      void main() {
        vec3 baseNormal = normalize(vWorldNormal);
        
        vec3 normal = crystallineFacets(vUv, crystalScale, baseNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        float dotNL = dot(normal, lightDir);
        
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        
        float rimLight = 1.0 - abs(dotNL);
        rimLight = pow(rimLight, 3.0) * 0.1;
        
        vec3 color = metalColor;
        
        float surfaceNoise = noise3D(vPosition * noiseScale);
        color = mix(color, color * 0.7, surfaceNoise * noiseIntensity);
        
        float edgeFactor = 1.0 - abs(dotNL);
        float fragmentation = angularCracks(vUv, 5.0 + fragmentationIntensity * 10.0, 2.0);
        
        if(edgeFactor > 0.8) {
          color = mix(color, color * 0.5, fragmentation * edgeFactor * 0.3);
        }
        
        float radialWaves = sin(length(vUv - 0.5) * 20.0 + time * 0.5) * 0.5 + 0.5;
        color = mix(color, color * 1.1, radialWaves * 0.1 * (1.0 - edgeFactor));
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        
        float NdotH = max(dot(normal, halfwayDir), 0.0);
        float specularStrength = pow(NdotH, mix(4.0, 128.0, 1.0 - roughness));
        vec3 specular = mix(vec3(0.04), color, metalness) * specularStrength;
        
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
        vec3 fresnelColor = mix(vec3(0.04), color, metalness) * fresnel;
        
        float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
        vec3 finalColor = color * totalLight;
        
        finalColor += (specular + fresnelColor * 0.5) * dayNight;
        
        finalColor = mix(finalColor, finalColor * 0.5, pow(surfaceNoise, 2.0) * 0.3);
        
        gl_FragColor = vec4(finalColor, opacity);
      }
    `;return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},metalColor:{value:e.color||new i(8421504)},metalness:{value:e.metalness||.8},roughness:{value:e.roughness||.4},fragmentationIntensity:{value:e.fragmentationIntensity||.5},opacity:{value:e.opacity||.8},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85},noiseScale:{value:e.noiseScale||8},noiseIntensity:{value:e.noiseIntensity||.3},crystalScale:{value:e.crystalScale||80}},transparent:!0,blending:v,side:c,depthWrite:!1})}createIcyTerrainLayerMaterial(e){const o=`
      uniform float rotationAngle;

      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;

      vec3 rotateY(vec3 p, float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
      }

      void main() {
        vec3 rotatedPosition = rotateY(position, -rotationAngle);
        vPosition = rotatedPosition;
        vNormal = normalMatrix * normal;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = rotateY(worldPos.xyz, -rotationAngle);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,t=`
      uniform vec3 iceColor;
      uniform float iceReflectivity;
      uniform float frostDensity;
      uniform float crackIntensity;
      uniform float opacity;
      uniform float organicShapeIntensity;
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      uniform float time;
      uniform float crystalScale;
      uniform float crystalDensity;
      uniform float crystalSharpness;
      uniform float frostPattern;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975, 397.2973, 491.1871));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      
      float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float n = mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        
        return n;
      }
      
      float iceCracks(vec3 p) {
        vec3 n = floor(p);
        vec3 f = fract(p);

        float minDist = 1.0;

        for(int i = -1; i <= 1; i++) {
          for(int j = -1; j <= 1; j++) {
            for(int k = -1; k <= 1; k++) {
              vec3 neighbor = vec3(float(i), float(j), float(k));
              vec3 point = neighbor + hash(n + neighbor) - f;
              float dist = length(point);
              minDist = min(minDist, dist);
            }
          }
        }

        return minDist;
      }
      
      float iceBubbles(vec3 p) {
        float bubbles = 0.0;
        
        bubbles += smoothstep(0.8, 1.0, noise3D(p * 8.0)) * 0.6;
        bubbles += smoothstep(0.9, 1.0, noise3D(p * 16.0 + vec3(100.0))) * 0.3;
        bubbles += smoothstep(0.95, 1.0, noise3D(p * 32.0 + vec3(200.0))) * 0.1;
        
        return bubbles;
      }
      
      void main() {
        vec3 normal = normalize(vWorldNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        float dotNL = dot(normal, lightDir);
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        
        float cracks = iceCracks(vWorldPosition * crackIntensity * 4.0);
        cracks = pow(cracks, 1.5);
        
        float scale1 = crystalScale * 0.8;
        float scale2 = crystalScale * 1.6; 
        float scale3 = crystalScale * 3.2;
        
        float microCrystals1 = noise3D(vWorldPosition * scale1);
        float microCrystals2 = noise3D(vWorldPosition * scale2);
        float microCrystals3 = noise3D(vWorldPosition * scale3);
        
        float crystals = microCrystals1 * 0.6 + microCrystals2 * 0.3 + microCrystals3 * 0.1;
        crystals = smoothstep(0.3, 0.3 + crystalDensity, crystals);
        
        float frost = noise3D(vWorldPosition * frostPattern);
        frost = smoothstep(0.6, 0.9, frost);
        
        vec3 baseIce = vec3(0.95, 0.97, 1.0);
        vec3 scratchColor = vec3(0.7, 0.8, 0.9);
        vec3 color = mix(scratchColor, baseIce, cracks);
        
        color = mix(color, vec3(0.98, 0.99, 1.0), crystals * 0.3);
        
        color = mix(color, vec3(1.0, 1.0, 1.0), frost * 0.4);
        
        float smoothLight = ambientStrength + (lightIntensity * dayNight);
        
        float backLight = max(0.0, -dotNL) * 0.25;
        float totalLight = smoothLight + backLight;
        
        vec3 finalColor = color * totalLight;
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float NdotH = max(dot(normal, halfwayDir), 0.0);
        
        float mainSpecular = pow(NdotH, 60.0) * iceReflectivity;
        mainSpecular *= (0.2 + 0.8 * cracks);
        
        float sharpness1 = crystalSharpness * 0.6;
        float sharpness2 = crystalSharpness * 1.0;
        float crystalSpecular1 = pow(NdotH, sharpness1) * crystals * iceReflectivity * 0.8;
        float crystalSpecular2 = pow(NdotH, sharpness2) * crystals * iceReflectivity * 0.4;
        
        float frostSpecular = pow(NdotH, 40.0) * frost * iceReflectivity * 0.6;
        
        vec3 specular = vec3(mainSpecular + crystalSpecular1 + crystalSpecular2 + frostSpecular);
        finalColor += specular * dayNight;
        
        float sparkle = smoothstep(0.8, 1.0, crystals) * smoothstep(0.9, 1.0, NdotH);
        finalColor += vec3(1.0, 1.0, 1.0) * sparkle * 0.5 * dayNight;
        
        float smoothVisibility = smoothstep(-0.5, 0.3, dotNL);
        float alpha = (0.5 + 0.3 * cracks + 0.2 * crystals) * smoothVisibility * opacity;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `;return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},rotationAngle:{value:0},iceColor:{value:e.color||new i(11591910)},iceReflectivity:{value:e.iceReflectivity||.8},frostDensity:{value:e.frostDensity||.5},crackIntensity:{value:e.crackIntensity||.4},opacity:{value:e.opacity||.7},crystalScale:{value:e.crystalScale||25},crystalDensity:{value:e.crystalDensity||.6},crystalSharpness:{value:e.crystalSharpness||150},frostPattern:{value:e.frostPattern||12},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},transparent:!0,side:c,depthWrite:!1})}createAquiferWaterLayerMaterial(e){const o=`
      uniform float time;
      uniform float waveHeight;
      uniform float waveFrequency;
      uniform float waveSpeed;
      uniform float seedOffset;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vWaveHeight;
      
      float random(vec3 st) {
        return fract(sin(dot(st.xyz, vec3(12.9898, 78.233, 54.321))) * 43758.5453123);
      }
      
      float noise(vec3 st) {
        vec3 i = floor(st);
        vec3 f = fract(st);
        
        f = f * f * (3.0 - 2.0 * f);
        
        float a = random(i);
        float b = random(i + vec3(1.0, 0.0, 0.0));
        float c = random(i + vec3(0.0, 1.0, 0.0));
        float d = random(i + vec3(1.0, 1.0, 0.0));
        float e = random(i + vec3(0.0, 0.0, 1.0));
        float f2 = random(i + vec3(1.0, 0.0, 1.0));
        float g = random(i + vec3(0.0, 1.0, 1.0));
        float h = random(i + vec3(1.0, 1.0, 1.0));
        
        return mix(
          mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
          mix(mix(e, f2, f.x), mix(g, h, f.x), f.y),
          f.z
        );
      }
      
      void main() {
        vPosition = position;
        vUv = uv;
        
        vec3 spherePos = normalize(position);
        
        float waveValue = 0.0;
        
        vec3 seedOffset3D = vec3(seedOffset, seedOffset * 0.7, seedOffset * 1.3);
        
        waveValue += (noise(spherePos * waveFrequency + seedOffset3D + vec3(time * waveSpeed * 0.3)) * 2.0 - 1.0) * 0.5;
        waveValue += (noise(spherePos * waveFrequency * 2.0 + seedOffset3D * 1.5 + vec3(time * waveSpeed * 0.5)) * 2.0 - 1.0) * 0.3;
        waveValue += (noise(spherePos * waveFrequency * 4.0 + seedOffset3D * 2.0 + vec3(time * waveSpeed * 0.2)) * 2.0 - 1.0) * 0.2;
        
        vWaveHeight = waveValue * waveHeight;
        
        vec3 newPosition = position + normal * vWaveHeight;
        
        vec3 modifiedNormal = normalize(normal + vec3(waveValue * 0.05, waveValue * 0.05, 0.0));
        vNormal = normalMatrix * modifiedNormal;
        vWorldNormal = normalize((modelMatrix * vec4(modifiedNormal, 0.0)).xyz);
        
        vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
        vWorldPosition = worldPos.xyz;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `,t=`
      uniform float time;
      uniform vec3 waterColor;
      uniform vec3 deepWaterColor;
      uniform vec3 foamColor;
      uniform float specularIntensity;
      uniform float transparency;
      uniform float roughness;
      
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vWaveHeight;
      
      void main() {
        vec3 normal = normalize(vWorldNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        float dotNL = dot(normal, lightDir);
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        
        float rimLight = 1.0 - abs(dotNL);
        rimLight = pow(rimLight, 3.0) * 0.1;
        
        float depth = 1.0 - abs(vWaveHeight) * 2.0;
        vec3 baseColor = mix(deepWaterColor, waterColor, depth);
        
        float foamFactor = smoothstep(0.2, 0.4, vWaveHeight);
        baseColor = mix(baseColor, foamColor, foamFactor * 0.3);
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float NdotH = max(dot(normal, halfwayDir), 0.0);
        float specularStrength = pow(NdotH, mix(4.0, 128.0, 1.0 - roughness)) * specularIntensity;
        
        float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
        vec3 finalColor = baseColor * totalLight;
        
        finalColor += vec3(1.0, 1.0, 1.0) * specularStrength * dayNight;
        
        gl_FragColor = vec4(finalColor, transparency);
      }
    `,a=e.waterColor instanceof i?e.waterColor:new i(e.waterColor||3050379),n=e.deepWaterColor instanceof i?e.deepWaterColor:new i(e.deepWaterColor||13158),s=e.foamColor instanceof i?e.foamColor:new i(e.foamColor||16777215);return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},seedOffset:{value:(e.seed||0)%100},waveHeight:{value:e.waveHeight||.08},waveFrequency:{value:e.waveFrequency||3},waveSpeed:{value:e.waveSpeed||.5},waterColor:{value:a},deepWaterColor:{value:n},foamColor:{value:s},specularIntensity:{value:e.specularIntensity||3},transparency:{value:e.transparency||.6},roughness:{value:e.roughness||.1},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},transparent:!0,blending:v,side:c,depthWrite:!1})}createOceanCurrentsLayerMaterial(e){const o=`
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vUv = uv;
        
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,t=`
      uniform float time;
      uniform vec3 currentColor;
      uniform vec3 deepCurrentColor;
      uniform float currentIntensity;
      uniform float currentScale;
      uniform float currentSpeed;
      uniform float secondaryCurrentIntensity;
      uniform float secondaryCurrentScale;
      uniform float secondaryCurrentSpeed;
      uniform float opacity;
      uniform float seedOffset;
      
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      float random(vec3 st) {
        return fract(sin(dot(st.xyz, vec3(12.9898, 78.233, 54.321))) * 43758.5453123);
      }
      
      float noise(vec3 st) {
        vec3 i = floor(st);
        vec3 f = fract(st);
        
        f = f * f * (3.0 - 2.0 * f);
        
        float a = random(i);
        float b = random(i + vec3(1.0, 0.0, 0.0));
        float c = random(i + vec3(0.0, 1.0, 0.0));
        float d = random(i + vec3(1.0, 1.0, 0.0));
        float e = random(i + vec3(0.0, 0.0, 1.0));
        float f2 = random(i + vec3(1.0, 0.0, 1.0));
        float g = random(i + vec3(0.0, 1.0, 1.0));
        float h = random(i + vec3(1.0, 1.0, 1.0));
        
        return mix(
          mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
          mix(mix(e, f2, f.x), mix(g, h, f.x), f.y),
          f.z
        );
      }
      
      float fbm(vec3 p) {
        float value = 0.0;
        float amplitude = 0.5;
        
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p *= 2.0;
          amplitude *= 0.5;
        }
        
        return value;
      }
      
      void main() {
        vec3 normal = normalize(vWorldNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        float dotNL = dot(normal, lightDir);
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        
        vec3 spherePos = normalize(vPosition);
        
        vec3 seedOffset3D = vec3(seedOffset, seedOffset * 0.7, seedOffset * 1.3);
        
        float currentPattern = 0.0;
        
        currentPattern += fbm(spherePos * currentScale + seedOffset3D + vec3(time * currentSpeed * 0.1)) * currentIntensity;
        
        currentPattern += fbm(spherePos * secondaryCurrentScale + seedOffset3D * 1.5 + vec3(time * secondaryCurrentSpeed * 0.15)) * secondaryCurrentIntensity;
        
        currentPattern += fbm(spherePos * currentScale * 3.0 + seedOffset3D * 2.0 + vec3(time * currentSpeed * 0.05)) * 0.2;
        
        currentPattern = (currentPattern * 2.0 - 1.0) * 0.5 + 0.5;
        currentPattern = smoothstep(0.3, 0.7, currentPattern);
        
        vec3 baseColor = mix(deepCurrentColor, currentColor, currentPattern);
        
        float totalLight = ambientStrength + (lightIntensity * dayNight * 0.3);
        vec3 finalColor = baseColor * totalLight;
        
        float alpha = currentPattern * opacity;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,a=e.currentColor instanceof i?e.currentColor:new i(e.currentColor||4889486),n=e.deepCurrentColor instanceof i?e.deepCurrentColor:new i(e.deepCurrentColor||2973010);return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},seedOffset:{value:(e.seed||0)%100},currentIntensity:{value:e.currentIntensity||.5},currentScale:{value:e.currentScale||2},currentSpeed:{value:e.currentSpeed||.2},secondaryCurrentIntensity:{value:e.secondaryCurrentIntensity||.3},secondaryCurrentScale:{value:e.secondaryCurrentScale||3},secondaryCurrentSpeed:{value:e.secondaryCurrentSpeed||.15},currentColor:{value:a},deepCurrentColor:{value:n},opacity:{value:e.opacity||.25},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},transparent:!0,blending:v,side:c,depthWrite:!1})}addToScene(e){this.scene=e,this.effectLayers.forEach(o=>{o.mesh&&e.add(o.mesh)})}update(e,o){this.effectLayers.forEach(t=>{if(t.material.uniforms.time&&(t.material.uniforms.time.value+=e),o!==void 0&&t.material.uniforms.rotationAngle&&(t.material.uniforms.rotationAngle.value=o),t.layerObject&&typeof t.layerObject=="object"&&t.layerObject!==null&&"update"in t.layerObject)try{t.layerObject.update(e,o)}catch{}t.mesh&&o!==void 0&&(t.mesh.rotation.y=o)})}updateBaseColor(e){const o=e instanceof i?e:new i(e);this.baseMaterial.uniforms.baseColor.value=o}updateLightDirection(e){this.baseMaterial.uniforms.lightDirection.value=e.clone().normalize(),this.effectLayers.forEach(o=>{o.material.uniforms.lightDirection&&(o.material.uniforms.lightDirection.value=e.clone().normalize())})}updateLightPosition(e){this.baseMaterial.uniforms.lightPosition.value=e.clone(),this.effectLayers.forEach(o=>{o.material.uniforms.lightPosition&&(o.material.uniforms.lightPosition.value=e.clone())})}updateFromThreeLight(e){this.updateLightPosition(e.position);const o=e.target.position.clone().sub(e.position).normalize();if(this.updateLightDirection(o),this.baseMaterial.uniforms.lightIntensity&&(this.baseMaterial.uniforms.lightIntensity.value=e.intensity),this.baseMaterial.uniforms.ambientStrength){const t=Math.min(1,e.intensity/3),a=.02,n=.15;this.baseMaterial.uniforms.ambientStrength.value=a+t*(n-a)}}applyHoleShader(e){this.originalBaseMaterial||(this.originalBaseMaterial=this.baseMaterial.clone()),this.baseMaterial&&this.baseMaterial.dispose(),this.baseMaterial=e,this.baseMesh.material=e}restoreOriginalMaterial(){this.originalBaseMaterial&&(this.baseMaterial&&this.baseMaterial.dispose(),this.baseMaterial=this.originalBaseMaterial.clone(),this.baseMesh.material=this.baseMaterial)}createGenericLayerMaterial(e,o,t,a=!0,n=v){return t.lightDirection||(t.lightDirection={value:new r(1,1,1).normalize()}),t.lightPosition||(t.lightPosition={value:new r(0,0,0)}),new l({vertexShader:e,fragmentShader:o,uniforms:t,transparent:a,blending:n,side:c,depthWrite:!1})}convertEffectToLayer(e,o,t=1.001){if(o instanceof l){const a=o.clone();return a.transparent=!0,a.depthWrite=!1,a.uniforms.lightDirection||(a.uniforms.lightDirection={value:new r(1,1,1).normalize()}),this.addEffectLayer(e,a,t)}return null}createDiamondSurfaceLayerMaterial(e){const o=`
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vNormal = normalMatrix * normal;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,t=`
      uniform vec3 diamondColor;
      uniform float refractionIndex;
      uniform float dispersion;
      uniform float clarity;
      uniform float facetSize;
      uniform float brilliance;
      uniform float opacity;
      uniform float prismaticIntensity;
      uniform float iridescenceIntensity;
      uniform float iridescenceRange;
      uniform float iridescenceSpeed;
      uniform float iridescenceScale;
      uniform float time;
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      
      float hash(vec3 p) {
        p = fract(p * vec3(443.8975, 397.2973, 491.1871));
        p += dot(p, p.yxz + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      
      vec3 diamondFacets(vec2 uv, float scale, vec3 baseNormal) {
        vec2 scaledUv = uv * scale;
        vec2 id = floor(scaledUv);
        vec2 f = fract(scaledUv);
        
        float facetType = hash(vec3(id, 42.0));
        vec3 facetNormal = baseNormal;
        
        vec2 center = vec2(0.5);
        vec2 toCenter = f - center;
        float dist = length(toCenter);
        float angle = atan(toCenter.y, toCenter.x);
        
        if(facetType < 0.33) {
          float hexAngle = floor(angle * 3.0 / 3.14159) * 3.14159 / 3.0;
          vec3 perturbation = vec3(
            cos(hexAngle) * dist * 0.8,
            sin(hexAngle) * dist * 0.8,
            (1.0 - dist) * 0.6
          );
          facetNormal = normalize(baseNormal + perturbation);
          
        } else if(facetType < 0.66) {
          float octAngle = floor(angle * 4.0 / 3.14159) * 3.14159 / 4.0;
          vec3 perturbation = vec3(
            cos(octAngle) * dist * 0.9,
            sin(octAngle) * dist * 0.9,
            cos(dist * 6.28) * 0.5
          );
          facetNormal = normalize(baseNormal + perturbation);
          
        } else {
          float triAngle = floor(angle * 6.0 / 3.14159) * 3.14159 / 6.0;
          float triPattern = sin(triAngle * 3.0) * cos(dist * 8.0);
          vec3 perturbation = vec3(
            cos(triAngle) * triPattern * 0.7,
            sin(triAngle) * triPattern * 0.7,
            triPattern * 0.4
          );
          facetNormal = normalize(baseNormal + perturbation);
        }
        
        return facetNormal;
      }
      
      vec3 chromaticDispersion(vec3 direction, vec3 normal, float dispersionAmount) {
        float eta_r = 1.0 / (refractionIndex - dispersionAmount * 0.01);
        float eta_g = 1.0 / refractionIndex;
        float eta_b = 1.0 / (refractionIndex + dispersionAmount * 0.01);
        
        vec3 refracted_r = refract(direction, normal, eta_r);
        vec3 refracted_g = refract(direction, normal, eta_g);
        vec3 refracted_b = refract(direction, normal, eta_b);
        
        return vec3(
          length(refracted_r),
          length(refracted_g),
          length(refracted_b)
        );
      }
      
      vec3 calculateIridescence(vec3 viewDir, vec3 normal, vec3 worldPos) {
        float fresnel = 1.0 - abs(dot(normal, viewDir));
        
        float spatialVariation = sin(worldPos.x * iridescenceScale) * 
                                cos(worldPos.y * iridescenceScale * 0.8) * 
                                sin(worldPos.z * iridescenceScale * 1.2);
        
        float timeVariation = sin(time * iridescenceSpeed) * 0.5 + 0.5;
        
        float colorShift = (spatialVariation * 0.7 + timeVariation * 0.3) * iridescenceRange;
        
        float anglePhase = fresnel * 6.28318;
        
        vec3 iridColor = vec3(
          sin(anglePhase + colorShift) * 0.5 + 0.5,
          sin(anglePhase + colorShift + 2.094) * 0.5 + 0.5,
          sin(anglePhase + colorShift + 4.188) * 0.5 + 0.5
        );
        
        float edgeIntensity = pow(fresnel, 2.0);
        
        return iridColor * edgeIntensity * iridescenceIntensity;
      }
      
      void main() {
        vec3 baseNormal = normalize(vWorldNormal);
        
        vec3 normal = diamondFacets(vUv, facetSize, baseNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        
        float dotNL = dot(normal, lightDir);
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        float rimLight = 1.0 - abs(dotNL);
        rimLight = pow(rimLight, 3.0) * 0.1;
        
        vec3 color = diamondColor;
        
        vec3 dispersedColor = chromaticDispersion(-viewDir, normal, dispersion * 10.0);
        vec3 prismaticColors = vec3(
          sin(dispersedColor.r * 15.0) * 0.5 + 0.5,
          sin(dispersedColor.g * 12.0) * 0.5 + 0.5,
          sin(dispersedColor.b * 18.0) * 0.5 + 0.5
        );
        
        color = mix(color, prismaticColors, prismaticIntensity * clarity * 0.7);
        
        vec3 iridescence = calculateIridescence(viewDir, normal, vWorldPosition);
        color = mix(color, color + iridescence, clarity * dayNight);
        
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float NdotH = max(dot(normal, halfwayDir), 0.0);
        float specularPower = mix(32.0, 256.0, brilliance / 3.0);
        float specularStrength = pow(NdotH, specularPower) * brilliance;
        
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
        vec3 internalReflections = vec3(1.0) * fresnel * clarity;
        
        vec3 refractedDir = refract(-viewDir, normal, 1.0 / refractionIndex);
        float refractionEffect = length(refractedDir) * clarity;
        
        vec3 refractionTint = vec3(0.9, 0.95, 1.1);
        color = mix(color, color * refractionTint, refractionEffect * 0.3);
        
        float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
        vec3 finalColor = color * totalLight;
        
        vec3 diamondSparkle = vec3(specularStrength);
        finalColor += diamondSparkle * dayNight;
        
        finalColor += internalReflections * 0.2 * dayNight;
        
        float sparkle = sin(dot(normal, viewDir) * facetSize * 2.0) * 0.5 + 0.5;
        finalColor += vec3(sparkle * brilliance * 0.1) * dayNight;
        
        float finalOpacity = opacity * clarity;
        
        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `;return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},diamondColor:{value:e.color||new i(8421504)},refractionIndex:{value:e.refractionIndex||2.42},dispersion:{value:e.dispersion||.5},clarity:{value:e.clarity||.8},facetSize:{value:e.facetSize!==void 0?e.facetSize:15},brilliance:{value:e.brilliance||2},opacity:{value:e.opacity||.9},prismaticIntensity:{value:e.prismaticIntensity||.6},iridescenceIntensity:{value:e.iridescenceIntensity||.5},iridescenceRange:{value:e.iridescenceRange||1},iridescenceSpeed:{value:e.iridescenceSpeed||.3},iridescenceScale:{value:e.iridescenceScale||1.5},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},transparent:!0,blending:v,side:h,depthWrite:!1})}createMoltenLavaLayerMaterial(e){const o=`
      uniform float time;
      uniform float lavaWaveHeight;
      uniform float lavaWaveFrequency;
      uniform float lavaWaveSpeed;
      uniform float seedOffset;
      uniform float viscosity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vLavaHeight;
      
      float random(vec3 st) {
        return fract(sin(dot(st.xyz, vec3(12.9898, 78.233, 54.321))) * 43758.5453123);
      }
      
      float noise(vec3 st) {
        vec3 i = floor(st);
        vec3 f = fract(st);
        
        f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        float a = random(i);
        float b = random(i + vec3(1.0, 0.0, 0.0));
        float c = random(i + vec3(0.0, 1.0, 0.0));
        float d = random(i + vec3(1.0, 1.0, 0.0));
        float e = random(i + vec3(0.0, 0.0, 1.0));
        float f2 = random(i + vec3(1.0, 0.0, 1.0));
        float g = random(i + vec3(0.0, 1.0, 1.0));
        float h = random(i + vec3(1.0, 1.0, 1.0));
        
        return mix(
          mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
          mix(mix(e, f2, f.x), mix(g, h, f.x), f.y),
          f.z
        );
      }
      
      void main() {
        vPosition = position;
        vUv = uv;
        
        vec3 spherePos = normalize(position);
        
        float lavaValue = 0.0;
        
        vec3 seedOffset3D = vec3(seedOffset, seedOffset * 0.7, seedOffset * 1.3);
        
        lavaValue += (noise(spherePos * lavaWaveFrequency + seedOffset3D + vec3(time * lavaWaveSpeed * 0.1)) * 2.0 - 1.0) * 0.6;
        lavaValue += (noise(spherePos * lavaWaveFrequency * 1.8 + seedOffset3D * 1.5 + vec3(time * lavaWaveSpeed * 0.05)) * 2.0 - 1.0) * 0.3;
        lavaValue += (noise(spherePos * lavaWaveFrequency * 3.2 + seedOffset3D * 2.0 + vec3(time * lavaWaveSpeed * 0.03)) * 2.0 - 1.0) * 0.1;
        
        vLavaHeight = lavaValue * lavaWaveHeight * viscosity;
        
        vec3 newPosition = position + normal * vLavaHeight;
        
        vec3 modifiedNormal = normalize(normal + vec3(lavaValue * 0.02, lavaValue * 0.02, 0.0));
        vNormal = normalMatrix * modifiedNormal;
        vWorldNormal = normalize((modelMatrix * vec4(modifiedNormal, 0.0)).xyz);
        
        vec4 worldPos = modelMatrix * vec4(newPosition, 1.0);
        vWorldPosition = worldPos.xyz;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `,t=`
      uniform float time;
      uniform vec3 moltenColor;
      uniform vec3 coreColor;
      uniform vec3 coolingColor;
      uniform float emissiveIntensity;
      uniform float glowIntensity;
      uniform float temperature;
      uniform float lavaRoughness;
      
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying float vLavaHeight;
      
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

      float fbm3D(vec3 st) {
        float value = 0.0;
        float amplitude = 0.5;

        for (int i = 0; i < 5; i++) {
          value += amplitude * noise3D(st);
          st *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }
      
      void main() {
        vec3 normal = normalize(vWorldNormal);
        
        vec3 lightDir;
        if (length(lightPosition) > 0.0) {
          lightDir = normalize(lightPosition - vWorldPosition);
        } else {
          lightDir = normalize(-lightDirection);
        }
        
        float dotNL = dot(normal, lightDir);
        float dayNight = smoothstep(-0.3, 0.1, dotNL);
        
        float rimLight = 1.0 - abs(dotNL);
        rimLight = pow(rimLight, 3.0) * 0.1;
        
        vec3 lavaPos = vWorldPosition;
        vec3 flowDirection = vec3(time * 0.02, time * 0.01, 0.0);

        float lavaTexture1 = fbm3D(lavaPos * 4.0 + flowDirection);
        float lavaTexture2 = fbm3D(lavaPos * 8.0 + vec3(time * 0.03, time * 0.02, 0.0));
        float lavaTexture3 = fbm3D(lavaPos * 16.0 + vec3(time * 0.05, time * 0.03, 0.0));
        
        float combinedTexture = lavaTexture1 * 0.5 + lavaTexture2 * 0.3 + lavaTexture3 * 0.2;
        
        float temperaturePulse = sin(time * 0.2) * 0.5 + 0.5;
        float heatIntensity = combinedTexture + temperaturePulse * 0.2 + temperature * 0.3;
        
        vec3 baseColor;
        if (heatIntensity > 0.8) {
          baseColor = mix(moltenColor, coreColor, (heatIntensity - 0.8) / 0.2);
        } else if (heatIntensity > 0.5) {
          baseColor = mix(coolingColor, moltenColor, (heatIntensity - 0.5) / 0.3);
        } else {
          baseColor = coolingColor * (0.4 + heatIntensity * 0.6);
        }
        
        float elevationFactor = 1.0 + abs(vLavaHeight) * 3.0;
        baseColor = mix(baseColor, coreColor, elevationFactor * 0.2);
        
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float NdotH = max(dot(normal, halfwayDir), 0.0);
        float specularStrength = pow(NdotH, mix(2.0, 8.0, 1.0 - lavaRoughness)) * glowIntensity * 0.5;
        
        float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
        vec3 finalColor = baseColor * totalLight;
        
        finalColor += vec3(1.0, 0.8, 0.6) * specularStrength * dayNight;
        
        vec3 emissive = baseColor * emissiveIntensity * (0.6 + temperaturePulse * 0.4) * heatIntensity;
        
        float emissiveFactor = mix(0.22, 1.0, dayNight);
        
        finalColor += emissive * emissiveFactor;
        
        float alpha = 0.8 + heatIntensity * 0.2;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,a=e.moltenColor instanceof i?e.moltenColor:new i(e.moltenColor||16747520),n=e.coreColor instanceof i?e.coreColor:new i(e.coreColor||16757575),s=e.coolingColor instanceof i?e.coolingColor:new i(e.coolingColor||13386752);return new l({vertexShader:o,fragmentShader:t,uniforms:{time:{value:0},seedOffset:{value:(e.seed||0)%100},lavaWaveHeight:{value:e.lavaWaveHeight||.04},lavaWaveFrequency:{value:e.lavaWaveFrequency||2},lavaWaveSpeed:{value:e.lavaWaveSpeed||.05},viscosity:{value:e.viscosity||.8},moltenColor:{value:a},coreColor:{value:n},coolingColor:{value:s},emissiveIntensity:{value:e.emissiveIntensity||4},glowIntensity:{value:e.glowIntensity||3},temperature:{value:e.temperature||.9},lavaRoughness:{value:e.lavaRoughness||.8},lightDirection:{value:new r(1,1,1).normalize()},lightPosition:{value:new r(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85}},transparent:!0,blending:v,side:c,depthWrite:!1})}getNextScaleFactor(){return 1.001+this.effectLayers.length*.001}getLayerMeshes(){const e={};return this.effectLayers.forEach(o=>{o.name&&o.mesh&&(e[o.name]=o.mesh)}),e}dispose(){this.baseMaterial.dispose(),this.effectLayers.forEach(e=>{e.mesh&&(e.mesh.geometry.dispose(),this.scene&&this.scene.remove(e.mesh)),e.material.dispose()})}}export{f as P};
