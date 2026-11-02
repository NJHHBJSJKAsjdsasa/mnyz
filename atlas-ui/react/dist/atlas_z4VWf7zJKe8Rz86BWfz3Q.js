import{S as p}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{g as P,D as T}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{i as y,cU as d,av as n,au as C,bE as A}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const t={PARTICLE_COUNT:{min:60,max:150},PHASE_INTENSITY:{min:.4,max:.9},TRANSITION_SPEED:{min:1,max:4},COHERENCE_LEVEL:{min:.7,max:.7},TIME_SPEED:{min:3e-4,max:6e-4},PHASE_STATES:{min:3,max:6}};class l{phaseSystem;material;geometry;params;particleCount;startTime;static vertexShader=`
    attribute float size;
    attribute vec3 phaseVector;
    attribute float coherenceFactor;
    attribute float phaseState;
    attribute float transitionPhase;
    
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSize;
    varying float vPhaseState;
    varying float vCoherence;
    
    uniform float time;
    uniform float phaseIntensity;
    uniform float transitionSpeed;
    uniform float coherenceLevel;
    uniform float phaseStates;
    
    float phaseTransition(float state, float t) {
      float cycle = sin(t * transitionSpeed + state * 6.28 / phaseStates);
      return 0.5 + 0.5 * cycle;
    }
    
    vec3 getPhasePosition(vec3 basePos, float state, float t) {
      float transition = phaseTransition(state, t);
      
      if (state < 1.0) {
        return basePos * (0.8 + 0.2 * transition);
      }
      else if (state < 2.0) {
        vec3 flow = vec3(sin(t + basePos.x), cos(t + basePos.y), sin(t * 0.5 + basePos.z)) * 0.1;
        return basePos + flow * transition;
      }
      else if (state < 3.0) {
        return basePos * (1.0 + 0.5 * transition);
      }
      else if (state < 4.0) {
        vec3 energy = normalize(phaseVector) * sin(t * 3.0) * 0.3;
        return basePos + energy * transition;
      }
      else if (state < 5.0) {
        vec3 uncertainty = phaseVector * sin(t * 5.0 + state) * 0.4;
        return basePos + uncertainty * transition;
      }
      else {
        return -basePos * (0.5 + 0.5 * transition);
      }
    }
    
    void main() {
      vSize = size;
      vPhaseState = phaseState;
      vCoherence = coherenceFactor;
      
      vec3 pos = getPhasePosition(position, phaseState, time + transitionPhase);
      
      float coherence = coherenceFactor * coherenceLevel;
      float phaseTransitionValue = phaseTransition(phaseState, time + transitionPhase);
      
      if (phaseState < 1.0) {
        vColor = vec3(0.8, 0.8, 1.0);
      } else if (phaseState < 2.0) {
        vColor = vec3(0.3, 0.7, 1.0);
      } else if (phaseState < 3.0) {
        vColor = vec3(0.9, 0.9, 0.6);
      } else if (phaseState < 4.0) {
        vColor = vec3(1.0, 0.5, 0.2);
      } else if (phaseState < 5.0) {
        vColor = vec3(0.7, 0.3, 1.0);
      } else {
        vColor = vec3(1.0, 0.2, 0.8);
      }
      
      vColor *= (0.7 + 0.3 * phaseTransitionValue);
      
      vAlpha = coherence * phaseIntensity * phaseTransitionValue;
      
      float materialization = abs(sin(time * 2.0 + phaseState)) * 0.5 + 0.5;
      vAlpha *= materialization;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = size * (300.0 / -mvPosition.z) * (0.5 + coherence);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;static fragmentShader=`
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSize;
    varying float vPhaseState;
    varying float vCoherence;
    
    uniform float time;
    
    float quantumInterference(vec2 uv, float phase) {
      float dist = length(uv);
      float wave = sin(dist * 15.0 + phase * 10.0 + time * 3.0);
      return 0.5 + 0.5 * wave;
    }
    
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float dist = length(uv);
      
      float particle = 1.0 - smoothstep(0.0, 0.5, dist);
      
      if (vPhaseState < 1.0) {
        particle = 1.0 - smoothstep(0.0, 0.3, dist);
      } else if (vPhaseState < 2.0) {
        particle = 1.0 - smoothstep(0.0, 0.4, dist);
        particle *= (0.8 + 0.2 * sin(time * 2.0 + dist * 10.0));
      } else if (vPhaseState < 3.0) {
        particle = 1.0 - smoothstep(0.0, 0.5, dist);
        particle *= 0.6;
      } else if (vPhaseState < 4.0) {
        float energy = quantumInterference(uv, vPhaseState);
        particle *= energy;
      } else if (vPhaseState < 5.0) {
        float interference = quantumInterference(uv, vPhaseState);
        particle *= interference;
        
        float probability = abs(sin(time + vPhaseState));
        if (probability < 0.3) {
          particle *= 0.2;
        }
      } else {
        particle = smoothstep(0.2, 0.5, dist) - smoothstep(0.5, 0.8, dist);
      }
      
      float coherenceEffect = vCoherence;
      if (coherenceEffect < 0.3) {
        particle *= 0.4;
        
        float flicker = step(0.8, fract(sin(time * 10.0 + vPhaseState) * 43758.5453));
        particle *= (0.3 + 0.7 * flicker);
      }
      
      float temporal = sin(time * 4.0 + vPhaseState) * 0.2 + 0.8;
      particle *= temporal;
      
      vec3 finalColor = vColor;
      
      if (abs(sin(time * 2.0 + vPhaseState)) > 0.9) {
        finalColor += vec3(0.5, 0.5, 0.5);
      }
      
      float finalAlpha = particle * vAlpha;
      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `;constructor(o,e={}){const s=e.seed||Math.floor(Math.random()*1e6),a=new p(s);this.startTime=e.startTime||s%1e4/1e3,this.params={particleCount:e.particleCount||Math.floor(a.uniform(t.PARTICLE_COUNT.min,t.PARTICLE_COUNT.max)),phaseIntensity:e.phaseIntensity||a.uniform(t.PHASE_INTENSITY.min,t.PHASE_INTENSITY.max),transitionSpeed:e.transitionSpeed||a.uniform(t.TRANSITION_SPEED.min,t.TRANSITION_SPEED.max),coherenceLevel:e.coherenceLevel||a.uniform(t.COHERENCE_LEVEL.min,t.COHERENCE_LEVEL.max),timeSpeed:e.timeSpeed||a.uniform(t.TIME_SPEED.min,t.TIME_SPEED.max),phaseStates:e.phaseStates||Math.floor(a.uniform(t.PHASE_STATES.min,t.PHASE_STATES.max)),seed:s,startTime:this.startTime},this.particleCount=this.params.particleCount,this.geometry=new y,this.material=this.createMaterial(),this.generatePhaseParticles(o),this.phaseSystem=new d(this.geometry,this.material)}generatePhaseParticles(o){const e=new Float32Array(this.particleCount*3),s=new Float32Array(this.particleCount),a=new Float32Array(this.particleCount*3),h=new Float32Array(this.particleCount),f=new Float32Array(this.particleCount),S=new Float32Array(this.particleCount),u=this.params.seed||Math.floor(Math.random()*1e6),r=new p(u);for(let i=0;i<this.particleCount;i++){const E=o*r.uniform(1.1,1.9),c=r.spherePosition(E);e[i*3]=c.x,e[i*3+1]=c.y,e[i*3+2]=c.z,s[i]=r.uniform(.8,2);const m=r.spherePosition(1);a[i*3]=m.x,a[i*3+1]=m.y,a[i*3+2]=m.z,h[i]=r.uniform(.1,1),f[i]=r.uniform(0,this.params.phaseStates),S[i]=r.uniform(0,Math.PI*2)}this.geometry.setAttribute("position",new n(e,3)),this.geometry.setAttribute("size",new n(s,1)),this.geometry.setAttribute("phaseVector",new n(a,3)),this.geometry.setAttribute("coherenceFactor",new n(h,1)),this.geometry.setAttribute("phaseState",new n(f,1)),this.geometry.setAttribute("transitionPhase",new n(S,1))}createMaterial(){return new C({vertexShader:l.vertexShader,fragmentShader:l.fragmentShader,uniforms:{time:{value:0},phaseIntensity:{value:this.params.phaseIntensity},transitionSpeed:{value:this.params.transitionSpeed},coherenceLevel:{value:this.params.coherenceLevel},phaseStates:{value:this.params.phaseStates}},transparent:!0,blending:A,depthWrite:!1})}addToScene(o,e){e&&this.phaseSystem.position.copy(e),o.add(this.phaseSystem)}update(){const e=P(T,this.params.timeSpeed,this.startTime);this.material.uniforms.time.value=e,this.phaseSystem.rotation.x=e*.012*Math.cos(e*.3),this.phaseSystem.rotation.y=e*.008*Math.sin(e*.5),this.phaseSystem.rotation.z=e*.006*Math.cos(e*.7)}getObject3D(){return this.phaseSystem}dispose(){this.geometry.dispose(),this.material.dispose()}}function b(v,o,e){const s=e||Math.floor(Math.random()*1e6),a=new p(s+9e3),h={particleCount:Math.floor(a.uniform(t.PARTICLE_COUNT.min,t.PARTICLE_COUNT.max)),phaseIntensity:a.uniform(t.PHASE_INTENSITY.min,t.PHASE_INTENSITY.max),transitionSpeed:a.uniform(t.TRANSITION_SPEED.min,t.TRANSITION_SPEED.max),coherenceLevel:a.uniform(t.COHERENCE_LEVEL.min,t.COHERENCE_LEVEL.max),timeSpeed:a.uniform(t.TIME_SPEED.min,t.TIME_SPEED.max),phaseStates:Math.floor(a.uniform(t.PHASE_STATES.min,t.PHASE_STATES.max)),seed:s,startTime:s%1e4/1e3};return new l(v,h)}export{l as A,b as c};
