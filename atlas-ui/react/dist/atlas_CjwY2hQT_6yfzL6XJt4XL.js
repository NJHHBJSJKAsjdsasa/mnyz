import{j as t,r as d}from"./atlas_DFcVS1aVtc-vpg3vNaKS_.js";import{N as Ge,c as He,B as qe}from"./atlas_B2_uUXf8mWzxoKZpqYNT-.js";import{W as $e}from"./atlas_TXxTYcL1GaNOX9UQ5hOxz.js";import{E as Je,R as Xe,U as Ye,S as ve}from"./atlas_E1EEB4pA2jNrLNZh5aRZy.js";import{P as Ke,a as Qe}from"./atlas_ChEiVTBcjYbriTsohrFYK.js";import{cS as Ze,C as oe,P as ze,o as et,i as ye,av as ne,cB as re,bE as pe,co as ge,V as S,m as Se,c6 as Pe,cp as Ce,cF as tt,cx as ot,ct as je,r as De}from"./atlas_BkM-4aqZ6cV-vWVlt631_.js";const nt=({size:A=24,color:E="currentColor",className:j=""})=>t.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",width:A,height:A,viewBox:"0 0 48 48",className:j,style:{color:E},children:[t.jsx("rect",{width:"48",height:"48",fill:"none"}),t.jsx("path",{fill:"none",stroke:"currentColor",strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:"4",d:"m30 27l-6 17m-6-17l6 17m-6-17h12m11 7l-11-7m11-13L30 27m11-13l-17 3m6 10l-6-10m0-13v13M7 14l17 3m-6 10l6-10m-6 10L7 14m11 13L7 34m34.32-20L24 4L6.68 14v20L24 44l17.32-10z"})]}),rt=({isActive:A,onTransitionComplete:E})=>{const j=d.useRef(null),$=d.useRef(null),M=d.useRef(null),ae=d.useRef(null),_=d.useRef(null),J=d.useRef(null),[F,se]=d.useState(!1),[ie,O]=d.useState(!0),[Z,le]=d.useState(!1),[ce,f]=d.useState(!1),v=d.useRef(null),B=3,i=.8,D=1.4,de=.8,Ne=()=>{const e=document.createElement("canvas");e.width=64,e.height=64;const r=e.getContext("2d");r.clearRect(0,0,64,64);const l=r.createRadialGradient(32,32,0,32,32,32);l.addColorStop(0,"rgba(255,255,255,1.0)"),l.addColorStop(.3,"rgba(255,255,255,0.8)"),l.addColorStop(.7,"rgba(255,255,255,0.2)"),l.addColorStop(1,"rgba(255,255,255,0.0)"),r.fillStyle=l,r.beginPath(),r.arc(32,32,32,0,Math.PI*2),r.fill();const s=new je(e);return s.premultiplyAlpha=!1,s.format=De,s},Ie=()=>{const e=document.createElement("canvas");e.width=128,e.height=128;const r=e.getContext("2d");r.clearRect(0,0,128,128);for(let s=0;s<50;s++){const T=s/50*Math.PI*4,P=s/50*60,N=64+Math.cos(T)*P,p=64+Math.sin(T)*P,g=r.createRadialGradient(N,p,0,N,p,8);g.addColorStop(0,`rgba(100, 200, 255, ${.8-s/50*.8})`),g.addColorStop(1,"rgba(100, 200, 255, 0)"),r.fillStyle=g,r.beginPath(),r.arc(N,p,8,0,Math.PI*2),r.fill()}const l=new je(e);return l.premultiplyAlpha=!1,l.format=De,l},Ae=(e,r)=>{const l=new Ce,s=r.clone().sub(e);s.length();const T=new ot([e,e.clone().add(s.clone().multiplyScalar(.2)).add(new S((Math.random()-.5)*10,(Math.random()-.5)*10,(Math.random()-.5)*10)),e.clone().add(s.clone().multiplyScalar(.5)).add(new S((Math.random()-.5)*15,(Math.random()-.5)*15,(Math.random()-.5)*15)),e.clone().add(s.clone().multiplyScalar(.8)).add(new S((Math.random()-.5)*10,(Math.random()-.5)*10,(Math.random()-.5)*10)),r]),P=100,N=new Float32Array(P*3),p=new Float32Array(P*3);for(let m=0;m<P;m++){const G=m/P,U=T.getPointAt(G);N[m*3]=U.x,N[m*3+1]=U.y,N[m*3+2]=U.z,p[m*3]=.3+Math.random()*.7,p[m*3+1]=.6+Math.random()*.4,p[m*3+2]=1}const g=new ye;g.setAttribute("position",new ne(N,3)),g.setAttribute("color",new ne(p,3));const k=new re({size:1,vertexColors:!0,blending:pe,transparent:!0,map:Ie()}),I=new ge(g,k);return l.add(I),l.userData={curve:T,particleGeometry:g,particleCount:P},l},Ee={uniforms:{tDiffuse:{value:null},distortion:{value:0},time:{value:0}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,fragmentShader:`
      uniform sampler2D tDiffuse;
      uniform float distortion;
      uniform float time;
      varying vec2 vUv;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 direction = vUv - center;
        float distance = length(direction);

        float aberration = distortion * distance;

        vec2 redOffset = direction * aberration * 1.5;
        vec2 greenOffset = direction * aberration;
        vec2 blueOffset = direction * aberration * 0.5;

        float red = texture2D(tDiffuse, vUv + redOffset).r;
        float green = texture2D(tDiffuse, vUv + greenOffset).g;
        float blue = texture2D(tDiffuse, vUv + blueOffset).b;

        gl_FragColor = vec4(red, green, blue, 1.0);
      }
    `},Te={uniforms:{tDiffuse:{value:null},distortionAmount:{value:0},time:{value:0}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,fragmentShader:`
      uniform sampler2D tDiffuse;
      uniform float distortionAmount;
      uniform float time;
      varying vec2 vUv;

      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 uv = vUv;

        vec2 direction = uv - center;
        float distance = length(direction);

        float waveDistortion = sin(distance * 20.0 + time * 10.0) * distortionAmount * 0.02;
        float radialDistortion = distance * distortionAmount * 0.1;

        uv += direction * (waveDistortion + radialDistortion);

        gl_FragColor = texture2D(tDiffuse, uv);
      }
    `},ke={uniforms:{tDiffuse:{value:null},time:{value:0},waveStrength:{value:0},waveSources:{value:[]},sourceCount:{value:0},cameraVelocity:{value:0}},vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,fragmentShader:`
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float waveStrength;
      uniform float cameraVelocity;
      uniform vec4 waveSources[10];
      uniform int sourceCount;
      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        vec2 center = vec2(0.5, 0.5);

        float lorentzFactor = 1.0 / sqrt(1.0 - cameraVelocity * cameraVelocity * 0.01);
        vec2 contractionDirection = normalize(uv - center);
        float contractionAmount = (cameraVelocity * 0.05) / lorentzFactor;

        vec2 toCenter = center - uv;
        float distFromCenter = length(toCenter);
        uv += normalize(toCenter) * contractionAmount * distFromCenter * 0.5;

        float totalWaveEffect = 0.0;

        for (int i = 0; i < 10; i++) {
          if (i >= sourceCount) break;

          vec3 sourcePos = waveSources[i].xyz;
          float sourceStrength = waveSources[i].w;

          vec2 sourceScreenPos = sourcePos.xy * 0.5 + 0.5;

          float distToSource = length(uv - sourceScreenPos);

          float wavePhase = distToSource * 50.0 - time * 20.0;
          float wave = sin(wavePhase) * exp(-distToSource * 2.0) * sourceStrength;

          vec2 dirToSource = normalize(uv - sourceScreenPos);
          float quadrupole = cos(2.0 * atan(dirToSource.y, dirToSource.x));

          totalWaveEffect += wave * quadrupole;
        }

        vec2 waveDistortion = (uv - center) * totalWaveEffect * waveStrength * 0.02;
        uv += waveDistortion;

        vec3 color = texture2D(tDiffuse, uv).rgb;
        if (cameraVelocity > 0.3) {
          float dopplerShift = cameraVelocity * 0.1;
          color.r *= (1.0 - dopplerShift);
          color.b *= (1.0 + dopplerShift);
        }

        gl_FragColor = vec4(color, 1.0);
      }
    `},xe=(e,r,l=new oe(16777215),s=.8)=>{const T=new Ce,P=new Pe({color:l,transparent:!0,opacity:s,blending:pe});return[[[-e/2,-e/2,e/2],[e/2,-e/2,e/2]],[[e/2,-e/2,e/2],[e/2,e/2,e/2]],[[e/2,e/2,e/2],[-e/2,e/2,e/2]],[[-e/2,e/2,e/2],[-e/2,-e/2,e/2]],[[-e/2,-e/2,-e/2],[e/2,-e/2,-e/2]],[[e/2,-e/2,-e/2],[e/2,e/2,-e/2]],[[e/2,e/2,-e/2],[-e/2,e/2,-e/2]],[[-e/2,e/2,-e/2],[-e/2,-e/2,-e/2]],[[-e/2,-e/2,-e/2],[-e/2,-e/2,e/2]],[[e/2,-e/2,-e/2],[e/2,-e/2,e/2]],[[e/2,e/2,-e/2],[e/2,e/2,e/2]],[[-e/2,e/2,-e/2],[-e/2,e/2,e/2]]].forEach(([p,g])=>{const k=new S(p[0],p[1],p[2]),I=new S(g[0],g[1],g[2]),G=I.clone().sub(k).length(),U=new tt(r,r,G,8),H=new Se(U,P);H.position.copy(k.clone().add(I).multiplyScalar(.5)),H.lookAt(I),H.rotateX(Math.PI/2),T.add(H)}),T},Re=()=>{if(j.current)try{const e=new Ze;e.background=new oe(17),$.current=e;const r=new ze(75,window.innerWidth/window.innerHeight,.01,2e3);r.position.set(0,0,3),ae.current=r;const l=new $e({antialias:!0,alpha:!1});l.setSize(window.innerWidth,window.innerHeight),j.current.appendChild(l.domElement),M.current=l;const s=new Je(l),T=new Xe(e,r);s.addPass(T);const P=new Ye(new et(window.innerWidth,window.innerHeight),.15,.3,.2);s.addPass(P);const N=new ve(Te);s.addPass(N);const p=new ve(Ee);s.addPass(p);const g=new ve(ke);s.addPass(g),_.current=s;const k=xe(10,.12,new oe(9055202),.9);e.add(k);const I=[],m=50,G=[],U=[];for(let o=0;o<m;o++){const c=Math.random()*5+2,x=.06+Math.random()*.08,V=Math.random()*.3+.5,X=new oe().setHSL(V,.8,.6),w=xe(c,x,X,0),y=150;w.position.set((Math.random()-.5)*y,(Math.random()-.5)*y,(Math.random()-.5)*y),w.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);const L=Math.random()<.2,te=L?2+Math.random()*3:1;w.userData={originalOpacity:.6,rotationSpeed:{x:.005+Math.random()*.01,y:.003+Math.random()*.007,z:.007+Math.random()*.005},mass:te,isMassive:L},L&&(w.children.forEach(Y=>{Y.material.color.setHSL(.1,1,.7)}),U.push({position:w.position.clone(),strength:te*.5})),I.push(w),e.add(w)}const H=Math.min(15,m/3);for(let o=0;o<H;o++){const c=I[Math.floor(Math.random()*m)],x=I[Math.floor(Math.random()*m)];if(c!==x&&c.position.distanceTo(x.position)>30){const V=Ae(c.position,x.position);G.push(V),e.add(V)}}const _e=Math.floor(Math.random()*m),q=I[_e];q.children.forEach(o=>{const c=o.material;c.color.setHex(65535),c.opacity=1});const ue=2e3,z=new Float32Array(ue*3),ee=new Float32Array(ue*3);for(let o=0;o<ue;o++){const c=o*3;z[c]=(Math.random()-.5)*400,z[c+1]=(Math.random()-.5)*400,z[c+2]=(Math.random()-.5)*400;const x=Math.random()*.8+.2;ee[c]=x,ee[c+1]=x*.8,ee[c+2]=x}const me=new ye;me.setAttribute("position",new ne(z,3)),me.setAttribute("color",new ne(ee,3));const we=new re({size:.8,vertexColors:!0,blending:pe,transparent:!0,alphaTest:.01,depthWrite:!1,map:Ne()}),he=new ge(me,we);we.opacity=0,e.add(he);let Fe=Date.now(),be=new S(0,0,3);const Me=()=>{const o=(Date.now()-Fe)/1e3;if(o>=B){E&&E();return}const c=_.current,x=c?.passes[1],V=c?.passes[2],X=c?.passes[3],w=c?.passes[4];let y,L;if(o<i){const n=o/i,a=Math.sin(n*Math.PI*.5)*Math.sin(n*Math.PI*.5),h=3;y=h+a*(25-h),L=new S(0,0,y),r.lookAt(0,0,0)}else if(o<i+D){const a=(o-i)/D,h=a*Math.PI*2,b=25+Math.sin(a*Math.PI)*20,C=Math.sin(a*Math.PI*3)*15;y=b,L=new S(Math.cos(h)*b,C,Math.sin(h)*b);let u;if(a<.6)u=new S(0,0,0);else{const Q=(a-.6)/.4,W=new S(0,0,0),fe=q.position.clone();u=W.lerp(fe,Q)}r.lookAt(u)}else{const a=(o-i-D)/de,h=Math.pow(a,2),b=1*Math.PI*2,C=25+Math.sin(Math.PI)*20,u=Math.sin(Math.PI*3)*15,Q=new S(Math.cos(b)*C,u,Math.sin(b)*C),W=q.position.clone().add(new S(0,0,.1));L=Q.lerp(W,h),y=L.length();const fe=Math.min(1,a+.6),We=new S(0,0,0),Oe=q.position.clone(),Be=We.lerp(Oe,fe);r.lookAt(Be)}r.position.copy(L);const te=r.position.distanceTo(be)*60;be.copy(r.position);const Y=Math.min(1,Math.max(0,(y-4)/16));I.forEach(n=>{const a=n.position.distanceTo(q.position);let h=Y*n.userData.originalOpacity;if(o>i+D){const b=(o-i-D)/de;if(n!==q&&n!==k){const C=Math.min(1,a/100);h*=Math.max(0,1-b*(1+C))}}n.children.forEach(b=>{const C=b.material;C.opacity=h}),n.rotation.x+=n.userData.rotationSpeed.x,n.rotation.y+=n.userData.rotationSpeed.y,n.rotation.z+=n.userData.rotationSpeed.z}),G.forEach(n=>{const{curve:a,particleGeometry:h,particleCount:b}=n.userData,C=h.attributes.position.array;for(let u=0;u<b;u++){let Q=(u/b+o*.1)%1;const W=a.getPointAt(Q);C[u*3]=W.x,C[u*3+1]=W.y,C[u*3+2]=W.z}h.attributes.position.needsUpdate=!0,n.children.forEach(u=>{u instanceof Se&&u.material instanceof Pe&&(u.material.opacity=Y*.3),u instanceof ge&&u.material instanceof re&&(u.material.opacity=Y*.7)})});let K;if(y<3.5?K=.2:y<6?K=.2+(y-3.5)/2.5*.6:K=.8,k.children.forEach(n=>{const a=n.material;a.opacity=K}),he.material instanceof re){const n=Math.min(1,Math.max(0,(y-3)/12));he.material.opacity=n*.3}if(o<i+D*.5){const n=o/(i+D*.5);k.rotation.y=n*Math.PI*.5,k.rotation.x=n*Math.PI*.3}let R=0;if(o<i)R=o/i*.2;else if(o<i+D){const a=(o-i)/D;if(a<.3||a>.7)R=.2;else{const h=(a-.3)/.4;R=.2+.3*Math.sin(h*Math.PI)}}else{const a=(o-i-D)/de;R=.2*(1-a*a*a)}if(w){const n=[];U.slice(0,10).forEach(a=>{n.push(a.position.x/100,a.position.y/100,a.position.z/100,a.strength)}),w.uniforms.time.value=o,w.uniforms.waveStrength.value=R*1,w.uniforms.cameraVelocity.value=Math.min(.5,te/15),w.uniforms.waveSources.value=n,w.uniforms.sourceCount.value=Math.min(10,U.length)}if(x&&V&&X&&(o<i?x.strength=.08+R*.05:o<i+D?x.strength=.1+R*.15:x.strength=.08+R*.02,V.uniforms.distortionAmount.value=R*.06,V.uniforms.time.value=o,X.uniforms.distortion.value=R*.03,X.uniforms.time.value=o),v.current&&o>B-.3){const n=(o-(B-.3))/.3;v.current.style.opacity=n.toString()}_.current?_.current.render():M.current&&M.current.render(e,r),J.current=requestAnimationFrame(Me)};Me()}catch(e){console.error("Error initializing multiverse transition scene:",e)}},Ue=()=>{O(!1),le(!0)},Le=()=>{O(!1),f(!0)},Ve=()=>{f(!1),E&&E()};return d.useEffect(()=>{A&&!F&&Z&&(se(!0),setTimeout(()=>{Re()},100))},[A,F,Z]),d.useEffect(()=>()=>{J.current&&cancelAnimationFrame(J.current),M.current&&j.current&&M.current.domElement.parentNode&&(j.current.removeChild(M.current.domElement),M.current.dispose())},[]),ie?t.jsx(Ke,{onProceed:Ue,onSkip:Le,children:null}):ce?t.jsx(Qe,{onComplete:Ve,duration:3e3}):F?t.jsxs(t.Fragment,{children:[t.jsx("div",{ref:j,className:"fixed inset-0 z-50 bg-black",style:{width:"100vw",height:"100vh"}}),t.jsx("div",{ref:v,className:"fixed inset-0 z-[51] bg-black pointer-events-none",style:{width:"100vw",height:"100vh",opacity:0,transition:"none"}})]}):null},at=()=>{const[A,E]=d.useState(!1),[j,$]=d.useState(!1),[M,ae]=d.useState(null),[_,J]=d.useState(!1),F=d.useRef(null);d.useEffect(()=>{const f=()=>{const B=document.getElementById("data-universe-config");if(B)try{const i=JSON.parse(B.textContent);ae(i)}catch(i){console.error("Error parsing universe config:",i)}};f();const v=setInterval(f,1e3);return()=>clearInterval(v)},[]);const se=()=>{$(!0),setTimeout(()=>{E(!1),J(!0)},300)},ie=()=>{window.location.href="/multiverse/exit"},O=()=>{$(!0),setTimeout(()=>{E(!1),$(!1)},300)},Z=()=>{A?O():E(!0)};d.useEffect(()=>{const f=v=>{A&&!j&&F.current&&!F.current.contains(v.target)&&O()};return document.addEventListener("mousedown",f),()=>{document.removeEventListener("mousedown",f)}},[A,j]);const le=f=>f||"Unknown",ce=f=>{if(!f)return"Unknown";const v=new Date(f*1e3);return`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")} ${String(v.getHours()).padStart(2,"0")}:${String(v.getMinutes()).padStart(2,"0")}:${String(v.getSeconds()).padStart(2,"0")}`};return M?.remote?t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"fixed bottom-20 sm:bottom-24 right-4 sm:right-6 z-50",children:t.jsxs("button",{onClick:Z,className:"w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-emerald-900 via-slate-900 to-black hover:from-emerald-800 hover:via-slate-800 hover:to-gray-900 text-white rounded-full shadow-2xl border-2 border-emerald-400/40 transition-all duration-300 transform hover:scale-105 backdrop-blur-sm",title:"Remote Universe Info",children:[t.jsx("div",{className:"flex items-center justify-center",children:t.jsxs("svg",{xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",className:"text-emerald-200",children:[t.jsx("rect",{width:"24",height:"24",fill:"none"}),t.jsxs("g",{fill:"none",fillRule:"evenodd",children:[t.jsx("path",{d:"m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"}),t.jsx("path",{fill:"currentColor",d:"M11 2.423a2 2 0 0 1 1.842-.082l.158.082l3.33 1.922a2 2 0 0 1 .993 1.569l.007.163v3.846l3.33 1.922a2 2 0 0 1 .994 1.569l.006.163v3.846a2 2 0 0 1-.861 1.644l-.139.088l-3.33 1.922a2 2 0 0 1-1.842.082l-.158-.082L12 19.155l-3.33 1.922a2 2 0 0 1-1.843.082l-.157-.082l-3.33-1.922a2 2 0 0 1-.993-1.568l-.007-.164v-3.846a2 2 0 0 1 .861-1.644l.139-.088l3.33-1.922V6.077a2 2 0 0 1 .861-1.644l.139-.088zm0 12.31l-2.33 1.344v2.69L11 17.424zm2 0v2.69l2.33 1.345v-2.69zm6.66 0l-2.33 1.344v2.691l2.33-1.345zm-15.32-.001v2.69l2.33 1.346v-2.69zm11.99-3.077L14 13l2.33 1.345L18.66 13zm-8.66 0L5.34 13l2.33 1.345L10 13zm7.66-4.423L13 8.577v2.691l2.33-1.345zm-6.66 0v2.69L11 11.269v-2.69zM12 4.155L9.67 5.5L12 6.845L14.33 5.5z"})]})]})}),t.jsx("div",{className:"absolute inset-0 rounded-full bg-emerald-400/20 animate-ping"})]})}),A&&t.jsxs("div",{ref:F,className:"fixed bottom-36 sm:bottom-40 right-2 sm:right-6 w-[calc(100vw-1rem)] sm:w-96 max-w-md max-h-[70vh] sm:max-h-96 bg-black/90 backdrop-blur-xl rounded-2xl border border-purple-400/30 shadow-2xl z-40 overflow-hidden transition-all duration-300 ease-out",style:{animation:j?"slideDownFadeOut 0.3s ease-out forwards":"slideUpFadeIn 0.3s ease-out forwards"},children:[t.jsx("div",{className:"bg-gradient-to-r from-purple-600/20 via-blue-600/20 to-purple-600/20 p-4 border-b border-white/10",children:t.jsxs("div",{className:"flex items-center justify-between",children:[t.jsxs("div",{className:"flex items-center space-x-2",children:[t.jsx("div",{className:"w-3 h-3 bg-purple-400 rounded-full animate-pulse"}),t.jsx("h3",{className:"text-white font-bold text-lg",children:"🌌 远程宇宙"})]}),t.jsx("button",{onClick:O,className:"text-gray-400 hover:text-white transition-colors duration-200",children:t.jsx("svg",{className:"w-5 h-5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:t.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M6 18L18 6M6 6l12 12"})})})]})}),t.jsxs("div",{className:"p-4 space-y-3 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",children:[t.jsx("div",{className:"text-purple-200 text-sm",children:M.seed_name||"Unknown Universe"}),t.jsxs("div",{className:"bg-white/5 rounded-lg p-3 border border-purple-500/20",children:[t.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[t.jsx(Ge,{size:14,color:"#c084fc"}),t.jsx("span",{className:"text-gray-400 text-xs",children:"阿特拉斯节点ID"})]}),t.jsx("div",{className:"text-purple-400 font-mono text-[10px] pl-5 truncate",children:le(M.node_id)})]}),t.jsxs("div",{className:"bg-white/5 rounded-lg p-3 border border-blue-500/20",children:[t.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[t.jsx(He,{size:14,color:"#60a5fa"}),t.jsx("span",{className:"text-gray-400 text-xs",children:"远程种子"})]}),t.jsx("div",{className:"text-blue-400 font-mono text-[10px] pl-5 truncate",children:M.seed_str||"Not available"})]}),t.jsxs("div",{className:"bg-white/5 rounded-lg p-3 border border-cyan-500/20",children:[t.jsxs("div",{className:"flex items-center gap-2 mb-1",children:[t.jsx(qe,{size:14,color:"#06b6d4"}),t.jsx("span",{className:"text-gray-400 text-xs",children:"远程比特大爆炸（宇宙起源时间）"})]}),t.jsx("div",{className:"text-cyan-400 font-mono text-[10px] pl-5 truncate",children:ce(M.cosmic_origin_time)||"Not available"})]}),t.jsx("button",{onClick:se,className:"w-full bg-gray-700/30 hover:bg-gray-600/40 text-gray-300 hover:text-white text-sm py-2 px-3 rounded-lg transition-all duration-200 border border-gray-600/30 hover:border-gray-500/50",children:t.jsxs("div",{className:"flex items-center justify-center space-x-2",children:[t.jsx(nt,{size:16,color:"currentColor"}),t.jsx("span",{children:"返回你的宇宙"})]})}),t.jsx("a",{href:"/multiverse",className:"block w-full bg-purple-700/20 hover:bg-purple-600/30 text-purple-300 hover:text-purple-200 text-xs py-1.5 px-2 rounded-md transition-all duration-200 border border-purple-500/20 hover:border-purple-400/30 text-center mt-2",children:t.jsxs("div",{className:"flex items-center justify-center space-x-1",children:[t.jsx("span",{children:"🌌"}),t.jsx("span",{children:"探索更多宇宙"})]})})]})]}),_&&t.jsx("div",{className:"fixed inset-0 z-[9999] animate-fadeIn",children:t.jsx(rt,{isActive:_,onTransitionComplete:ie})})]}):null},mt=Object.freeze(Object.defineProperty({__proto__:null,default:at},Symbol.toStringTag,{value:"Module"}));export{at as M,nt as U,rt as a,mt as b};
