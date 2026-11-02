import{C as z,M as Le,g as P,au as Y,bE as ee,ar as ot,m as E,aJ as st,cv as de,cF as it,d5 as X,d6 as Pt,d7 as kt,cm as zt,cl as Q,f as Pe,i as he,cC as Se,cT as At,cy as se,d8 as We,S as rt,ad as qe,o as me,d9 as Ge,D as be,av as ae,cU as Te,da as nt,db as Lt,cM as lt,dc as Tt,cn as ct,bN as ut,cI as dt,bL as ve,cS as Ve,dd as It,bA as Nt,de as He,j as Ot,df as Et,V as De,B as ht,P as je,cD as Xe,cR as qt,dg as Dt,c6 as pe,F as Wt,ck as mt,bT as Gt,cA as Vt}from"./atlas_D7YbGohBrWFmjRvYLSTuK.js";import{r as fe,j as Ht}from"./atlas_DFcVS1aVtc-vpg3vNaKS_.js";import{S as jt,W as Bt}from"./atlas_D39LckKae10t1yFg-YJWB.js";import{O as $t}from"./atlas_B2GUpc_0aSeVQCq7Ph8VS.js";import{m as ft}from"./atlas_B4uzugRtI1Wt46vjBr8jY.js";import{c as Ne}from"./atlas_Bs4XyrTIoqL3_aNd9foZY.js";const le=`
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Fractal sums. uOctaves (float) is the detail the view can resolve: whole octaves plus
// a fade on the last one, so detail grows smoothly while zooming in
uniform float uOctaves;

float fbm(vec3 p) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 9; i++) {
    float w = clamp(uOctaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    sum += snoise(p) * amp * w;
    norm += amp * w;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

float fbmN(vec3 p, float octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 9; i++) {
    float w = clamp(octaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    sum += snoise(p) * amp * w;
    norm += amp * w;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

// Sharp crests: mountain ranges, ice ridges
float ridged(vec3 p, float octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0, prev = 1.0;
  for (int i = 0; i < 8; i++) {
    float w = clamp(octaves - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    float n = 1.0 - abs(snoise(p));
    n *= n;
    sum += n * amp * prev * w;
    norm += amp * w;
    prev = n;
    p = p * 2.1 + vec3(3.3, 1.1, 7.7);
    amp *= 0.5;
  }
  return sum / max(norm, 1e-4);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// Cellular noise: x = distance to the nearest feature point, y = to the second one,
// z = a random id of the nearest cell
vec3 cellular(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(cell + o);
        vec3 r = o + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; }
        else if (d < d2) { d2 = d; }
      }
  return vec3(sqrt(d1), sqrt(d2), id);
}
`,Be=`
uniform vec3 uLightDir;   // towards the star, world space
uniform vec3 uSunColor;
uniform float uSunIntensity;

// Diffuse light with the terminator taken from the round planet (geometric normal), so
// bumps never light up the night side
float daylight(vec3 n, vec3 ng) {
  float geo = dot(ng, uLightDir);
  return max(dot(n, uLightDir), 0.0) * smoothstep(-0.06, 0.18, geo);
}

// Sun specular (GGX) with Schlick fresnel
vec3 specularGGX(vec3 n, vec3 v, float roughness, vec3 f0) {
  vec3 h = normalize(uLightDir + v);
  float nh = max(dot(n, h), 0.0);
  float nl = max(dot(n, uLightDir), 0.0);
  float nv = max(dot(n, v), 1e-3);
  float a = roughness * roughness;
  float a2 = a * a;
  float d = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  float g = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  vec3 f = f0 + (1.0 - f0) * pow(1.0 - max(dot(h, v), 0.0), 5.0);
  return d * g * f / max(4.0 * nl * nv, 1e-3) * nl;
}
`;function Yt(r,e){const a=new z(e);switch(r){case"Red Giant":return{color:a,cells:7,spots:.25,churn:.25,smooth:0,corona:1.6,temperature:3800};case"Blue Giant":return{color:a,cells:70,spots:0,churn:1.6,smooth:.15,corona:2.6,temperature:25e3};case"White Dwarf":return{color:a,cells:140,spots:0,churn:.4,smooth:.8,corona:1.8,temperature:12e3};case"Neutron Star":return{color:new z(12573951),cells:200,spots:0,churn:.2,smooth:1,corona:4,temperature:6e5};case"Red Dwarf":return{color:a,cells:34,spots:.85,churn:.8,smooth:0,corona:1.7,temperature:3200};default:return{color:a.clone().lerp(new z(16762977),.6),cells:46,spots:.55,churn:1,smooth:0,corona:2,temperature:5800}}}const Ut=`
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vObj = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`,Xt=`
${le}
uniform float uTime;
uniform vec3 uColor;
uniform float uCells;
uniform float uSpots;
uniform float uChurn;
uniform float uSmooth;
uniform vec3 uSeed;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 p = normalize(vObj);
  float mu = max(dot(normalize(vNormal), normalize(vView)), 0.0);
  float t = uTime * 0.02 * uChurn;
  // Granulation: rounded cells, brightest where the hot gas wells up in the middle,
  // ringed by narrow, ragged dark lanes where it sinks; slowly renewing
  vec3 g = p * uCells + uSeed + vec3(t, -t * 0.7, t * 0.4);
  vec3 warp = vec3(snoise(g * 0.45 + t), snoise(g * 0.45 - t + 7.0), snoise(g * 0.45 + 13.0));
  vec3 cells = cellular(g + 0.6 * warp);
  float edge = cells.y - cells.x + 0.12 * snoise(g * 2.3);
  float lanes = smoothstep(0.02, 0.32, edge);
  float dome = 1.0 - smoothstep(0.0, 0.9, cells.x);
  float granule = 0.66 + 0.2 * lanes + 0.16 * dome + 0.06 * (fract(cells.z * 7.3) - 0.5);
  // Supergranulation and a faint mottling over the whole disc
  float super = fbmN(p * uCells * 0.18 + uSeed * 0.3 + vec3(t * 0.3), 4.0);
  float shade = mix(granule * (0.92 + 0.12 * super), 1.0, uSmooth);
  // Sunspots in belts either side of the equator: dark umbra, lighter penumbra
  float belt = smoothstep(0.55, 0.25, abs(abs(p.y) - 0.28));
  float spotField = fbmN(p * 3.2 + uSeed + vec3(0.0, 0.0, uTime * 0.0015), 5.0);
  float penumbra = smoothstep(0.42, 0.52, spotField) * belt * uSpots;
  float umbra = smoothstep(0.55, 0.62, spotField) * belt * uSpots;
  shade *= 1.0 - 0.45 * penumbra - 0.45 * umbra;
  // Faculae: bright patches that show near the limb
  float faculae = smoothstep(0.35, 0.6, fbmN(p * 9.0 + uSeed + 3.0, 4.0)) * (1.0 - mu) * (1.0 - uSmooth) * 0.5;
  // Limb darkening (quadratic law), redder towards the edge
  float limb = 1.0 - 0.55 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
  vec3 color = uColor * mix(vec3(1.0), vec3(1.0, 0.62, 0.38), (1.0 - mu) * 0.7 * (1.0 - uSmooth));
  // (bright, but kept below the tonemapper's shoulder so the surface still reads)
  color *= shade * limb * 1.05 + faculae;
  // The hottest stars burn towards white
  color = mix(color, vec3(1.0), uSmooth * 0.35);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Zt=`
uniform float uR;
uniform float uSize;
uniform mat3 uSpin;
varying vec2 vP;
varying float vSilhouette;
varying vec3 vDir;
varying vec3 vToCamera;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float d = length(mv.xyz);
  vSilhouette = uR * d / sqrt(max(d * d - uR * uR, 1e-12));
  vP = position.xy * uR * uSize;
  mv.xy += vP;
  // The sheet's point as a direction in world space, then in the star's turning frame
  mat3 viewToWorld = transpose(mat3(viewMatrix));
  vDir = uSpin * (viewToWorld * vec3(position.xy, 0.0));
  vToCamera = uSpin * (viewToWorld * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * mv;
}
`,Kt=`
${le}
uniform float uTime;
uniform vec3 uColor;
uniform float uSmooth;
uniform float uOpacity;
uniform vec3 uSeed;
uniform float uSize;
varying vec2 vP;
varying float vSilhouette;
varying vec3 vDir;
varying vec3 vToCamera;
void main() {
  float x = length(vP) / vSilhouette;
  if (x < 0.99) discard;
  // Where on the star this ray of corona rises from: the direction across the sky,
  // tilted a little towards the camera the further out it is (a ray leaning towards us
  // is seen projected further from the limb)
  vec3 across = normalize(vDir);
  vec3 dir = normalize(across + normalize(vToCamera) * 0.35 * (1.0 - 1.0 / x));
  float latitude = abs(dir.y);
  // Streamers fixed on the star: broad helmets near the equator, fine plumes at the poles
  float helmets = 0.5 + 0.5 * snoise(dir * 2.2 + uSeed * 0.1 + vec3(0.0, 0.0, uTime * 0.008));
  float fine = 0.5 + 0.5 * snoise(dir * 9.0 + uSeed * 0.2 + vec3(uTime * 0.015));
  float equator = 1.0 - smoothstep(0.15, 0.7, latitude);
  float reach = mix(1.0 + 0.9 * fine, 1.0 + 3.2 * helmets, equator);
  float strength = mix(0.35 + 0.65 * pow(fine, 2.0), 0.4 + 0.6 * helmets, equator);
  float fall = exp(-(x - 1.0) * (3.6 / reach));
  float chromosphere = exp(-(x - 1.0) * 40.0);
  vec3 tint = mix(uColor, vec3(0.65, 0.8, 1.0), uSmooth);
  // Gone well before the edge of the sheet, so the longest streamers never end in a cut
  float edge = 1.0 - smoothstep(uSize * 0.55, uSize * 0.95, x);
  vec3 color = tint * (fall * 0.6 * strength + chromosphere * 0.9) * uOpacity * edge;
  gl_FragColor = vec4(color, 1.0);
}
`;class ke{surface;corona;coronaMaterial;spin=new Le;static spinAt(e){return e*.01%(Math.PI*2)}constructor(e,a,s){const o=i=>{const l=Math.sin(s*12.9898+i*78.233)*43758.5453;return l-Math.floor(l)},n=new P(o(1)*50,o(2)*50,o(3)*50);this.surface=new Y({uniforms:{uTime:{value:0},uColor:{value:e.color.clone()},uCells:{value:e.cells},uSpots:{value:e.spots},uChurn:{value:e.churn},uSmooth:{value:e.smooth},uSeed:{value:n},uOctaves:{value:5}},vertexShader:Ut,fragmentShader:Xt}),this.coronaMaterial=new Y({uniforms:{uTime:{value:0},uColor:{value:e.color.clone()},uSmooth:{value:e.smooth},uOpacity:{value:0},uSeed:{value:n},uR:{value:a},uSize:{value:e.corona*1.6+3},uSpin:{value:new ot},uOctaves:{value:3}},vertexShader:Zt,fragmentShader:Kt,blending:ee,transparent:!0,depthWrite:!1}),this.corona=new E(new st(2,2),this.coronaMaterial),this.corona.frustumCulled=!1}update(e,a){this.surface.uniforms.uTime.value=e,this.coronaMaterial.uniforms.uTime.value=e,this.coronaMaterial.uniforms.uSpin.value.setFromMatrix4(this.spin.makeRotationY(-ke.spinAt(e))),this.coronaMaterial.uniforms.uOpacity.value=a,this.corona.visible=a>.01}dispose(){this.surface.dispose(),this.coronaMaterial.dispose(),this.corona.geometry.dispose()}}const Jt=r=>{let e=0;for(let a=0;a<r.length;a++)e=(e<<5)-e+r.charCodeAt(a),e=e&e;return Math.abs(e)%1e4/1e4*.15},Qt=r=>{let e=0;for(let a=0;a<r.length;a++)e=(e<<3)-e+r.charCodeAt(a)*7,e=e&e;return Math.abs(e)%1e4/1e4*Math.PI*2},Ze=(r,e,a,s,o,n=new P)=>{const i=e*(1-a*a)/(1+a*Math.cos(r)),l=i*Math.cos(r),d=i*Math.sin(r),c=l*Math.cos(o)-d*Math.sin(o)*Math.cos(s),u=l*Math.sin(o)+d*Math.cos(o)*Math.cos(s),t=d*Math.sin(s);return n.set(c,t,u)};function ea(r){const e=r.replace("#",""),a=parseInt(e.substr(0,2),16)/255,s=parseInt(e.substr(2,2),16)/255,o=parseInt(e.substr(4,2),16)/255;return new z(a,s,o)}function pt(r){const a={"Gas Giant":"#FFA500",Anomaly:"#FFFFFF",Rocky:"#808080",Icy:"#ADD8E6",Oceanic:"#0000FF",Desert:"#FFD700",Lava:"#FF0000",Arid:"#800000",Swamp:"#008000",Tundra:"#F0F8FF",Forest:"#006400",Savannah:"#F4A460",Cave:"#D1D1D1",Crystalline:"#00FFFF",Metallic:"#C0C0C0",Toxic:"#800080",Radioactive:"#00FF00",Magma:"#FF4500","Molten Core":"#FF8C00",Carbon:"#090909",Diamond:"#87CEFA","Super Earth":"#90EE90","Sub Earth":"#006400","Frozen Gas Giant":"#ADD8E6",Nebulous:"#FFC0CB",Aquifer:"#00FFFF",Exotic:"#FF00FF","Super Puff":"#F7C6D9","Super Ringed":"#E3C99A",Mirror:"#D9DEE6","Ruby Cloud":"#9B111E"}[r]||"#FFFFFF";return ea(a)}function ta(r){let e=2166136261;for(let a=0;a<r.length;a++)e^=r.charCodeAt(a),e=Math.imul(e,16777619);return $e(e)}function $e(r){return r^=r>>>16,r=Math.imul(r,2246822507),r^=r>>>13,r=Math.imul(r,3266489909),r^=r>>>16,r>>>0}function gt(r){return r/4294967296}function aa(r){let e=0;for(let a=0;a<4;a++)r=$e(r+1831565813*(a+1)),e+=gt(r);return(e-2)*Math.sqrt(3)}class oa{state;constructor(e){this.state=e>>>0||1}next(){return this.state=$e(this.state+2654435769>>>0),gt(this.state)}range(e,a){return e+(a-e)*this.next()}int(e,a){return Math.floor(this.range(e,a+1))}gauss(){return aa(this.next()*4294967296>>>0)}pick(e){return e[Math.floor(this.next()*e.length)]}}const sa=1496e5,ia=.00465,ra=110,na=80,la={red:16742989,yellow:16773577,blue:11127039,orange:16758891,white:16054271,purple:13215487},ca={"Red Dwarf":.8,"Yellow Dwarf":1.4,"Blue Giant":2.6,"Red Giant":1.8,"White Dwarf":1.2,"Neutron Star":1},vt=new Set(["Gas Giant","Frozen Gas Giant","Nebulous","Super Puff","Super Ringed","Mirror","Ruby Cloud"]),Ke=new Set(["Lava","Magma","Molten Core","Radioactive","Ruby Cloud"]);function ua(){const e=document.createElement("canvas");e.width=e.height=256;const a=e.getContext("2d"),s=a.createRadialGradient(256/2,256/2,0,256/2,256/2,256/2);s.addColorStop(0,"rgba(255,255,255,1)"),s.addColorStop(.08,"rgba(255,255,255,0.85)"),s.addColorStop(.25,"rgba(255,255,255,0.22)"),s.addColorStop(.6,"rgba(255,255,255,0.05)"),s.addColorStop(1,"rgba(255,255,255,0)"),a.fillStyle=s,a.fillRect(0,0,256,256);const o=new We(e);return o.colorSpace=rt,o}function Je(r,e){const o=document.createElement("canvas");o.width=256,o.height=128;const n=o.getContext("2d"),i=new oa(ta(r.name)),l=e?e.clone():pt(r.planet_type).clone();e||l.lerp(new z(9080729),.35);const d=u=>`#${u.getHexString()}`;if(n.fillStyle=d(l),n.fillRect(0,0,256,128),vt.has(r.planet_type))for(let u=0;u<128;u++){const t=Math.sin(u*.18+i.next()*.4)*.5+Math.sin(u*.05)*.5,h=l.clone().offsetHSL(0,0,t*.12);n.fillStyle=d(h),n.fillRect(0,u,256,1)}else{const u=l.clone().offsetHSL(0,-.05,-.18),t=l.clone().offsetHSL(.02,0,.12);for(let h=0;h<220;h++)n.fillStyle=d(i.next()<.55?u:t),n.globalAlpha=i.range(.15,.45),n.beginPath(),n.ellipse(i.range(0,256),i.range(0,128),i.range(4,26),i.range(3,14),i.range(0,Math.PI),0,Math.PI*2),n.fill();n.globalAlpha=1,r.surface_temperature+273.15<260&&(n.fillStyle="rgba(240,248,255,0.85)",n.fillRect(0,0,256,10),n.fillRect(0,118,256,10))}const c=new We(o);return c.colorSpace=rt,c.wrapS=qe,c}const da=`
  varying vec3 vNormal;
  varying vec3 vView;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`,ha=`
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vView;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
    gl_FragColor = vec4(uColor * rim * 1.4, rim);
  }
`;class go{root=new de;system;planets=[];stars=[];timeScale=1;simulatedSeconds=0;serverTime;loadedAt=Date.now()/1e3;disposables=[];timing;constructor(e,a){this.system=e,this.timing=a,this.serverTime=a.current_time,this.buildStars(),this.buildPlanets(),this.root.add(new it(4213350,.06))}get cosmicNow(){return this.serverTime+this.simulatedSeconds}get drift(){return this.simulatedSeconds-(Date.now()/1e3-this.loadedAt)}resetTime(){this.simulatedSeconds=Date.now()/1e3-this.loadedAt}buildStars(){const e=ua();this.disposables.push(e);const a=this.system.stars.length,s=.12+.05*a;this.system.stars.forEach((o,n)=>{const i=la[o.Color?.toLowerCase()]??16777215,l=Math.max(6e-4,o.Size*ia*ra),d=new X(l,96,48),c=Yt(o.Type,i),u=new ke(c,l,this.system.index*7+n+1),t=new E(d,u.surface);t.userData.starIndex=n,u.corona.position.copy(t.position);const h=new Pt(new kt({map:e,color:i,blending:ee,depthWrite:!1,transparent:!0})),g=n/Math.max(1,a)*Math.PI*2,m=a>1?new P(Math.cos(g)*s,0,Math.sin(g)*s):new P;t.position.copy(m),h.position.copy(m),u.corona.position.copy(m);const p=new zt(i,(ca[o.Type]??1.2)/Math.sqrt(a),0,0);p.position.copy(m),this.root.add(t,u.corona,h,p),this.stars.push({mesh:t,glow:h,radius:l,offset:m,light:p,surface:u,info:o,look:c}),this.disposables.push(d,u,h.material)})}buildPlanets(){for(const e of this.system.planets){const a=Math.max(2e-5,e.diameter/2/sa*na),s=Je(e),o=new X(a,48,24),n=new Q({map:s,roughness:vt.has(e.planet_type)?.9:.75,metalness:e.planet_type==="Metallic"?.6:.05,emissive:Ke.has(e.planet_type)?new z(e.planet_type==="Radioactive"?8257354:16734751):new z(0),emissiveIntensity:Ke.has(e.planet_type)?.35:0}),i=new E(o,n);if(i.rotation.z=e.axial_tilt*Math.PI/180,i.userData.planetIndex=e.index,this.root.add(i),this.disposables.push(s,o,n),e.atmosphere&&!/none|vacuum/i.test(e.atmosphere)){const m=new E(new X(a*1.06,48,24),new Y({uniforms:{uColor:{value:pt(e.planet_type).clone().lerp(new z(10471679),.6)}},vertexShader:da,fragmentShader:ha,blending:ee,transparent:!0,depthWrite:!1,side:Pe}));i.add(m),this.disposables.push(m.geometry,m.material)}const l=Jt(e.name),d=Qt(e.name),c=Math.min(.9,e.eccentricity_factor??.1),u=[];for(let m=0;m<360;m++)u.push(Ze(m/360*Math.PI*2,e.orbital_radius,c,l,d));const t=new he().setFromPoints(u),h=new Se({color:7311320,transparent:!0,opacity:.28,depthWrite:!1}),g=new At(t,h);g.userData.opacity=.28,this.root.add(g),this.disposables.push(t,h),this.planets.push({data:e,mesh:i,orbit:g,radius:a,inclination:l,ascendingNode:d,eccentricity:c,angularVelocity:2*Math.PI/e.orbital_period_seconds,position:new P})}}get outerRadius(){return Math.max(1,...this.system.planets.map(e=>e.orbital_radius))}planetPosition(e){const a=this.planets.find(s=>s.data.index===e);return a?a.position:null}planet(e){return this.planets.find(a=>a.data.index===e)}get starOffsets(){return this.stars.map(e=>e.offset.clone())}nearestSurface(e){let a=1/0;for(const s of this.planets)a=Math.min(a,e.distanceTo(s.position)-s.radius);for(const s of this.stars)a=Math.min(a,e.distanceTo(s.offset)-s.radius);return a}setDetailed(e){for(const a of this.planets)a.mesh.visible=!e.includes(a.data.index)}setPlanetColor(e,a){const s=this.planet(e);if(!s)return;const o=s.mesh.material,n=o.map,i=Je(s.data,a);o.map=i,o.needsUpdate=!0,this.disposables.push(i),n&&(n.dispose(),this.disposables=this.disposables.filter(d=>d!==n)),s.mesh.children[0]?.material.uniforms.uColor.value.copy(a).lerp(new z(10471679),.6)}setSelectedPlanet(e){for(const a of this.planets){const s=a.orbit.material,o=a.data.index===e;s.color.set(o?8317183:7311320),a.orbit.userData.opacity=o?.75:.28}}setOrbitsVisible(e){for(const a of this.planets)a.orbit.visible=e}update(e,a){this.simulatedSeconds+=e*this.timeScale,this.root.position.copy(a).negate();for(const o of this.planets){const n=o.data.current_orbital_angle+o.angularVelocity*this.simulatedSeconds;Ze(n,o.data.orbital_radius,o.eccentricity,o.inclination,o.ascendingNode,o.position),o.mesh.position.copy(o.position),o.mesh.rotation.y=this.simulatedSeconds/Math.max(1,Math.abs(o.data.rotation_period_seconds))*Math.PI*2%(Math.PI*2)}const s=performance.now()/1e3;for(const o of this.stars){const n=a.distanceTo(o.offset),i=se.smoothstep(o.radius*40/Math.max(n,1e-9),.6,2.5),l=Math.max(o.radius*16,n*.09);o.glow.scale.setScalar(l),o.glow.material.opacity=this.presence*(1-.85*i),o.surface.update(s,i*this.presence),o.mesh.rotation.y=ke.spinAt(s)}for(const o of this.planets)o.orbit.material.opacity=o.orbit.userData.opacity*this.presence}presence=0;static presenceAt(e){const a=se.clamp(Math.log(4800/Math.max(e,1e-9))/Math.log(32),0,1);return a*a*(3-2*a)}pickPlanet(e,a,s,o,n=18){let i=null,l=1/0;const d=new P;for(const c of this.planets){d.copy(c.position).sub(o);const u=s(d);if(!u)continue;const t=Math.hypot(u.x-e,u.y-a);t<n&&t<l&&(i=c,l=t)}return i}pickBody(e,a,s,o){let n=null,i=1;const l=new P,d=new P,c=(u,t,h,g)=>{l.copy(u).sub(o);const m=s(l);if(!m)return;d.copy(l).add(new P(t,0,0));const p=s(d),y=Math.max(h,p?Math.hypot(p.x-m.x,p.y-m.y):0),x=Math.hypot(m.x-e,m.y-a)/y;x<i&&(i=x,n=g)};for(const u of this.planets)c(u.position,u.radius,18,{kind:"planet",body:u});return this.stars.forEach((u,t)=>c(u.offset,u.radius,22,{kind:"star",index:t})),n}dispose(){this.disposables.forEach(e=>e.dispose()),this.root.clear()}}const ma={red:16742989,yellow:16773577,blue:11127039,orange:16758891,white:16054271,purple:13215487};function vo(r){return ma[String(r??"").toLowerCase()]??16777215}function Qe(r){const e=typeof r.Size=="number"?r.Size:Number.parseFloat(String(r.Size??"1"));return{Type:String(r.Type??"Yellow Dwarf"),Color:String(r.Color??"yellow"),Size:Number.isFinite(e)&&e>0?e:1}}const $=(r,e)=>{const a=typeof r=="number"?r:Number.parseFloat(String(r??""));return Number.isFinite(a)?a:e};function bo(r,e={}){if(!r)return null;const a=r.system_data??r;if(!a||!Array.isArray(a.planets)||a.planets.length===0)return null;const s=e.now??Date.now()/1e3,o=$(a.timing?.cosmic_origin_time,e.cosmicOriginTime??s),n=$(a.timing?.current_time,s),i=a.planets.map((c,u)=>{const t=Math.max(1,$(c.orbital_period_seconds,31557600)),h=$(c.initial_orbital_angle,0),g=$(c.current_orbital_angle,(h+2*Math.PI/t*(n-o))%(2*Math.PI));return{index:u,name:String(c.name??`Planet ${u+1}`),planet_type:String(c.planet_type??"Rocky"),diameter:$(c.diameter,12742),mass:$(c.mass,1),density:$(c.density,5.5),gravity:$(c.gravity,9.8),orbital_radius:Math.max(1e-4,$(c.orbital_radius,1)),orbital_period_seconds:t,orbital_speed:$(c.orbital_speed,0),axial_tilt:$(c.axial_tilt,0),rotation_period_seconds:$(c.rotation_period_seconds,86400),surface_temperature:$(c.surface_temperature,15),mean_temperature:c.mean_temperature,atmosphere_factor:c.atmosphere_factor,atmosphere:String(c.atmosphere??"None"),life_forms:String(c.life_forms??"None"),elements:Array.isArray(c.elements)?c.elements:[],eccentricity_factor:$(c.eccentricity_factor,.1),initial_orbital_angle:h,current_orbital_angle:g,relative_orbital_radius:$(c.relative_orbital_radius,0),stargate_url:String(c.stargate_url??"")}}),l=$(a.timing?.max_orbital_radius,0)||Math.max(...i.map(c=>c.orbital_radius));return{system:{index:e.index??0,name:String(a.name??"Unknown system"),star_system_type:String(a.star_system_type??"Unknown"),num_planets:$(a.num_planets,i.length),stars:Array.isArray(a.stars)&&a.stars.length?a.stars.map(Qe):[Qe({})],planets:i,max_orbital_radius:l,stargate_url:String(a.stargate_url??"")},timing:{cosmic_origin_time:o,current_time:n}}}const ze=6,bt=`
uniform vec2 uRingBands[${ze}];
uniform int uRingBandCount;
uniform float uRingSeed;
// A Super Ringed planet's rings (1): a dense ring inside its Roche limit (uRingRoche, planet
// radii), a dusty disc beyond it
uniform float uRingSuper;
uniform float uRingRoche;

