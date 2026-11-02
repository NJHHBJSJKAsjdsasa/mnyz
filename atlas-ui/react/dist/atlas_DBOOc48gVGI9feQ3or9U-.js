import{S as m}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{C as r,d5 as f,au as h,bE as p,D as v,m as C}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const e={CRACK_DENSITY:{min:.3,max:.6},CRACK_DEPTH:{min:.5,max:.9},CRACK_COMPLEXITY:{min:3,max:5},CRACK_SCALE:{min:3,max:8},CRACK_SHARPNESS:{min:.7,max:1},CRACK_OPACITY:{min:.6,max:.9},INTERNAL_REFLECTIONS:{min:.5,max:.9},ANIMATION_SPEED:{min:.05,max:.15}};class u{crackMesh;material;params;constructor(a={}){const o=a.seed!==void 0?a.seed:123456,t=new m(o+1e4),i=t.uniform(0,360),s=t.uniform(.3,.8),c=t.uniform(.7,1),l=new r().setHSL(i/360,s,c);this.params={crackDensity:t.uniform(e.CRACK_DENSITY.min,e.CRACK_DENSITY.max),crackDepth:t.uniform(e.CRACK_DEPTH.min,e.CRACK_DEPTH.max),crackComplexity:Math.floor(t.uniform(e.CRACK_COMPLEXITY.min,e.CRACK_COMPLEXITY.max)),crackScale:t.uniform(e.CRACK_SCALE.min,e.CRACK_SCALE.max),crackSharpness:t.uniform(e.CRACK_SHARPNESS.min,e.CRACK_SHARPNESS.max),crackColor:l,crackOpacity:t.uniform(e.CRACK_OPACITY.min,e.CRACK_OPACITY.max),internalReflections:t.uniform(e.INTERNAL_REFLECTIONS.min,e.INTERNAL_REFLECTIONS.max),animationSpeed:t.uniform(e.ANIMATION_SPEED.min,e.ANIMATION_SPEED.max),seed:o,radius:a.radius||2.5,lineDrawPercentage:a.lineDrawPercentage!==void 0?a.lineDrawPercentage:.66};const d=new f(this.params.radius*1.02,32,32);this.material=new h({vertexShader:`
        uniform float rotationAngle;

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        vec3 rotateY(vec3 p, float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        }

        void main() {
          vec3 rotatedPos = rotateY(position, -rotationAngle);

          float theta = atan(rotatedPos.x, rotatedPos.z);
          float phi = acos(rotatedPos.y / length(rotatedPos));
          vUv = vec2((theta + 3.14159) / (2.0 * 3.14159), phi / 3.14159);

          vPosition = rotatedPos;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        precision highp float;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;
        
        uniform float time;
        uniform vec3 crackColor;
        uniform float crackIntensity;
        uniform float crackGlow;
        uniform float planetSeed;
        uniform float lineDrawPercentage;
        
        vec2 random2(vec2 st, float seed) {
          st = vec2(dot(st, vec2(127.1 + seed, 311.7 + seed * 0.5)),
                    dot(st, vec2(269.5 + seed * 0.3, 183.3 + seed * 0.7)));
          vec2 result = fract(sin(st) * (43758.5453123 + seed));
          result = clamp(result, 0.0, 1.0);
          return -1.0 + 2.0 * result;
        }
        
        float shouldDrawLine(vec2 position, float planetSeed, float percentage) {
          vec2 cellPos = floor(position * 2.0);
          
          float cellHash = dot(cellPos, vec2(127.1, 311.7));
          cellHash = fract(sin(cellHash + planetSeed * 0.001) * 43758.5453);
          
          cellHash = clamp(fract(cellHash + planetSeed * 0.0001), 0.0, 1.0);
          
          return step(cellHash, percentage);
        }
        
        float voronoiCracks(vec2 st, float planetSeed) {
          vec2 i_st = floor(st);
          vec2 f_st = fract(st);
          
          float min_dist = 10.0;
          float min_dist2 = 10.0;
          
          for(int y = -2; y <= 2; y++) {
            for(int x = -2; x <= 2; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 point = random2(i_st + neighbor, planetSeed);
              point = 0.5 + 0.35 * point;
              vec2 diff = neighbor + point - f_st;
              float dist = length(diff);
              
              if(dist < min_dist) {
                min_dist2 = min_dist;
                min_dist = dist;
              } else if(dist < min_dist2) {
                min_dist2 = dist;
              }
            }
          }
          
          float edge = min_dist2 - min_dist;
          return smoothstep(0.0, 0.1, edge);
        }
        
        void main() {
          vec2 st = clamp(vUv, 0.0, 1.0) * (6.0 + mod(planetSeed, 4.0));
          
          float drawChance1 = shouldDrawLine(st, planetSeed, lineDrawPercentage);
          float drawChance2 = shouldDrawLine(st * 1.5, planetSeed + 1000.0, lineDrawPercentage);
          
          if(drawChance1 < 0.5 && drawChance2 < 0.5) {
            discard;
          }
          
          vec2 offset1 = vec2(mod(planetSeed, 17.0), mod(planetSeed * 1.3, 19.0));
          vec2 offset2 = vec2(mod(planetSeed * 2.1, 23.0), mod(planetSeed * 0.7, 29.0));
          
          float edge1 = voronoiCracks(st, planetSeed);
          float edge2 = voronoiCracks(st * (1.3 + mod(planetSeed * 0.1, 0.4)) + offset2, planetSeed + 1000.0);
          
          float lineWidth = 0.02 + mod(planetSeed * 0.001, 0.01);
          float crack1 = (1.0 - smoothstep(0.0, lineWidth, edge1)) * drawChance1;
          float crack2 = (1.0 - smoothstep(0.0, lineWidth * 0.8, edge2)) * drawChance2;
          
          float weight = 0.5 + mod(planetSeed * 0.01, 0.3);
          float crack = max(crack1, crack2 * weight);
          
          if(crack < 0.1) {
            discard;
          }
          
          float depthVariation = abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
          crack *= 0.7 + 0.3 * depthVariation;
          
          float pulseSpeed = 1.0 + mod(planetSeed * 0.001, 1.0);
          float pulse = 1.0 + 0.05 * sin(time * pulseSpeed + st.x * 3.0 + planetSeed);
          crack *= pulse;
          
          vec3 baseColor = crackColor * crackIntensity;
          vec3 glowColor = baseColor * (1.0 + crackGlow * crack * 0.5);
          
          float alpha = crack * 0.11;
          
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,uniforms:{time:{value:0},crackColor:{value:this.params.crackColor||new r(65535)},crackIntensity:{value:(this.params.crackOpacity||.7)*2},crackGlow:{value:(this.params.internalReflections||.7)*3},planetSeed:{value:this.params.seed||123456},lineDrawPercentage:{value:this.params.lineDrawPercentage||.66},rotationAngle:{value:0}},transparent:!0,depthWrite:!1,side:v,blending:p}),this.crackMesh=new C(d,this.material)}addToScene(a,o){this.crackMesh.position.copy(o),this.crackMesh.visible=!0,a.add(this.crackMesh)}removeFromScene(a){a.remove(this.crackMesh)}update(a,o){this.material.uniforms.time&&(this.material.uniforms.time.value+=a*this.params.animationSpeed),o!==void 0&&this.material.uniforms.rotationAngle&&(this.material.uniforms.rotationAngle.value=o)}updateFromThreeLight(a){}getObject3D(){return this.crackMesh}dispose(){this.crackMesh&&(this.crackMesh.geometry.dispose(),this.material.dispose())}}function A(n,a,o){const i=o?(o+5e3)%1e6:Math.floor(Math.random()*1e6);return new u({radius:a,seed:i,lineDrawPercentage:.66})}export{u as T,A as c};
