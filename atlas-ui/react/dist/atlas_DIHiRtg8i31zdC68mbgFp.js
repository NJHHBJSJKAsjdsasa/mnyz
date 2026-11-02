import{E as T,R as S,U as A,S as v}from"./atlas_Dyu5TuS4aOiFromlWQw7_.js";import{g as I,D as C}from"./atlas_DEKVFm_qd-9rY4MxzBqjx.js";import{S as b}from"./atlas_CeQg93eRwzz916rALJkEC.js";import{C as f,o as d}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";const o={bloomStrength:{min:.3,max:.6},bloomRadius:{min:.4,max:.8},bloomThreshold:{min:.2,max:.5},godrayIntensity:{min:.05,max:.16},chromaticAberrationIntensity:{min:.001,max:.004},timeSpeed:{min:.6,max:1.8},breathingAmplitude:{min:.05,max:.2},pulseAmplitude:{min:.02,max:.1}},D={uniforms:{tDiffuse:{value:null},uIntensity:{value:.005},uToxicTint:{value:new f(.5,0,.8)},uTime:{value:0}},vertexShader:`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform vec3 uToxicTint;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      vec2 direction = normalize(vUv - center);
      float distance = length(vUv - center);
      
      float aberration = uIntensity * distance * distance;
      
      float pulse = sin(uTime * 0.5) * 0.3 + 0.7;
      aberration *= pulse;
      
      vec2 offsetR = direction * aberration * 1.2;
      vec2 offsetG = direction * aberration * 0.8;
      vec2 offsetB = direction * aberration * 1.5;
      
      float r = texture2D(tDiffuse, vUv + offsetR).r;
      float g = texture2D(tDiffuse, vUv + offsetG).g;
      float b = texture2D(tDiffuse, vUv + offsetB).b;
      
      vec3 color = vec3(r, g, b);
      
      float brightness = dot(color, vec3(0.299, 0.587, 0.114));
      float toxicMix = smoothstep(0.3, 0.8, brightness) * 0.15;
      color = mix(color, color * uToxicTint, toxicMix);
      
      float breathing = sin(uTime * 1.2) * 0.05 + 1.0;
      color *= breathing;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `},R={uniforms:{tDiffuse:{value:null},uLightPosition:{value:new d(.5,.5)},uIntensity:{value:.3},uSamples:{value:64},uDecay:{value:.96},uWeight:{value:.4},uToxicColor:{value:new f(.6,0,.8)},uTime:{value:0}},vertexShader:`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform vec2 uLightPosition;
    uniform float uIntensity;
    uniform int uSamples;
    uniform float uDecay;
    uniform float uWeight;
    uniform vec3 uToxicColor;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      vec2 deltaTextCoord = (vUv - uLightPosition);
      deltaTextCoord *= 1.0 / float(uSamples) * 0.5;
      
      float illuminationDecay = 1.0;
      vec2 textCord = vUv;
      
      vec3 godrayColor = vec3(0.0);
      for (int i = 0; i < 64; i++) {
        if (i >= uSamples) break;
        
        textCord -= deltaTextCoord;
        vec4 texSample = texture2D(tDiffuse, textCord);
        
        float brightness = dot(texSample.rgb, vec3(0.299, 0.587, 0.114));
        brightness = smoothstep(0.4, 1.0, brightness);
        
        texSample.rgb *= illuminationDecay * uWeight * brightness;
        godrayColor += texSample.rgb;
        illuminationDecay *= uDecay;
      }
      
      float pulse = sin(uTime * 0.8) * 0.2 + 0.8;
      godrayColor *= uIntensity * pulse;
      
      godrayColor = mix(godrayColor, godrayColor * uToxicColor, 0.6);
      
      gl_FragColor = vec4(color.rgb + godrayColor, color.a);
    }
  `};class w{composer;bloomPass;chromaticAberrationPass;godrayPass;renderPass;planetRadius;rng;startTime;timeSpeed;proceduralParams;toxicTint;constructor(r,s,t,i,e={}){this.planetRadius=i;const m=e.seed||Math.floor(Math.random()*1e6);this.rng=new b(m),this.startTime=this.rng.uniform(0,1e3),this.proceduralParams={bloomStrength:this.rng.uniform(o.bloomStrength.min,o.bloomStrength.max),bloomRadius:this.rng.uniform(o.bloomRadius.min,o.bloomRadius.max),bloomThreshold:this.rng.uniform(o.bloomThreshold.min,o.bloomThreshold.max),godrayIntensity:this.rng.uniform(o.godrayIntensity.min,o.godrayIntensity.max),chromaticAberrationIntensity:this.rng.uniform(o.chromaticAberrationIntensity.min,o.chromaticAberrationIntensity.max),timeSpeed:this.rng.uniform(o.timeSpeed.min,o.timeSpeed.max),breathingAmplitude:this.rng.uniform(o.breathingAmplitude.min,o.breathingAmplitude.max),pulseAmplitude:this.rng.uniform(o.pulseAmplitude.min,o.pulseAmplitude.max)};const n=this.rng.uniform(.65,.95),c=this.rng.uniform(.7,1),u=this.rng.uniform(.25,.7);this.toxicTint=new f().setHSL(n,c,u),this.composer=new T(t),this.renderPass=new S(r,s),this.composer.addPass(this.renderPass);const a=e.bloomStrength||this.proceduralParams.bloomStrength,l=e.bloomRadius||this.proceduralParams.bloomRadius,h=e.bloomThreshold||this.proceduralParams.bloomThreshold;this.bloomPass=new A(new d(window.innerWidth,window.innerHeight),a,l,h),this.composer.addPass(this.bloomPass),this.godrayPass=new v(R),this.godrayPass.uniforms.uIntensity.value=e.godrayIntensity||this.proceduralParams.godrayIntensity,this.godrayPass.uniforms.uToxicColor.value=this.toxicTint,this.composer.addPass(this.godrayPass),this.chromaticAberrationPass=new v(D),this.chromaticAberrationPass.uniforms.uIntensity.value=e.chromaticAberrationIntensity||this.proceduralParams.chromaticAberrationIntensity,this.chromaticAberrationPass.uniforms.uToxicTint.value=this.toxicTint,this.composer.addPass(this.chromaticAberrationPass),this.chromaticAberrationPass.renderToScreen=!0}update(r=.016){const t=I(C,this.proceduralParams.timeSpeed,this.startTime);this.chromaticAberrationPass.uniforms.uTime.value=t,this.godrayPass.uniforms.uTime.value=t;const i=Math.sin(t*.3)*this.proceduralParams.breathingAmplitude+1,e=Math.sin(t*.7)*this.proceduralParams.pulseAmplitude+1;this.bloomPass.strength=this.proceduralParams.bloomStrength*i,this.chromaticAberrationPass.uniforms.uIntensity.value=this.proceduralParams.chromaticAberrationIntensity*e}updateLightPosition(r,s){const t=r.clone().project(s),i=new d((t.x+1)/2,(t.y+1)/2);this.godrayPass.uniforms.uLightPosition.value=i}render(){this.composer.render()}setSize(r,s){this.composer.setSize(r,s)}dispose(){this.composer.dispose(),this.bloomPass.dispose(),this.chromaticAberrationPass.dispose(),this.godrayPass.dispose()}}function E(g,r,s,t,i,e){if(!i||i.planet_type!=="toxic")return null;const m=e||Math.floor(Math.random()*1e6),n=new b(m+2e4),c=i.toxic_intensity,u=i.atmosphere_thickness,a=.7+c*.6,l=.8+u*.4,h=n.uniform(o.bloomStrength.min*a,o.bloomStrength.max*a),p=n.uniform(o.bloomRadius.min,o.bloomRadius.max),x=n.uniform(o.bloomThreshold.min,o.bloomThreshold.max),y=n.uniform(o.chromaticAberrationIntensity.min*a,o.chromaticAberrationIntensity.max*a),P=n.uniform(o.godrayIntensity.min*l,o.godrayIntensity.max*l);return new w(g,r,s,t,{bloomStrength:h,bloomRadius:p,bloomThreshold:x,chromaticAberrationIntensity:y,godrayIntensity:P,seed:m+2e4})}export{E as c};