float ringHash(float x) { return fract(sin(x * 127.1 + uRingSeed) * 43758.5453); }
float ringNoise(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(ringHash(i), ringHash(i + 1.0), f); }

float ringDensity(float r) {
  float density = 0.0;
  for (int i = 0; i < ${ze}; i++) {
    if (i >= uRingBandCount) break;
    vec2 band = uRingBands[i];
    float width = band.y - band.x;
    float inside = smoothstep(band.x, band.x + width * 0.04, r) * (1.0 - smoothstep(band.y - width * 0.06, band.y, r));
    // Denser towards the middle of a band
    float t = (r - band.x) / max(width, 1e-4);
    density = max(density, inside * (0.55 + 0.45 * sin(t * 3.14159)));
  }
  // Ringlets at three scales, and a few sharp gaps
  float ringlets = 0.55 + 0.25 * ringNoise(r * 40.0) + 0.15 * ringNoise(r * 160.0) + 0.1 * ringNoise(r * 700.0);
  float gaps = smoothstep(0.02, 0.06, ringNoise(r * 22.0 + 3.0)) * smoothstep(0.0, 0.03, ringNoise(r * 75.0 + 9.0));
  if (uRingSuper > 0.5) {
    // A Super Ringed planet's (J1407 b's): inside its Roche limit a dense ring of ice; beyond
    // it, where ring material can no longer stay a ring, the young circumplanetary disc
    // still forming moons, thinner and dustier
    density *= mix(1.0, 0.75, smoothstep(uRingRoche * 0.9, uRingRoche * 1.3, r));
  }
  return clamp(density * ringlets * mix(1.0, gaps, 0.6), 0.0, 1.0);
}
`,fa=`
varying vec3 vWorldPos;
varying vec3 vLocal;
void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,pa=`
${bt}
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uRingNormal;
uniform float uPlanetRadius;
uniform vec3 uRingColor;
varying vec3 vWorldPos;
varying vec3 vLocal;

void main() {
  float r = length(vLocal.xy) / uPlanetRadius;
  float density = ringDensity(r);
  if (density < 0.01) discard;
  // Planet shadow: is the planet between this point and the star?
  float b = dot(vWorldPos, uLightDir);
  float shadow = 1.0;
  if (b < 0.0) {
    float d = length(vWorldPos - b * uLightDir);
    shadow = smoothstep(uPlanetRadius * 0.97, uPlanetRadius * 1.03, d);
  }
  // Lit face: diffuse; far face: the light that makes it through (thin parts glow)
  vec3 v = normalize(cameraPosition - vWorldPos);
  float sunSide = sign(dot(uRingNormal, uLightDir));
  float viewSide = sign(dot(uRingNormal, v));
  float lit = abs(dot(uRingNormal, uLightDir));
  float brightness = sunSide == viewSide ? 0.25 + 0.75 * lit : (1.0 - density) * 0.9 * lit + 0.05;
  // Forward scattering: rings brighten looking towards the star
  brightness += pow(max(dot(-v, uLightDir), 0.0), 8.0) * 0.6 * (1.0 - density);
  vec3 tone = uRingColor * (0.8 + 0.4 * ringNoise(r * 55.0 + 17.0));
  if (uRingSuper > 0.5) {
    // Clean ice inside the Roche limit, the disc's dust beyond it, redder further out
    float outer = uRingBands[max(uRingBandCount - 1, 0)].y;
    float dust = smoothstep(uRingRoche * 0.9, uRingRoche * 1.3, r);
    vec3 disc = mix(vec3(0.92, 0.72, 0.52), vec3(0.86, 0.52, 0.3), smoothstep(uRingRoche, outer, r));
    tone = mix(vec3(0.8, 0.9, 1.0), disc, dust) * (0.8 + 0.4 * ringNoise(r * 55.0 + 17.0));
  }
  vec3 color = tone * uSunColor * uSunIntensity * brightness * shadow + tone * 0.01;
  gl_FragColor = vec4(color, density * 0.92);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;class ga{mesh;normal=new P;bands;bandCount;seed;structure={uRingRoche:{value:2.5}};material;constructor(e,a,s,o,n=!1){const i=1/(e.planet_radius||200),l=Math.asin((e.tilt_factor||.2)*.5);this.bands=Array.from({length:ze},(t,h)=>{const g=e.bands[h];return g?new me(g.inner*i,g.outer*i):new me(0,0)}),this.bandCount=Math.min(e.bands.length,ze),this.seed=e.shape_seed%1e3/10;const d=Math.min(...e.bands.map(t=>t.inner))*i*a,c=Math.max(...e.bands.map(t=>t.outer))*i*a,u=new Ge(d*.98,c*1.02,256,1);this.material=new Y({uniforms:{uLightDir:o.uLightDir,uSunColor:o.uSunColor,uSunIntensity:o.uSunIntensity,uRingBands:{value:this.bands},uRingBandCount:{value:this.bandCount},uRingSeed:{value:this.seed},uRingNormal:{value:this.normal},uPlanetRadius:{value:a},uRingColor:{value:s},uRingSuper:{value:n?1:0},...this.structure},vertexShader:fa,fragmentShader:pa,transparent:!0,depthWrite:!1,side:be}),this.mesh=new E(u,this.material),this.mesh.name="realistic-rings",this.mesh.rotation.set(-Math.PI/2+l,0,0),this.mesh.updateMatrixWorld(),this.normal.set(0,0,1).applyQuaternion(this.mesh.quaternion).normalize(),this.mesh.renderOrder=1}setRoche(e){this.structure.uRingRoche.value=e}dispose(){this.mesh.removeFromParent(),this.mesh.geometry.dispose(),this.material.dispose()}}function ye(r){let e=r%2147483647;return e<=0&&(e+=2147483646),()=>(e=e*16807%2147483647)/2147483647}const va=r=>{const e=r()*2-1,a=r()*Math.PI*2,s=Math.sqrt(1-e*e);return new P(s*Math.cos(a),e,s*Math.sin(a))};function Ae(r,e,a,s){const o=new P(0,1,0).applyEuler(new ut((r()-.5)*a*2,r()*Math.PI*2,(r()-.5)*a*2)).normalize(),n=new P(1,0,0).cross(o);n.lengthSq()<1e-4&&n.set(0,0,1).cross(o),n.normalize();const i=new P().crossVectors(o,n);return{radius:e,normal:o,u:n,v:i,period:s,phase:r()*Math.PI*2}}const ge=(r,e,a)=>{const s=r.phase+e/r.period*Math.PI*2;return a.copy(r.u).multiplyScalar(Math.cos(s)*r.radius).addScaledVector(r.v,Math.sin(s)*r.radius)};function ba(r){const e=new ve(r*.6,r*.6,r),a=new ve(r*2.4,r*.02,r*.7).translate(-r*1.6,0,0),s=new ve(r*2.4,r*.02,r*.7).translate(r*1.6,0,0),o=new Et(r*.35,r*.2,12,1,!0).rotateX(Math.PI/2).translate(0,0,r*.6),n=[e,a,s,o].map(l=>l.toNonIndexed()),i=ft(n);return n.forEach(l=>l.dispose()),i}function ya(r){const e=[];e.push(new ve(r*6,r*.15,r*.15));for(let o=-2;o<=2;o++)e.push(new nt(r*.35,r*.35,r*1.4,12).rotateX(Math.PI/2).translate(o*r*.5,0,0));for(const o of[-2.8,-1.9,1.9,2.8])for(const n of[-1,1])e.push(new ve(r*.7,r*.02,r*2.2).translate(o*r,0,n*r*1.3));e.push(new He(r*1.1,r*.08,8,32).rotateY(Math.PI/2));const a=e.map(o=>o.toNonIndexed()),s=ft(a);return e.forEach(o=>o.dispose()),a.forEach(o=>o.dispose()),s}const yt=`
attribute float phase;
uniform float uWall;
uniform float uPixelRatio;
varying float vOn;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // Short double flash every two seconds
  float t = fract(uWall * 0.5 + phase);
  vOn = step(t, 0.04) + step(0.1, t) * step(t, 0.14);
  gl_PointSize = (1.5 + 2.5 * vOn) * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
