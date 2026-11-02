import{S as h}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{C as s,au as p,f as u,g as v}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const f={DEFAULT:{TERRAIN_HEIGHT:{min:.02,max:.05},TERRAIN_COMPLEXITY:{min:2,max:4},EROSION_STRENGTH:{min:.4,max:.7},OPACITY:{min:.6,max:.8}},SAVANNAH:{TERRAIN_HEIGHT:{min:.03,max:.08},TERRAIN_COMPLEXITY:{min:3,max:6},EROSION_STRENGTH:{min:.6,max:.9},OPACITY:{min:.5,max:.7}}};class c{layerMesh;material;params;layerSystem;static vertexShader=`
    uniform float terrainHeight;
    uniform float terrainComplexity;
    uniform float erosionStrength;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vElevation;
    
    float hash(vec3 p) {
      p = fract(p * vec3(443.8975, 397.2973, 491.1871));
      p += dot(p, p.yxz + 19.19);
      return fract((p.x + p.y) * p.z);
    }
    
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      
      return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
      );
    }
    
    float terrainFBM(vec3 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = terrainComplexity;
      
      for(int i = 0; i < 5; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.2;
      }
      
      float erosion = noise(p * 8.0) * erosionStrength;
      value = mix(value, smoothstep(0.3, 0.7, value), erosion);
      
      return value;
    }
    
    void main() {
      vPosition = position;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      vUv = uv;
      
      vec3 pos = normalize(position);
      float height = terrainFBM(pos * 4.0);
      
      float erosionPattern = noise(pos * 12.0) * erosionStrength;
      height = mix(height, height * 0.7, erosionPattern * 0.5);
      
      vec3 displaced = position + normal * height * terrainHeight;
      
      float delta = 0.001;
      vec3 neighborPos = normalize(position + vec3(delta, 0, 0));
      float neighborHeight = terrainFBM(neighborPos * 4.0);
      vec3 tangent = normalize(vec3(delta, neighborHeight - height, 0));
      vNormal = normalize(cross(tangent, vec3(0, 0, 1)));
      
      vElevation = height;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `;static fragmentShader=`
    uniform vec3 terrainColor;
    uniform float opacity;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec2 vUv;
    varying float vElevation;
    
    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      
      float n = i.x + i.y * 57.0 + 113.0 * i.z;
      return fract(sin(n + dot(i, vec3(1.0, 57.0, 113.0))) * 43758.5453);
    }
    
    void main() {
      vec3 normal = normalize(vNormal);
      
      vec3 lowColor = terrainColor * 0.6;
      vec3 midColor = terrainColor;
      vec3 highColor = terrainColor * 1.3;
      
      vec3 color;
      if (vElevation < 0.3) {
        color = mix(lowColor, midColor, vElevation / 0.3);
      } else if (vElevation < 0.7) {
        color = mix(midColor, highColor, (vElevation - 0.3) / 0.4);
      } else {
        vec3 peakColor = vec3(0.9, 0.85, 0.7);
        color = mix(highColor, peakColor, (vElevation - 0.7) / 0.3);
      }
      
      vec3 pos = normalize(vPosition);
      float textureNoise = noise(pos * 50.0);
      color *= (0.9 + 0.1 * textureNoise);
      
      float erosionLines = noise(pos * 100.0 + vec3(vElevation * 10.0));
      if (erosionLines > 0.8) {
        color *= 0.8;
      }
      
      vec3 lightDir;
      if (length(lightPosition) > 0.0) {
        lightDir = normalize(lightPosition - vWorldPosition);
      } else {
        lightDir = normalize(-lightDirection);
      }
      
      float dotNL = dot(normal, lightDir);
      float lighting = max(0.0, dotNL);

      color *= 0.25 + 0.75 * lighting;

      vec3 planetNormal = normalize(vWorldPosition);
      float planetDotNL = dot(planetNormal, lightDir);

      float shadowDarkness = smoothstep(0.1, -0.2, planetDotNL) * 0.6;
      color *= (1.0 - shadowDarkness);
      
      float viewDistance = length(vPosition);
      vec3 atmosphereColor = vec3(0.7, 0.75, 0.85);
      color = mix(color, atmosphereColor, min(0.3, viewDistance * 0.0001));
      
      float alpha = (0.5 + 0.5 * vElevation) * opacity;
      
      gl_FragColor = vec4(color, alpha);
    }
  `;constructor(i,o={}){this.layerSystem=i;const a=o.seed||Math.floor(Math.random()*1e6),t=new h(a),n=o.color instanceof s?o.color:o.color?new s(o.color):new s(13935475),l=o.planetType||"SAVANNAH",e=f[l];this.params={color:n,terrainHeight:o.terrainHeight||t.uniform(e.TERRAIN_HEIGHT.min,e.TERRAIN_HEIGHT.max),terrainComplexity:o.terrainComplexity||t.uniform(e.TERRAIN_COMPLEXITY.min,e.TERRAIN_COMPLEXITY.max),erosionStrength:o.erosionStrength||t.uniform(e.EROSION_STRENGTH.min,e.EROSION_STRENGTH.max),opacity:o.opacity||t.uniform(e.OPACITY.min,e.OPACITY.max),seed:a,planetType:l},this.material=new p({vertexShader:c.vertexShader,fragmentShader:c.fragmentShader,uniforms:{terrainColor:{value:n},terrainHeight:{value:this.params.terrainHeight},terrainComplexity:{value:this.params.terrainComplexity},erosionStrength:{value:this.params.erosionStrength},opacity:{value:this.params.opacity},lightDirection:{value:new v(1,1,1).normalize()},lightPosition:{value:new v(10,10,10)}},transparent:!0,side:u,depthWrite:!1}),this.layerMesh=this.layerSystem.addEffectLayer("savannahTerrain",this.material,this.layerSystem.getNextScaleFactor(),this)}update(i){}updateLightDirection(i){this.material.uniforms.lightDirection&&(this.material.uniforms.lightDirection.value=i.clone().normalize())}getObject3D(){return this.layerMesh}dispose(){}}function E(g,i,o,a="DEFAULT"){const t=i.surface||{},n=i.planet_info?.base_color||t.base_color,l=o||Math.floor(Math.random()*1e6),e=new h(l+9e3);let m=a;a==="DEFAULT"&&i.surface_elements?.type&&i.surface_elements.type.toLowerCase()==="savannah"&&(m="SAVANNAH");const r=f[m];return new c(g,{color:n?new s(n):new s(13935475),terrainHeight:t.terrain_height||e.uniform(r.TERRAIN_HEIGHT.min,r.TERRAIN_HEIGHT.max),terrainComplexity:t.terrain_complexity||e.uniform(r.TERRAIN_COMPLEXITY.min,r.TERRAIN_COMPLEXITY.max),erosionStrength:t.erosion_strength||e.uniform(r.EROSION_STRENGTH.min,r.EROSION_STRENGTH.max),opacity:e.uniform(r.OPACITY.min,r.OPACITY.max),seed:l,planetType:m})}export{E as c};
