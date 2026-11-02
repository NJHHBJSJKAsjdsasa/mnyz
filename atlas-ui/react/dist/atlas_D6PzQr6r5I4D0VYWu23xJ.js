import{S as m}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{C as c,au as T,D as E,bA as P,g as d}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const t={STORM_COUNT:{min:1,max:4},STORM_SIZE:{min:.15,max:.3},STORM_INTENSITY:{min:.6,max:1.2},SPIRAL_SPEED:{min:.5,max:1.5},ANIMATION_SPEED:{min:.1,max:.5},OPACITY:{min:.1,max:.3}};class f{layerMesh;material;params;layerSystem;static vertexShader=`
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
  `;static fragmentShader=`
    uniform float time;
    uniform vec3 stormColor;
    uniform vec3 stormCenters3D[30];
    uniform float stormSizes[30];
    uniform float stormIntensities[30];
    uniform float spiralSpeeds[30];
    uniform float animationSpeeds[30];
    uniform int numStorms;
    uniform vec3 lightDirection;
    uniform vec3 lightPosition;
    uniform float ambientStrength;
    uniform float lightIntensity;
    uniform float opacity;
    
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    
    float createGyroSpirals(vec3 pos) {
      float storms = 0.0;
      
      for(int i = 0; i < 30; i++) {
        if(i >= numStorms) break;
        
        vec3 stormCenter3D = normalize(stormCenters3D[i]);
        float stormSize = stormSizes[i];
        float stormIntensity = stormIntensities[i];
        float spiralSpeed = spiralSpeeds[i];
        float animationSpeed = animationSpeeds[i];

        float dotProduct = dot(pos, stormCenter3D);
        float angularDist = acos(clamp(dotProduct, -1.0, 1.0));
        
        if(angularDist < stormSize) {

          vec3 tangent = normalize(cross(stormCenter3D, vec3(0.0, 0.0, 1.0)));
          if(length(cross(stormCenter3D, vec3(0.0, 0.0, 1.0))) < 0.1) {
            tangent = normalize(cross(stormCenter3D, vec3(1.0, 0.0, 0.0)));
          }
          
          vec3 toPoint = pos - stormCenter3D * dot(pos, stormCenter3D);
          float angle = atan(dot(toPoint, cross(stormCenter3D, tangent)), dot(toPoint, tangent));

          float spiralFreq = 2.0 + spiralSpeed * 8.0;
          float radialFreq = 5.0 + spiralSpeed * 15.0;
          float spiral = sin(angle * spiralFreq + angularDist * radialFreq - time * animationSpeed * 2.0);

          spiral = smoothstep(-0.4, 1.2, spiral + 0.5);

          float cloudNoise = sin(angularDist * 25.0 + time * animationSpeed) * 0.3;
          spiral = spiral * (0.7 + cloudNoise * 0.3);

          spiral = spiral * (0.3 + stormIntensity * 0.7);

          float falloffStart = stormSize * 0.3;
          float falloffRange = stormSize - falloffStart;
          float falloff = 1.0;
          
          if(angularDist > falloffStart) {
            falloff = 1.0 - ((angularDist - falloffStart) / falloffRange);

            falloff = smoothstep(0.0, 1.0, falloff);
            falloff = smoothstep(0.0, 1.0, falloff);
            falloff = pow(falloff, 0.7);
          }

          float stormIntensityValue = falloff * spiral * stormIntensity * 0.3;
          storms += stormIntensityValue;
        }
      }

      return storms;
    }
    
    void main() {
      vec3 pos = normalize(vPosition);

      vec3 normal = normalize(vWorldNormal);
      vec3 lightDir = normalize(lightPosition - vWorldPosition);
      float dotNL = dot(normal, lightDir);

      float dayNight = smoothstep(-0.3, 0.1, dotNL);

      float rimLight = 1.0 - abs(dotNL);
      rimLight = pow(rimLight, 3.0) * 0.1;

      float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;

      float storms = createGyroSpirals(pos);

      vec3 color = stormColor * totalLight;
      float alpha = clamp(storms * opacity * 3.0, 0.0, 0.8);
      
      gl_FragColor = vec4(color, alpha);
    }
  `;constructor(e,i={}){this.layerSystem=e;const o=i.seed||Math.floor(Math.random()*1e6),r=new m(o);this.params={stormCenters:i.stormCenters||this.generateStormCenters(o),stormColor:i.stormColor||new c(16724016),stormIntensity:i.stormIntensity||r.uniform(t.STORM_INTENSITY.min,t.STORM_INTENSITY.max),spiralSpeed:i.spiralSpeed||r.uniform(t.SPIRAL_SPEED.min,t.SPIRAL_SPEED.max),animationSpeed:i.animationSpeed||r.uniform(t.ANIMATION_SPEED.min,t.ANIMATION_SPEED.max),opacity:i.opacity||r.uniform(t.OPACITY.min,t.OPACITY.max),seed:o},this.material=this.createShaderMaterial(),this.layerMesh=this.layerSystem.addEffectLayer("cloudGyros",this.material,1.002,this)}createShaderMaterial(){const e=new Array(90).fill(0),i=new Array(30).fill(.25),o=new Array(30).fill(1),r=new Array(30).fill(1),s=new Array(30).fill(1);return this.params.stormCenters&&this.params.stormCenters.forEach((a,n)=>{n<30&&(e[n*3]=a.x,e[n*3+1]=a.y,e[n*3+2]=a.z,i[n]=a.size,o[n]=a.intensity,r[n]=a.spiralSpeed,s[n]=a.animationSpeed)}),new T({vertexShader:f.vertexShader,fragmentShader:f.fragmentShader,uniforms:{time:{value:0},stormColor:{value:this.params.stormColor||new c(16724016)},opacity:{value:this.params.opacity||t.OPACITY.max},stormCenters3D:{value:e},stormSizes:{value:i},stormIntensities:{value:o},spiralSpeeds:{value:r},animationSpeeds:{value:s},numStorms:{value:this.params.stormCenters?Math.min(this.params.stormCenters.length,30):30},lightDirection:{value:new d(1,1,1).normalize()},lightPosition:{value:new d(1,1,1)},ambientStrength:{value:.2},lightIntensity:{value:1}},transparent:!0,blending:P,side:E,depthWrite:!1})}generateStormCenters(e){const i=Math.abs(e%1e6),o=[],r=new m(i),s=Math.floor(r.uniform(t.STORM_COUNT.min,t.STORM_COUNT.max+1));for(let a=0;a<s;a++){const n=i+a*7919,l=new m(n),p=l.uniform(0,Math.PI*2),S=Math.acos(l.uniform(-1,1)),h=Math.sin(S)*Math.cos(p),u=Math.sin(S)*Math.sin(p),y=Math.cos(S),g=l.uniform(t.STORM_SIZE.min,t.STORM_SIZE.max),I=l.uniform(t.STORM_INTENSITY.min,t.STORM_INTENSITY.max),N=l.uniform(t.SPIRAL_SPEED.min,t.SPIRAL_SPEED.max),M=l.uniform(t.ANIMATION_SPEED.min,t.ANIMATION_SPEED.max);o.push({x:h,y:u,z:y,size:g,intensity:I,spiralSpeed:N,animationSpeed:M})}return o}update(e){this.material.uniforms.time&&(this.material.uniforms.time.value+=e)}updateParams(e){if(this.params={...this.params,...e},e.stormIntensity!==void 0){const i=this.material.uniforms.stormIntensities.value;for(let o=0;o<i.length;o++)i[o]=e.stormIntensity}if(e.spiralSpeed!==void 0){const i=this.material.uniforms.spiralSpeeds.value;for(let o=0;o<i.length;o++)i[o]=e.spiralSpeed}if(e.animationSpeed!==void 0){const i=this.material.uniforms.animationSpeeds.value;for(let o=0;o<i.length;o++)i[o]=e.animationSpeed}e.opacity!==void 0&&(this.material.uniforms.opacity.value=e.opacity)}dispose(){}}function D(v,e,i){const o=e.storms||{},r=i||Math.floor(Math.random()*1e6),s=new m(r+5e3),a={stormCenters:o.centers||void 0,stormColor:new c(16724016),stormIntensity:o.intensity||e.storm_intensity||s.uniform(t.STORM_INTENSITY.min,t.STORM_INTENSITY.max),spiralSpeed:o.spiral_speed||s.uniform(t.SPIRAL_SPEED.min,t.SPIRAL_SPEED.max),animationSpeed:s.uniform(t.ANIMATION_SPEED.min,t.ANIMATION_SPEED.max),opacity:s.uniform(t.OPACITY.min,t.OPACITY.max),seed:r};return new f(v,a)}export{D as c};