`,wt=`
uniform vec3 uColor;
varying float vOn;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor * (0.25 + 2.5 * vOn) * (1.0 - d * 2.0), 1.0);
}
`;function et(r,e,a,s,o,n){const i=ye(a),l=e*(n?.008:.013),d=ba(l),c=new Q({color:n?10134708:13152368,metalness:.85,roughness:.3,envMapIntensity:1}),u=new ct(d,c,s);u.frustumCulled=!1;const t=[];for(let S=0;S<s;S++){const L=i(),b=L<.7?e*(1.04+i()*.12):L<.92?e*(1.3+i()*.4):e*(2.2+i()*.6),C=5400*Math.pow(b/(e*1.06),1.5);t.push(Ae(i,b,n?1.4:1,C))}r.add(u);const h=new he;h.setAttribute("position",new ae(new Float32Array(s*3),3)),h.setAttribute("phase",new ae(Float32Array.from({length:s},()=>i()),1));const g=new Y({uniforms:{uWall:{value:0},uPixelRatio:{value:Math.min(window.devicePixelRatio,2)},uColor:{value:new z(n?6347007:16769184)}},vertexShader:yt,fragmentShader:wt,blending:ee,transparent:!0,depthWrite:!1}),m=new Te(h,g);m.frustumCulled=!1,r.add(m);let p=null;const y=Ae(i,e*1.08,.9,5600);o&&(p=new E(ya(e*.012),new Q({color:14211280,metalness:.6,roughness:.4})),r.add(p));const x=new Le,k=new dt,_=new P,w=new P,M=new P(1,1,1),v=h.getAttribute("position");return{update:(S,L)=>{for(let b=0;b<s;b++)ge(t[b],S,_),ge(t[b],S+30,w),x.lookAt(_,w,_.clone().normalize()),k.setFromRotationMatrix(x),u.setMatrixAt(b,x.compose(_,k,M)),v.setXYZ(b,_.x,_.y,_.z);u.instanceMatrix.needsUpdate=!0,v.needsUpdate=!0,g.uniforms.uWall.value=L,p&&(ge(y,S,p.position),ge(y,S+30,w),p.lookAt(w))},dispose:()=>{for(const S of[u,m,p])S?.removeFromParent();d.dispose(),c.dispose(),h.dispose(),g.dispose(),p&&(p.geometry.dispose(),p.material.dispose())}}}function wa(r,e){const a=e*1.55,s=new de,o=new E(new He(a,e*.006,8,512),new Q({color:9213604,metalness:.9,roughness:.35}));o.rotation.x=Math.PI/2,s.add(o);const n=[];for(let t=0;t<6;t++){const h=t/6*Math.PI*2;n.push(Math.cos(h)*e,0,Math.sin(h)*e,Math.cos(h)*a,0,Math.sin(h)*a)}const i=new Ve(new he().setAttribute("position",new Ot(n,3)),new Se({color:8425632,transparent:!0,opacity:.5}));s.add(i);const l=240,d=new Float32Array(l*3);for(let t=0;t<l;t++){const h=t/l*Math.PI*2;d.set([Math.cos(h)*a,0,Math.sin(h)*a],t*3)}const c=new he;c.setAttribute("position",new ae(d,3)),c.setAttribute("phase",new ae(Float32Array.from({length:l},(t,h)=>h/l),1));const u=new Y({uniforms:{uWall:{value:0},uPixelRatio:{value:Math.min(window.devicePixelRatio,2)},uColor:{value:new z(6349055)}},vertexShader:yt,fragmentShader:wt,blending:ee,transparent:!0,depthWrite:!1});return s.add(new Te(c,u)),r.add(s),{surface:s,update:(t,h)=>{u.uniforms.uWall.value=h},dispose:()=>{s.removeFromParent(),s.traverse(t=>{const h=t;h.geometry?.dispose(),h.material?.dispose?.()})}}}const xt=`
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vObj = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,_e=`
${le}
uniform float uWall;
uniform vec3 uLightDir;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uStrength;
uniform vec3 uSeed;
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
float nightSide() { return 1.0 - smoothstep(-0.15, 0.25, dot(normalize(vWorldNormal), uLightDir)); }
float limb() { vec3 v = normalize(cameraPosition - vWorldPos); return pow(1.0 - abs(dot(normalize(vWorldNormal), v)), 2.0); }
`,xa=`
${_e}
void main() {
  vec3 p = normalize(vObj);
  float lat = abs(p.y);
  float lon = atan(p.z, p.x);
  float oval = exp(-pow((lat - 0.93) / 0.035, 2.0));
  float curtains = 0.5 + 0.5 * snoise(vec3(lon * 6.0, p.y * 3.0, uWall * 0.15 + uSeed.x));
  curtains *= 0.6 + 0.4 * snoise(vec3(lon * 22.0, 0.0, uWall * 0.4));
  float glow = oval * curtains * (0.3 + 0.7 * nightSide()) * (0.4 + 0.9 * limb());
  vec3 color = mix(uColor, uColor2, smoothstep(0.92, 0.97, lat));
  gl_FragColor = vec4(color * glow * uStrength, 1.0);
}
`,Ma=`
${_e}
void main() {
  vec3 p = normalize(vObj);
  vec3 w = vec3(snoise(p * 2.0 + uWall * 0.03), snoise(p * 2.0 + 7.0 - uWall * 0.025), snoise(p * 2.0 + 13.0));
  float n = fbmN(p * 3.0 + w * 1.2 + vec3(uWall * 0.02), 5.0);
  float body = smoothstep(0.1, 0.5, n);
  float pulse = 0.65 + 0.35 * sin(uWall * 0.7 + n * 8.0);
  vec3 color = mix(uColor, uColor2, smoothstep(0.3, 0.7, n));
  gl_FragColor = vec4(color * body * pulse * uStrength * (0.35 + 0.65 * nightSide()), 1.0);
}
`,Sa=`
${_e}
void main() {
  vec3 p = normalize(vObj);
  float ripples = 0.5 + 0.5 * sin(acos(clamp(dot(p, normalize(uSeed - 50.0)), -1.0, 1.0)) * 18.0 - uWall * 0.8);
  float veil = 0.5 + 0.5 * snoise(p * 4.0 + vec3(0.0, uWall * 0.05, 0.0));
  float glow = (limb() * 1.4 + 0.08) * (0.4 + 0.6 * ripples * veil);
  gl_FragColor = vec4(mix(uColor, uColor2, ripples) * glow * uStrength, 1.0);
}
`,_a=`
${_e}
void main() {
  vec3 p = normalize(vObj);
  float a = acos(clamp(dot(p, normalize(uSeed - 50.0)), -1.0, 1.0));
  float b = acos(clamp(dot(p, normalize(uSeed.zxy - 50.0)), -1.0, 1.0));
  float waves = sin(a * 40.0 - uWall * 1.5) * sin(b * 40.0 + uWall * 1.2);
  float glow = pow(abs(waves), 8.0) * (0.3 + limb());
  gl_FragColor = vec4(mix(uColor, uColor2, 0.5 + 0.5 * waves) * glow * uStrength, 1.0);
}
`;function xe(r,e,a,s,o,n,i,l,d,c){const u=ye(l),t=new Y({uniforms:{uWall:{value:0},uLightDir:d.uLightDir,uColor:{value:new z(o)},uColor2:{value:new z(n)},uStrength:{value:i},uSeed:{value:new P(u()*100,u()*100,u()*100)},uOctaves:{value:5}},vertexShader:xt,fragmentShader:s,blending:ee,transparent:!0,depthWrite:!1}),h=new E(new X(e*a,128,64),t);return h.renderOrder=3,r.add(h),{mesh:h,material:t,surface:c?h:void 0,update:(g,m)=>{t.uniforms.uWall.value=m},dispose:()=>{h.removeFromParent(),h.geometry.dispose(),t.dispose()}}}function Ca(r,e){const a=new de,s=new Y({uniforms:{uColor:{value:new z(6990079)},uWall:{value:0}},vertexShader:`
      varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = -mv.xyz; gl_Position = projectionMatrix * mv; }
    `,fragmentShader:`
      uniform vec3 uColor; uniform float uWall; varying vec3 vNormal; varying vec3 vView;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 4.0); gl_FragColor = vec4(uColor * rim * (0.07 + 0.02 * sin(uWall * 0.5)), 1.0); }
    `,blending:ee,transparent:!0,depthWrite:!1,side:be});for(const[o,n]of[[1.7,.35],[3.2,.9]]){const i=new E(new He(e*o,e*n,32,128),s);i.rotation.x=Math.PI/2,i.scale.z=1.3,a.add(i)}return r.add(a),{update:(o,n)=>{s.uniforms.uWall.value=n},dispose:()=>{a.removeFromParent(),a.traverse(o=>o.geometry?.dispose()),s.dispose()}}}const Ra=`
attribute vec3 vent;     // direction of the vent on the unit sphere
attribute vec4 params;   // phase, speed, spread angle, size
uniform float uWall;
uniform float uRadius;
uniform float uHeight;
uniform float uRate;
uniform float uGravity;
uniform float uPixelRatio;
uniform float uWind;
varying float vAge;
varying float vSeed;
void main() {
  float t = fract(uWall * uRate * params.y + params.x);
  vAge = t;
  vSeed = params.x;
  vec3 up = normalize(vent);
  vec3 side = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 side2 = cross(up, side);
  float a = params.x * 61.0;
  vec3 out_ = side * cos(a) + side2 * sin(a);
  // Ballistic rise and fall (or a buoyant column that spreads), carried by the wind
  float h = uHeight * (t * 2.0 - uGravity * t * t);
  vec3 pos = up * (uRadius + max(h, 0.0)) + out_ * uHeight * params.z * t + side * uWind * uHeight * t * t;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = params.w * (0.4 + t * 1.8) * uPixelRatio * 300.0 / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`,Fa=`
uniform vec3 uHot;
uniform vec3 uCool;
uniform float uGlow;
uniform float uOpacity;
uniform vec3 uLightDir;
varying float vAge;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float soft = (1.0 - d * d);
  // Glowing when fresh, cooling to ash or vapour as it ages
  vec3 color = mix(uHot, uCool, smoothstep(0.0, 0.45, vAge));
  float fade = smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(0.6, 1.0, vAge));
  float emissive = uGlow * (1.0 - smoothstep(0.0, 0.35, vAge));
  // Ash and vapour thin out as they spread
  float thin = 1.0 - 0.75 * smoothstep(0.2, 0.9, vAge);
  gl_FragColor = vec4(color * (0.35 + emissive * 2.5), soft * soft * fade * thin * uOpacity);
}
`,Pa={volcanic:{vents:7,particlesPerVent:260,height:.16,rate:.1,gravity:1,spread:.7,size:.022,hot:16752704,cool:3813416,glow:1,opacity:.9,additive:!1,wind:.3},smoke:{vents:9,particlesPerVent:200,height:.1,rate:.05,gravity:.2,spread:.35,size:.03,hot:4867136,cool:2104866,glow:0,opacity:.6,additive:!1,wind:1.6},seeps:{vents:12,particlesPerVent:120,height:.05,rate:.07,gravity:.1,spread:.6,size:.024,hot:11075440,cool:5933632,glow:.3,opacity:.4,additive:!0,wind:1},snow:{vents:10,particlesPerVent:160,height:.025,rate:.08,gravity:0,spread:1.6,size:.03,hot:16054527,cool:14674164,glow:0,opacity:.3,additive:!1,wind:3,latitude:[.6,.95]}};function ka(r,e,a,s,o){const n=ye(a),i=s.vents*s.particlesPerVent,l=new Float32Array(i*3),d=new Float32Array(i*4);for(let h=0;h<s.vents;h++){let g=va(n);if(s.latitude){const p=(s.latitude[0]+n()*(s.latitude[1]-s.latitude[0]))*(n()<.5?-1:1),y=Math.sqrt(1-p*p),x=n()*Math.PI*2;g=new P(y*Math.cos(x),p,y*Math.sin(x))}const m=.6+n()*.8;for(let p=0;p<s.particlesPerVent;p++){const y=h*s.particlesPerVent+p;l.set([g.x,g.y,g.z],y*3),d.set([n(),(.7+n()*.6)*m,n()*s.spread,e*s.size*(.6+n()*.8)],y*4)}}const c=new he;c.setAttribute("position",new ae(new Float32Array(i*3),3)),c.setAttribute("vent",new ae(l,3)),c.setAttribute("params",new ae(d,4));const u=new Y({uniforms:{uWall:{value:0},uRadius:{value:e*1.002},uHeight:{value:e*s.height},uRate:{value:s.rate},uGravity:{value:s.gravity},uPixelRatio:{value:Math.min(window.devicePixelRatio,2)},uWind:{value:s.wind},uHot:{value:new z(s.hot)},uCool:{value:new z(s.cool)},uGlow:{value:s.glow},uOpacity:{value:s.opacity},uLightDir:o.uLightDir},vertexShader:Ra,fragmentShader:Fa,transparent:!0,depthWrite:!1,blending:s.additive?ee:Nt}),t=new Te(c,u);return t.frustumCulled=!1,t.renderOrder=1,r.add(t),{surface:t,update:(h,g)=>{u.uniforms.uWall.value=g},dispose:()=>{t.removeFromParent(),c.dispose(),u.dispose()}}}function za(r,e,a){const s=ye(a),o=e*.06,n=new de,i=new ve(o,o,o),l=new E(i,new lt({color:328967,metalness:.3,roughness:.08,clearcoat:1})),d=new Se({color:8440063,transparent:!0,blending:ee}),c=new Ve(new It(i),d);n.add(l,c),r.add(n);const u=Ae(s,e*1.9,.5,4e4);return{update:(t,h)=>{ge(u,t,n.position),n.rotation.set(h*.05,h*.08,0),d.opacity=.35+.65*Math.pow(.5+.5*Math.sin(h*1.2),3)},dispose:()=>{n.removeFromParent(),i.dispose(),c.geometry.dispose(),l.material.dispose(),d.dispose()}}}function tt(r,e,a,s){const o=ye(a),n=s==="shards"?70:600;let i,l;if(s==="shards")i=new Lt(e*.02,0).scale(.5,1.8,.5),l=new lt({color:13154559,metalness:.1,roughness:.05,iridescence:1,iridescenceIOR:1.6,clearcoat:1,emissive:2756704,emissiveIntensity:.6});else{i=new Tt(e*.012,1);const x=i.getAttribute("position");for(let k=0;k<x.count;k++)x.setXYZ(k,x.getX(k)*(.7+o()*.6),x.getY(k)*(.6+o()*.5),x.getZ(k)*(.7+o()*.6));i.computeVertexNormals(),l=new Q({color:6971994,roughness:.95,metalness:.05,flatShading:!0})}const d=new ct(i,l,n);d.frustumCulled=!1;const c=[],u=[],t=[];for(let x=0;x<n;x++){const k=s==="shards"?e*(1.4+o()*.8):e*(1.15+Math.pow(o(),2)*.6);c.push(Ae(o,k,s==="shards"?1.2:.15,9e3*Math.pow(k/e,1.5))),u.push(new P(o(),o(),o()).multiplyScalar(.4)),t.push(s==="shards"?.5+o():.3+Math.pow(o(),3)*2.5)}r.add(d);const h=new Le,g=new dt,m=new ut,p=new P,y=new P;return{update:(x,k)=>{for(let _=0;_<n;_++)ge(c[_],x,p),m.set(u[_].x*k,u[_].y*k,u[_].z*k),g.setFromEuler(m),y.setScalar(t[_]),d.setMatrixAt(_,h.compose(p,g,y));d.instanceMatrix.needsUpdate=!0},dispose:()=>{d.removeFromParent(),i.dispose(),l.dispose()}}}function Aa(r,e,a){const s=new Y({uniforms:{uWall:{value:0},uColor:{value:new z(10146047)},uLightDir:a.uLightDir,uOctaves:{value:3}},vertexShader:`
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = -mv.xyz; gl_Position = projectionMatrix * mv; }
    `,fragmentShader:`
      ${le}
      uniform float uWall; uniform vec3 uColor; varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float core = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float knots = 0.6 + 0.4 * snoise(vec3(vUv.y * 12.0 - uWall * 2.0, 0.0, 0.0));
        float fade = (1.0 - vUv.y) * smoothstep(0.0, 0.05, vUv.y);
        gl_FragColor = vec4(uColor * core * knots * fade * 1.6, 1.0);
      }
    `,blending:ee,transparent:!0,depthWrite:!1,side:be}),o=new de;for(const n of[1,-1]){const i=new E(new nt(e*.08,e*.015,e*3,24,1,!0),s);i.position.y=n*e*2.5,n<0&&(i.rotation.z=Math.PI),o.add(i)}return r.add(o),{surface:o,update:(n,i)=>{s.uniforms.uWall.value=i},dispose:()=>{o.removeFromParent(),o.traverse(n=>n.geometry?.dispose()),s.dispose()}}}const Ce=16765562,Re=16774364,La=`
uniform float uR;
varying vec2 vP;
varying float vSilhouette;
void main() {
  // A billboard at the planet's centre, facing the camera
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float d = length(mv.xyz);
  // The planet's silhouette radius, measured in that plane
  vSilhouette = uR * d / sqrt(max(d * d - uR * uR, 1e-6));
  vP = position.xy;
  mv.xy += position.xy;
  gl_Position = projectionMatrix * mv;
}
`,Ta=`
${le}
uniform float uWall;
uniform vec3 uColor;
uniform vec3 uColor2;
varying vec2 vP;
varying float vSilhouette;
void main() {
  float x = length(vP) / vSilhouette;
  if (x < 0.995) discard;
  float a = atan(vP.y, vP.x);
  vec2 ring = vec2(cos(a), sin(a));
  // Rays: broad and fine, drifting round, each brightening and fading on its own
  float broad = 0.5 + 0.5 * snoise(vec3(ring * 2.2, uWall * 0.06));
  float fine = pow(0.5 + 0.5 * snoise(vec3(ring * 9.0, uWall * 0.11 + 4.0)), 3.0);
  float rays = broad * 0.6 + fine * 0.8;
  float reach = exp(-(x - 1.0) * (1.6 + 1.4 * (1.0 - broad)));
  float corona = exp(-(x - 1.0) * 10.0);
  float breathe = 0.82 + 0.18 * sin(uWall * 0.5);
  vec3 color = mix(uColor, uColor2, corona) * (corona * 1.1 + rays * reach * 0.55) * breathe;
  gl_FragColor = vec4(color, 1.0);
}
`,Ia=`
uniform float uWall;
uniform float uInner;
uniform float uOuter;
uniform float uCells;
uniform float uSpeed;
uniform float uSeedF;
uniform vec3 uColor;
uniform vec3 uColor2;
varying vec2 vPos;
float hash(float n) { return fract(sin(n * 12.9898 + uSeedF) * 43758.5453); }
void main() {
  float r = length(vPos);
  float t = (r - uInner) / (uOuter - uInner);
  float a = atan(vPos.y, vPos.x) / 6.2831853 + 0.5;
  // Hairlines along both edges
  float lines = exp(-pow((t - 0.1) / 0.025, 2.0)) + exp(-pow((t - 0.9) / 0.025, 2.0));
  // The engraved code: one glyph per cell, a 0 or a 1, flickering as it is rewritten
  float u = a * uCells + uWall * uSpeed;
  float id = floor(u);
  vec2 g = vec2(fract(u), (t - 0.28) / 0.44);
  float inside = step(0.0, g.y) * step(g.y, 1.0);
  float bit = step(0.5, hash(id + floor(uWall * 0.4 + hash(id) * 10.0)));
  float one = smoothstep(0.09, 0.03, abs(g.x - 0.5)) * smoothstep(0.0, 0.08, g.y) * smoothstep(1.0, 0.92, g.y);
  float zero = smoothstep(0.1, 0.03, abs(length((g - 0.5) * vec2(2.4, 2.0)) - 0.78));
  float glyph = mix(zero, one, bit) * inside;
  // Ticks between the glyphs
  float ticks = smoothstep(0.03, 0.0, abs(fract(u) - 0.0)) * smoothstep(0.35, 0.3, abs(t - 0.5));
  float flicker = 0.6 + 0.4 * sin(uWall * 3.0 + id * 1.7);
  // A faint band of light carrying the code
  float band = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.88, t) * 0.08;
  vec3 color = mix(uColor, uColor2, glyph) * (band + lines * 1.1 + glyph * 1.3 * flicker + ticks * 0.4);
  gl_FragColor = vec4(color, 1.0);
}
`,Na=`
${_e}
uniform vec3 uAxes[6];
void main() {
  vec3 p = normalize(vObj);
  float web = 0.0;
  float pulses = 0.0;
  for (int i = 0; i < 6; i++) {
    float d = abs(dot(p, uAxes[i]));
    float line = exp(-pow(d / 0.006, 2.0)) + exp(-pow(d / 0.03, 2.0)) * 0.25;
    web += line;
    // Light travelling along each great circle
    vec3 u = normalize(cross(uAxes[i], vec3(0.31, 0.83, 0.47)));
    vec3 v = cross(uAxes[i], u);
    float along = atan(dot(p, v), dot(p, u));
    pulses += line * pow(0.5 + 0.5 * sin(along * 3.0 - uWall * 1.3 + float(i) * 2.1), 12.0);
  }
  float glow = (web * 0.35 + pulses * 1.2) * (0.25 + 0.75 * nightSide()) * (0.6 + 0.6 * limb());
  gl_FragColor = vec4(mix(uColor, uColor2, clamp(pulses, 0.0, 1.0)) * glow * uStrength, 1.0);
}
`,Oa=`
attribute vec4 orbit;   // radius, inclination, node, phase
attribute float speed;
attribute float twinkle;
uniform float uTime;
uniform float uWall;
uniform float uPixels;
varying float vGlow;
void main() {
  float a = orbit.w + uWall * speed;
  vec3 p = vec3(cos(a), 0.0, sin(a)) * orbit.x;
  float ci = cos(orbit.y), si = sin(orbit.y);
  p = vec3(p.x, -p.z * si, p.z * ci);
  float cn = cos(orbit.z), sn = sin(orbit.z);
  p = vec3(p.x * cn - p.z * sn, p.y, p.x * sn + p.z * cn);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vGlow = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uWall * (1.0 + twinkle * 2.0) + twinkle * 40.0), 3.0);
  gl_PointSize = clamp(uPixels * orbit.x * 0.012 / -mv.z, 1.5, 9.0);
  gl_Position = projectionMatrix * mv;
}
`,Ea=`
uniform vec3 uColor;
varying float vGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 7.0);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.5) * core * vGlow, 1.0);
}
`,qa=`
uniform float uAge;
uniform vec3 uColor;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vec3 v = normalize(cameraPosition - vWorldPos);
  // A rim that fades again right at the silhouette, so the wave has no hard edge
  float grazing = 1.0 - abs(dot(normalize(vWorldNormal), v));
  float rim = pow(grazing, 3.0) * (1.0 - pow(grazing, 14.0));
  float fade = (1.0 - uAge) * smoothstep(0.0, 0.08, uAge);
  gl_FragColor = vec4(uColor * rim * fade * 0.7, 1.0);
}
`;function Da(r,e,a,s){const o=ye(a),n=new de,i={blending:ee,transparent:!0,depthWrite:!1},l=[],d=[],c=new Y({uniforms:{uWall:{value:0},uR:{value:e},uColor:{value:new z(Ce)},uColor2:{value:new z(Re)},uOctaves:{value:3}},vertexShader:La,fragmentShader:Ta,...i}),u=new st(e*9,e*9),t=new E(u,c);t.frustumCulled=!1,t.renderOrder=4,n.add(t),l.push(u,c),d.push(c);const h=[];for(let b=0;b<3;b++){const C=e*(1.6+b*.36),F=e*.13,A=new Ge(C,C+F,256,1),D=C+F/2,Z=Math.round(Math.PI*2*D/(F*.44*.62)),B=new Y({uniforms:{uWall:{value:0},uInner:{value:C},uOuter:{value:C+F},uCells:{value:Z},uSpeed:{value:(.6+o()*.8)*(b%2?-1:1)},uSeedF:{value:o()*100},uColor:{value:new z(Ce)},uColor2:{value:new z(Re)}},vertexShader:"varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",fragmentShader:Ia,side:be,...i}),T=new E(A,B);T.renderOrder=4,T.rotation.set(Math.PI/2+(o()-.5)*1.4,(o()-.5)*1.4,o()*Math.PI),n.add(T),h.push({mesh:T,spin:(.02+o()*.03)*(b%2?-1:1),base:T.rotation.z}),l.push(A,B),d.push(B)}const g=(1+Math.sqrt(5))/2,m=[[0,1,g],[0,-1,g],[1,g,0],[-1,g,0],[g,0,1],[-g,0,1]].map(([b,C,F])=>new P(b,C,F).normalize()),p=xe(r,e,1.004,Na,Ce,Re,.55,a+11,s,!0);p.material.uniforms.uAxes={value:m};const y=700,x=new Float32Array(y*4),k=new Float32Array(y),_=new Float32Array(y);for(let b=0;b<y;b++)x.set([e*(1.15+Math.pow(o(),1.5)*1.6),(o()-.5)*2.4,o()*Math.PI*2,o()*Math.PI*2],b*4),k[b]=(.03+o()*.06)*(o()<.5?-1:1),_[b]=o();const w=new he;w.setAttribute("position",new ae(new Float32Array(y*3),3)),w.setAttribute("orbit",new ae(x,4)),w.setAttribute("speed",new ae(k,1)),w.setAttribute("twinkle",new ae(_,1));const M=new Y({uniforms:{uTime:{value:0},uWall:{value:0},uPixels:{value:900},uColor:{value:new z(Ce)}},vertexShader:Oa,fragmentShader:Ea,...i}),v=new Te(w,M);v.frustumCulled=!1,n.add(v),l.push(w,M),d.push(M);const S=new X(e,96,48),L=[0,1].map(()=>{const b=new Y({uniforms:{uAge:{value:0},uColor:{value:new z(Re)}},vertexShader:xt,fragmentShader:qa,...i}),C=new E(S,b);return C.renderOrder=4,n.add(C),l.push(b),{mesh:C,material:b}});return l.push(S),r.add(n),{update:(b,C)=>{for(const F of d)F.uniforms.uWall.value=C;p.update(b,C);for(const F of h)F.mesh.rotation.z=F.base+C*F.spin;L.forEach((F,A)=>{const D=((C/7+A*.5)%1+1)%1;F.material.uniforms.uAge.value=D,F.mesh.scale.setScalar(1.02+D*2.2)})},dispose:()=>{n.removeFromParent(),p.dispose(),l.forEach(b=>b.dispose())},surface:p.mesh}}class Wa{live=[];constructor(e,a){const{scene:s,radius:o,seed:n,shared:i}=a;let l=0;const d=()=>n+7919*++l;for(const c of e)switch(c){case"satellites":this.live.push(et(s,o,d(),48,!0,!1));break;case"swarm":this.live.push(et(s,o,d(),320,!1,!0),wa(s,o));break;case"aurora":this.live.push(xe(s,o,1.03,xa,a.auroraColor?.[0]??4259728,a.auroraColor?.[1]??16728192,1.4,d(),i,!1));break;case"belts":this.live.push(Ca(s,o));break;case"volcanic":case"smoke":case"seeps":case"snow":this.live.push(ka(s,o,d(),Pa[c],i));break;case"livingGas":this.live.push(xe(s,o,1.018,Ma,11559167,4251903,.9,d(),i,!0));break;case"presence":this.live.push(xe(s,o,1.12,Sa,14742783,10535167,.5,d(),i,!1));break;case"ripples":this.live.push(xe(s,o,1.08,_a,9067775,4243711,.8,d(),i,!1));break;case"monolith":this.live.push(za(s,o,d()));break;case"shards":this.live.push(tt(s,o,d(),"shards"));break;case"debris":this.live.push(tt(s,o,d(),"debris"));break;case"jets":this.live.push(Aa(s,o,i));break;case"divine":this.live.push(Da(s,o,d(),i));break}}update(e,a,s){for(const o of this.live)o.surface?.quaternion.copy(s),o.update(e,a)}dispose(){this.live.forEach(e=>e.dispose()),this.live=[]}}function Ga(r){const e=new Set,a=String(r?.planet_info?.type??r?.original_planet_data?.planet_type??"").toLowerCase().replace(/_/g," "),s=String(r?.original_planet_data?.life_forms??"None"),o=r?.surface_elements??{};return s==="Intelligent Life"&&e.add("satellites"),s==="Robotic Entities"&&e.add("swarm"),s==="Conscious Gas"&&e.add("livingGas"),s==="Non-Physical Entity"&&e.add("presence"),s==="Have I just found God?"&&e.add("divine"),(a==="lava"||a==="molten core"||a==="magma")&&e.add("volcanic"),a==="carbon"&&e.add("smoke"),(a==="toxic"||a==="swamp"&&o.toxic_bubbles)&&e.add("seeps"),(a==="tundra"||a==="desert"||a==="carbon"||a==="toxic")&&e.add("snow"),a==="radioactive"&&(e.add("belts"),e.add("aurora")),a==="exotic"&&e.add("shards"),a==="anomaly"&&(e.add("ripples"),e.add("monolith"),e.add("jets")),o.has_fragmentation_zones&&e.add("debris"),e}const Ye=`
uniform vec3 uDeep, uShallow, uLow, uMid, uHigh, uPeak, uAccent, uEmissive;
uniform float uSea, uRelief, uContinentScale, uIceCap, uVegetation, uSpecular, uRoughness, uMetal;
uniform float uEmission, uCityLights, uCraters, uBands, uStorms, uClouds, uTime, uCloudSpin;
uniform vec3 uSeed;
uniform vec3 uCloudColor;
// Per-planet structure: variant of the family (0..3), twist of the shapes, feature size
uniform float uVariant, uWarp, uFeature, uLifeGlow, uBandFreq, uBloom;
// Kind within a family that holds several planet types (see PlanetLook.style)
uniform float uStyle;
`,Mt=`
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

float cloudDensity(vec3 p, float octaves) {
  vec3 r = rotY(p, uCloudSpin);
  float lat = r.y;
  // Weather is stretched east-west by the planet's spin, and swirls into systems
  vec3 q = vec3(r.x * 2.0, r.y * 3.4, r.z * 2.0) + uSeed * 1.7;
  vec3 w = vec3(fbmN(q * 0.7 + vec3(0.0, 0.0, uTime * 0.004), 4.0), fbmN(q * 0.7 + vec3(5.2, 1.3, uTime * 0.003), 4.0), fbmN(q * 0.7 + vec3(2.7, 8.1, 0.0), 4.0));
  float n = fbmN(q + w * 2.2, octaves);
  // Wispy edges: high frequencies eat into the thin parts
  float erosion = fbmN(q * 4.0 + w, max(octaves - 2.0, 2.0)) * 0.22;
  float cover = mix(0.38, -0.25, uClouds);
  // Clear belts near the subtropics, the most cloud at mid latitudes
  cover += 0.1 * cos(lat * 9.0);
  // Soft edges: thin cloud thickens gradually into the dense cores
  return smoothstep(cover, cover + 0.6, n - erosion * (1.0 - smoothstep(cover + 0.1, cover + 0.45, n)));
}
`,Oe=`
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vObj = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,Va=`
${le}
${Be}
${Ye}
${Mt}
uniform mat3 uWorldToObject;
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
#if defined(HAS_RINGS)
${bt}
uniform vec3 uRingNormal;
uniform float uPlanetRadius;
#endif

// Bump mapping from screen derivatives of the height (Mikkelsen)
vec3 bumped(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}

// Impact craters: bowl, raised rim, at two scales
float craterField(vec3 p, float scale) {
  vec3 c = cellular(p * scale);
  float size = 0.25 + 0.3 * fract(c.z * 7.13);
  float t = c.x / size;
  float bowl = t < 1.0 ? (t * t - 1.0) : 0.0;
  float rim = exp(-pow((t - 1.0) / 0.18, 2.0)) * 0.35;
  float present = step(0.45, fract(c.z * 3.71));
  return (bowl + rim) * present;
}

// A Ruby Cloud's gem glints: each a corundum crystal, a flat hexagonal plate, as corundum
// grows. The nearest of the feature points around x (the same as cellular's, so its id
// is cellular's .z), seen on the sphere at p: the plate turned its own way and tilted
// (foreshortened), with crisp but unaliased edges and brighter rims, as a cut stone's.
// Returns x: coverage (0..1), y: unused, z: the crystal's id
vec3 gemCrystal(vec3 x, vec3 p) {
  vec3 cell = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0, id = 0.0;
  vec3 toFeature = vec3(0.0);
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++)
      for (int k = -1; k <= 1; k++) {
        vec3 o = vec3(float(i), float(j), float(k));
        vec3 h = hash33(cell + o);
        vec3 r = o + h - f;
        float d = dot(r, r);
        if (d < d1) { d1 = d; id = h.x; toFeature = r; }
      }
  // Into the plane of the sphere there
  vec3 up = abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(up, p));
  vec3 t2 = cross(p, t1);
  vec2 q = vec2(dot(toFeature, t1), dot(toFeature, t2));
  float angle = fract(id * 17.31) * 1.0472;
  float c = cos(angle), s = sin(angle);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  q.y /= 0.45 + 0.55 * fract(id * 29.7);
  q = abs(q);
  float hex = max(q.x * 0.8660254 + q.y * 0.5, q.y);
  float size = 0.22 + 0.14 * fract(id * 5.3);
  float edge = max(fwidth(hex), size * 0.06);
  float plate = 1.0 - smoothstep(size - edge, size, hex);
  float rim = 0.7 + 0.3 * smoothstep(size * 0.55, size - edge, hex);
  return vec3(plate * rim, 0.0, id);
}

#if defined(FAMILY_DIAMOND)
// What a diamond facet sees, inside or out: black space, faint stars, the glow of the
// galaxy, and the star (a sharp disc and a softer halo)
vec3 diamondSky(vec3 d) {
  float s = max(dot(d, uLightDir), 0.0);
  vec3 star = uSunColor * uSunIntensity * (pow(s, 600.0) * 30.0 + pow(s, 40.0) * 0.6 + pow(s, 6.0) * 0.05);
  float stars = step(0.9985, hash33(floor(d * 240.0)).x) * 0.15;
  float galaxy = exp(-pow(dot(d, normalize(vec3(0.25, 1.0, 0.15))) / 0.3, 2.0)) * 0.035;
  return star + vec3(stars) + vec3(0.55, 0.6, 0.8) * galaxy;
}
#endif

#if defined(FAMILY_MIRROR)
// The stars a mirror reflects. Each is a point, so its image is as small as the optics allow:
// blurred by the metal's roughness and never smaller than what one pixel covers of the
// reflected sky (footprint, radians). A star whose image the pixel can't resolve spreads
// its light over it, dimmer, instead of flickering on and off: the same light, filtered.
// Some three thousand stars over the sky, as the naked eye sees it: most faint, a few
// bright (a steep power law), of varied colour (cool red to hot blue). One may sit in some
// of the cells of a grid on the sky; the eight cells around the direction are searched
vec3 mirrorStars(vec3 d, float footprint, float rough) {
  const float S = 40.0;
  vec3 g = d * S;
  vec3 base = floor(g - 0.5);
  float core = 0.003;
  float sigma2 = core * core + footprint * footprint + (rough * 0.03) * (rough * 0.03);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec3 cell = base + vec3(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1));
    vec3 h = hash33(cell + 17.0);
    if (h.z > 0.15) continue;
    vec3 star = normalize((cell + h) / S);
    vec3 diff = d - star;
    float flux = pow(fract(h.x * 13.7), 10.0) * 1.6 + 0.04;
    vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.7, 0.82, 1.0), fract(h.y * 7.3));
    sum += tint * flux * (core * core / sigma2) * exp(-dot(diff, diff) / (2.0 * sigma2));
  }
  return sum * 4.0;
}

// What a mirror world mirrors: the star (sharper the smoother the metal), the stars, the
// galaxy's dusty band across the sky and the faint glow of the rest of it.
// uGalaxy: xyz towards the galaxy's core in its own frame (its disc on XZ), w 1 inside one
uniform vec4 uGalaxy;
vec3 mirrorSky(vec3 d, float rough, float footprint) {
  float s = max(dot(d, uLightDir), 0.0);
  float sharp = mix(2000.0, 120.0, clamp(rough * 6.0, 0.0, 1.0));
  vec3 star = uSunColor * uSunIntensity * (pow(s, sharp) * 40.0 + pow(s, 24.0) * 0.5 + pow(s, 4.0) * 0.08);
  vec3 stars = mirrorStars(d, footprint, rough);
  // The galaxy as it really lies from here: its disc's band across the sky (the disc is on
  // XZ), brightest towards the core, the warm glow of the bulge there; nebulae around it
  // (broad bright and dark patches, which is what makes chrome read as chrome)
  vec3 core = uGalaxy.w > 0.5 ? uGalaxy.xyz : vec3(0.0);
  float toCore = max(dot(d, core), 0.0);
  float band = exp(-d.y * d.y / 0.3) * (0.55 + 0.9 * toCore * toCore);
  float bulge = exp(-(1.0 - toCore) * 7.0) * uGalaxy.w;
  float clouds = smoothstep(-0.3, 0.6, fbmN(d * 2.2 + 7.0, 5.0));
  float dust = 1.0 - 0.6 * smoothstep(0.1, 0.5, fbmN(d * 5.0 + 3.0, 4.0)) * band;
  // (the sky's glow as faint as the night sides of the other planets: no light of its own)
  vec3 glow = ((vec3(0.62, 0.66, 0.8) * band * 0.45 + vec3(1.0, 0.84, 0.6) * bulge * 0.5 + vec3(0.34, 0.36, 0.46) * clouds * 0.35) * dust + vec3(0.03, 0.035, 0.05)) * 0.45;
  return star + stars + glow;
}
#endif

