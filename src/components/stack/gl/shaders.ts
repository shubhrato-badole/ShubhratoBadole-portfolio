// All GLSL for the scene. Values (flutes, glass, side fx, floor, ceiling…) follow the reference's tuning.
export const slabVert = /* glsl */ `
attribute float aSlot;
attribute float aCell;
uniform vec2 uSlab;
uniform float uHoverSlotA; uniform float uHoverA;
uniform float uHoverSlotB; uniform float uHoverB;
uniform float uN;
varying vec2 vLocal;
varying vec3 vN;
varying vec3 vWorld;
varying float vSlot;
varying float vCell;
varying float vFace;
varying float vDist;
void main() {
  vec3 p = position;
  float lift = step(abs(aSlot - uHoverSlotA), 0.5) * uHoverA + step(abs(aSlot - uHoverSlotB), 0.5) * uHoverB;
  p.z += lift * 0.07;
  mat4 M = modelMatrix * instanceMatrix;
  vec4 w = M * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(M) * normal);
  vLocal = position.xy / uSlab + 0.5;
  vSlot = aSlot; vCell = aCell; vFace = normal.z;
  vec3 c = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float ang = atan(c.x, c.z);
  vDist = abs(ang) / (6.2831853 / uN);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const slabFrag = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas; uniform vec2 uGrid; uniform float uInset;
uniform sampler2D uCode; uniform vec3 uCodeTint; uniform vec2 uCodeUvScale; uniform float uCodeWidth; uniform float uCodeStrength; uniform float uCodeSpeed; uniform float uActiveCodeFade;
uniform vec2 uSlab; uniform float uCorner; uniform float uTime;
uniform vec3 uAccent;
uniform float uReflPass;
uniform float uHoverSlotA; uniform float uHoverA; uniform vec2 uPtrA; uniform float uRipA;
uniform float uHoverSlotB; uniform float uHoverB; uniform vec2 uPtrB; uniform float uRipB;
uniform sampler2D uInfoA; uniform float uInfoProgA;
uniform sampler2D uInfoB; uniform float uInfoProgB;
uniform float uInfoOnA; uniform float uInfoOnB;
uniform float uSideFadeStart; uniform float uSideFadeEnd;
uniform float uSideFxStart; uniform float uSideFxEnd;
uniform float uSideGrid; uniform float uSideGridStrength; uniform float uSideCa; uniform float uSideCaStart;
uniform float uSideSmear; uniform float uSideLiquid; uniform float uSideLiquidSpeed;
uniform float uInactiveDim; uniform float uActiveBright; uniform float uBackDarken;
uniform float uFlute; uniform float uFluteShade; uniform float uFluteStrength;
varying vec2 vLocal; varying vec3 vN; varying vec3 vWorld;
varying float vSlot; varying float vCell; varying float vFace; varying float vDist;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 cellNoise(vec2 c){ return vec2(hash21(c), hash21(c + 17.3)) - 0.5; }
// the reference renders in linear light and encodes to sRGB on output; the card art here is already display-coloured,
// so the code overlay is added in linear and converted back (that is what makes it readable instead of a 6/255 smudge)
vec3 toLinear(vec3 c){ return mix(pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), c * 0.0773993808, step(c, vec3(0.04045))); }
vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0)); return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308))); }
vec3 atlas(float cell, vec2 uv){
  cell = floor(cell + 0.5);   // varyings are interpolated: snap to the exact integer cell
  float col = mod(cell, uGrid.x); float row = floor(cell / uGrid.x);
  vec2 inCell = clamp(uv, uInset, 1.0 - uInset);
  vec2 a = vec2((col + inCell.x) / uGrid.x, 1.0 - (row + (1.0 - inCell.y)) / uGrid.y);
  return texture2D(uAtlas, a).rgb;
}
vec2 coverUV(vec2 uv, float imgA, float zoneA){
  if (imgA > zoneA) { float s = zoneA / imgA; uv.x = uv.x * s + (1.0 - s) * 0.5; }
  else { float s = imgA / zoneA; uv.y = uv.y * s + (1.0 - s) * 0.5; }
  return uv;
}
float infoReveal(vec2 uv, float prog){
  // per-character wave: left-to-right with a hashed jitter, so glyphs "decode" in
  vec2 cell = floor(vec2(uv.x * 28.0, uv.y * 26.0));
  float h = hash21(cell);
  float t = prog * 1.35 - (uv.x * 0.55 + h * 0.35 + uv.y * 0.1);
  return clamp(t * 4.0, 0.0, 1.0);
}
vec4 info(sampler2D tex, vec2 uv, float prog, vec2 off){
  vec2 u = coverUV(uv, 0.65, uSlab.x / uSlab.y);
  float rv = infoReveal(u, prog);
  float r = texture2D(tex, u + off).a;
  float g = texture2D(tex, u).a;
  float b = texture2D(tex, u - off).a;
  vec3 acc = mix(uAccent, vec3(1.0), smoothstep(0.0, 1.0, rv));
  float scr = step(rv, 0.999) * step(0.001, rv);
  float a = max(max(r, g), b) * rv;
  return vec4(vec3(r, g, b) * acc * rv + scr * acc * g * 0.2, a);
}
void main() {
  // the glass pass draws the edges, bevel and border glow: this pass only paints the card face (and a dark back)
  if (vFace < 0.5 && vFace > -0.5) discard;
  float away = -vWorld.z / max(length(vWorld.xz), 1e-4);
  float fade = 1.0 - smoothstep(uSideFadeStart, uSideFadeEnd, away);
  if (fade < 0.004 || vCell < -0.5) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  float ndv = abs(dot(N, V));
  // active amount, as in the reference: full on the front card, gone by the neighbours (half a slot = uActiveHalf)
  float act = 1.0 - smoothstep(0.3, 0.8, vDist);
  float hov = step(abs(vSlot - uHoverSlotA), 0.5) * uHoverA + step(abs(vSlot - uHoverSlotB), 0.5) * uHoverB;
  vec3 col;
  if (vFace > 0.5) {
    // ───────── front face: the card ─────────
    float fx = smoothstep(uSideFxStart, uSideFxEnd, 1.0 - ndv) * (1.0 - uReflPass);
    vec2 offs = vec2(0.0); vec2 ca = vec2(0.0);
    if (fx > 0.0) {
      float fx2 = fx * fx; float sgn = sign(vWorld.x + 1e-5);
      vec2 cn = cellNoise(floor(vLocal * uSideGrid) / uSideGrid);
      float smear = fx * fx2 * uSideSmear * sgn;
      vec2 waves = vec2(sin(vLocal.y * 25.0 + uTime * uSideLiquidSpeed), cos(vLocal.x * 18.0 + uTime * uSideLiquidSpeed * 0.7) * 0.6) * fx2 * uSideLiquid;
      offs = cn * fx2 * uSideGridStrength + vec2(smear, 0.0) + waves;
      float caAmt = smoothstep(uSideCaStart, uSideFxEnd, 1.0 - ndv);
      ca = vec2(cn.x, sgn * 0.4) * caAmt * caAmt * uSideCa;
    }
    vec2 uv = vLocal + offs;
    // hover ripple (radial, chromatic) centred on the pointer
    float ripple = 0.0; vec2 rdir = vec2(0.0);
    for (int i = 0; i < 2; i++) {
      float on = i == 0 ? step(abs(vSlot - uHoverSlotA), 0.5) * uHoverA : step(abs(vSlot - uHoverSlotB), 0.5) * uHoverB;
      vec2 pc = i == 0 ? uPtrA : uPtrB; float tt = i == 0 ? uRipA : uRipB;
      vec2 dv = (vLocal - pc) * vec2(uSlab.x / uSlab.y, 1.0);
      float d = length(dv);
      float front = tt * 1.4;
      float w = exp(-pow((d - front) * 10.0, 2.0)) * smoothstep(1.4, 0.0, d);
      float s = sin(d * 12.0 - tt * 9.0) * w * on;
      ripple += abs(s); rdir += normalize(dv + 1e-5) * s * 0.012;
    }
    uv += rdir;
    vec2 cc = ca + rdir * 0.5;
    // flutes (vertical glass ribs), exactly as the reference: every card that is neither active nor hovered
    float fluteAmt = (1.0 - hov) * (1.0 - act);
    float fl = fract(vLocal.x * uFlute) - 0.5;
    vec2 fo = vec2(-fl * uFluteStrength * fluteAmt, 0.0);
    float fShade = 1.0 - uFluteShade * (2.0 * abs(fl)) * fluteAmt;
    vec3 art;
    art.r = atlas(vCell, uv + cc + fo).r; art.g = atlas(vCell, uv + fo).g; art.b = atlas(vCell, uv - cc + fo).b;
    art *= fShade;
    // scrolling code, in the right-hand part of the card, only where the picture is dark (reference maths)
    if (uReflPass < 0.5) {
      float colLeft = 1.0 - uCodeWidth;
      float codeX = vLocal.x + offs.x + fo.x;
      vec2 codeUv = vec2((codeX - colLeft) * uCodeUvScale.x, (vLocal.y + offs.y) * uCodeUvScale.y + vSlot * 0.37 - uTime * uCodeSpeed);
      float code = texture2D(uCode, codeUv).a;
      code *= smoothstep(colLeft - 0.02, colLeft + 0.02, codeX);
      code *= 1.0 - act * uActiveCodeFade;
      code *= (1.0 - hov);
      vec3 lin = toLinear(art);
      float luma = dot(lin, vec3(0.299, 0.587, 0.114));
      float codeMask = smoothstep(0.75, 0.18, luma);
      lin += uCodeTint * code * uCodeStrength * codeMask * (1.0 - lin);
      art = toSRGB(lin);
    }
    // brightness: dim when inactive, a little brighter on the active card (reference), plus a lift on hover
    art *= mix(uInactiveDim, 1.0 + uActiveBright, act) * (1.0 + hov * 0.12);
    art += uAccent * ripple * 0.10 * hov;
    // hover: glitchy info grid
    float glitch = step(0.985, hash21(vec2(floor(uTime * 9.0), floor(vLocal.y * 14.0)))) * 0.01;
    vec2 ioff = vec2(0.0035 + glitch, 0.0);
    vec4 iA = info(uInfoA, vLocal + vec2(glitch, 0.0), uInfoProgA, ioff) * uInfoOnA * step(abs(vSlot - uHoverSlotA), 0.5) * uHoverA;
    vec4 iB = info(uInfoB, vLocal + vec2(glitch, 0.0), uInfoProgB, ioff) * uInfoOnB * step(abs(vSlot - uHoverSlotB), 0.5) * uHoverB;
    float darken = max(iA.a, iB.a);
    art *= 1.0 - 0.38 * darken;
    art += (iA.rgb + iB.rgb);
    col = art;
  } else {
    col = vec3(0.362, 0.142, 0.95) * 0.12 * uBackDarken;   // back of the slab
  }
  col *= fade;
  gl_FragColor = vec4(col, 1.0);
}`;

