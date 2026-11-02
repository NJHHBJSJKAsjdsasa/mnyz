import{g as p}from"./atlas_CGlzP5-5rZHcB4Bo5sVPs.js";import{C as s,au as u,m as w}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";class r{material;params;oceanLayerMesh;static vertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    void main() {
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;static fragmentShader=`
    uniform float time;
    uniform vec3 baseColor;
    
    uniform float waveIntensity;
    uniform float waveSpeed;
    uniform float waveScale;
    
    uniform float landmassThreshold;
    uniform vec3 landmassColor;
    
    uniform float deepOceanThreshold;
    uniform float deepOceanMultiplier;
    
    uniform float foamThreshold;
    uniform vec3 foamColor;
    uniform float foamIntensity;
    
    uniform vec3 oceanColor;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    
    float hash(float n) {
      return fract(sin(n) * 43758.5453123);
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
    
    float fractalNoise(vec3 p, int octaves) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for(int i = 0; i < 6; i++) {
        if(i >= octaves) break;
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }
    
    void main() {
      vec3 pos = normalize(vPosition);
      vec3 color = oceanColor;
      
      float waves1 = sin(pos.x * waveScale + time * waveSpeed) * sin(pos.z * waveScale + time * waveSpeed * 1.5);
      float waves2 = sin(pos.x * waveScale * 1.5 - time * waveSpeed * 1.8) * sin(pos.z * waveScale * 1.2 + time * waveSpeed * 2.2);
      float waves3 = sin(pos.x * waveScale * 2.0 + time * waveSpeed * 0.7) * sin(pos.z * waveScale * 2.5 - time * waveSpeed * 1.3);
      
      float totalWaves = (waves1 + waves2 * 0.5 + waves3 * 0.3) * waveIntensity;
      
      vec3 waveColor = vec3(0.0, 0.2, 0.4);
      color += waveColor * totalWaves;
      
      float landmass = fractalNoise(pos * 3.0, 4);
      if(landmass > landmassThreshold) {
        float landIntensity = smoothstep(landmassThreshold, 0.7, landmass);
        color = mix(color, landmassColor, landIntensity);
      }
      
      float depth = fractalNoise(pos * 6.0 + vec3(time * 0.1), 3);
      if(depth < deepOceanThreshold) {
        color *= deepOceanMultiplier;
      }
      
      float foam = fractalNoise(pos * 20.0 + vec3(time * 3.0), 2);
      if(foam > foamThreshold) {
        float foamMix = smoothstep(foamThreshold, 1.0, foam) * foamIntensity;
        color = mix(color, foamColor, foamMix);
      }
      
      float caustics = sin(pos.x * 30.0 + time * 4.0) * sin(pos.z * 25.0 + time * 3.5);
      caustics = pow(max(caustics, 0.0), 3.0);
      color += vec3(0.1, 0.3, 0.5) * caustics * 0.2;
      
      float fresnel = pow(1.0 - abs(dot(vNormal, normalize(vWorldPosition))), 2.0);
      vec3 reflectionColor = vec3(0.8, 0.9, 1.0);
      color = mix(color, reflectionColor, fresnel * 0.3);
      
      vec3 lightDirection = normalize(vec3(1.0, 1.0, 1.0));
      float lighting = dot(vNormal, lightDirection) * 0.5 + 0.5;
      
      float waterAttenuation = 0.7 + 0.3 * lighting;
      color *= waterAttenuation;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;constructor(e={}){this.params={waveIntensity:e.waveIntensity||.3,waveSpeed:e.waveSpeed||2,waveScale:e.waveScale||8,landmassThreshold:e.landmassThreshold||.3,landmassColor:e.landmassColor||new s(.4,.6,.2),deepOceanThreshold:e.deepOceanThreshold||.2,deepOceanMultiplier:e.deepOceanMultiplier||.5,foamThreshold:e.foamThreshold||.8,foamColor:e.foamColor||new s(.9,.9,1),foamIntensity:e.foamIntensity||.4,oceanColor:e.oceanColor||new s(.1,.3,.6),...e},this.material=this.createMaterial()}createMaterial(){const e=this.params.landmassColor instanceof s?this.params.landmassColor:new s(this.params.landmassColor),a=this.params.foamColor instanceof s?this.params.foamColor:new s(this.params.foamColor),o=this.params.oceanColor instanceof s?this.params.oceanColor:new s(this.params.oceanColor);return new u({vertexShader:r.vertexShader,fragmentShader:r.fragmentShader,uniforms:{time:{value:0},baseColor:{value:o},waveIntensity:{value:this.params.waveIntensity},waveSpeed:{value:this.params.waveSpeed},waveScale:{value:this.params.waveScale},landmassThreshold:{value:this.params.landmassThreshold},landmassColor:{value:e},deepOceanThreshold:{value:this.params.deepOceanThreshold},deepOceanMultiplier:{value:this.params.deepOceanMultiplier},foamThreshold:{value:this.params.foamThreshold},foamColor:{value:a},foamIntensity:{value:this.params.foamIntensity},oceanColor:{value:o}}})}apply(e){this.createOceanLayer(e)}createOceanLayer(e){const a=e.geometry.clone();a.scale(1.002,1.002,1.002);const o=new w(a,this.material);o.position.copy(e.position),o.rotation.copy(e.rotation),this.oceanLayerMesh=o}update(e,a){this.material.uniforms.time.value+=e,this.oceanLayerMesh&&a!==void 0&&(this.oceanLayerMesh.rotation.y=a)}updateParams(e){this.params={...this.params,...e},Object.keys(e).forEach(a=>{const o=e[a];if(o!==void 0&&this.material.uniforms[a])if(o instanceof s||Array.isArray(o)){const i=o instanceof s?o:new s(o);this.material.uniforms[a].value=i}else this.material.uniforms[a].value=o})}addToScene(e,a){this.oceanLayerMesh&&(a&&this.oceanLayerMesh.position.copy(a),e.add(this.oceanLayerMesh))}getMaterial(){return this.material}dispose(){this.material.dispose(),this.oceanLayerMesh&&(this.oceanLayerMesh.geometry&&this.oceanLayerMesh.geometry.dispose(),this.oceanLayerMesh=void 0)}}function x(l){const e=p(l),a=[e.r,e.g,e.b];let o=.3,i=2,c=8,m=.3,h=.2;if(l.seeds){const f=l.seeds.shape_seed,t=(d=>{let n=d;return()=>(n=(n*1664525+1013904223)%4294967296,n/4294967296)})(f);o=.2+t()*.3,i=1.5+t()*1.5,c=6+t()*6,m=.25+t()*.15,h=.15+t()*.1}const v={waveIntensity:o,waveSpeed:i,waveScale:c,landmassThreshold:m,deepOceanThreshold:h,deepOceanMultiplier:.5,foamThreshold:.8,foamColor:new s(.9,.9,1),foamIntensity:.4,oceanColor:a};return new r(v)}export{r as O,x as c};