void main() {
  vec3 p = normalize(vObj);
  vec3 ng = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  vec3 q = p * uContinentScale + uSeed;
  float lat = p.y;
  float alat = abs(lat);

  vec3 albedo;
  float height;          // for bumps, in radii
  float spec = uSpecular, rough = uRoughness, metal = uMetal;
  vec3 emission = vec3(0.0);
  float wet = 0.0;       // 1 over open water
  float landMask = 0.0;  // where cities may be
  float rubyHeat = 0.0;  // a Ruby Cloud's day-side incandescence (0..1)

#if defined(FAMILY_TERRAN)
  // Continents: big coherent shapes, twisted by the planet's own warp. Variants: 0 a few
  // continents, 1 an archipelago, 2 a single supercontinent, 3 continents split by rifts
  vec3 w = vec3(fbmN(q * 0.8 + vec3(5.2, 1.3, 2.8), 3.0), fbmN(q * 0.8 + vec3(1.7, 9.2, 4.1), 3.0), fbmN(q * 0.8 + vec3(8.3, 2.8, 6.6), 3.0));
  float k = uVariant < 0.5 ? 0.9 : uVariant < 1.5 ? 2.2 : uVariant < 2.5 ? 0.6 : 1.1;
  float cont = fbm(q * k + w * (0.35 + uWarp * 0.4)) * 1.5;
  if (uVariant > 1.5 && uVariant < 2.5) cont += dot(p, normalize(uSeed - 50.0)) * 0.45;
  if (uVariant > 2.5) cont -= pow(1.0 - abs(snoise(q * 1.3 + w)), 10.0) * 0.6;
  float landF = smoothstep(uSea, uSea + 0.06, cont);
  // Mountain belts along the edges of the continents, like colliding plates
  float belt = exp(-pow((cont - uSea - 0.22) / 0.16, 2.0));
  float mountains = ridged(q * 2.4 * uFeature + w, uOctaves - 1.0) * (0.35 + belt) * smoothstep(uSea, uSea + 0.3, cont);
  float h = cont + mountains * 0.5 * uRelief;
  // Climate: wet tropics and temperate belts, dry subtropics, drier far inland
  float coastal = 1.0 - smoothstep(0.0, 0.5, cont - uSea);
  float moisture = fbmN(q * 1.1 + vec3(3.0), 4.0) * 0.8 + 0.3 * (1.0 - smoothstep(0.12, 0.35, alat)) - 0.35 * exp(-pow((alat - 0.42) / 0.12, 2.0)) + 0.25 * coastal;
  float altitude = clamp((h - uSea) / 1.2, 0.0, 1.0);
  // Ground: soil and rock by altitude, then vegetation where it is wet and warm enough
  vec3 soil = mix(uLow, uMid, smoothstep(0.05, 0.4, altitude));
  soil = mix(soil, uHigh, smoothstep(0.4, 0.7, altitude));
  vec3 green = mix(uAccent, uAccent * 1.35, 0.5 + 0.5 * fbmN(q * 3.0, 3.0));
  float veg = uVegetation * smoothstep(-0.15, 0.3, moisture) * (1.0 - smoothstep(0.35, 0.6, altitude)) * (1.0 - smoothstep(0.6, 0.85, alat));
  vec3 land = mix(soil, green, veg);
  // Dry belts turn to sand
  vec3 sand = mix(uMid, vec3(0.74, 0.6, 0.4), 0.55);
  land = mix(land, sand, (1.0 - veg) * smoothstep(-0.05, -0.4, moisture) * 0.8);
  // Water: deeper is darker
  // Shelves along the coasts, then the open ocean drops away
  float depth = clamp((uSea - cont) / 0.18, 0.0, 1.0);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 0.6, depth));
  // Microbial life: plankton blooms swirling in the currents, turquoise and milky green
  if (uBloom > 0.0) {
    vec3 bw = vec3(fbmN(q * 3.0 + 2.0, 3.0), fbmN(q * 3.0 + 6.0, 3.0), 0.0);
    float bloom = smoothstep(0.25, 0.6, fbmN(q * 5.0 + bw * 2.5, 5.0)) * (1.0 - smoothstep(0.3, 0.7, alat));
    water = mix(water, vec3(0.08, 0.42, 0.38), bloom * 0.55 * uBloom);
  }
  albedo = mix(water, land, landF);
  wet = 1.0 - landF;
  landMask = landF * (1.0 - smoothstep(0.4, 0.6, altitude));
  // Ice: polar caps (wavy edge) and high peaks; frozen seas too
  float ice = smoothstep(uIceCap, uIceCap + 0.04, alat + 0.06 * fbmN(q * 4.0, 3.0) + altitude * 0.35 * landF);
  ice = max(ice, smoothstep(0.82, 0.95, altitude + mountains * 0.15) * landF);
  albedo = mix(albedo, uPeak, ice);
  wet *= 1.0 - ice;
  landMask *= 1.0 - ice;
  height = (landF > 0.0 ? max(h - uSea, 0.0) : 0.0) * 0.012 * uRelief + (1.0 - landF) * fbmN(p * 60.0 + vec3(uTime * 0.02), 2.0) * 0.0004;
  spec = mix(0.04, 1.0, wet);
  rough = mix(0.85, 0.12, wet);

#elif defined(FAMILY_DESERT)
  vec3 w = vec3(fbmN(q + vec3(5.2, 1.3, 2.8), 3.0), fbmN(q + vec3(1.7, 9.2, 4.1), 3.0), 0.0);
  float base = fbm(q + w * 0.6);
  // Dark rocky plateaus (hamada), sand seas (ergs) in the basins, dry river valleys
  float rock = smoothstep(-0.12, 0.25, fbmN(q * 1.6 + vec3(7.0) + w * 0.5, uOctaves));
  float erg = smoothstep(0.05, -0.3, base) * (1.0 - rock);
  float valleys = 1.0 - smoothstep(0.0, 0.05, abs(fbmN(q * 2.3 + w * 0.8, 5.0)));
  valleys *= 1.0 - erg;
  // Dune fields: long crests across the prevailing wind, broken by noise
  float dunePhase = dot(p, normalize(vec3(0.8, 0.15, 0.55))) * 90.0 + fbmN(q * 3.0, 3.0) * 6.0;
  float dunes = pow(0.5 + 0.5 * sin(dunePhase), 3.0) * erg;
  float h = base * 0.6 + rock * 0.3 - valleys * 0.2 + ridged(q * 3.0, uOctaves - 2.0) * rock * 0.3;
  vec3 sand = mix(uLow, uPeak, 0.25 + 0.25 * fbmN(q * 8.0, 3.0));
  albedo = mix(uMid, uLow, smoothstep(-0.25, 0.25, base + fbmN(q * 5.0, 4.0) * 0.25));
  albedo = mix(albedo, sand, erg * (0.6 + 0.4 * dunes));
  albedo = mix(albedo, uHigh, rock * (0.55 + 0.25 * fbmN(q * 9.0, 4.0)));
  albedo = mix(albedo, uHigh * 0.8, valleys * 0.5);
  // Variants: 0 dune seas, 1 a great rift valley, 2 cratered like Mars, 3 terraced mesas
  if (uVariant > 0.5 && uVariant < 1.5) {
    float rift = pow(1.0 - abs(snoise(q * 0.55 + w * 0.6)), 28.0) * smoothstep(0.75, 0.3, alat);
    h -= rift * 0.9;
    albedo = mix(albedo, uHigh * 0.65, rift * 0.8);
  } else if (uVariant > 1.5 && uVariant < 2.5) {
    float cr = craterField(p, 4.5 * uFeature) * 0.6 + craterField(p + 3.1, 12.0 * uFeature) * 0.3 * clamp(uOctaves - 4.0, 0.0, 1.0);
    h += cr * (0.5 + uCraters);
    albedo *= 1.0 + cr * 0.25;
  } else if (uVariant > 2.5) {
    float steps = 5.0;
    float terraced = floor(h * steps) / steps + smoothstep(0.0, 0.25, fract(h * steps)) / steps;
    h = mix(h, terraced, rock);
    albedo = mix(albedo, uHigh * 1.2, smoothstep(0.05, 0.0, fract(h * steps)) * rock * 0.5);
  }
  // Frost on the poles of cold deserts
  albedo = mix(albedo, uPeak * 1.1, smoothstep(0.9, 0.97, alat + fbmN(q * 4.0, 3.0) * 0.04) * 0.7);
  height = (h * 0.009 + dunes * 0.0008) * uRelief;
  landMask = 1.0 - valleys;

#elif defined(FAMILY_BARREN) || defined(FAMILY_RADIOACTIVE)
  vec3 w = vec3(fbmN(q * 0.9, 3.0), fbmN(q * 0.9 + 4.4, 3.0), fbmN(q * 0.9 + 8.8, 3.0)) * uWarp;
  float base = fbm(q * 1.2 + w);
  float rough1 = ridged(q * 3.0 * uFeature + w, uOctaves - 2.0);
  float f = uFeature;
  float craters = craterField(p, 4.0 * f) * 0.6 + craterField(p + 3.7, 11.0 * f) * 0.3 * clamp(uOctaves - 4.0, 0.0, 1.0) + craterField(p + 9.1, 26.0 * f) * 0.15 * clamp(uOctaves - 6.0, 0.0, 1.0);
  craters *= uCraters;
  float h = base * 0.6 + rough1 * 0.25 + craters;
  albedo = mix(uLow, uMid, smoothstep(-0.4, 0.4, base + fbmN(q * 7.0, 4.0) * 0.3));
  albedo = mix(albedo, uHigh, smoothstep(0.45, 0.8, rough1));
  // Variants: 0 saturated with craters, 1 dark lava plains (maria) like the Moon,
  // 2 tectonic scarps and fractures, 3 a giant impact basin with ring walls
  if (uVariant > 0.5 && uVariant < 1.5) {
    float maria = smoothstep(0.05, -0.15, fbmN(q * 0.8 + w, 5.0));
    albedo = mix(albedo, uLow * 0.45, maria);
    h = mix(h, base * 0.15, maria * 0.8);
    craters *= 1.0 - maria * 0.7;
  } else if (uVariant > 1.5 && uVariant < 2.5) {
    float scarps = pow(1.0 - abs(snoise(q * 1.8 + w * 2.0)), 14.0) + pow(1.0 - abs(snoise(q * 4.2 + 7.0)), 18.0) * 0.6;
    h += scarps * 0.5;
    albedo = mix(albedo, uHigh * 1.15, scarps * 0.4);
  } else if (uVariant > 2.5) {
    vec3 centre = normalize(uSeed - 50.0);
    float d = acos(clamp(dot(p, centre), -1.0, 1.0)) / 0.9;
    float basin = (d < 1.0 ? (d * d - 1.0) * 0.8 : 0.0) + exp(-pow((d - 1.0) / 0.08, 2.0)) * 0.5 + exp(-pow((d - 1.45) / 0.06, 2.0)) * 0.25;
    h += basin;
    albedo = mix(albedo, uLow * 0.7, smoothstep(1.0, 0.6, d) * 0.5);
  }
  // Fresh crater rims are brighter, floors darker
  albedo *= 1.0 + craters * 0.35;
  height = h * 0.008 * uRelief;
  landMask = 0.4;
#if defined(FAMILY_RADIOACTIVE)
  // The crust is split open over glowing ore; luminous sludge pools in the craters and
  // basins, with a blue Cherenkov core where it is deepest; the ground around fissures
  // and pools is stained a sickly yellow-green, and hot spots flare and fade
  vec3 cells = cellular(q * 3.0 + w * 0.5);
  float gap = cells.y - cells.x;
  float fissure = 1.0 - smoothstep(0.0, 0.05, gap);
  vec3 fineCells = cellular(q * 9.0 + w);
  float fineCracks = (1.0 - smoothstep(0.0, 0.03, fineCells.y - fineCells.x)) * 0.5 * clamp(uOctaves - 4.0, 0.0, 1.0);
  float pools = max(smoothstep(-0.18, -0.38, craters), smoothstep(-0.3, -0.5, base + fbmN(q * 4.0, 3.0) * 0.15));
  float deep = max(smoothstep(-0.35, -0.6, craters), smoothstep(-0.45, -0.65, base));
  float stain = max(1.0 - smoothstep(0.0, 0.22, gap), smoothstep(-0.02, -0.3, craters)) * (0.6 + 0.4 * fbmN(q * 6.0, 3.0));
  float flare = smoothstep(0.55, 0.9, snoise(q * 1.4 + vec3(uTime * 0.03)));
  float pulse = 0.7 + 0.3 * sin(uTime * 1.3 + cells.z * 20.0);
  albedo = mix(albedo, mix(vec3(0.42, 0.46, 0.1), uEmissive * 0.4, 0.4), clamp(stain, 0.0, 1.0) * 0.55);
  albedo = mix(albedo, uEmissive * 0.3, max(fissure * 0.6, pools));
  emission = uEmissive * (fissure * 1.6 + fineCracks + pools * (0.9 + 0.3 * pulse) + flare * (fissure + stain) * 0.8) * pulse * uEmission;
  emission += vec3(0.35, 0.65, 1.0) * deep * (0.8 + 0.2 * pulse) * uEmission;
  // Sludge lies flat in the hollows
  height = mix(height, -0.001 * uRelief, pools);
  // It glows bright enough to be seen in daylight too
  emission *= 1.5;
#endif

#elif defined(FAMILY_METAL)
  // A world of bare metal: broad plains that once flowed and set mirror-smooth, scoured
  // and frosted elsewhere, and crusted with oxide (rust, verdigris, tarnish, temper
  // colours) in the low ground and on the oldest surfaces, dull and rough, so it reads
  // as metal and never as a gem. Impacts expose fresh, bright metal. Variants: 0 smooth
  // seas of metal under oxidised highlands, 1 brushed (long grooves), 2 cast (frozen
  // flow ripples), 3 armour plates
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp;
  float base = fbm(q * 1.1 + w);
  float detail = fbmN(q * 6.0 * uFeature + w, uOctaves - 2.0);
  vec3 dir = normalize(hash33(uSeed) - 0.5);
  float along = dot(p, dir);
  float grooves = pow(abs(sin((along * 160.0 + fbmN(q * 2.0, 3.0) * 8.0) * uFeature)), 6.0);
  float grooveAmount = uVariant > 0.5 && uVariant < 1.5 ? 1.0 : 0.15;
  float flow = sin((base * 30.0 + along * 12.0) * uFeature);
  float castAmount = uVariant > 1.5 && uVariant < 2.5 ? 1.0 : 0.0;
  float seams = 0.0;
  if (uVariant > 2.5) {
    vec3 plates = cellular(q * 3.0 * uFeature + w * 0.4);
    seams = 1.0 - smoothstep(0.0, 0.025, plates.y - plates.x);
  }
  float craters = craterField(p, 5.0 * uFeature) * uCraters * 0.6 + craterField(p + 2.2, 14.0 * uFeature) * uCraters * 0.3;
  float fresh = smoothstep(0.0, -0.3, craters);
  // Smooth seas where the metal pooled and set
  float sea = uVariant < 0.5 ? smoothstep(0.0, -0.2, base) : smoothstep(-0.25, -0.45, base) * 0.6;
  float oxide = smoothstep(0.0, 0.35, fbmN(q * 2.2 + w + 3.0, uOctaves - 1.0) + base * 0.5 - 0.05);
  oxide *= (1.0 - fresh) * (1.0 - sea);
  vec3 bare = mix(uLow, uMid, smoothstep(-0.5, 0.5, base + detail * 0.3));
  bare = mix(bare, uMid * 1.15, max(fresh * 0.6, sea * 0.3));
  vec3 crust = mix(uAccent, uHigh * 0.6, 0.3) * (0.5 + 0.5 * fbmN(q * 12.0, 3.0));
  albedo = mix(bare, crust, oxide);
  albedo = mix(albedo, uHigh, seams * 0.8);
  metal = 1.0 - oxide * 0.95;
  spec = mix(1.0, 0.08, oxide);
  rough = mix(uRoughness * (1.0 + grooves * grooveAmount * 0.6 + detail * 0.4) * (1.0 - sea * 0.7), 0.85, oxide);
  height = (base * 0.005 * (1.0 - sea * 0.8) + craters * 0.006 - seams * 0.004 + grooves * grooveAmount * 0.0006 + flow * castAmount * 0.0015 + oxide * detail * 0.002) * uRelief;
  landMask = 0.3;

#elif defined(FAMILY_CRYSTAL)
  // Fields of crystal breaking out of dark rock: each crystal a flat, tilted face that
  // flashes when it catches the star, coloured by thin-film interference. Variants:
  // 0 clustered fields, 1 long shards (aligned), 2 geodes (rings of crystals in
  // basins), 3 a fine druse covering everything
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp;
  float base = fbm(q * 1.2 + w);
  vec3 sq = q;
  if (uVariant > 0.5 && uVariant < 1.5) sq += normalize(hash33(uSeed) - 0.5) * dot(q, normalize(hash33(uSeed) - 0.5)) * 2.5;
  float scale = (uVariant > 2.5 ? 16.0 : 6.0) * uFeature;
  vec3 cells = cellular(sq * scale + w);
  float field = uVariant > 2.5 ? 1.0 : smoothstep(-0.05, 0.2, fbmN(q * 1.4 + w + 2.0, 5.0));
  if (uVariant > 1.5 && uVariant < 2.5) {
    vec3 geode = cellular(q * 1.6 * uFeature);
    float ring = exp(-pow((geode.x - 0.38) / 0.12, 2.0));
    field = max(field * 0.3, ring);
  }
  float edges = 1.0 - smoothstep(0.0, 0.05, cells.y - cells.x);
  vec3 tilt = hash33(vec3(cells.z * 131.0, cells.z * 17.0, 3.0)) - 0.5;
  vec3 crystal = mix(uMid, uHigh, fract(cells.z * 9.1));
  crystal = mix(crystal, uAccent, smoothstep(0.85, 1.0, fract(cells.z * 4.7)) * 0.7);
  albedo = mix(uLow * (0.8 + 0.3 * base), crystal, field * (1.0 - edges * 0.6));
  height = (base * 0.004 + field * (dot(p, tilt) * 0.05 + (1.0 - cells.x) * 0.004)) * uRelief;
  rough = mix(0.7, uRoughness, field);
  spec = mix(0.05, 1.0, field);
  landMask = 0.2;

#elif defined(FAMILY_DIAMOND)
  // A diamond world. The crust is grown crystal: grains, each a crystal with its own
  // cleavage directions, cut into flat facets along three families of planes, with
  // growth terraces and triangular etch pits (trigons) on the faces. Its colour is not
  // painted on: it is the light it reflects, refracts and disperses (see the shading
  // below). Variants: 0 polycrystalline grains, 1 a single giant crystal (big facets,
  // stepped terraces), 2 diamond breaking through plains of dark graphite, 3 frosted
  // (a fine, sugar-like crust of tiny crystals)
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp;
  bool oneCrystal = uVariant > 0.5 && uVariant < 1.5;
  vec3 grains = cellular(q * 1.8 * uFeature + w * 0.5);
  float grainId = oneCrystal ? 0.37 : grains.z;
  float boundary = oneCrystal ? 0.0 : 1.0 - smoothstep(0.0, 0.03, grains.y - grains.x);
  // Each grain its own growth direction (for the zoning seen inside)
  vec3 a1 = normalize(hash33(uSeed + grainId * 13.0 + 1.0) - 0.5);
  float k = (uVariant < 0.5 ? 14.0 : oneCrystal ? 7.0 : uVariant < 2.5 ? 16.0 : 40.0) * uFeature;
  // Facets: irregular flat faces, stretched a little along the grain's direction
  vec3 fq = q * k + a1 * dot(q, a1) * k * 0.6 + w * 0.6;
  vec3 facets = cellular(fq);
  vec3 cellId = vec3(facets.z * 97.0, grainId * 31.0, facets.z * 13.0);
  float edge = facets.y - facets.x;
  // Each facet leans its own way (applied to the normal below)
  vec3 facetTilt = hash33(cellId + uSeed) - 0.5;
  float base = fbm(q * 0.8);
  // Growth terraces across the faces of a big crystal; small triangular etch pits
  float terraceS = dot(q, a1) * k * 1.5;
  float terrace = oneCrystal ? 1.0 - smoothstep(0.0, 0.06, min(fract(terraceS), 1.0 - fract(terraceS))) : 0.0;
  vec3 pits = cellular(fq * 3.0);
  float trigon = smoothstep(0.12, 0.08, pits.x) * step(0.75, fract(pits.z * 5.3)) * clamp(uOctaves - 4.0, 0.0, 1.0);
  // Graphite plains (variant 2): the same carbon, unpressed, dark and dully lustrous
  float graphite = uVariant > 1.5 && uVariant < 2.5 ? smoothstep(0.05, -0.15, fbmN(q * 1.3 + w, 5.0)) : 0.0;
  albedo = mix(uLow, uHigh * (0.8 + 0.4 * fbmN(q * 9.0, 3.0)), graphite);
  height = (base * 0.003 - boundary * 0.003 - trigon * 0.002 - terrace * 0.001) * uRelief;
  rough = mix(uVariant > 2.5 ? 0.08 : uRoughness, 0.4, graphite);
  spec = 1.0;
  landMask = 0.1;

#elif defined(FAMILY_MIRROR)
  // A mirror world: a deck of metal clouds, smooth enough to mirror the sky, in faint
  // lanes where it thickens and roughens; slow ripples ruffle the reflections
  float drift = uTime * 0.004;
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp * 0.5;
  float lanes = sin(p.y * uBandFreq * 0.7 + fbmN(vec3(p.x * 2.0, p.y * 6.0, p.z * 2.0) + uSeed + w + vec3(drift), 4.0) * 2.0);
  float ripple = fbmN(vec3(p.x * 6.0, p.y * 30.0, p.z * 6.0) + uSeed + vec3(drift * 2.0), uOctaves - 1.0);
  // The deck churns in convection cells, like any cloud layer heated from below: each a
  // faintly domed top, the downdrafts between them rougher and a little duller. Two scales,
  // the finer one only where the view resolves it; the domes tilt the reflections a little
  vec3 cells = cellular(q * 4.0 * uFeature + w + vec3(drift));
  vec3 fineCells = cellular(q * 13.0 * uFeature + w * 1.5 + vec3(drift * 1.6));
  float fineSeen = clamp(uOctaves - 4.0, 0.0, 1.0);
  float domes = (1.0 - cells.x * cells.x) * 0.7 + (1.0 - fineCells.x * fineCells.x) * 0.3 * fineSeen;
  // (broad, soft downdrafts: a cloud deck's lanes, not cracks)
  float downdraft = (1.0 - smoothstep(0.0, 0.3, cells.y - cells.x)) * 0.6 + (1.0 - smoothstep(0.0, 0.2, fineCells.y - fineCells.x)) * 0.25 * fineSeen;
  albedo = mix(uLow, uLow * 0.82, smoothstep(-0.2, 1.0, lanes) * uBands * 0.6);
  albedo *= 1.0 - downdraft * 0.06;
  height = (lanes * 0.0008 + ripple * 0.0004) * uBands + domes * 0.0005 - downdraft * 0.0002;
  rough = uRoughness * (1.0 + smoothstep(0.3, 1.0, lanes) * 1.5 + downdraft * 1.2);
  spec = 1.0;
  metal = 1.0;

#elif defined(FAMILY_ICE)
  // Variants after the real icy moons: 0 Europa (long double ridges, rust-stained
  // lineae), 1 Enceladus (smooth, with "tiger stripes" at one pole), 2 Callisto (dirty
  // ice saturated with bright craters), 3 Triton (cantaloupe dimples)
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp;
  float base = fbm(q * 1.4 + w);
  float lines = 0.0;
  float craters = craterField(p, 6.0 * uFeature) * uCraters * 0.4;
  albedo = mix(uLow, uMid, smoothstep(-0.4, 0.4, base));
  if (uVariant < 0.5) {
    float l1 = pow(1.0 - abs(snoise(q * 3.0 * uFeature + w * 2.0)), 22.0);
    float l2 = pow(1.0 - abs(snoise(q * 7.0 * uFeature + 4.0 + w)), 26.0) * clamp(uOctaves - 4.0, 0.0, 1.0);
    lines = max(l1, l2 * 0.8);
    albedo = mix(albedo, uAccent, lines * 0.85);
    // Chaos terrain: blotches where the crust broke and refroze
    albedo = mix(albedo, uAccent * 0.8, smoothstep(0.55, 0.75, fbmN(q * 2.0 + 9.0, 4.0)) * 0.5);
  } else if (uVariant < 1.5) {
    vec3 pole = vec3(0.0, -1.0, 0.0);
    float polar = smoothstep(0.55, 0.85, dot(p, pole));
    float stripes = pow(abs(sin(dot(p, normalize(vec3(1.0, 0.0, 0.4))) * 28.0 + fbmN(q * 2.0, 3.0) * 2.0)), 14.0) * polar;
    lines = stripes;
    albedo = mix(uMid * 1.05, uAccent * 0.9, stripes * 0.8);
    craters *= smoothstep(0.3, -0.1, dot(p, pole));
  } else if (uVariant < 2.5) {
    craters = craterField(p, 5.0 * uFeature) * 0.7 + craterField(p + 3.0, 13.0 * uFeature) * 0.4 + craterField(p + 7.0, 30.0) * 0.2 * clamp(uOctaves - 5.0, 0.0, 1.0);
    albedo = mix(uAccent * 0.6, uLow, smoothstep(-0.3, 0.3, base));
    albedo = mix(albedo, uMid * 1.1, smoothstep(0.1, 0.4, craters));
  } else {
    vec3 dimples = cellular(q * 9.0 * uFeature + w);
    float cup = smoothstep(0.0, 0.5, dimples.x);
    lines = (1.0 - smoothstep(0.0, 0.08, dimples.y - dimples.x)) * 0.6;
    albedo = mix(albedo * 0.92, albedo * 1.05, cup);
    albedo = mix(albedo, uAccent, lines * 0.4);
    base += cup * 0.4;
  }
  height = (base * 0.004 + lines * 0.002 + craters * 0.005) * uRelief;
  landMask = 0.2;

