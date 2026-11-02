import{S as w}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{cv as A,C as H,g as m,au as O,f as x,i as L,j as D,cp as E,D as b,m as I,cI as N,cR as z}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const l={HOLE_COUNT:{min:22,max:36},HOLE_RADIUS:{min:.03,max:.1},HOLE_DEPTH:{min:.02,max:.12},ROUGHNESS:{min:.4,max:.8},COLOR_VARIATION:{min:.2,max:.5}};class U{group;planetRadius;rng;holesData=[];coneMeshes=[];holeMask;holeColor;constructor(o,e={},t){this.group=new A,this.planetRadius=o;const i=t||12345;this.rng=new w(i),this.holeColor=e.holeColor instanceof H?e.holeColor:new H(e.holeColor||"#000000"),this.holesData=this.generateProceduralHoles(),this.holesData.length>0&&this.createHoles()}generateProceduralHoles(){const o=[],e=this.rng.randint(l.HOLE_COUNT.min,l.HOLE_COUNT.max);for(let t=0;t<e;t++){const i=this.rng.random()*2*Math.PI,a=Math.acos(this.rng.random()*2-1),h=[Math.sin(a)*Math.cos(i),Math.sin(a)*Math.sin(i),Math.cos(a)];o.push({position_3d:h,radius:this.rng.uniform(l.HOLE_RADIUS.min,l.HOLE_RADIUS.max),depth:this.rng.uniform(l.HOLE_DEPTH.min,l.HOLE_DEPTH.max),roughness:this.rng.uniform(l.ROUGHNESS.min,l.ROUGHNESS.max),color_variation:this.rng.uniform(l.COLOR_VARIATION.min,l.COLOR_VARIATION.max)})}return o}createPlanetHoleShader(o){const t=Math.min(this.holesData.length,64),i=`
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
    `,a=`
      uniform vec3 baseColor;
      uniform vec3 lightDirection;
      uniform vec3 lightPosition;
      uniform float ambientStrength;
      uniform float lightIntensity;
      uniform vec3 holePositions[${t}];
      uniform float holeRadii[${t}];
      uniform int numHoles;
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
        vec3 rotatedWorldPos = rotateY(vWorldPosition, -rotationAngle);
        vec3 worldPos = normalize(rotatedWorldPos);

        for(int i = 0; i < ${t}; i++) {
          if(i >= numHoles) break;

          vec3 holePos = normalize(holePositions[i]);
          float dist = distance(worldPos, holePos);
          float holeRadius = holeRadii[i];

          if(dist < holeRadius) {
            discard;
          }
        }

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

        float totalLight = ambientStrength + (lightIntensity * dayNight) + rimLight;
        vec3 finalColor = baseColor * totalLight;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,h=new Array(t).fill(null).map((c,s)=>s<this.holesData.length?new m(...this.holesData[s].position_3d):new m(0,0,0)),r=new Array(t).fill(null).map((c,s)=>s<this.holesData.length?this.holesData[s].radius:0);return new O({vertexShader:i,fragmentShader:a,uniforms:{baseColor:{value:o},lightDirection:{value:new m(1,1,1).normalize()},lightPosition:{value:new m(0,0,0)},ambientStrength:{value:.15},lightIntensity:{value:.85},holePositions:{value:h},holeRadii:{value:r},numHoles:{value:t},rotationAngle:{value:0}},side:x})}createHoles(){this.holesData.slice(0,64).forEach(t=>{this.createHoleCone(t)})}createHollowConeGeometry(o,e,t,i){const a=new L,h=[],r=[],c=[],s=[];for(let n=0;n<=t;n++){const S=n/t*Math.PI*2,P=Math.cos(S),y=Math.sin(S),d=P*o,u=y*o,M=e/2,v=Math.sqrt(d*d+u*u),C=v*v/(i*2),R=M-C;h.push(d,R,u),s.push(n/t,1),h.push(0,-e/2,0),s.push(n/t,0)}for(let n=0;n<t;n++){const S=n*2,P=n*2+1,y=(n+1)%(t+1)*2,d=(n+1)%(t+1)*2+1;r.push(S,P,y),r.push(P,d,y);const u=n/t*Math.PI*2,M=Math.cos(u),v=Math.sin(u);c.push(M,.5,v),c.push(M,.5,v)}const p=0,g=Math.cos(p),f=Math.sin(p);return c.push(g,.5,f),c.push(g,.5,f),a.setIndex(r),a.setAttribute("position",new D(h,3)),a.setAttribute("normal",new D(c,3)),a.setAttribute("uv",new D(s,2)),a}createHoleCone(o){const e=new m(...o.position_3d).normalize(),t=o.radius*this.planetRadius,i=o.depth*this.planetRadius*2,a=this.createHollowConeGeometry(t,i,16,this.planetRadius),h=new E({color:new H(8421504),transparent:!1,opacity:1,side:b}),r=new I(a,h),c=e.clone().multiplyScalar(this.planetRadius),s=e.clone().negate(),p=c.clone().add(s.clone().multiplyScalar(i*.5));r.position.copy(p);const g=new m(0,1,0),f=e.clone(),n=new N().setFromUnitVectors(g,f);r.setRotationFromQuaternion(n),this.coneMeshes.push(r),this.group.add(r)}update(o,e){e!==void 0&&(this.group.rotation.y=e,this.planetShader&&this.planetShader.uniforms.rotationAngle&&(this.planetShader.uniforms.rotationAngle.value=e))}updateLightDirection(o){this.planetShader&&this.planetShader.uniforms.lightDirection.value.copy(o.normalize())}updateFromThreeLight(o){if(this.planetShader){this.planetShader.uniforms.lightPosition.value.copy(o.position);const e=o.target.position.clone().sub(o.position).normalize();this.planetShader.uniforms.lightDirection.value.copy(e)}}addToScene(o,e){this.group.position.copy(e),o.add(this.group)}applyToPlanetSystem(o,e){const t=this.createPlanetHoleShader(e);if(o.baseMaterial&&o.baseMaterial.uniforms){const i=o.baseMaterial.uniforms;i.lightDirection&&t.uniforms.lightDirection.value.copy(i.lightDirection.value),i.lightPosition&&t.uniforms.lightPosition.value.copy(i.lightPosition.value),i.ambientStrength&&(t.uniforms.ambientStrength.value=i.ambientStrength.value),i.lightIntensity&&(t.uniforms.lightIntensity.value=i.lightIntensity.value)}o.applyHoleShader(t),this.planetShader=t,this.planetSystem=o}planetShader;planetSystem;removeFromScene(o){o.remove(this.group)}getObject3D(){return this.group}dispose(){this.coneMeshes.forEach(o=>{o.geometry.dispose(),o.material instanceof z&&o.material.dispose()}),this.coneMeshes=[],this.planetShader&&(this.planetShader.dispose(),this.planetShader=void 0)}}function W(_,o,e){const t=o?.surface_elements?.cave_holes,i={};return t?.holes&&(i.holes=t.holes),t?.hole_color&&(i.holeColor=t.hole_color),new U(_,i,e)}export{U as C,W as c};