/* ───────────── the glass slab: body, bright edges, bevel glints, iridescence, border glow (reference shader, sky removed because the
   reference sets every sky colour to black; exit-choreography removed because the Stack has none) ───────────── */
export const glassVert = /* glsl */ `
attribute float aSlot;
uniform vec3 uHalf;
uniform float uHoverSlotA; uniform float uHoverA; uniform float uHoverSlotB; uniform float uHoverB;
varying vec3 vLocal; varying vec3 vLocalNormal; varying vec4 vInfo; varying vec3 vWorldPos; varying vec3 vWorldNormal;
void main() {
  vLocal = position; vLocalNormal = normal; vInfo = vec4(uHalf, aSlot);
  vec3 p = position;
  float lift = step(abs(aSlot - uHoverSlotA), 0.5) * uHoverA + step(abs(aSlot - uHoverSlotB), 0.5) * uHoverB;
  p.z += lift * 0.07;                         // same lift as the card face
  mat4 M = modelMatrix * instanceMatrix;
  vec4 wp = M * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(M) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const glassFrag = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uBodyAlpha;
uniform float uEdgeAlpha; uniform float uEdgeBright; uniform vec3 uEdgeTint;
uniform float uCornerRadius; uniform vec3 uBorderGlowColor; uniform float uBorderGlowWidth; uniform float uBorderGlow;
uniform float uIridescence; uniform float uHueRoll;
uniform float uSweepSpeed; uniform float uSweepWidth; uniform float uSweepStrength;
uniform float uFluteCount; uniform float uFluteShine; uniform float uFluteDepth;
uniform float uHoverSlotA; uniform float uHoverA; uniform float uHoverSlotB; uniform float uHoverB;
uniform float uSideFadeStart; uniform float uSideFadeEnd;
uniform float uActiveHalf; uniform float uActiveBoost;
uniform float uReflPass;
varying vec3 vLocal; varying vec3 vLocalNormal; varying vec4 vInfo; varying vec3 vWorldPos; varying vec3 vWorldNormal;

vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0)); return mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308))); }
float roundedRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float away = -vWorldPos.z / max(length(vWorldPos.xz), 1e-4);
  float fade = 1.0 - smoothstep(uSideFadeStart, uSideFadeEnd, away);
  if (fade <= 0.0) discard;

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 n = normalize(vWorldNormal);
  if (dot(n, viewDir) < 0.0) n = -n;
  vec3 ln = normalize(vLocalNormal);

  float wFront = smoothstep(0.55, 0.85, abs(ln.z));
  float wSide = smoothstep(0.55, 0.85, abs(ln.x));
  float wCap = smoothstep(0.55, 0.85, abs(ln.y));
  float wBevel = clamp(1.0 - wFront - wSide - wCap, 0.0, 1.0);

  float ringA = atan(vWorldPos.x, vWorldPos.z);
  float activeAmt = 1.0 - smoothstep(uActiveHalf * 0.6, uActiveHalf * 1.6, abs(ringA));

#ifndef BACK_PASS
  float slabHover = max(step(abs(vInfo.w - uHoverSlotA), 0.5) * uHoverA, step(abs(vInfo.w - uHoverSlotB), 0.5) * uHoverB);
  float fluteFade = (1.0 - slabHover) * (1.0 - activeAmt);
  float ribT = fract((vLocal.x / vInfo.x * 0.5 + 0.5) * uFluteCount) - 0.5;
  vec3 ribTangent = normalize(vec3(n.z, 1e-5, -n.x));
  n = normalize(n + ribTangent * (ribT * uFluteDepth * wFront * fluteFade));
#endif

  float ndv = clamp(dot(n, viewDir), 0.0, 1.0);
  vec3 refl = reflect(-viewDir, n);
  float fresnel = pow(1.0 - ndv, 3.0);
  float bodyA = uBodyAlpha + fresnel * 0.12;
  float vGrad = 0.55 + 0.45 * smoothstep(-vInfo.y, vInfo.y, vLocal.y);
  vec3 lightDir = normalize(vec3(0.2, 0.45, -1.0));
  float spec = pow(max(dot(refl, lightDir), 0.0), 24.0);
#ifdef BACK_PASS
  vec3 edgeCol = uEdgeTint * uEdgeBright * vGrad;
  vec3 bevelCol = vec3(0.74, 0.82, 1.0) * 0.4;
#else
  float along = (abs(ln.x) > abs(ln.y) ? vLocal.y / vInfo.y : vLocal.x / vInfo.x);
  float iriAmt = uIridescence * (1.0 - uReflPass);
  vec3 iri = 0.5 + 0.5 * cos(6.2832 * (along * 0.35 + vInfo.w * 0.37 + uTime * uHueRoll) + vec3(0.0, 2.094, 4.188));
  vec3 edgeCol = uEdgeTint * uEdgeBright * vGrad;
  edgeCol = mix(edgeCol, edgeCol * iri * 1.7, iriAmt);
  vec3 bevelCol = mix(vec3(0.74, 0.82, 1.0), iri, iriAmt * 0.8) * 0.4;
#endif
  float bevelGlint = fresnel * 0.9 + spec * 1.4;

  float wEdge = max(wSide, wCap);
  vec3 col = edgeCol * wEdge;                       // (the body itself is black glass: its colour comes from the sky, which is black)
  float alpha = bodyA * wFront + uEdgeAlpha * wEdge;

  col += bevelCol * bevelGlint * (wBevel * 1.3 + wEdge * 0.35 + wFront * 0.3);
  alpha += bevelGlint * (wBevel * 0.85 + wFront * 0.25);

  // the thick glowing frame: an exponential glow measured inward from the rounded edge
  float borderDist = -roundedRect(vLocal.xy, vInfo.xy, uCornerRadius);
  float borderGlow = exp(-max(borderDist, 0.0) / uBorderGlowWidth);
  float borderBoost = 1.0 + activeAmt * uActiveBoost;
  col += uBorderGlowColor * borderGlow * uBorderGlow * borderBoost;
  alpha += borderGlow * uBorderGlow * 0.55 * borderBoost;

#ifndef BACK_PASS
  float fluteShine = uFluteShine * smoothstep(0.3, 0.0, abs(ribT)) * wFront * fluteFade;
  col += vec3(0.82, 0.86, 1.0) * fluteShine * (0.4 + fresnel);
  alpha += fluteShine * 0.12;
  if (uReflPass < 0.5) {
    float band1 = smoothstep(1.0 - uSweepWidth, 1.0, cos(ringA - uTime * uSweepSpeed));
    float band2 = smoothstep(1.0 - uSweepWidth * 1.8, 1.0, cos(ringA + uTime * uSweepSpeed * 0.63 + 2.1)) * 0.5;
    float sweep = (band1 + band2) * uSweepStrength * (0.3 + 0.7 * fresnel);
    col += sweep * mix(vec3(0.80, 0.86, 1.0), iri, 0.5);
    alpha += sweep * 0.4;
  }
#endif

  col *= fade; alpha *= fade;
  gl_FragColor = vec4(toSRGB(col), alpha);          // the reference ends with colorspace_fragment (linear -> sRGB)
}`;