#elif defined(FAMILY_LAVA)
  vec3 warp = vec3(fbmN(q * 2.0, 3.0), fbmN(q * 2.0 + 4.1, 3.0), fbmN(q * 2.0 + 8.3, 3.0));
  float flicker = 0.85 + 0.15 * snoise(q * 6.0 + vec3(uTime * 0.4));
  float crust = fbm(q * 3.0);
  float glow;
  vec3 hot;
  if (uStyle < 0.5) {
    // Lava world: a black crust of plates, irregular (warped cells) and of many sizes;
    // glowing seams between them, and pools of molten rock in the low ground
    vec3 cells = cellular(q * 5.5 + warp * 1.4);
    vec3 fine = cellular(q * 14.0 + warp * 2.0);
    float seam = cells.y - cells.x;
    float cracks = (1.0 - smoothstep(0.0, 0.035 + 0.03 * uEmission, seam)) * (0.6 + 0.4 * snoise(q * 9.0));
    cracks = max(cracks, (1.0 - smoothstep(0.0, 0.03, fine.y - fine.x)) * 0.35 * clamp(uOctaves - 4.0, 0.0, 1.0));
    float molten = smoothstep(0.42 - uEmission * 0.3, 0.62 - uEmission * 0.3, -fbm(q * 0.8 + warp * 0.5 + vec3(0.0, 0.0, uTime * 0.003)));
    glow = clamp(max(cracks, molten), 0.0, 1.0) * flicker;
    albedo = mix(uLow, uMid, smoothstep(-0.3, 0.4, crust));
    albedo = mix(albedo, uHigh, smoothstep(0.4, 0.8, fract(cells.z * 7.0)) * 0.35);
    albedo *= 1.0 - glow * 0.9;
    // Deep red at the edges of a flow, orange, then yellow where it is hottest
    hot = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.42, 0.06), smoothstep(0.2, 0.7, glow));
    hot = mix(hot, vec3(1.0, 0.78, 0.35), smoothstep(0.8, 1.0, glow) * molten);
    height = (crust * 0.005 + (1.0 - glow) * 0.006 * (1.0 - cells.x)) * uRelief;
  } else if (uStyle < 1.5) {
    // Magma ocean: the whole surface is molten. Convection wells up hot in the middle of
    // each cell (yellow), cools as it spreads (orange, red) and skins over into dark
    // rafts of crust that drift and pile up where the cells meet, cracking as they go
    float t = uTime * 0.003;
    vec3 conv = cellular(q * 2.0 * uFeature + warp * 0.9 + vec3(0.0, 0.0, t));
    float streak = fbmN(q * 9.0 + warp * 2.5 + vec3(t * 3.0), uOctaves - 1.0);
    float raft = smoothstep(0.4, 0.14, conv.y - conv.x + streak * 0.12);
    raft *= smoothstep(-0.25, 0.15, fbmN(q * 6.0 + warp * 2.0 + vec3(t * 2.0), 4.0) + 0.3);
    vec3 rc = cellular(q * 12.0 + warp * 2.0);
    float raftCracks = (1.0 - smoothstep(0.0, 0.04, rc.y - rc.x)) * raft;
    float heat = clamp(1.0 - conv.x * 2.2 + streak * 0.35, 0.0, 1.0);
    glow = clamp((1.0 - raft) * (0.55 + 0.45 * heat) + raftCracks * 0.6, 0.0, 1.0) * flicker;
    albedo = mix(mix(uLow, uMid, smoothstep(-0.3, 0.4, crust)), vec3(0.04, 0.015, 0.008), 1.0 - raft);
    hot = mix(vec3(0.6, 0.08, 0.01), vec3(1.0, 0.45, 0.07), heat);
    hot = mix(hot, vec3(1.0, 0.85, 0.45), smoothstep(0.75, 1.0, heat) * (1.0 - raft));
    height = (raft * 0.004 + crust * 0.002 * raft + streak * 0.0004) * uRelief;
  } else {
    // Molten core: the crust has been torn open down to the mantle. Huge dark slabs drift
    // apart over wide chasms of white-hot rock; each slab still glows red along its
    // edges as it cools, and is crazed with fine glowing cracks
    vec3 slabs = cellular(q * 1.6 * uFeature + warp * 0.6);
    float gap = slabs.y - slabs.x + snoise(q * 5.0) * 0.025;
    float chasm = 1.0 - smoothstep(0.04, 0.1 + 0.04 * uEmission, gap);
    float rim = exp(-max(gap, 0.0) / 0.12) * (1.0 - chasm);
    vec3 fine = cellular(q * 10.0 + warp * 1.5);
    float crazing = (1.0 - smoothstep(0.0, 0.025, fine.y - fine.x)) * clamp(uOctaves - 3.0, 0.0, 1.0) * (0.3 + 0.7 * rim);
    glow = clamp(chasm + rim * 0.55 + crazing * 0.45, 0.0, 1.0) * flicker;
    albedo = mix(uLow, uHigh, smoothstep(-0.3, 0.5, crust)) * (1.0 - chasm);
    albedo = mix(albedo, vec3(0.22, 0.1, 0.07), rim * 0.6);
    hot = mix(vec3(0.7, 0.12, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.3, 0.8, glow));
    hot = mix(hot, vec3(1.0, 0.93, 0.75), chasm);
    height = ((1.0 - chasm) * 0.008 + crust * 0.003 - crazing * 0.001) * uRelief;
  }
  hot = mix(hot, uEmissive * 1.2, 0.2);
  emission = hot * glow * (0.9 + 1.1 * uEmission);

#elif defined(FAMILY_GAS) || defined(FAMILY_VEILED)
  vec3 g = p;
  // Storms: a few vortices twist the flow around them
  for (int i = 0; i < 3; i++) {
    vec3 centre = normalize(hash33(uSeed + float(i) * 17.0) - 0.5);
    centre.y *= 0.5;
    centre = normalize(centre);
    float r = 0.12 + 0.12 * hash33(uSeed + float(i) * 5.0).x;
    float d = distance(g, centre);
    float swirl = smoothstep(r, 0.0, d) * uStorms * 3.5;
    if (swirl > 0.0) {
      vec3 axis = centre;
      float a = swirl;
      g = g * cos(a) + cross(axis, g) * sin(a) + axis * dot(axis, g) * (1.0 - cos(a));
    }
  }
  float t = uTime * 0.01;
  // No solid surface: each band runs at its own speed, east or west, so the clouds shear
  g = rotY(g, uTime * 0.0004 * sin(g.y * uBandFreq * 0.5 + uSeed.x));
  float turbulence = fbmN(vec3(g.x * 2.5, g.y * 9.0, g.z * 2.5) + uSeed + vec3(t, 0.0, -t), uOctaves);
  float y = g.y + turbulence * 0.05 * (0.6 + uBands);
  // Waves curl along the edges where bands slide past each other
  y += sin(atan(g.z, g.x) * 22.0 + y * 60.0 + t * 3.0) * 0.006 * clamp(uOctaves - 3.0, 0.0, 1.0);
  float band = sin(y * uBandFreq + sin(y * 5.0 + uSeed.y) * 1.5);
  float fine = fbmN(vec3(g.x * 6.0, g.y * 40.0, g.z * 6.0) + uSeed + vec3(t * 2.0), uOctaves - 1.0);
  float b = band * (0.35 + uBands * 0.75) + fine * 0.45;
  albedo = mix(uMid, uLow, smoothstep(-0.6, 0.6, b));
  albedo = mix(albedo, uHigh, smoothstep(0.55, 1.0, b) * 0.8);
  albedo = mix(albedo, uAccent, smoothstep(-0.7, -1.0, b) * 0.6);
  // Storm ovals stand out in their own colour
  for (int i = 0; i < 3; i++) {
    vec3 centre = normalize(hash33(uSeed + float(i) * 17.0) - 0.5);
    centre.y *= 0.5;
    centre = normalize(centre);
    float r = 0.12 + 0.12 * hash33(uSeed + float(i) * 5.0).x;
    float oval = smoothstep(r * 0.7, r * 0.3, distance(p, centre)) * uStorms;
    albedo = mix(albedo, mix(uAccent, uHigh, 0.3 * float(i)), oval * 0.55);
  }
#if defined(FAMILY_GAS)
  // Variants: 0 Jupiter (as above), 1 Saturn (a hexagonal jet stream round the pole),
  // 2 Neptune (a dark spot and bright high clouds), 3 turbulent (no clear bands)
  if (uVariant > 0.5 && uVariant < 1.5) {
    float ang = atan(p.z, p.x);
    float hexR = 0.33 * (1.0 + 0.08 * cos(6.0 * ang + uSeed.x));
    float rad = length(p.xz);
    float hex = exp(-pow((rad - hexR) / 0.025, 2.0)) * step(0.0, p.y);
    albedo = mix(albedo, uAccent, hex * 0.6);
    albedo = mix(albedo, albedo * 0.75, smoothstep(hexR, hexR * 0.5, rad) * step(0.0, p.y) * 0.5);
  } else if (uVariant > 1.5 && uVariant < 2.5) {
    vec3 spotC = normalize(vec3(0.6, -0.35, 0.7) + (hash33(uSeed) - 0.5) * 0.5);
    float spot = smoothstep(0.16, 0.06, distance(p, spotC));
    albedo = mix(albedo, uAccent * 0.45, spot);
    float streaks = smoothstep(0.55, 0.8, fbmN(vec3(g.x * 3.0, g.y * 30.0, g.z * 3.0) + uSeed + 9.0, 4.0));
    albedo = mix(albedo, vec3(0.95), streaks * 0.75);
  } else if (uVariant > 2.5) {
    float churn = fbmN(g * 4.0 + vec3(t), uOctaves);
    albedo = mix(albedo, mix(uLow, uHigh, 0.5 + 0.5 * churn), 0.6);
  }
  if (uStyle > 0.5 && uStyle < 1.5) {
    // Ice giant: a deep methane haze softens the bands into faint stripes; bright methane
    // clouds ride high above it in long streaks, and a paler haze hoods one pole
    albedo = mix(albedo, mix(uLow, uMid, 0.5 + 0.5 * band), 0.5);
    float streaks = smoothstep(0.45, 0.8, fbmN(vec3(g.x * 3.0, g.y * 28.0, g.z * 3.0) + uSeed + 13.0, 4.0));
    streaks *= smoothstep(0.08, 0.25, alat) * (1.0 - smoothstep(0.7, 0.85, alat));
    albedo = mix(albedo, uHigh, streaks * 0.85);
    albedo = mix(albedo, mix(uLow, uHigh, 0.55), smoothstep(0.6, 0.92, lat) * 0.6);
  } else if (uStyle > 2.5 && uStyle < 3.5) {
    // Super-puff: so tenuous an envelope that its bands wash out into a soft pastel haze
    float haze = fbmN(g * 1.5 + uSeed + vec3(t * 0.5), 4.0);
    // Super-puff: below its haze's top there is only more haze, as optically thick as you
    // like, never a banded deck: the same colour HAZE_FRAGMENT gives it, seamless with it
    albedo = mix(uLow, uHigh, 0.5 + 0.15 * fbmN(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + uSeed, 3.0));
  } else if (uStyle > 3.5) {
    // Ruby cloud, an ultra-hot giant split in two (WASP-121 b): on the day side the
    // corundum evaporates and the sky burns cloudless, hottest east of the substellar point
    // where the winds carry the heat; on the night side it condenses into decks of ruby and
    // sapphire (uLow, uMid), pale crests, wine-red troughs where it rains out
    vec3 lightObj = uWorldToObject * uLightDir;
    vec3 hotDir = rotY(lightObj, 0.35);
    float dayness = smoothstep(-0.25, 0.35, dot(p, lightObj));
    vec3 gems = mix(uMid, uLow, smoothstep(-0.45, 0.45, b));
    gems = mix(gems, uAccent, smoothstep(-0.3, -0.9, b) * 0.5);
    gems = mix(gems, uHigh, smoothstep(0.8, 1.15, b) * 0.4);
    albedo = mix(gems, gems * 0.2, dayness);
    rubyHeat = smoothstep(-0.1, 0.9, dot(p, hotDir)) * (0.8 + 0.2 * fine);
  }
#endif
  // Hazy, darker poles (not under a Super Puff's haze, which is the same everywhere)
  if (uStyle < 2.5 || uStyle > 3.5) albedo *= 1.0 - smoothstep(0.75, 0.98, alat) * 0.35;
  // Nothing to cast bumps: the light sinks into the haze
  height = 0.0;
  emission = uEmissive * uEmission * smoothstep(0.2, 0.9, fine + band * 0.3) * 0.6;

#elif defined(FAMILY_EXOTIC)
  // Exotic matter: a glassy, iridescent crust laid out in an impossible geometry, glowing
  // along its seams; the pattern slowly drifts as if alive. Variants: 0 hexagons,
  // 1 triangles, 2 concentric shells, 3 interference waves
  vec3 w = vec3(fbmN(q, 3.0), fbmN(q + 4.4, 3.0), fbmN(q + 8.8, 3.0)) * uWarp;
  float drift = uTime * 0.01;
  float pattern;
  if (uVariant < 0.5) {
    vec3 cells = cellular(q * 6.0 * uFeature + w * 0.3);
    pattern = 1.0 - smoothstep(0.0, 0.06, cells.y - cells.x);
  } else if (uVariant < 1.5) {
    vec3 a = vec3(dot(q, vec3(1.0, 0.0, 0.0)), dot(q, vec3(-0.5, 0.0, 0.866)), dot(q, vec3(-0.5, 0.0, -0.866))) * 8.0 * uFeature + p.y * 5.0;
    vec3 fr = abs(fract(a) - 0.5);
    pattern = 1.0 - smoothstep(0.0, 0.05, min(min(fr.x, fr.y), fr.z));
  } else if (uVariant < 2.5) {
    float r = acos(clamp(dot(p, normalize(uSeed - 50.0)), -1.0, 1.0));
    pattern = pow(abs(sin(r * 30.0 * uFeature - drift * 3.0 + fbmN(q, 3.0) * 2.0)), 20.0);
  } else {
    pattern = pow(abs(sin(dot(p, normalize(hash33(uSeed) - 0.5)) * 40.0 + drift * 4.0) * sin(dot(p, normalize(hash33(uSeed + 3.0) - 0.5)) * 40.0 - drift * 3.0)), 6.0);
  }
  float base = fbm(q * 1.5 + w + vec3(drift));
  albedo = mix(uLow, uMid, smoothstep(-0.5, 0.5, base));
  albedo = mix(albedo, uHigh, pattern * 0.5);
  float pulse = 0.7 + 0.3 * sin(uTime * 0.8 + base * 6.0);
  emission = uEmissive * pattern * pulse * uEmission * 1.6;
  height = (base * 0.004 + pattern * 0.002) * uRelief;
  spec = 0.8;
  rough = uRoughness;

#elif defined(FAMILY_ANOMALY)
  // An anomaly: a black, light-swallowing body wrapped in slow whorls of something that
  // glows, flowing towards one point. It barely reflects the star; it lights itself
  vec3 sink = normalize(uSeed - 50.0);
  float toSink = acos(clamp(dot(p, sink), -1.0, 1.0));
  vec3 axis = sink;
  float a = toSink * 4.0 - uTime * 0.05;
  vec3 g = p * cos(a) + cross(axis, p) * sin(a) + axis * dot(axis, p) * (1.0 - cos(a));
  float whorl = fbmN(g * 3.0 * uFeature + vec3(uTime * 0.01), uOctaves);
  float filaments = pow(1.0 - abs(whorl), 12.0);
  albedo = mix(uLow, uHigh, smoothstep(0.2, 0.7, whorl) * 0.3);
  emission = uEmissive * (filaments * 1.5 + exp(-toSink * 3.0) * 1.2) * uEmission;
  height = whorl * 0.002;
  spec = 0.1;
#endif

  vec3 n = bumped(vWorldPos, ng, height * 1.6);
#if defined(FAMILY_DIAMOND)
  // Flat facets: one normal per face, leaning its own way (no bump seams at the edges)
  vec3 lean = facetTilt - p * dot(facetTilt, p);
  n = normalize(n + normalize(transpose(uWorldToObject) * lean) * length(lean) * 1.3 * (1.0 - graphite));
#endif

  // Cloud shadows: the deck as seen from the star, slightly offset
#if !defined(FAMILY_GAS) && !defined(FAMILY_VEILED)
  float shadow = 1.0;
  if (uClouds > 0.01) {
    vec3 toSunObj = uWorldToObject * uLightDir;
    shadow = 1.0 - 0.4 * cloudDensity(normalize(p + toSunObj * 0.006), max(uOctaves - 3.0, 3.0));
  }
#else
  float shadow = 1.0;
#endif
#if defined(HAS_RINGS)
  // The rings' shadow: where the ray to the star crosses the ring plane
  float ln = dot(uLightDir, uRingNormal);
  if (abs(ln) > 1e-4) {
    float tr = -dot(vWorldPos, uRingNormal) / ln;
    if (tr > 0.0) shadow *= 1.0 - 0.85 * ringDensity(length(vWorldPos + uLightDir * tr) / uPlanetRadius);
  }
#endif

  float day = daylight(n, ng);
  vec3 sun = uSunColor * uSunIntensity;
  vec3 ambient = vec3(0.012, 0.014, 0.02) + albedo * 0.015;
  vec3 diffuse = albedo * (1.0 - metal) * sun * day * shadow;
#if defined(FAMILY_GAS) || defined(FAMILY_VEILED)
  // A deep atmosphere, not a surface: the light wraps softly past the terminator and the
  // limb darkens, as the line of sight runs through more haze
  float nlGas = dot(ng, uLightDir);
  diffuse = albedo * sun * smoothstep(-0.12, 0.55, nlGas) * (0.35 + 0.65 * max(nlGas, 0.0)) * mix(0.5, 1.0, pow(max(dot(ng, v), 0.0), 0.5)) * shadow;
#endif
  vec3 f0 = mix(vec3(0.02), albedo, metal) * mix(1.0, 3.0, spec * (1.0 - metal));
  vec3 highlight = specularGGX(n, v, max(rough, 0.05), f0) * sun * shadow * spec * smoothstep(-0.02, 0.1, dot(ng, uLightDir));
  float sunUp = smoothstep(-0.02, 0.1, dot(ng, uLightDir));
  vec3 r = reflect(-v, n);
#if defined(FAMILY_METAL)
  // Metal mirrors its surroundings: the dark sky above, a faint glow of the galaxy, and
  // the star's highlight stretched along the grooves
  // (a broad, polished sheen, unlike the pin-point sparks of crystal and diamond)
  ambient += metal * (albedo * (0.03 + 0.08 * smoothstep(-0.3, 0.6, r.y)) + albedo * pow(max(dot(r, uLightDir), 0.0), 3.0) * 0.1 * sunUp);
  highlight += metal * albedo * sun * pow(max(dot(r, uLightDir), 0.0), 14.0) * 0.5 * sunUp * shadow;
#elif defined(FAMILY_CRYSTAL)
  // Faces flash when they catch the star; thin-film colours shift with the angle
  float glint = pow(max(dot(r, uLightDir), 0.0), 300.0) * 5.0;
  highlight += sun * glint * spec * sunUp;
  vec3 iridescence = 0.5 + 0.5 * cos(6.2831 * (dot(n, v) * 1.8 + vec3(0.0, 0.33, 0.67)));
  diffuse = mix(diffuse, diffuse * iridescence * 1.5, spec * 0.45);
  ambient += albedo * 0.05 * spec;
#elif defined(FAMILY_DIAMOND)
  // Diamond is not lit like rock. What you see is (1) the sky and the star mirrored in
  // each facet (fresnel: 17 % head-on, a mirror at grazing angles); (2) light that went
  // in, bounced off a facet behind and came back out, bent by refraction and split into
  // colours (dispersion, the "fire"), or trapped inside (the dark facets that make the
  // sparkle read); (3) the stone itself, seen in depth: its body colour, growth zones,
  // inclusions, and the sunlight it soaks up
  float nv = max(dot(n, v), 0.0);
  float F = 0.17 + 0.83 * pow(1.0 - nv, 5.0);
  vec3 mirrored = diamondSky(r) * F;
  vec3 back = normalize(-ng + (hash33(cellId * 3.1 + 7.0) - 0.5) * 1.4);
  // Into the stone (parallax): look a little way below the facet
  vec3 inward = refract(-normalize(uWorldToObject * v), p, 1.0 / 2.42);
  vec3 pIn = p + inward * 0.04;
  float zoning = 0.5 + 0.5 * sin(dot(pIn * uContinentScale, a1) * k * 2.0 + fbmN(pIn * 6.0, 3.0) * 2.0);
  float inclusions = smoothstep(0.7, 0.9, fbmN(pIn * 18.0 + uSeed, 3.0));
  vec3 body = albedo * (0.75 + 0.25 * zoning) * (1.0 - inclusions * 0.7);
  float soak = smoothstep(-0.1, 0.5, dot(ng, uLightDir));
  // (dispersion a little stronger than real diamond's, so the fire reads from orbit)
  vec3 iorRGB = vec3(2.36, 2.42, 2.52);
  vec3 fireRGB = vec3(0.0);
  for (int c = 0; c < 3; c++) {
    vec3 tin = refract(-v, n, 1.0 / iorRGB[c]);
    vec3 tout = refract(reflect(tin, back), -n, iorRGB[c]);
    if (dot(tout, tout) > 0.0) {
      vec3 d = normalize(tout);
      // Where the traced ray leads: the star itself (fire), or the sunlit body of the
      // stone, glowing with the light it has soaked up
      float glow = pow(0.5 + 0.5 * dot(d, uLightDir), 5.0);
      fireRGB[c] = diamondSky(d)[c] + (body * sun)[c] * glow * soak * 0.9;
    }
  }
  fireRGB *= (1.0 - F) * shadow;
  vec3 inner = body * sun * soak * 0.06 * shadow;
  // Facet edges and grain boundaries catch a thin line of light
  inner += sun * soak * (1.0 - smoothstep(0.0, 0.025, edge)) * 0.05 * (1.0 - boundary);
  vec3 stone = mirrored + fireRGB + inner;
  diffuse = mix(stone, diffuse, graphite);
  highlight *= graphite;
  ambient = mix(vec3(0.004, 0.005, 0.008) + albedo * 0.01, ambient, graphite);
#elif defined(FAMILY_MIRROR)
  // Chrome: nearly all it shows is what it mirrors, tinted by the metal and brighter at
  // grazing angles (Schlick); a little diffuse light from the cloud deck itself
  float nvM = max(dot(n, v), 0.0);
  vec3 fresnel = albedo + (1.0 - albedo) * pow(1.0 - nvM, 5.0);
  ambient = mirrorSky(r, rough, length(fwidth(r))) * fresnel;
  diffuse = albedo * sun * day * shadow * 0.06;
  highlight = specularGGX(n, v, max(rough, 0.03), albedo) * sun * shadow * sunUp;
  // Thousands of degrees hot, it glows by its own heat, but a mirror is a poor emitter
  // (Kirchhoff: what it reflects it cannot radiate), so faintly: through its clouds most
  // where the downdrafts open onto the hotter depths, and only where it isn't drowned out
  // by the starlight it mirrors. uEmissive is the blackbody colour at its temperature,
  // uEmission its emissivity times how hot (looks.ts)
  emission = uEmissive * uEmission * (1.0 - fresnel.g * 0.6) * (0.25 + 0.75 * downdraft);
#endif
#if defined(FAMILY_GAS)
  if (uStyle > 3.5) {
    // The day side glows by its own heat, orange to white-hot at the hottest spot
    emission += mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.8, 0.55), rubyHeat * rubyHeat) * rubyHeat * uEmission * 2.0;
    // The gem front: along the terminator, where the corundum condenses, crystals at every
    // angle catch the grazing starlight and sparkle ruby or sapphire. Each twinkles slowly
    // (cycles of several seconds, nothing like a flash), and they fade out before they
    // shrink below a few pixels
    float scale = 70.0;
    vec3 gem = gemCrystal(p * scale + uSeed, p);
    float facet = fract(gem.z * 91.7);
    vec3 axis = normalize(hash33(vec3(gem.z * 37.0, facet, 1.0)) - 0.5);
    vec3 nf = normalize(ng + (transpose(uWorldToObject) * axis) * 0.9);
    float resolved = 1.0 - smoothstep(0.2, 0.6, length(fwidth(p)) * scale);
    float front = 1.0 - smoothstep(0.0, 0.25, abs(dot(ng, uLightDir) - 0.04));
    float twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.2 + facet * 40.0));
    float glint = pow(max(dot(reflect(-v, nf), uLightDir), 0.0), 4.0) * gem.x * step(0.45, facet) * front * twinkle * resolved;
    highlight += sun * glint * 3.0 * mix(vec3(1.0, 0.12, 0.2), vec3(0.25, 0.45, 1.0), step(0.72, facet));
  }
#endif
  vec3 color = diffuse + highlight + ambient;

  // Silicon life: a network of faintly glowing veins over the ground, brighter at night
  if (uLifeGlow > 0.0) {
    float veins = pow(1.0 - abs(snoise(q * 5.0)), 20.0) + pow(1.0 - abs(snoise(q * 13.0 + 3.0)), 24.0) * 0.6;
    float pulse = 0.7 + 0.3 * sin(uTime * 0.6 + snoise(q * 2.0) * 6.0);
    emission += vec3(0.35, 0.85, 1.0) * veins * pulse * uLifeGlow * 0.9;
  }

  // Night side: cities and glowing ground
  float night = 1.0 - smoothstep(-0.12, 0.08, dot(ng, uLightDir));
  if (uCityLights > 0.0) {
    float clusters = smoothstep(0.15, 0.45, fbmN(q * 4.0 + vec3(11.0), 3.0));
    float sprawl = smoothstep(0.25, 0.65, snoise(q * 70.0)) + smoothstep(0.55, 0.8, snoise(q * 160.0)) * 0.6;
    color += vec3(1.0, 0.72, 0.38) * clusters * sprawl * landMask * night * uCityLights * 1.6;
  }
  color += emission * (0.35 + 0.65 * night);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Ha=`
${le}
${Be}
${Ye}
${Mt}
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 p = normalize(vObj);
  vec3 ng = normalize(vWorldNormal);
  float d = cloudDensity(p, uOctaves);
  if (d < 0.01) discard;
  vec3 v = normalize(cameraPosition - vWorldPos);
  float nl = dot(ng, uLightDir);
  // Soft terminator; thin edges glow when back-lit
  float lit = smoothstep(-0.18, 0.35, nl);
  float rim = pow(1.0 - max(dot(ng, v), 0.0), 3.0) * max(dot(-v, uLightDir), 0.0);
  vec3 sun = uSunColor * uSunIntensity;
  vec3 color = uCloudColor * (sun * (lit * (0.85 + 0.15 * d) + rim * 0.5) + vec3(0.01));
  // Sunset tint along the terminator
  color *= mix(vec3(1.0), vec3(1.0, 0.6, 0.35), smoothstep(0.25, 0.0, nl) * step(-0.18, nl));
  gl_FragColor = vec4(color, pow(d, 1.3) * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,ja=`
