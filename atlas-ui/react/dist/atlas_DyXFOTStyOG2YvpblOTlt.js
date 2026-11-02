import{S as v}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{C as l,au as d,f as C,g as u}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const h={DEFAULT:{ROUGHNESS:{min:.6,max:.9},ROCK_DENSITY:{min:.4,max:.8},CRATER_COUNT:{min:.2,max:.6},OPACITY:{min:.7,max:.95}},ROCKY:{ROUGHNESS:{min:1,max:2},ROCK_DENSITY:{min:1,max:3},CRATER_COUNT:{min:.4,max:.8},OPACITY:{min:.8,max:1}},CAVE:{ROUGHNESS:{min:.5,max:.7},ROCK_DENSITY:{min:.5,max:1},CRATER_COUNT:{min:.1,max:.4},OPACITY:{min:.02,max:.05}}};class m{layerMesh;material;params;layerSystem;static vertexShader=`
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    float noise(vec3 p) {
      return sin(p.x * 4.0) * sin(p.y * 4.0) * sin(p.z * 4.0);
    }

    void main() {
      vPosition = position;
      vNormal = normal;
      vUv = uv;

      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;

      vec3 deformed = position;
      float noiseValue = noise(position * 3.0);
      deformed += normal * noiseValue * 0.02;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(deformed, 1.0);
    }
  `;static fragmentShader=`
    uniform vec3 rockColor;
    uniform float roughness;
    uniform float rockDensity;
    uniform float craterCount;
    uniform float opacity;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      
      float n = i.x + i.y * 57.0 + 113.0 * i.z;
      return mix(
        mix(mix(fract(sin(n) * 43758.5453), fract(sin(n + 1.0) * 43758.5453), f.x),
            mix(fract(sin(n + 57.0) * 43758.5453), fract(sin(n + 58.0) * 43758.5453), f.x), f.y),
        mix(mix(fract(sin(n + 113.0) * 43758.5453), fract(sin(n + 114.0) * 43758.5453), f.x),
            mix(fract(sin(n + 170.0) * 43758.5453), fract(sin(n + 171.0) * 43758.5453), f.x), f.y), f.z);
    }

    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      
      for(int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }

    float craterPattern(vec3 p, float count) {
      float craters = 0.0;
      float scale = count * 8.0;

      for(int i = 0; i < 3; i++) {
        float layerScale = scale * pow(2.0, float(i));
        vec3 cellPos = p * layerScale;
        vec3 cellId = floor(cellPos);
        vec3 cellLocal = fract(cellPos);

        float hash = fract(sin(dot(cellId, vec3(12.9898, 78.233, 54.53))) * 43758.5453);
        
        if(hash > 0.7) {
          vec2 craterCenter = vec2(0.5) + 0.3 * (vec2(hash, fract(hash * 73.0)) - 0.5);
          float dist = distance(cellLocal.xy, craterCenter);
          float craterSize = 0.2 + 0.3 * fract(hash * 127.0);
          
          if(dist < craterSize) {
            float craterDepth = smoothstep(craterSize, craterSize * 0.3, dist);
            craters += craterDepth * (0.8 - float(i) * 0.2);
          }
        }
      }
      
      return clamp(craters, 0.0, 1.0);
    }
    
    void main() {
      vec3 pos = normalize(vPosition);
      vec3 normal = normalize(vNormal);

      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }

      float rockTexture = fbm(pos * rockDensity);
      rockTexture = pow(rockTexture, roughness);

      float craters = craterPattern(pos, craterCount);

      float combinedTexture = rockTexture * (1.0 - craters * 0.5) + craters * 0.3;

      float dotNL = dot(normal, lightDir);
      float lightInfluence = smoothstep(-0.2, 0.2, dotNL);

      vec3 baseColor = rockColor;

      baseColor = mix(baseColor, baseColor * 0.6, craters);

      vec3 color = baseColor * (0.6 + 0.4 * combinedTexture);

      color *= (0.7 + 0.3 * lightInfluence);

      vec3 planetNormal = normalize(vWorldPosition);
      float planetDotNL = dot(planetNormal, lightDir);

      float shadowDarkness = smoothstep(0.1, -0.2, planetDotNL) * 0.6;
      color *= (1.0 - shadowDarkness);

      float alpha = combinedTexture * opacity;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;constructor(t,e={}){this.layerSystem=t;const a=e.seed||Math.floor(Math.random()*1e6),r=new v(a),n=e.color instanceof l?e.color:e.color?new l(e.color):new l(9127187),s=e.planetType||"DEFAULT",o=h[s];this.params={color:n,roughness:e.roughness||r.uniform(o.ROUGHNESS.min,o.ROUGHNESS.max),rockDensity:e.rockDensity||r.uniform(o.ROCK_DENSITY.min,o.ROCK_DENSITY.max)*10,craterCount:e.craterCount||r.uniform(o.CRATER_COUNT.min,o.CRATER_COUNT.max),opacity:e.opacity||r.uniform(o.OPACITY.min,o.OPACITY.max),seed:a,planetType:s},this.material=new d({vertexShader:m.vertexShader,fragmentShader:m.fragmentShader,uniforms:{rockColor:{value:n},roughness:{value:this.params.roughness},rockDensity:{value:this.params.rockDensity},craterCount:{value:this.params.craterCount},opacity:{value:this.params.opacity},lightDirection:{value:new u(1,1,1).normalize()},lightPosition:{value:new u(0,0,0)}},transparent:!0,side:C,depthWrite:!1}),this.layerMesh=this.layerSystem.addEffectLayer("rockyTerrain",this.material,this.layerSystem.getNextScaleFactor())}update(t){}updateFromThreeLight(t){this.material.uniforms.lightPosition&&this.material.uniforms.lightPosition.value.copy(t.position);const e=t.target.position.clone().sub(t.position).normalize();this.material.uniforms.lightDirection&&(this.material.uniforms.lightDirection.value=e)}dispose(){}}function g(p,t,e,a="DEFAULT"){const r=t.surface||{},n=t.planet_info?.base_color||r.base_color,s=e||Math.floor(Math.random()*1e6),o=new v(s+8e3);let c=a;if(a==="DEFAULT"&&t.surface_elements?.type){const f=t.surface_elements.type.toLowerCase();f==="rocky"?c="ROCKY":f==="cave"&&(c="CAVE")}const i=h[c];return new m(p,{color:n?new l(n):new l(9127187),roughness:r.roughness||o.uniform(i.ROUGHNESS.min,i.ROUGHNESS.max),rockDensity:r.rock_density||o.uniform(i.ROCK_DENSITY.min,i.ROCK_DENSITY.max)*10,craterCount:r.crater_count||o.uniform(i.CRATER_COUNT.min,i.CRATER_COUNT.max),opacity:o.uniform(i.OPACITY.min,i.OPACITY.max),seed:s,planetType:c})}export{g as c};
