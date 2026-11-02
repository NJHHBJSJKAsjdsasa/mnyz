import{D as T,g as P}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{S as v}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{cv as M,C as _,aJ as C,g,m as A,au as I,D as O,bE as R}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const s={OBJECT_COUNT:{min:16,max:32},SPOT_SIZE:{min:.4,max:1.2},SPOT_SIZE_SPECIAL:{min:3.2,max:4.2},MOVE_SPEED:{min:.01,max:.1},INNER_ROTATION_SPEED:{min:-300,max:300},PULSE_AMPLITUDE:{min:.1,max:2.5},TIME_SPEED:{min:.1,max:3}},y=.04;function D(u,i,e){return new I({uniforms:{uTime:{value:0},uToxicColor:{value:u},uSize:{value:i},uSeed:{value:e},uPulseAmplitude:{value:.2}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      uniform float uTime;
      uniform vec3 uToxicColor;
      uniform float uSize;
      uniform float uSeed;
      uniform float uPulseAmplitude;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453);
      }

      float polygonShape(vec2 p, int vertices) {
        vec2 center = vec2(0.5);
        vec2 dir = p - center;
        float angle = atan(dir.y, dir.x);
        float radius = length(dir);
        
        float angleStep = 6.28318 / float(vertices);
        float minDist = uSize;
        
        for (int i = 0; i < 8; i++) {
          if (i >= vertices) break;
          float vertexAngle = float(i) * angleStep;
          
            float vertexHash = hash(vec2(float(i) * 17.3, uSeed));
          float vertexRadius = uSize * 0.3 * (0.7 + 0.6 * vertexHash);
          
          vec2 vertex = center + vec2(cos(vertexAngle), sin(vertexAngle)) * vertexRadius;
          float distToVertex = length(p - vertex);
          minDist = min(minDist, distToVertex);
        }
        
        return 1.0 - smoothstep(0.0, uSize * 0.1, minDist);
      }

      void main() {
        int vertices = 5 + int(hash(vec2(uSeed + 10.0, 0.0)) * 2.0);
        float polygon = polygonShape(vUv, vertices);
        
        if (polygon < 0.1) {
          discard;
        }
        
        float pulse = sin(uTime * 2.0 + uSeed) * uPulseAmplitude + (1.0 - uPulseAmplitude * 0.5);
        
        vec3 finalColor = uToxicColor * pulse;
        float alpha = polygon * 0.8;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,transparent:!0,blending:R,depthWrite:!1,side:O})}class U{mesh;material;initialAngle;initialPhi;angleSpeed;phiSpeed;rotationSpeed;size;pulseAmplitude;planetRadius;constructor(i,e,t,o,a,r){this.planetRadius=i;const n=new v(t);r?this.size=n.uniform(s.SPOT_SIZE_SPECIAL.min,s.SPOT_SIZE_SPECIAL.max):this.size=n.uniform(s.SPOT_SIZE.min,s.SPOT_SIZE.max),this.pulseAmplitude=n.uniform(s.PULSE_AMPLITUDE.min,s.PULSE_AMPLITUDE.max);const l=o!==void 0?o:n.uniform(s.MOVE_SPEED.min,s.MOVE_SPEED.max),d=a!==void 0?a:n.uniform(s.INNER_ROTATION_SPEED.min,s.INNER_ROTATION_SPEED.max);this.angleSpeed=n.uniform(.5,1.5)*l,this.phiSpeed=n.uniform(-.3,.3)*l,this.rotationSpeed=d*n.uniform(.8,1.2);const c=new C(this.size*2,this.size*2,8,8),m=c.attributes.position.array;for(let h=0;h<m.length;h+=3){const S=m[h],f=m[h+1];m[h+2];const E=new g(S,f,0),p=this.planetRadius*1.001;E.normalize().multiplyScalar(p);const x=Math.sqrt(Math.max(0,p*p-S*S-f*f))-p;m[h+2]=x}c.attributes.position.needsUpdate=!0,c.computeVertexNormals(),this.material=D(e,this.size,t),this.material.uniforms.uPulseAmplitude.value=this.pulseAmplitude,this.mesh=new A(c,this.material),this.initialAngle=n.uniform(0,Math.PI*2),this.initialPhi=n.uniform(.2,Math.PI-.2)}updatePosition(i){const e=this.initialAngle+this.angleSpeed*i;let t=this.initialPhi+this.phiSpeed*i;t=Math.abs(t%(Math.PI*2)),t>Math.PI&&(t=Math.PI*2-t);const o=this.planetRadius*1.005,a=o*Math.sin(t)*Math.cos(e),r=o*Math.cos(t),n=o*Math.sin(t)*Math.sin(e);this.mesh.position.set(a,r,n);const l=new g(a,r,n).normalize();this.mesh.lookAt(this.mesh.position.x+l.x,this.mesh.position.y+l.y,this.mesh.position.z+l.z);const d=i*this.rotationSpeed*.01;this.mesh.rotateZ(d)}update(i,e){this.updatePosition(e),this.material.uniforms.uTime.value=e}getMesh(){return this.mesh}dispose(){this.material.dispose(),this.mesh.geometry.dispose()}}class z{spots=[];planetRadius;rng;startTime;proceduralParams;toxicColor;cosmicOriginTime;useSpecialEffect;group;constructor(i,e={}){this.planetRadius=i,this.group=new M;const t=e.seed||Math.floor(Math.random()*1e6);this.rng=new v(t),this.useSpecialEffect=this.rng.random()<y,this.startTime=t%1e4/1e3,this.cosmicOriginTime=e.cosmicOriginTime||T,this.proceduralParams={objectCount:Math.floor(this.rng.uniform(s.OBJECT_COUNT.min,s.OBJECT_COUNT.max)),timeSpeed:e.timeSpeed||this.rng.uniform(s.TIME_SPEED.min,s.TIME_SPEED.max),moveSpeed:e.moveSpeed,innerRotationSpeed:e.innerRotationSpeed};const o=this.rng.uniform(.7,.95),a=this.rng.uniform(.8,1),r=this.rng.uniform(.5,.9);this.toxicColor=e.toxicColor||new _().setHSL(o,a,r),this.createSpots()}createSpots(){for(let i=0;i<this.proceduralParams.objectCount;i++){const e=this.rng.random()*1e6,t=this.rng.uniform(-.05,.05),o=this.toxicColor.clone(),a={};o.getHSL(a),o.setHSL((a.h+t)%1,a.s,a.l);const r=new U(this.planetRadius,o,e,this.proceduralParams.moveSpeed,this.proceduralParams.innerRotationSpeed,this.useSpecialEffect);this.spots.push(r),this.group.add(r.getMesh())}}update(i=.016){const e=P(this.cosmicOriginTime,this.proceduralParams.timeSpeed,this.startTime);this.spots.forEach(t=>{t.update(i,e)})}addToScene(i,e){this.group.position.copy(e),i.add(this.group)}getObject3D(){return this.group}dispose(){this.spots.forEach(i=>i.dispose()),this.spots=[],this.group.parent&&this.group.parent.remove(this.group)}}function V(u,i,e,t){if(!i||!i.type||i.type.toLowerCase()!=="toxic")return null;const o=e||Math.floor(Math.random()*1e6);return new z(u,{seed:o+3e4,moveSpeed:t?.moveSpeed,innerRotationSpeed:t?.innerRotationSpeed,timeSpeed:t?.timeSpeed,toxicColor:t?.toxicColor,...t})}export{z as T,V as c};