${le}
${Be}
${Ye}
uniform float uPlanetRadius;
uniform vec4 uHaze;  // x scale height (radii), y 1 if any
varying vec3 vObj;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

// Where a ray from o along d enters and leaves a sphere of radius r at the origin
vec2 sphereHit(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  float H = max(uHaze.x, 1e-3);
  float R = uPlanetRadius;
  vec3 d = normalize(vWorldPos - cameraPosition);
  vec3 closest = cameraPosition - d * dot(cameraPosition, d);
  float b = length(closest) / R;
  float tau = exp(-(b - 1.0) / H);
  float alpha = 1.0 - exp(-tau);
  if (alpha < 0.003) discard;
  // The haze's colour, uniform but for the faintest of latitude shading
  vec3 p = normalize(vObj);
  vec3 haze = mix(uLow, uHigh, 0.5 + 0.15 * fbmN(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + uSeed, 3.0));
  // Lit where the line of sight meets the haze's tau = 1 level (the radius R), or at its
  // closest approach where it passes above it
  vec2 hit = sphereHit(cameraPosition, d, R);
  vec3 n = b < 1.0 && hit.x > 0.0 ? normalize(cameraPosition + d * hit.x) : normalize(closest);
  float nl = dot(n, uLightDir);
  float lit = smoothstep(-0.25, 0.45, nl) * (0.45 + 0.55 * max(nl, 0.0));
  float mu = dot(d, uLightDir);
  float g = 0.7;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
  vec3 sun = uSunColor * uSunIntensity;
  // (tholin haze is dark-ish, Titan's albedo is some 0.2: it never glares)
  vec3 color = haze * sun * (lit * 0.8 + phase * smoothstep(-0.3, 0.1, nl + 0.3)) + haze * 0.012;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Ba=`
varying vec3 vWorldPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`,$a=`
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform vec3 uBetaR;
uniform float uBetaM;
uniform float uScaleR;
uniform float uScaleM;
varying vec3 vWorldPos;

vec2 sphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 o = cameraPosition;
  vec3 d = normalize(vWorldPos - cameraPosition);
  vec2 shell = sphere(o, d, uAtmosphereRadius);
  if (shell.x > shell.y) discard;
  vec2 ground = sphere(o, d, uPlanetRadius);
  float t0 = max(shell.x, 0.0);
  float t1 = shell.y;
  if (ground.x > 0.0 && ground.x < t1) t1 = ground.x;
  if (t1 <= t0) discard;

  const int STEPS = 12;
  const int LIGHT_STEPS = 4;
  float ds = (t1 - t0) / float(STEPS);
  // A very tall envelope (a Super Puff's) shows its few steps as bands: jitter them per
  // pixel there; every other atmosphere samples the middle of each step, as always
  float offset = uAtmosphereRadius - uPlanetRadius > uPlanetRadius * 0.2 ? fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) : 0.5;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float depthR = 0.0, depthM = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 x = o + d * (t0 + ds * (float(i) + offset));
    float h = length(x) - uPlanetRadius;
    float hr = exp(-h / uScaleR) * ds;
    float hm = exp(-h / uScaleM) * ds;
    depthR += hr;
    depthM += hm;
    // Light path to the star; in the planet's shadow there is none
    vec2 toSun = sphere(x, uLightDir, uAtmosphereRadius);
    vec2 blocked = sphere(x, uLightDir, uPlanetRadius * 0.998);
    if (blocked.x > 0.0) continue;
    float dl = toSun.y / float(LIGHT_STEPS);
    float lr = 0.0, lm = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 y = x + uLightDir * dl * (float(j) + 0.5);
      float hy = length(y) - uPlanetRadius;
      lr += exp(-hy / uScaleR) * dl;
      lm += exp(-hy / uScaleM) * dl;
    }
    vec3 tau = uBetaR * (depthR + lr) + uBetaM * 1.1 * (depthM + lm);
    vec3 attenuation = exp(-tau);
    sumR += attenuation * hr;
    sumM += attenuation * hm;
  }
  float mu = dot(d, uLightDir);
  float phaseR = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
  float g = 0.76;
  float phaseM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 color = uSunColor * uSunIntensity * 1.6 * (sumR * uBetaR * phaseR + sumM * uBetaM * phaseM);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,Ya=1.45;class St{constructor(e,a,s,o,n,i=new Set,l=!1,d=0){this.look=e,this.mesh=a,this.scene=s,this.radius=o,this.shared={uLightDir:{value:new P(1,0,0)},uSunColor:{value:new z(1,1,1)},uSunIntensity:{value:Ya},uOctaves:{value:6},uTime:{value:0},uCloudSpin:{value:0},uWorldToObject:{value:this.worldToObject},uDeep:{value:e.deep},uShallow:{value:e.shallow},uLow:{value:e.low},uMid:{value:e.mid},uHigh:{value:e.high},uPeak:{value:e.peak},uAccent:{value:e.accent},uEmissive:{value:e.emissive},uSea:{value:e.seaLevel},uRelief:{value:e.relief},uContinentScale:{value:e.continentScale},uIceCap:{value:e.iceCap},uVegetation:{value:e.vegetation},uSpecular:{value:e.specular},uRoughness:{value:e.roughness},uMetal:{value:e.metal},uEmission:{value:e.emission},uCityLights:{value:e.cityLights},uCraters:{value:e.craters},uBands:{value:e.bands},uStorms:{value:e.storms},uClouds:{value:e.clouds},uCloudColor:{value:e.cloudColor},uSeed:{value:e.seed},uVariant:{value:e.variant},uStyle:{value:e.style},uWarp:{value:e.warp},uFeature:{value:e.featureScale},uLifeGlow:{value:e.lifeGlow},uBandFreq:{value:e.bandFrequency},uBloom:{value:e.bloom},uGalaxy:{value:new De}};const c={[`FAMILY_${e.family.toUpperCase()}`]:""};if(n?.has_rings&&n.bands?.length){const u=new z(13483940).lerp(e.mid,.25);this.rings=new ga(n,o,u,this.shared,l),s.add(this.rings.mesh),c.HAS_RINGS="",Object.assign(this.shared,{uRingBands:{value:this.rings.bands},uRingBandCount:{value:this.rings.bandCount},uRingSeed:{value:this.rings.seed},uRingSuper:{value:l?1:0},...this.rings.structure,uRingNormal:{value:this.rings.normal},uPlanetRadius:{value:o}})}if(this.surface=new Y({uniforms:this.shared,vertexShader:Oe,fragmentShader:Va,defines:c}),a.material=this.surface,d>0){const u=a.geometry;a.geometry=new X(o*(1-d*3),128,64),u.dispose()}if(e.clouds>.01){const u=new Y({uniforms:this.shared,vertexShader:Oe,fragmentShader:Ha,defines:c,transparent:!0,depthWrite:!1});this.cloudMesh=new E(new X(o*1.007,128,64),u),this.cloudMesh.name="realistic-clouds",s.add(this.cloudMesh)}if(d>0){const u=new Y({uniforms:{...this.shared,uPlanetRadius:{value:o},uHaze:{value:new De(d,1,0,0)}},vertexShader:Oe,fragmentShader:ja,defines:c,transparent:!0,depthWrite:!1,side:Pe});this.hazeMesh=new E(new X(o*(1+d*4),128,64),u),this.hazeMesh.name="realistic-haze",this.hazeMesh.renderOrder=1,s.add(this.hazeMesh)}if(e.atmosphereDensity>0){this.atmosphereRadius=o*(1+e.atmosphereHeight);const u=this.atmosphereRadius-o,t=u*.25,h=u*.1,g=new P(e.atmosphere.r,e.atmosphere.g,e.atmosphere.b);g.divideScalar(Math.max(g.x,g.y,g.z,.001));const m=g.multiplyScalar(.22*e.atmosphereDensity/t),p=.035*e.atmosphereDensity/h;this.atmosphereMaterial=new Y({uniforms:{uLightDir:this.shared.uLightDir,uSunColor:this.shared.uSunColor,uSunIntensity:this.shared.uSunIntensity,uPlanetRadius:{value:o},uAtmosphereRadius:{value:this.atmosphereRadius},uBetaR:{value:m},uBetaM:{value:p},uScaleR:{value:t},uScaleM:{value:h}},vertexShader:Ba,fragmentShader:$a,blending:ee,transparent:!0,depthWrite:!1}),this.atmosphereMesh=new E(new X(this.atmosphereRadius,128,64),this.atmosphereMaterial),this.atmosphereMesh.name="realistic-atmosphere",this.atmosphereMesh.renderOrder=2,s.add(this.atmosphereMesh)}e.family==="terran"&&e.atmosphereDensity>=.8&&i.add("aurora"),this.effects=new Wa(i,{scene:s,radius:o,seed:Math.floor(e.seed.x*1e4+e.seed.y*100),shared:this.shared})}surface;cloudMesh=null;hazeMesh=null;atmosphereMesh=null;atmosphereMaterial=null;shared;worldToObject=new ot;atmosphereRadius=0;rings=null;effects;update(e){const a=this.shared;a.uLightDir.value.copy(e.lightDir).normalize(),a.uSunColor.value.copy(e.sunColor);const s=e.camera.position.length(),o=Math.tan(se.degToRad(e.camera.fov/2)),n=this.radius/Math.max(s-this.radius*.98,1e-4)/o*e.viewportHeight*.5;a.uOctaves.value=se.clamp(Math.log2(Math.max(n,1))-.5,2.5,e.maxOctaves),a.uTime.value=e.elapsed%2e4;const i=e.galacticCore;a.uGalaxy.value.set(i?.x??0,i?.y??0,i?.z??0,i&&i.lengthSq()>0?1:0),a.uCloudSpin.value=e.elapsed/Math.max(e.rotationPeriod,3600)*Math.PI*2*.035%(Math.PI*2),this.mesh.updateMatrixWorld(),this.worldToObject.setFromMatrix4(this.mesh.matrixWorld).invert();for(const l of[this.cloudMesh,this.hazeMesh])l&&(l.position.copy(this.mesh.position),l.quaternion.copy(this.mesh.quaternion));this.atmosphereMesh&&this.atmosphereMaterial&&(this.atmosphereMaterial.side=s>this.atmosphereRadius*1.002?Pe:ht),this.effects.update(e.elapsed,performance.now()/1e3,this.mesh.quaternion)}setRingRoche(e){this.rings?.setRoche(e)}dispose(){this.surface.dispose(),this.rings?.dispose(),this.effects.dispose();for(const e of[this.cloudMesh,this.hazeMesh,this.atmosphereMesh])e&&(this.scene.remove(e),e.geometry.dispose(),e.material.dispose())}}const f=r=>new z(r);function Ua(r){let e=r%2147483647;return e<=0&&(e+=2147483646),()=>(e=e*16807%2147483647)/2147483647}function Xa(r){const e=String(r?.seeds?.planet_seed??r?.seeds?.shape_seed??r?.planet_info?.name??"atlas");let a=2166136261;for(let s=0;s<e.length;s++)a=Math.imul(a^e.charCodeAt(s),16777619);return Math.abs(a)||1}function G(r,e,a){const s={h:0,s:0,l:0};e.getHSL(s);const o=new z().setHSL(s.h,Math.min(s.s,.55),se.clamp(s.l,.25,.6));return r.clone().lerp(o,a)}function j(r,e,a=.03,s=.12){const o={h:0,s:0,l:0};return r.getHSL(o),new z().setHSL((o.h+(e()-.5)*a+1)%1,o.s,se.clamp(o.l*(1+(e()-.5)*s),0,1))}const ne=(r,e)=>e[Math.floor(r()*e.length)%e.length],Za={Breathable:{color:5213695,density:1},Thick:{color:13154458,density:1.8},Thin:{color:10467552,density:.35},"Carbon Dioxide":{color:14721136,density:1.2},Methane:{color:5941208,density:1},Nitrogen:{color:6262783,density:.9},"Oxygen-Rich":{color:7315711,density:1.1},"Sulfur Dioxide":{color:15258474,density:1.4},Superheated:{color:16742976,density:1.5},Acidic:{color:11063392,density:1.3},Toxic:{color:11563216,density:1.4},Hydrogen:{color:15775944,density:1},Helium:{color:16182472,density:.9},Ammonia:{color:15128720,density:1.1},Ionic:{color:4245759,density:1},Plasma:{color:16740544,density:1.2},"Exotic Gases":{color:12611839,density:1.2},"Water Vapor":{color:10277119,density:1.2},Frozen:{color:14216447,density:.6}};function _t(r){const e=r.original_planet_data??r.planet_info??{},a=String(r.planet_info?.type??e.planet_type??"Rocky").replace(/_/g," "),s=r.planet_info?.base_color,o=typeof s=="string"?new z(s):new z(8421504),n=Xa(r),i=Ua(n),l=Number(e.surface_temperature??r.planet_info?.surface_temperature??15),d=String(e.life_forms??r.life_forms?.type??"None"),c=String(r.atmosphere?.type??e.atmosphere??"None"),u=Za[c],t={family:"barren",variant:Math.floor(i()*4),style:0,warp:.3+i()*.9,featureScale:.7+i()*.9,deep:f(333358),shallow:f(1003374),low:f(5204782),mid:f(8022600),high:f(7037530),peak:f(15922422),accent:f(3103262),emissive:f(16752704),seaLevel:-2,relief:.8+i()*.6,continentScale:.8+i()*1.1,iceCap:2,vegetation:0,specular:.05,roughness:.85,metal:0,emission:0,cityLights:d==="Intelligent Life"?1:0,craters:0,lifeGlow:d==="Silicon-Based Life"?1:0,bloom:d==="Bacteria"?1:d==="Animal Life"||d==="Vegetation"?.35:d==="Vegetable Animals"?.6:0,clouds:0,cloudColor:f(16777215),atmosphere:f(u?u.color:8956671),atmosphereHeight:.025,atmosphereDensity:u?u.density:0,bands:0,bandFrequency:10+i()*12,storms:0,seed:new P(i()*100,i()*100,i()*100)},h=m=>(i()-.5)*2*m,g=()=>se.clamp(.88+(l-15)/160+h(.04),.3,2);switch(a){case"Oceanic":case"Aquifer":t.family="terran",t.seaLevel=(a==="Oceanic"?.22:.12)+h(.06),t.deep=G(f(134950),o,.08),t.shallow=a==="Aquifer"?f(1278090):G(f(739952),o,.12),t.vegetation=.7,t.clouds=.38,t.iceCap=g();break;case"Super Earth":case"Sub Earth":case"Forest":t.family="terran",t.seaLevel=(a==="Forest"?-.02:.03)+h(.08),t.relief*=a==="Super Earth"?1.4:1,t.vegetation=a==="Forest"?1:.75,t.accent=j(G(f(a==="Forest"?2050583:3103262),o,.2),i),t.low=j(G(f(4416554),o,.15),i),t.clouds=.42,t.iceCap=g();break;case"Savannah":t.family="terran",t.seaLevel=-.16+h(.06),t.vegetation=.45,t.low=j(G(f(10521162),o,.25),i),t.mid=f(9073220),t.accent=f(5660714),t.clouds=.28,t.iceCap=g();break;case"Swamp":t.family="terran",t.seaLevel=.04+h(.04),t.deep=f(860184),t.shallow=f(2968106),t.low=j(f(3820066),i),t.accent=f(2504730),t.vegetation=1,t.relief*=.5,t.clouds=.55,t.iceCap=2;break;case"Tundra":t.family="terran",t.seaLevel=-.08+h(.06),t.low=f(6974034),t.mid=f(9078390),t.accent=f(5069374),t.vegetation=.3,t.iceCap=.45+h(.08),t.clouds=.45;break;case"Desert":case"Arid":t.family="desert",t.low=j(G(f(a==="Desert"?12620378:11035196),o,.2),i),t.mid=G(f(a==="Desert"?10514495:9062958),o,.2),t.high=f(a==="Desert"?6177840:4860960),t.peak=f(a==="Desert"?14730388:14203040),t.relief*=1.1,t.craters=a==="Arid"?.5:.15,t.clouds=a==="Arid"?.08:.04,t.atmosphereHeight=.02,u||(t.atmosphere=f(14196848),t.atmosphereDensity=.45);break;case"Rocky":case"Cave":case"Carbon":t.family="barren",t.low=j(G(f(a==="Carbon"?1315860:7236198),o,a==="Carbon"?.1:.25),i),t.mid=G(f(a==="Carbon"?2236446:8814714),o,.2),t.high=f(a==="Carbon"?3025962:10130572),t.peak=f(a==="Carbon"?4209722:12104362),t.craters=a==="Cave"?.6:.6+i()*.4,t.relief*=a==="Cave"?1.6:1.2,t.specular=a==="Carbon"?.35:.04,t.roughness=a==="Carbon"?.4:.9;break;case"Metallic":{t.family="metal";const m=ne(i,[[9211796,11843516,5922146,8008728],[10511422,13142620,6962212,3115636],[11570240,14202984,6967328,5917226],[8028296,10134704,4608092,4864650],[7368816,10132122,3815994,9059350]]);t.low=G(f(m[0]),o,.12),t.mid=f(m[1]),t.high=f(m[2]),t.accent=f(m[3]),t.specular=1,t.roughness=.12+i()*.2,t.metal=1,t.craters=.4+i()*.4;break}case"Crystalline":t.family="crystal",t.low=f(1709606),t.mid=j(G(f(7002344),o,.45),i,.25,.2),t.high=j(G(f(10124008),o,.3),i,.25,.2),t.accent=f(ne(i,[16740560,7405528,16765040,8429823])),t.specular=1,t.roughness=.06,t.craters=.15;break;case"Diamond":{t.family="diamond";const m=ne(i,[15397631,12574975,16773312,16766186]);t.low=f(m),t.mid=f(16777215),t.high=f(2500652),t.accent=f(10148095),t.specular=1,t.roughness=.03;break}case"Icy":t.family="ice",t.low=j(f(13163756),i,.04),t.mid=f(15134968),t.high=f(11060444),t.accent=G(f(ne(i,[6986432,10119760,8022672])),o,.3),t.specular=.6,t.roughness=.3,t.craters=.3+i()*.5,t.clouds=.15;break;case"Lava":case"Magma":case"Molten Core":t.family="lava",t.style=a==="Magma"?1:a==="Molten Core"?2:0,t.low=f(1709074),t.mid=f(2760732),t.high=f(3813418),t.emissive=G(f(a==="Molten Core"?16756800:16734746),o,.2),t.emission=(a==="Molten Core"?1:a==="Magma"?.85:.7)*(.85+i()*.3),t.relief*=1.2,u||(t.atmosphere=f(16738864),t.atmosphereDensity=.6);break;case"Gas Giant":case"Frozen Gas Giant":case"Nebulous":{t.family="gas";const m=a==="Frozen Gas Giant",p=a==="Nebulous";t.style=m?1:p?2:0,t.low=j(G(f(m?5940944:p?14196944:14200968),o,m?.2:.35),i,.05),t.mid=j(G(f(m?3108784:p?10514632:11565648),o,m?.15:.3),i,.05),t.high=f(m?15267583:p?15782128:15786184),t.accent=f(m?1194616:p?7360704:9062960),t.bands=(m||p?.6:1)*(.7+i()*.6),t.storms=(m?.7:1)*(.4+i()*.9),t.emission=p?.25:0,t.emissive=f(12615935),t.atmosphere=f(m?9097456:p?13668592:15255712),t.atmosphereDensity=m?.55:1.2,t.atmosphereHeight=.03;break}case"Super Puff":t.family="gas",t.style=3;{const m=ne(i,[[13214330,11042394,15125672,8018494,15258292],[13933166,11695696,15582882,9065524,15781034],[13141550,10511902,15119472,7226388,15253124],[10254942,8282186,13151892,5521454,13547682]]);t.low=j(f(m[0]),i,.02),t.mid=j(f(m[1]),i,.02),t.high=f(m[2]),t.accent=f(m[3]),t.bands=.1+i()*.1,t.storms=0*i(),t.atmosphere=f(m[4]),t.atmosphereDensity=.5,t.atmosphereHeight=.03}break;case"Super Ringed":t.family="gas",t.variant=3,t.low=j(G(f(13207386),o,.2),i,.04),t.mid=j(G(f(11035198),o,.2),i,.04),t.high=f(15254432),t.accent=f(7221792),t.emissive=f(10107416),t.emission=.3,t.bands=.6+i()*.4,t.storms=.2+i()*.4,t.atmosphere=f(14727318),t.atmosphereDensity=.9,t.atmosphereHeight=.03;break;case"Mirror":t.family="mirror",t.low=f(ne(i,[15265010,15918796,14477040,15130864])),t.mid=f(16777215),t.high=f(9081500),t.accent=f(12571903),t.specular=1,t.roughness=.04+i()*.05,t.metal=1,t.bands=.5+i()*.5;{const m=se.clamp((l-800)/2200,0,1);t.emissive=f(11546634).lerp(f(16757866),m),t.emission=.012+.05*m}t.atmosphere=f(13622773),t.atmosphereDensity=.25,t.atmosphereHeight=.02;break;case"Ruby Cloud":t.family="gas",t.style=4,t.low=j(f(9308700),i,.03),t.mid=j(f(1522334),i,.03),t.high=f(14239839),t.accent=f(2753552),t.emissive=f(13117466),t.emission=.8+i()*.3,t.bands=.8+i()*.4,t.storms=.3+i()*.5,t.atmosphere=f(16743018),t.atmosphereDensity=1.1,t.atmosphereHeight=.035;break;case"Toxic":t.family="veiled",t.low=j(G(f(11055184),o,.25),i),t.mid=G(f(8030768),o,.25),t.high=f(13684872),t.bandFrequency=5+i()*6,t.atmosphere=u?t.atmosphere:f(12107872),t.atmosphereDensity=Math.max(t.atmosphereDensity,1.6),t.atmosphereHeight=.04;break;case"Radioactive":t.family="radioactive",t.low=j(f(2500126),i),t.mid=f(3815980),t.high=f(4868666),t.emissive=f(ne(i,[8257354,4915104,13172544])),t.emission=1,t.craters=.7,t.atmosphere=f(u?u.color:9109360).lerp(f(9109360),.65),t.atmosphereDensity=Math.max(u?u.density:0,.5);break;case"Exotic":t.family="exotic",t.low=j(G(f(2627656),o,.4),i,.3),t.mid=j(G(f(5913242),o,.4),i,.3),t.high=f(14733567),t.accent=f(ne(i,[16728256,4259808,16764992,8413439])),t.emissive=t.accent.clone(),t.emission=.7,t.specular=.8,t.roughness=.15,u||(t.atmosphere=f(12611839),t.atmosphereDensity=.8);break;case"Anomaly":t.family="anomaly",t.low=f(131590),t.mid=f(657428),t.high=f(1709104),t.accent=f(ne(i,[9067775,4243711,16735370])),t.emissive=t.accent.clone(),t.emission=1,t.atmosphereDensity=0;break}return t.family==="terran"&&(l<-60||l>85)&&(t.vegetation*=.2),t.family!=="terran"&&t.family!=="desert"&&(t.cityLights*=t.family==="barren"||t.family==="ice"?.6:0),t.clouds=se.clamp(t.clouds*(.7+i()*.6)*(t.atmosphereDensity>0?1:0),0,.85),t}const we=(r,e)=>typeof r=="string"&&r.trim()?r:e;function Ct(r,e="atlas"){const a=we(r.name,"Unknown"),s=we(r.planet_type,"Rocky"),o=we(r.seed,`${a}|${s}|${e}`);return{planet_info:{name:a,type:s,base_color:r.base_color,surface_temperature:r.surface_temperature},original_planet_data:{planet_type:s,surface_temperature:r.surface_temperature,life_forms:r.life_forms},atmosphere:{type:we(r.atmosphere,"None")},life_forms:{type:we(r.life_forms,"None")},seeds:{planet_seed:o,shape_seed:o}}}function Rt(r){let e=2166136261;for(let a=0;a<r.length;a+=1)e^=r.charCodeAt(a),e=Math.imul(e,16777619);return e>>>0}function te(r,e){return Rt(`${r}:${e}`)%1e4/1e4}const Ee=[{type:"rocky",color:"#8b8680",roughness:.9,metalness:.1,density:3300,origin:"co-formation"},{type:"icy",color:"#d9e4f2",roughness:.35,metalness:.05,density:1900,origin:"captured"},{type:"asteroidal",color:"#5d4f3a",roughness:.95,metalness:.15,density:2600,origin:"captured"},{type:"volcanic",color:"#7a5a4a",roughness:.75,metalness:.12,density:3500,origin:"co-formation"}],Ka=["I","II","III","IV","V","VI","VII","VIII"];function Ja(r,e,a=1){const s=Math.max(0,Math.min(Math.floor(r),8)),o=5972e21,n=[];for(let l=0;l<s;l+=1){const d=Ee[Math.floor(te(e,l*7+1)*Ee.length)%Ee.length],c=.05+te(e,l*7+2)*.11,u=Math.max(80,c*6371),t=42e3*Math.pow(1.65,l)*(.9+te(e,l*7+3)*.2),h=2*Math.PI*Math.sqrt(Math.pow(t*1e3,3)/(6674e-14*o)),g=t<4e5,m=g?h:h*(.4+te(e,l*7+4)),p=d.type==="icy";n.push({name:`Moon ${Ka[l]??l+1}`,properties:{mass_kg:4/3*Math.PI*Math.pow(u*1e3,3)*d.density,radius_km:u,density_kg_m3:d.density,type:d.type,origin:d.origin},orbit:{semi_major_axis_km:t,eccentricity:.002+te(e,l*7+5)*.05,inclination_deg:te(e,l*7+6)*8,orbital_period_seconds:h,orbital_period_days:h/86400,current_angle:te(e,l*7+7)*Math.PI*2,initial_phase:te(e,l*7+8)*Math.PI*2},rotation:{rotation_period_s:m,rotation_period_hours:m/3600,angular_velocity_rad_s:Math.PI*2/m,is_tidally_locked:g},visuals:{base_color:d.color,roughness:d.roughness,metalness:d.metalness,normal_strength:.8,relative_size:c,has_atmosphere:p&&te(e,l*7+9)>.6,atmosphere_color:"#9fc4e8",atmosphere_opacity:.35},procedural:{seed:Rt(`${e}:moon:${l}`)%1e5,noise_scale:2+te(e,l*7+10)*4,crater_density:.4+te(e,l*7+11)*.5,surface_variation:.5}})}const i=n.length?n[n.length-1].orbit.semi_major_axis_km:1;return{count:s,roche_limit:a*2.4,hill_radius:i*3,moons:n,render_settings:{max_visible_distance:i*4,lod_distances:[a*4,a*10,a*30]},cosmic_origin_time:0,planet_mass:o,planet_radius:a}}function Qa(r,e,a=1){return r==null?null:typeof r=="number"?r>0?Ja(r,e,a):null:r.count>0?r:null}const eo=`
${le}
uniform vec4 uDetail;
uniform vec3 uDetailSeed;
varying vec3 vMoonSphere;
varying float vMoonScale;
// The mesh's own normal (view space), before the bump: keeps the round moon's terminator
vec3 moonGeometryNormal;

// Bump mapping from screen derivatives of the height (Mikkelsen), as the planets do
vec3 moonBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}