export const floorVert = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv; varying vec3 vW;
void main() {
  vUv = textureMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const floorFrag = /* glsl */ `
precision highp float;
uniform vec3 color; uniform sampler2D tDiffuse;
uniform sampler2D uAlbedo; uniform sampler2D uNormalMap; uniform sampler2D uRoughMap; uniform float uHasMaps;
uniform float uUvScale; uniform float uAlbedoScale; uniform float uNormalStrength;
uniform float uReflectBase; uniform float uReflectGraze; uniform float uReflectMax; uniform vec3 uReflectTint;
uniform float uDistort; uniform float uBlur; uniform float uFadeStart; uniform float uFadeEnd;
varying vec4 vUv; varying vec3 vW;
void main() {
  vec2 puv = vW.xz * uUvScale;
  vec3 nm = vec3(0.0, 0.0, 1.0); float rough = 0.5; vec3 alb = vec3(0.4);
  if (uHasMaps > 0.5) {
    nm = texture2D(uNormalMap, puv).xyz * 2.0 - 1.0;
    rough = texture2D(uRoughMap, puv).r;
    alb = texture2D(uAlbedo, puv).rgb;
  }
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(V.y, 0.0, 1.0);
  float fres = min(mix(uReflectBase, uReflectGraze, pow(1.0 - ndv, 3.0)), uReflectMax);
  vec2 d = nm.xy * uNormalStrength * uDistort * (0.5 + rough);
  vec4 q = vUv; q.xy += d * vUv.w;
  float b = uBlur * vUv.w * (0.6 + rough);
  vec3 refl = texture2DProj(tDiffuse, q).rgb * 0.4;
  refl += texture2DProj(tDiffuse, q + vec4(b, 0.0, 0.0, 0.0)).rgb * 0.15;
  refl += texture2DProj(tDiffuse, q - vec4(b, 0.0, 0.0, 0.0)).rgb * 0.15;
  refl += texture2DProj(tDiffuse, q + vec4(0.0, b, 0.0, 0.0)).rgb * 0.15;
  refl += texture2DProj(tDiffuse, q - vec4(0.0, b, 0.0, 0.0)).rgb * 0.15;
  float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, length(vW.xz));
  vec3 c = alb * uAlbedoScale + refl * uReflectTint * fres * fade * 2.6;
  gl_FragColor = vec4(c, 1.0);
}`;

export const railVert = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const railFrag = /* glsl */ `
precision highp float;
uniform float uTime; uniform float uRadius; uniform float uRail; uniform float uRailStrength;
uniform float uHalo; uniform float uHaloStrength; uniform vec3 uColor;
varying vec3 vW;
void main(){
  float d = abs(length(vW.xz) - uRadius);
  float rail = exp(-pow(d / uRail, 2.0));
  float halo = exp(-pow(d / uHalo, 2.0));
  float breath = 1.0 + sin(uTime * 6.2831853 * 0.22) * 0.12;
  vec3 c = uColor * (rail * uRailStrength + halo * uHaloStrength) * breath;
  gl_FragColor = vec4(c, 1.0);
}`;

export const ceilVert = /* glsl */ `
varying vec3 vWorldPos;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorldPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const ceilFrag = /* glsl */ `
precision highp float;
uniform float uCellSize; uniform float uBeamWidth; uniform float uRibCount; uniform float uLightEvery; uniform float uLightWidth;
uniform float uBevel; uniform vec3 uPanelColor; uniform vec3 uBeamColor; uniform vec3 uLightColor; uniform float uLightIntensity;
uniform float uDim; uniform float uFadeStart; uniform float uFadeEnd;
varying vec3 vWorldPos;
void main(){
  vec2 p = vWorldPos.xz;
  float far = smoothstep(uFadeStart, uFadeEnd, length(vWorldPos - cameraPosition));
  vec2 g = p / uCellSize; vec2 f = fract(g); vec2 fw = fwidth(g);
  float minBorder = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float beam = 1.0 - smoothstep(uBeamWidth, uBeamWidth + fw.x + fw.y, minBorder);
  float ribTri = abs(fract(g.x * uRibCount) - 0.5) * 2.0;
  float ribShade = mix(0.22, 1.0, smoothstep(0.12, 0.6, ribTri));
  float ao = mix(0.5, 1.0, smoothstep(0.08, 0.5, length(f - 0.5)));
  vec3 col = uPanelColor * ribShade * ao;
  col = mix(col, uBeamColor, beam);
  float bevel = exp(-pow((minBorder - uBeamWidth) / (uBeamWidth * 0.7), 2.0));
  col += uBeamColor * bevel * uBevel;
  col *= (1.0 - far) * uDim;
  float nx = floor(g.x + 0.5);
  float onLight = 1.0 - step(0.5, mod(nx, uLightEvery));
  float distToLine = abs(g.x - nx);
  float light = onLight * (1.0 - smoothstep(uLightWidth, uLightWidth + fw.x, distToLine));
  col += uLightColor * light * uLightIntensity * (1.0 - far);
  gl_FragColor = vec4(col, 1.0);
}`;

export const partVert = /* glsl */ `
uniform float uTime; uniform float uPixelRatio;
attribute float aSize; attribute float aPhase; attribute float aSpeed;
varying float vTw;
void main(){
  vec3 pos = position; float ph = aPhase * 6.2831853; float t = uTime; float s = aSpeed;
  pos.x += sin(t * 0.3 * s + ph) * 0.6 + sin(t * 0.13 + ph * 1.7) * 0.4;
  pos.y += cos(t * 0.24 * s + ph * 1.3) * 0.5 + sin(t * 0.11 + ph) * 0.3;
  pos.z += sin(t * 0.27 * s + ph * 0.7) * 0.6 + cos(t * 0.16 + ph * 1.4) * 0.4;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vTw = 0.5 + 0.5 * sin(t * (0.6 + s) + ph * 3.0);
  gl_PointSize = aSize * uPixelRatio * (14.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
export const partFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform vec3 uCore; varying float vTw;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d); a *= a;
  vec3 c = mix(uColor, uCore, smoothstep(0.6, 0.0, d));
  gl_FragColor = vec4(c * a * (0.35 + 0.65 * vTw), a * (0.35 + 0.65 * vTw));
}`;

export const fsVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const compFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes; uniform float uWinH; uniform float uOpen; uniform float uVig; uniform float uAlpha;
varying vec2 vUv;
// uWinH : the part of the screen (from the bottom, 0..1) that is uncovered while the page lifts away
// uOpen : 0 = the scene sits small inside that window, 1 = full screen (eased by the caller)
void main(){
  float s = mix(0.74, 1.0, uOpen);
  float cy = mix(uWinH * 0.5, 0.5, uOpen);
  vec2 suv = (vUv - vec2(0.5, cy)) / s + 0.5;
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec3 c = texture2D(tScene, clamp(suv, 0.0, 1.0)).rgb;
  vec2 q = suv - 0.5;
  float v = smoothstep(0.13, 0.62, length(q * vec2(1.0, 0.9)));
  c *= 1.0 - v * uVig;
  float edge = smoothstep(0.0, 0.07, min(min(suv.x, 1.0 - suv.x), min(suv.y, 1.0 - suv.y)));
  c *= mix(1.0, edge, step(uOpen, 0.999));
  c = mix(vec3(0.0196, 0.0196, 0.0275), c, inside);
  gl_FragColor = vec4(c, uAlpha);
}`;