// How well a pixel spanning footprint radians draws a feature of frequency cycles per
// radian: fully from eight pixels a cycle, nothing below four
float moonResolve(float frequency, float footprint) {
  return clamp(log2(0.25 / (frequency * footprint)) + 1.0, 0.0, 1.0);
}

// A crater in about half the cells, of random size: bowl, then a raised rim. Every
// neighbouring cell's crater is added (the deepest bowl wins), so no rim is cut off where
// the nearest cell changes: a cut would be an edge for the bump
float moonCraters(vec3 p, float scale) {
  vec3 cell = floor(p * scale);
  vec3 f = fract(p * scale);
  float bowl = 0.0, rim = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      for (int z = -1; z <= 1; z++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(cell + o);
        if (fract(h.x * 3.71) < 0.4) continue;
        float size = 0.18 + 0.32 * fract(h.x * 7.13);
        float t = length(o + h - f) / size;
        if (t < 1.0) bowl = min(bowl, t * t - 1.0);
        float e = (t - 1.0) / 0.2;
        rim += exp(-e * e) * 0.3;
      }
  return bowl + rim;
}

// p: the direction on the moon's sphere; footprint: radians of it one pixel spans.
// Returns the albedo factor (fresh rims brighter, floors darker); height is the bump in
// units of uDetail.z, fractures the icy lines (0..1, stained darker and redder)
float moonDetail(vec3 p, float footprint, out float height, out float fractures) {
  vec3 q = p + uDetailSeed;
  float craters = moonCraters(q, 6.0) * 0.55 * moonResolve(12.0, footprint)
                + moonCraters(q + 3.7, 14.0) * 0.3 * moonResolve(28.0, footprint)
                + moonCraters(q + 9.1, 32.0) * 0.17 * moonResolve(64.0, footprint);
  craters *= uDetail.x;
  float octaves = clamp(log2(0.25 / (24.0 * footprint)) + 1.0, 0.0, 5.0);
  float grit = octaves > 0.0 ? fbmN(q * 24.0, octaves) * clamp(octaves, 0.0, 1.0) * uDetail.w : 0.0;
  fractures = 0.0;
  if (uDetail.y > 0.0) {
    // Lineae, as on Europa: long winding cracks along the zero lines of noise, at two
    // scales, each only where a broad mask lets it through; thin, but never under a pixel
    vec3 warp = vec3(snoise(q * 1.3 + 11.0), snoise(q * 1.3 + 23.0), snoise(q * 1.3 + 37.0)) * 0.25;
    float frequency = 2.5, width = 0.035, weight = 1.0;
    for (int i = 0; i < 2; i++) {
      float n = snoise((q + warp) * frequency + float(i) * 17.0);
      float line = 1.0 - smoothstep(0.0, max(width, fwidth(n) * 1.5), abs(n));
      float mask = smoothstep(-0.1, 0.35, snoise(q * 1.7 + float(i) * 5.3));
      fractures = max(fractures, line * mask * weight * moonResolve(frequency * 4.0, footprint));
      frequency *= 2.2;
      width *= 0.85;
      weight *= 0.75;
    }
    fractures *= uDetail.y;
  }
  height = craters + grit * 0.35 - fractures * 0.4;
  return 1.0 + craters * 0.3 + grit * 0.12;
}
`;class Me{scene;planetRadius;moonMeshes=[];orbitalLines=[];smallMoonIndicators=[];moonData=null;cosmicOriginTime;lastRelaxationCheck=0;static LOW_SEGMENTS=64;static HIGH_SEGMENTS=192;setMoonDetail(e,a){const s=this.moonData?.moons.find(d=>d.name===e),o=this.scene.getObjectByName(`moon-surface-${e}`);if(!s||!o||!(o.geometry instanceof X))return;const n=a?Me.HIGH_SEGMENTS:Me.LOW_SEGMENTS,i=o.geometry;if(i.parameters.widthSegments===n)return;const l=new X(i.parameters.radius,n,Math.floor(n*.75),i.parameters.phiStart);this.generateProceduralSurface(l,s,i.parameters.radius),o.geometry=l,i.dispose()}moonMaterials=new Map;camera;planetPosition;timeOffset=0;orbitalLinesFadeEnabled=!0;orbitalLinesVisible=!0;orbitalLinesTargetOpacity=1;orbitalLinesCurrentOpacity=1;lastCameraPosition=new P;lastCameraTarget=new P;lastInteractionTime=0;fadeOutTimer=null;initialShowTimer=null;cameraMovementThreshold=.01;fadeOutDelay=3e3;initialShowDuration=5e3;fadeSpeed=.05;constructor(e,a,s,o,n){if(this.scene=e,this.planetRadius=a,this.camera=s,this.planetPosition=o,this.cosmicOriginTime=n,this.lastCameraPosition.copy(this.camera.position),this.camera instanceof je){const i=new P;this.camera.getWorldDirection(i),this.lastCameraTarget.copy(i)}this.startInitialShowTimer(),this.initializeMaterials()}initializeMaterials(){this.moonMaterials.set("rocky",new Q({color:9143936,roughness:.9,metalness:.1,normalScale:new me(.8,.8)})),this.moonMaterials.set("icy",new Q({color:14737648,roughness:.3,metalness:.05,normalScale:new me(.4,.4)})),this.moonMaterials.set("asteroidal",new Q({color:4865578,roughness:.95,metalness:.15,normalScale:new me(1.2,1.2)})),this.moonMaterials.set("captured",new Q({color:7035722,roughness:.8,metalness:.08,normalScale:new me(.9,.9)}))}loadMoonSystem(e){this.moonData=e,e.cosmic_origin_time&&(this.cosmicOriginTime=e.cosmic_origin_time),this.clearMoons(),this.createMoons()}clearMoons(){this.orbitalLines.forEach(e=>{this.scene.remove(e),e.traverse(a=>{a instanceof Xe&&(a.geometry.dispose(),a.material instanceof qt&&a.material.dispose())})}),this.orbitalLines=[],this.moonMeshes.forEach(e=>{this.scene.remove(e),e.traverse(a=>{a instanceof E&&(a.geometry.dispose(),Array.isArray(a.material)?a.material.forEach(s=>s.dispose()):a.material.dispose())})}),this.moonMeshes=[]}createMoons(){this.moonData&&this.moonData.moons.forEach((e,a)=>{const s=this.createMoonMesh(e,a);this.moonMeshes.push(s),this.scene.add(s)})}createMoonMesh(e,a){const s=new de;s.name=`moon-${e.name}`;const o=e.visuals.relative_size,n=this.planetRadius*o,i=Me.LOW_SEGMENTS,l=Math.floor(i*.75),c=(e.procedural?.seed||0)*.618034%(Math.PI*2),u=new X(n,i,l,c);this.generateProceduralSurface(u,e,n);let t;switch(e.properties.type){case"icy":t=new Q({color:16777215,roughness:.2,metalness:.05,transparent:!1});break;case"asteroidal":t=new Q({color:16777215,roughness:.95,metalness:.15,transparent:!1});break;case"captured":t=new Q({color:16777215,roughness:.8,metalness:.08,transparent:!1});break;default:t=new Q({color:16777215,roughness:.8,metalness:.1,transparent:!1});break}switch(this.applyMoonTexture(t,e),e.properties.type){case"icy":const w=e.procedural?.seed||0,M=this.createSeededRandom(w+9999)();let v=1;M>.8?v=1.4:M>.6?v=1.2:M<.2?v=.6:M<.4&&(v=.8),t.emissive=new z(4877194).multiplyScalar(.05*v),t.emissiveIntensity=.6*v,t.envMapIntensity=1*v,t.roughness=Math.max(.05,.15/v),t.metalness=.02,t.transparent=!0,t.opacity=Math.min(1,.95+(v-1)*.1);break;case"asteroidal":t.emissive=new z(2759178).multiplyScalar(.03),t.emissiveIntensity=.3,t.envMapIntensity=.1,t.roughness=.98,t.metalness=.18;break;case"captured":t.emissive=new z(5917242).multiplyScalar(.04),t.emissiveIntensity=.4,t.envMapIntensity=.3,t.roughness=.75,t.metalness=.12;break;default:t.emissive=new z(9136404).multiplyScalar(.04),t.emissiveIntensity=.4,t.envMapIntensity=.4,t.roughness=.85,t.metalness=.08;break}t.transparent=!1,t.side=Pe,t.aoMapIntensity=.8,t.normalScale=new me(1,1),this.applyMoonDetail(t,e,n);const h=new E(u,t);h.name=`moon-surface-${e.name}`,h.castShadow=!0,h.receiveShadow=!0,h.userData={moonData:e,moonIndex:a,isMoon:!0},s.add(h),this.createOrbitalTrail(e,a);const g=Math.max(n*2,this.planetRadius*.04),m=new Dt(g,32),p=new pe({side:be,depthTest:!1,depthWrite:!1,colorWrite:!1}),y=new E(m,p);y.name=`moon-indicator-hitarea-${e.name}`,y.renderOrder=998,y.userData={isMoonIndicator:!0,moonData:e},s.add(y);const x=new Ge(g*.85,g,48),k=new pe({color:65348,transparent:!0,opacity:0,side:be,depthTest:!1}),_=new E(x,k);if(_.name=`moon-indicator-${e.name}`,_.renderOrder=999,_.userData={isMoonIndicator:!0,moonData:e},s.add(_),this.smallMoonIndicators.push(_),this.smallMoonIndicators.push(y),e.visuals.has_atmosphere&&e.visuals.atmosphere_color){const w=new X(n*1.05,16,8),M=new pe({color:e.visuals.atmosphere_color,transparent:!0,opacity:e.visuals.atmosphere_opacity||.1,side:ht}),v=new E(w,M);v.name=`moon-atmosphere-${e.name}`,s.add(v)}return this.updateMoonPosition(s,e,0,a),s}applyMoonDetail(e,a,s){const o=a.properties.type,n=a.procedural??{},i=o==="icy"?.45:o==="asteroidal"?1.15:1,l=this.createSeededRandom((n.seed||0)%1e9+31337),d=new P(l()*100,l()*100,l()*100),c=(.35+(n.crater_density??.5))*i,u=o==="icy"?1:0,t=o==="icy"?.5:o==="asteroidal"?1.2:1,h=.012,g={uDetail:{value:new De(c,u,s*h,t)},uDetailSeed:{value:d}},m=jt.lights_physical_pars_fragment.replace("vec3 irradiance = dotNL * directLight.color;","vec3 irradiance = dotNL * saturate( dot( moonGeometryNormal, directLight.direction ) * 10.0 + 0.5 ) * directLight.color;");e.onBeforeCompile=p=>{Object.assign(p.uniforms,g),p.vertexShader=p.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vMoonSphere;
varying float vMoonScale;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vMoonSphere = position;
vMoonScale = length(modelMatrix[0].xyz);`),p.fragmentShader=p.fragmentShader.replace("#include <common>",`#include <common>
${eo}`).replace("#include <lights_physical_pars_fragment>",m).replace("#include <map_fragment>",`#include <map_fragment>
          vec3 moonSphere = normalize(vMoonSphere);
          float moonHeight, moonFractures;
          diffuseColor.rgb *= moonDetail(moonSphere, max(length(fwidth(moonSphere)), 1e-6), moonHeight, moonFractures);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.58, 0.5), moonFractures * 0.6);`).replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
          moonGeometryNormal = normal;
          normal = moonBump(-vViewPosition, normal, moonHeight * uDetail.z * vMoonScale);
          nonPerturbedNormal = normal;`)},e.needsUpdate=!0}generateProceduralSurface(e,a,s){const o=a.procedural?.seed||0,n=Ne(this.createSeededRandom(o)),i=e.attributes.position.array,l=this.calculateHydrostaticRelaxation(a),d=this.reliefModel(a,n),c=s,u=c*(1-l),t=new Float32Array(i.length),h=new Float32Array(i.length/3),g=new P;for(let m=0;m<i.length;m+=3){g.set(i[m],i[m+1],i[m+2]).normalize();const p=d(g);t[m]=g.x,t[m+1]=g.y,t[m+2]=g.z,h[m/3]=p;const y=s+p*u;i[m]=g.x*y,i[m+1]=g.y*y,i[m+2]=g.z*y}e.userData.relaxation={directions:t,relief:h,radius:s,amplitude:c,factor:l},e.attributes.position.needsUpdate=!0,e.computeVertexNormals()}reliefModel(e,a){const s=e.properties.type,o=e.procedural??{},n=e.surface??{},i=this.createSeededRandom((o.seed||0)%1e9+4242),l=o.surface_variation??.15,c=(s==="asteroidal"?.14:s==="captured"?.09:s==="icy"?.025:.035)*(.7+l*2),u=s==="asteroidal"?.18:s==="captured"?.1:0,t=new P(i()-.5,i()-.5,i()-.5).normalize(),h=(w,M)=>{const v=w*Math.PI/180,S=M*Math.PI/180;return new P(Math.cos(v)*Math.cos(S),Math.sin(v),Math.cos(v)*Math.sin(S))},g=.06,m=[],p=(w,M,v)=>{M=Math.max(g,M),m.push({centre:w,radius:M,depth:v,reach:Math.cos(Math.min(Math.PI,M*2.4))})};for(const w of n.craters??[])p(h(w.position.lat,w.position.lon),w.radius*Math.PI,w.depth*.55);const y=o.crater_density??.5,x=Math.round(y*(s==="icy"?22:45));for(let w=0;w<x;w++){const M=g*(1+Math.pow(i(),3)*3.5);p(new P(i()*2-1,i()*2-1,i()*2-1).normalize(),M,.25+i()*.25)}const k=[];if(s==="icy")for(const w of n.cracks??[]){const M=h(w.start.lat,w.start.lon),v=h(w.end.lat,w.end.lon),S=new P().crossVectors(M,v);S.lengthSq()<1e-6||k.push({a:M,b:v,normal:S.normalize(),width:.018+w.width*2.5,height:.006+w.brightness*.012})}const _=new P;return w=>{let M=(a(w.x*1.1,w.y*1.1,w.z*1.1)*.7+a(w.x*2.3+7,w.y*2.3,w.z*2.3)*.3)*c;if(u){const v=w.dot(t);M+=u*(v*v-.33)}for(const v of m){const S=w.dot(v.centre);if(S<v.reach)continue;const L=Math.acos(Math.min(1,S))/v.radius,b=v.depth*v.radius;if(L<1){const C=L*L-1;M+=b*Math.max(C,v.radius>.15?-.75:-1)}M+=b*.32*Math.exp(-Math.pow((L-1)/.16,2)),L>1&&(M+=b*.08*Math.exp(-(L-1)*3))}for(const v of k){const S=Math.abs(w.dot(v.normal));if(S>v.width*3||_.crossVectors(v.a,w).dot(v.normal)<0||_.crossVectors(w,v.b).dot(v.normal)<0)continue;const L=S/v.width;M+=v.height*(Math.exp(-Math.pow(L-.7,2)*6)+Math.exp(-Math.pow(L+.7,2)*6)-.8*Math.exp(-L*L*10))}return M+=a(w.x*7+3,w.y*7,w.z*7)*.004*(.5+l*3),M}}applyMoonTexture(e,a){this.createProceduralColorTexture(e,a)}createProceduralColorTexture(e,a){const o=document.createElement("canvas");o.width=256,o.height=256;const n=o.getContext("2d"),i=a.visuals.base_color;let l;if(i&&i.startsWith("#")){const b=i.slice(1);l={r:parseInt(b.slice(0,2),16),g:parseInt(b.slice(2,4),16),b:parseInt(b.slice(4,6),16)}}else switch(a.properties.type){case"icy":l={r:160,g:170,b:190};break;case"asteroidal":l={r:74,g:62,b:42};break;case"captured":l={r:107,g:91,b:74};break;default:l={r:139,g:134,b:128};break}const d=a.procedural?.seed||Math.abs(a.name.split("").reduce((b,C)=>b+C.charCodeAt(0),0)),c=Math.abs(d)%1e6,u=c===0?12345:c,t=Ne(this.createSeededRandom(u+777));let h=0,g=0,m=0;const p=u%100*.1,y=u/100%100*.1,x=u/1e4%100*.1;switch(a.properties.type){case"icy":h=t(p+1,y+2,x+3)*120,g=t(p+4,y+5,x+6)*100,m=t(p+7,y+8,x+9)*110;const b=t(p*.5,y*.5,x*.5),C=t(p*.3,y*.7,x*.4),F=t(p*.8,y*.2,x*.6);let A=1;F>.4?A=1.4:F>.1?A=1.2:F<-.4?A=.6:F<-.1&&(A=.8),b>.3?(h-=40,g+=50,m+=60):b<-.3?(h+=60,g-=20,m+=20):C>.4?(h+=40,g+=35,m-=30,A*=.9):C<-.4&&(h-=30,g-=20,m+=50),h*=A,g*=A,m*=A;break;case"asteroidal":h=t(p+10,y+11,x+12)*60,g=t(p+13,y+14,x+15)*55,m=t(p+16,y+17,x+18)*50;break;case"captured":h=t(p+19,y+20,x+21)*50,g=t(p+22,y+23,x+24)*45,m=t(p+25,y+26,x+27)*40;break;default:h=t(p+28,y+29,x+30)*55,g=t(p+31,y+32,x+33)*50,m=t(p+34,y+35,x+36)*45;break}({...l},l={r:Math.max(20,Math.min(255,l.r+h)),g:Math.max(20,Math.min(255,l.g+g)),b:Math.max(30,Math.min(255,l.b+m))}),n.fillStyle=`rgb(${l.r}, ${l.g}, ${l.b})`,n.fillRect(0,0,256,256);const k=(u*7919+41)%233280,_=Ne(this.createSeededRandom(k)),w=n.getImageData(0,0,256,256),M=w.data;for(let b=0;b<256;b++)for(let C=0;C<256;C++){const F=(b*256+C)*4,A=C/256,D=b/256,Z=(A-.5)*2*Math.PI,B=(D-.5)*Math.PI,T=Math.cos(B)*Math.cos(Z),q=Math.cos(B)*Math.sin(Z),N=Math.sin(B),oe=(k*17+8901)%1e3,R=.5+oe/1e3*1,O=.8+oe/1e3*.4;let I=0;switch(a.properties.type){case"icy":I+=_(T*(2*R),q*(2*R),N*(2*R))*(.5*O),I+=_(T*(6*R),q*(6*R),N*(6*R))*(.3*O),I+=_(T*(15*R),q*(15*R),N*(15*R))*(.2*O);const K=_(T*30,q*30,N*30)*.1;I+=K*O;break;case"asteroidal":I+=_(T*(1.2*R),q*(1.2*R),N*(1.2*R))*(.75*O),I+=_(T*(4*R),q*(4*R),N*(4*R))*(.55*O),I+=_(T*(10*R),q*(10*R),N*(10*R))*(.35*O),I+=_(T*(25*R),q*(25*R),N*(25*R))*(.22*O);break;case"captured":I+=_(T*(1.8*R),q*(1.8*R),N*(1.8*R))*(.6*O),I+=_(T*(5*R),q*(5*R),N*(5*R))*(.38*O),I+=_(T*(12*R),q*(12*R),N*(12*R))*(.2*O);break;default:I+=_(T*(2*R),q*(2*R),N*(2*R))*(.55*O),I+=_(T*(6*R),q*(6*R),N*(6*R))*(.33*O),I+=_(T*(16*R),q*(16*R),N*(16*R))*(.18*O);break}let W,V,H;if(a.properties.type==="icy"){if(W=l.r,V=l.g,H=l.b,I>0){const J=I*.5;W=W*(1-J*.15),V=V*(1+J*.2),H=H*(1+J*.25)}else{const J=Math.abs(I)*.5;W=W*(1+J*.1),V=V*(1-J*.15),H=H*(1+J*.05)}const K=1+I*.3;W=W*K,V=V*K,H=H*K;const ie=_(T*8,q*8,N*8);ie>.5?(W=Math.min(255,W*1.05),V=Math.min(255,V*1.08),H=Math.min(255,H*1.1)):ie<-.5&&(W=W*.95,V=V*.97,H=H*1.02),W=Math.max(0,Math.min(255,W)),V=Math.max(0,Math.min(255,V)),H=Math.max(0,Math.min(255,H))}else{const K=1+I;W=Math.max(0,Math.min(255,l.r*K)),V=Math.max(0,Math.min(255,l.g*K)),H=Math.max(0,Math.min(255,l.b*K))}M[F]=W,M[F+1]=V,M[F+2]=H,M[F+3]=255}n.putImageData(w,0,0);const v=new We(o);v.wrapS=qe,v.wrapT=qe,v.generateMipmaps=!0,v.needsUpdate=!0;const L=(a.procedural?.seed||0)*.618034%1;v.offset.x=L,v.repeat.set(1,1),e.map=v,e.needsUpdate=!0}drawCrater(e,a,s){const o=(s.position.lon+180)/360*a,n=(90-s.position.lat)/180*a,i=Math.max(20,s.radius*a*.8),l=e.createRadialGradient(o,n,0,o,n,i);l.addColorStop(0,"rgba(0, 0, 0, 0.95)"),l.addColorStop(.2,"rgba(10, 10, 10, 0.8)"),l.addColorStop(.5,"rgba(40, 40, 40, 0.6)"),l.addColorStop(.8,"rgba(100, 100, 100, 0.4)"),l.addColorStop(.95,"rgba(180, 180, 180, 0.3)"),l.addColorStop(1,"rgba(0, 0, 0, 0)"),e.fillStyle=l,e.beginPath(),e.arc(o,n,i,0,2*Math.PI),e.fill(),e.strokeStyle="rgba(255, 255, 255, 0.7)",e.lineWidth=3,e.beginPath(),e.arc(o,n,i*.9,0,2*Math.PI),e.stroke(),e.strokeStyle="rgba(220, 220, 220, 0.5)",e.lineWidth=1,e.beginPath(),e.arc(o,n,i*.95,0,2*Math.PI),e.stroke()}createSeededRandom(e){let a=e*9301+49297;return()=>(a=(a*9301+49297)%233280,a/233280)}calculateHydrostaticRelaxation(e){const a=e.properties.radius_km*1e3,s=e.properties.mass_kg,o=e.properties.density_kg_m3;if(!isFinite(a)||!isFinite(s)||!isFinite(o)||a<=0||s<=0||o<=0)return 0;const i=66743e-15*s/(a*a);if(!isFinite(i)||i<=0)return 0;let l;switch(e.properties.type){case"icy":const g=e.tidal_heating?.tidal_power_watts||0,m=4*Math.PI*a*a,p=g/m;p>1e3?l=1e12:p>100?l=1e15:p>10?l=1e18:p>1?l=1e20:l=1e21;break;case"asteroidal":l=1e26;break;case"captured":l=1e24;break;default:a>5e5?l=1e22:a>1e5?l=1e23:l=1e25;break}let d;e.properties.type==="icy"?(e.tidal_heating?.tidal_power_watts||0)>1e12?d=1e9:d=35e8:d=3e10;const c=l/d;if(!isFinite(c)||c<=0)return 0;const u=Date.now()/1e3-this.cosmicOriginTime+this.timeOffset;if(!isFinite(u)||u<0)return 0;const t=u/c,h=1-Math.exp(-t);return Math.max(0,Math.min(1,h))}updateMoonSurfaceRelaxation(e,a){const s=e.getObjectByName(`moon-surface-${a.name}`),o=s?.geometry.userData.relaxation;if(!s||!o)return;const n=this.calculateHydrostaticRelaxation(a);if(Math.abs(n-o.factor)<.001)return;o.factor=n;const i=s.geometry,l=i.attributes.position.array,d=o.amplitude*(1-n);for(let c=0,u=0;c<l.length;c+=3,u++){const t=o.radius+o.relief[u]*d;l[c]=o.directions[c]*t,l[c+1]=o.directions[c+1]*t,l[c+2]=o.directions[c+2]*t}i.attributes.position.needsUpdate=!0,i.computeVertexNormals(),i.computeBoundingSphere()}drawMaria(e,a,s,o=0){const n=(s.position.lon+180)/360*a,i=(90-s.position.lat)/180*a,l=Math.max(15,s.radius*a*.4),d=e.createRadialGradient(n,i,0,n,i,l);d.addColorStop(0,`rgba(10, 10, 10, ${s.darkness*.9})`),d.addColorStop(.6,`rgba(25, 25, 25, ${s.darkness*.7})`),d.addColorStop(1,`rgba(40, 40, 40, ${s.darkness*.3})`),e.fillStyle=d,e.beginPath(),e.arc(n,i,l,0,2*Math.PI),e.fill();const c=this.createSeededRandom(o+Math.floor(n+i));e.fillStyle=`rgba(60, 50, 40, ${s.darkness*.2})`;for(let u=0;u<5;u++){const t=n+(c()-.5)*l*.8,h=i+(c()-.5)*l*.8;e.beginPath(),e.arc(t,h,2+c()*3,0,2*Math.PI),e.fill()}}calculateOrbitalParameters(e){const a=Math.max(...this.moonData.moons.map(v=>v.orbit.semi_major_axis_km)),s=e.orbit.semi_major_axis_km/a,o=Math.log10(1+s*9),i=e.properties.origin==="co-formation"&&e.properties.density_kg_m3<1500?2.5:1.8,d=this.planetRadius*i*1.2,c=this.planetRadius*4,u=d+o*c,t=this.planetRadius*10,h=Math.min(u,t),g=e.orbit.eccentricity,p=Math.min(3,1/.5),y=Math.min(.8,g*p),k=Math.min(e.orbit.inclination_deg*3,60),_=se.degToRad(k),w=e.orbit.argument_of_periapsis||0,M=e.orbit.longitude_of_ascending_node||0;return{semiMajorAxis:h,eccentricity:y,inclination:_,argumentOfPeriapsis:w,longitudeOfAscendingNode:M}}createOrbitalTrail(e,a){const s=this.calculateOrbitalParameters(e),o=s.semiMajorAxis,n=s.eccentricity,i=s.inclination,l=s.argumentOfPeriapsis,d=s.longitudeOfAscendingNode,c=[],u=128;for(let y=0;y<=u;y++){const x=y/u*Math.PI*2,k=o*(1-n*n)/(1+n*Math.cos(x)),_=k*Math.cos(x+l),w=k*Math.sin(x+l),M=0,v=Math.cos(i),S=Math.sin(i),L=Math.cos(d),b=Math.sin(d),C=_,F=w*v-M*S,A=w*S+M*v,D=C*L-F*b,Z=C*b+F*L,B=A;c.push(new P(D,B,-Z))}const t=new he().setFromPoints(c);let h;switch(e.properties.type){case"icy":h=6724095;break;case"asteroidal":h=9127187;break;case"captured":h=16737894;break;default:h=16755302;break}const g=new de;g.name=`moon-orbit-${e.name}`;const m=[];for(let y=0;y+1<c.length;y+=3)m.push(c[y],c[y+1]);if(m.length>=2){const y=new Se({color:h,opacity:0,transparent:!0,linewidth:1}),x=new Ve(new he().setFromPoints(m),y);x.name=`moon-orbit-segment-${e.name}`,g.add(x)}t.dispose();const p=g;p.visible=!1,p.position.copy(this.planetPosition),this.scene.add(p),this.orbitalLines||(this.orbitalLines=[]),this.orbitalLines.push(p)}drawIceCracks(e,a,s){const o=(s.start.lon+180)/360*a,n=(90-s.start.lat)/180*a,i=(s.end.lon+180)/360*a,l=(90-s.end.lat)/180*a,d=Math.max(8,s.width*a*500);e.shadowColor="rgba(150, 200, 255, 1.0)",e.shadowBlur=20,e.strokeStyle=`rgba(255, 255, 255, ${Math.min(1,s.brightness*3)})`,e.lineWidth=d,e.lineCap="round",e.beginPath(),e.moveTo(o,n),e.lineTo(i,l),e.stroke(),e.shadowColor="rgba(100, 150, 255, 0.8)",e.shadowBlur=30,e.strokeStyle=`rgba(200, 230, 255, ${Math.min(1,s.brightness*2.5)})`,e.lineWidth=d*.7,e.beginPath(),e.moveTo(o,n),e.lineTo(i,l),e.stroke(),e.shadowBlur=0,e.shadowColor="transparent",e.shadowBlur=0}setTimeOffset(e){this.timeOffset=e}getTimeOffset(){return this.timeOffset}update(){if(!this.moonData)return;this.detectCameraMovement()&&this.onCameraMovement(),this.updateOrbitalLinesFade();const e=Date.now()/1e3;if(!isFinite(this.cosmicOriginTime))return;const a=e-this.cosmicOriginTime+this.timeOffset;if(!isFinite(a)||a<0)return;const s=performance.now()-this.lastRelaxationCheck>500;s&&(this.lastRelaxationCheck=performance.now()),this.moonData.moons.forEach((o,n)=>{n<this.moonMeshes.length&&(this.updateMoonPosition(this.moonMeshes[n],o,a,n),s&&this.updateMoonSurfaceRelaxation(this.moonMeshes[n],o))}),this.updateLOD()}updateMoonPosition(e,a,s,o=0){if(!isFinite(s))return;const n=a.orbit.orbital_period_seconds;if(!isFinite(n)||n<=0)return;const i=2*Math.PI/n,l=a.orbit.initial_phase||0,d=(i*s+l)%(2*Math.PI);if(!isFinite(d))return;const c=this.calculateOrbitalParameters(a),u=c.semiMajorAxis,t=c.eccentricity,h=c.inclination,g=c.argumentOfPeriapsis,m=c.longitudeOfAscendingNode;let p=d;for(let ie=0;ie<5;ie++){const J=d+t*Math.sin(p);if(!isFinite(J))break;p=J}if(!isFinite(p))return;const y=Math.sqrt(1+t),x=Math.sqrt(1-t),k=Math.sin(p/2),_=Math.cos(p/2);if(!isFinite(y)||!isFinite(x)||!isFinite(k)||!isFinite(_))return;const w=2*Math.atan2(y*k,x*_);if(!isFinite(w))return;const M=u*(1-t*t)/(1+t*Math.cos(w)),v=w+g,S=M*Math.cos(v),L=M*Math.sin(v),b=0;if(!isFinite(S)||!isFinite(L)||!isFinite(b))return;const C=Math.cos(h),F=Math.sin(h);if(!isFinite(C)||!isFinite(F)||!isFinite(m))return;let A=S,D=L*C-b*F,Z=L*F+b*C;const B=Math.cos(m),T=Math.sin(m);if(!isFinite(B)||!isFinite(T))return;const q=A*B-D*T,N=A*T+D*B,oe=Z;if(!isFinite(q)||!isFinite(N)||!isFinite(oe)||!isFinite(this.planetPosition.x)||!isFinite(this.planetPosition.y)||!isFinite(this.planetPosition.z))return;const R=q,O=oe,I=-N,W=this.planetPosition.x+R,V=this.planetPosition.y+O,H=this.planetPosition.z+I;if(!isFinite(W)||!isFinite(V)||!isFinite(H))return;e.position.set(W,V,H);const K=e.getObjectByName(`moon-surface-${a.name}`);K&&this.applyTidalLockingWithLibration(K,a,w,s)}calculatePeriapsisWithPrecession(e,a){const s=e.orbit.argument_of_periapsis||0;if(!isFinite(a)||!isFinite(s))return s;const o=this.planetRadius,n=e.orbit.semi_major_axis_km;if(!isFinite(n)||n<=0||n/o>10)return s;const l=.001,d=2*Math.PI/e.orbit.orbital_period_seconds,c=e.orbit.inclination_deg*Math.PI/180;if(!isFinite(d)||!isFinite(c))return s;const u=3/2*l*d*Math.pow(o/n,2)*Math.cos(c);if(!isFinite(u))return s;const t=u*a,h=(s+t)%(2*Math.PI);return isFinite(h)?h:s}applyTidalLockingWithLibration(e,a,s,o){if(!isFinite(s))return;if(a.rotation?.is_tidally_locked??!0){e.lookAt(this.planetPosition);const i=a.orbit.eccentricity;if(isFinite(i)&&i>=0&&i<1){const l=2*i*Math.sin(s),c=a.orbit.inclination_deg*Math.PI/180*Math.sin(s)*.1;if(isFinite(l)&&isFinite(c)){const u=l+c;isFinite(u)&&e.rotateY(u)}}}else{const i=a.rotation?.angular_velocity_rad_s??2*Math.PI/a.orbit.orbital_period_seconds;if(isFinite(i)&&i>0){const l=Date.now()/1e3,d=this.moonData?.cosmic_origin_time||0,c=l-d,u=i*c;isFinite(u)&&(e.rotation.y=u%(2*Math.PI))}}}updateLOD(){if(!this.moonData)return;const e=this.camera.position,a=new Wt,s=new Le;s.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse),a.setFromProjectionMatrix(s),this.moonMeshes.forEach((o,n)=>{const i=e.distanceTo(o.position),l=this.moonData.moons[n];if(!a.containsPoint(o.position)&&i>this.moonData.render_settings.lod_distances[1]){o.visible=!1;return}const c=this.moonData.render_settings.max_visible_distance*2;if(o.visible=i<c,!o.visible)return;const t=l.properties.radius_km/i;let h=2;i<this.moonData.render_settings.lod_distances[0]||t>.001?h=0:(i<this.moonData.render_settings.lod_distances[1]||t>1e-4)&&(h=1);const g=o.getObjectByName(`moon-surface-${l.name}`);g&&g.geometry instanceof X&&this.applyGeometryLOD(g,h,i);const m=this.moonData.render_settings.max_visible_distance;if(i>m*.5){const p=Math.max(.3,1-(i-m*.5)/(m*.5));o.scale.setScalar(p)}else o.scale.setScalar(1)})}applyGeometryLOD(e,a,s){e.geometry;const o=e.material;s>1e3&&(o.roughness=Math.min(1,o.roughness+.1),o.metalness=Math.max(0,o.metalness-.05))}getMoonAtPosition(e){const a=e.intersectObjects(this.scene.children,!0);for(const s of a)if(s.object.userData?.isMoon||s.object.userData?.isMoonIndicator)return s.object.userData.moonData;return null}getMoonPosition(e){const a=this.moonMeshes.find(s=>s.name===`moon-${e}`);return a?a.position.clone():null}dispose(){this.fadeOutTimer&&(clearTimeout(this.fadeOutTimer),this.fadeOutTimer=null),this.initialShowTimer&&(clearTimeout(this.initialShowTimer),this.initialShowTimer=null),this.clearMoons(),this.moonMaterials.forEach(e=>e.dispose()),this.moonMaterials.clear()}startInitialShowTimer(){this.orbitalLinesTargetOpacity=0,this.orbitalLinesCurrentOpacity=0,this.lastInteractionTime=Date.now(),this.initialShowTimer=null}detectCameraMovement(){const e=this.camera.position.clone(),a=new P;this.camera.getWorldDirection(a);const s=e.distanceTo(this.lastCameraPosition)>this.cameraMovementThreshold,o=a.distanceTo(this.lastCameraTarget)>this.cameraMovementThreshold;return s||o?(this.lastCameraPosition.copy(e),this.lastCameraTarget.copy(a),!0):!1}isCameraMoving(){return this.detectCameraMovement()}onCameraMovement(){this.lastInteractionTime=Date.now(),this.fadeOutTimer&&(clearTimeout(this.fadeOutTimer),this.fadeOutTimer=null),this.initialShowTimer&&(clearTimeout(this.initialShowTimer),this.initialShowTimer=null),this.fadeInOrbitalLines(),this.fadeOutTimer=window.setTimeout(()=>{this.fadeOutOrbitalLines(),this.fadeOutTimer=null},this.fadeOutDelay)}fadeInOrbitalLines(){this.orbitalLinesFadeEnabled&&(this.orbitalLinesTargetOpacity=.4)}fadeOutOrbitalLines(){this.orbitalLinesFadeEnabled&&(this.orbitalLinesTargetOpacity=0)}updateOrbitalLinesFade(){if(!this.orbitalLinesFadeEnabled)return;const e=this.orbitalLinesTargetOpacity-this.orbitalLinesCurrentOpacity;Math.abs(e)>.001&&(this.orbitalLinesCurrentOpacity+=e*this.fadeSpeed,this.orbitalLines.forEach(n=>{if(n.name&&n.name.startsWith("moon-orbit-")){const i=this.orbitalLinesCurrentOpacity>.05;n.visible=i,i&&n.traverse(l=>{l instanceof Xe&&l.material instanceof Se&&l.name&&l.name.startsWith("moon-orbit-segment-")&&(l.material.opacity=this.orbitalLinesCurrentOpacity)})}}));const a=Date.now()/1e3,s=.5+Math.sin(a*4)*.4,o=this.orbitalLinesCurrentOpacity*s;this.smallMoonIndicators.forEach(n=>{if(n.material instanceof pe&&(n.visible=this.orbitalLinesCurrentOpacity>.05,n.material.opacity=o,n.parent)){const i=new P;n.parent.getWorldPosition(i),n.lookAt(this.camera.position)}})}enableOrbitalLinesFade(e){this.orbitalLinesFadeEnabled=e,e||(this.orbitalLinesTargetOpacity=.4,this.orbitalLinesCurrentOpacity=.4,this.updateOrbitalLinesFade())}isOrbitalLinesFadeEnabled(){return this.orbitalLinesFadeEnabled}}const to=[{key:"terran",type:"Oceanic",atmosphere:"Nitrogen",temperature:14},{key:"desert",type:"Desert",atmosphere:"Thin",temperature:45},{key:"barren",type:"Rocky",atmosphere:"None",temperature:-20},{key:"metal",type:"Metallic",atmosphere:"None",temperature:120},{key:"crystal",type:"Crystalline",atmosphere:"None",temperature:-40},{key:"diamond",type:"Diamond",atmosphere:"None",temperature:-80},{key:"ice",type:"Icy",atmosphere:"Frozen",temperature:-140},{key:"lava",type:"Lava",atmosphere:"Sulfur Dioxide",temperature:900},{key:"gas",type:"Gas Giant",atmosphere:"Hydrogen",temperature:-120},{key:"mirror",type:"Mirror",atmosphere:"Thin",temperature:1e3},{key:"veiled",type:"Toxic",atmosphere:"Toxic",temperature:300},{key:"radioactive",type:"Radioactive",atmosphere:"Ionic",temperature:200},{key:"exotic",type:"Exotic",atmosphere:"Exotic Gases",temperature:40},{key:"anomaly",type:"Anomaly",atmosphere:"None",temperature:0},{key:"superPuff",type:"Super Puff",atmosphere:"Methane",temperature:-100},{key:"superRinged",type:"Super Ringed",atmosphere:"Hydrogen",temperature:-150,rings:!0}],ao={has_rings:!0,inner_radius:140,outer_radius:260,planet_radius:100,tilt_factor:.24,shape_seed:421,bands:[{inner:140,outer:178},{inner:186,outer:232},{inner:240,outer:260}]},at=new WeakMap;function Ft(r){return r.info?.programs?.length??0}async function oo(r,e={}){const a=performance.now();let s=at.get(r);s||(s=new Set,at.set(r,s));const o=e.probes??to;let n=0,i=0,l=0;for(let d=0;d<o.length&&!e.signal?.aborted;d+=1){const c=o[d];if(s.has(c.key)){i+=1;continue}e.onProgress?.({done:d,total:o.length,key:c.key});try{await io(r,c,e.signal),s.add(c.key),n+=1}catch{l+=1}await ro()}return{total:o.length,warmed:n,skipped:i,failed:l,ms:performance.now()-a,programs:Ft(r)}}function so(r){const e=Ct({name:`probe-${r.key}`,planet_type:r.type,atmosphere:r.atmosphere,surface_temperature:r.temperature,seed:`probe|${r.key}`}),a=_t(e),s=new mt,o=new X(1,12,8),n=new E(o,new pe);s.add(n);const i=r.type==="Super Ringed",l=r.type==="Super Puff"?.035:0,d=new St(a,n,s,1,r.rings?ao:null,new Set,i,l),c=new je(40,1,.01,50);return c.position.set(0,.45,3.4),c.updateMatrixWorld(),{scene:s,camera:c,mesh:n,dispose:()=>{d.dispose(),o.dispose(),n.material.dispose(),s.remove(n)}}}async function io(r,e,a){const s=so(e);if(typeof r.compileAsync!="function"){try{r.compile(s.scene,s.camera)}finally{s.dispose()}return}await r.compileAsync(s.scene,s.camera).catch(()=>{}).finally(()=>s.dispose())}function ro(){return new Promise(r=>{const e=globalThis.requestIdleCallback;typeof e=="function"?e(()=>r(),{timeout:120}):setTimeout(r,0)})}const ue=1,no=86400;function yo({planet:r,className:e,maxOctaves:a=7.5,secondsPerRotation:s=40,elapsedScale:o=300,lightDirection:n=[.85,.22,.5],rings:i=null,moons:l=0,galacticCore:d=[0,0,0],pauseWhenHidden:c=!0,maxPixelRatio:u=2,warmVariants:t=!0,onReady:h,onCacheStats:g,onError:m}){const p=fe.useRef(null),y=fe.useRef(null),x=fe.useRef(null),k=typeof l=="number"?l:l?.count??0,_=i&&i.has_rings!==!1?`r${i.shape_seed}:${i.bands.length}`:"r0",w=`${r.name??""}|${r.planet_type??""}|${r.seed??""}|${r.surface_temperature??""}|${_}|m${k}`,M=fe.useRef({maxOctaves:a,secondsPerRotation:s,elapsedScale:o,lightDirection:n,galacticCore:d,warmVariants:t,onReady:h,onCacheStats:g,planet:r,rings:i,moons:l});return M.current={maxOctaves:a,secondsPerRotation:s,elapsedScale:o,lightDirection:n,galacticCore:d,warmVariants:t,onReady:h,onCacheStats:g,planet:r,rings:i,moons:l},fe.useEffect(()=>{const v=p.current;if(!v)return;let S;try{S=new Bt({antialias:!0,alpha:!0,powerPreference:"high-performance"})}catch(U){m?.(U instanceof Error?U.message:"WebGL unavailable");return}const L=Math.min(window.devicePixelRatio||1,u);S.setPixelRatio(L),S.toneMapping=Gt,S.toneMappingExposure=1,S.domElement.style.display="block",v.appendChild(S.domElement);const b=new mt,C=new je(40,1,.01,200);C.position.set(0,ue*.45,ue*3.4);const F=new $t(C,S.domElement);F.enableDamping=!0,F.dampingFactor=.08,F.enablePan=!1,F.minDistance=ue*1.25,F.maxDistance=ue*9,F.rotateSpeed=.6;const A={renderer:S,scene:b,camera:C,controls:F,lights:[],visible:!0,frames:0,started:performance.now()};y.current=A;const D=new Vt(16774116,2.2),Z=new it(2240580,.55);b.add(D,Z),A.lights=[D,Z];const B=()=>{const U=v.clientWidth||1,re=v.clientHeight||1;S.setSize(U,re,!1),C.aspect=U/re,C.updateProjectionMatrix()};B();const T=new ResizeObserver(B);T.observe(v);const q=c?new IntersectionObserver(U=>{A.visible=U.some(re=>re.isIntersecting)},{threshold:.01}):null;q?.observe(v);const N=new P,oe=new P,R=new z(16774116),O=new AbortController;let I=!1,W=null,V=0,H=0,K=0;const ie=(U,re,Ie,ce)=>{M.current.onCacheStats?.({programs:Ft(S),warmed:re,total:Ie,warming:U,ms:ce})};let J=0;const Ue=()=>{if(J=requestAnimationFrame(Ue),!A.visible)return;A.frames+=1;const U=x.current;if(!U)return;const re=(performance.now()-A.started)/1e3,Ie=re/Math.max(M.current.secondsPerRotation,1)*Math.PI*2;U.mesh.rotation.y=Ie,N.set(...M.current.lightDirection).normalize(),oe.set(...M.current.galacticCore),D.position.copy(N).multiplyScalar(10),F.update(),U.planet.update({lightDir:N,sunColor:R,camera:C,viewportHeight:S.domElement.height,maxOctaves:M.current.maxOctaves,elapsed:re*M.current.elapsedScale,rotationPeriod:U.rotationPeriod,galacticCore:oe}),U.moonSystem?.update(),S.render(b,C),!I&&A.frames===2&&M.current.warmVariants&&(I=!0,ie(!0,0,0,0),W=oo(S,{signal:O.signal,onProgress:ce=>ie(!0,ce.done,ce.total,0)}).then(ce=>{V=ce.warmed,H=ce.total,K=ce.ms}).catch(()=>{}).finally(()=>{I=!1,ie(!1,V,H,K)}))};return Ue(),h?.(S),()=>{if(O.abort(),cancelAnimationFrame(J),q?.disconnect(),T.disconnect(),F.dispose(),b.remove(D,Z),S.domElement.remove(),W){const U=S;W.finally(()=>{try{U.dispose()}catch{}})}else S.dispose();y.current=null}},[u,c]),fe.useEffect(()=>{const v=y.current;if(!v)return;const{scene:S,camera:L}=v,b=M.current,C=Ct(b.planet),F=_t(C),A=new X(ue,128,64),D=new E(A,new pe);S.add(D);const Z=String(b.planet.planet_type??"").replace(/_/g," "),B=Z==="Super Ringed",T=Z==="Super Puff"?.035:0,q=b.rings&&b.rings.has_rings!==!1?b.rings:null,N=new St(F,D,S,ue,q,Ga(C),B,T),oe=Math.abs(b.planet.rotation_period_seconds||no),R=Qa(b.moons,String(b.planet.seed??b.planet.name??"atlas"),ue);let O=null;R&&(O=new Me(S,ue,L,new P(0,0,0),0),O.loadMoonSystem(R));const I={signature:w,scene:S,mesh:D,geometry:A,planet:N,moonSystem:O,rotationPeriod:oe,dispose:()=>{O?.dispose(),N.dispose(),S.remove(D),A.dispose(),D.material.dispose()}};return x.current=I,()=>{x.current===I&&(x.current=null),I.dispose()}},[w,u,c]),Ht.jsx("div",{ref:p,className:e,style:{width:"100%",height:"100%"}})}const Fe={low:{maxOctaves:5,maxPixelRatio:1.5},mid:{maxOctaves:6.5,maxPixelRatio:2},high:{maxOctaves:7.5,maxPixelRatio:2}};function lo(){try{const r=new URLSearchParams(window.location.search).get("quality");return r==="low"||r==="mid"||r==="high"?r:null}catch{return null}}function wo(){const r=lo();if(r)return{tier:r,...Fe[r],reason:"url override"};const e=navigator.hardwareConcurrency??4,a=window.devicePixelRatio||1,s=Math.min(window.innerWidth,window.innerHeight)<500;return e<=4||s&&a>2?{tier:"low",...Fe.low,reason:`cores=${e} dpr=${a} small=${s}`}:e>=8&&a<=2?{tier:"high",...Fe.high,reason:`cores=${e} dpr=${a}`}:{tier:"mid",...Fe.mid,reason:`cores=${e} dpr=${a}`}}export{yo as R,go as S,bo as a,Yt as b,ke as c,wo as q,vo as s};
