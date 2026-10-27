// atlas-ui/react/static/js/3DEffects/SuperEarthWaterFeatures.tsx
import * as THREE from "three";
import { SeededRandom } from "../Utils/SeededRandom.tsx";

const PROCEDURAL_RANGES = {
  WATER_BODY_COUNT: { min: 4, max: 8 },
  WATER_BODY_RADIUS: { min: 0.07, max: 0.35 },
  WATER_BODY_OPACITY: { min: 0.6, max: 0.85 },
};

export interface SuperEarthWaterFeaturesParams {
  water_bodies?: {
    position_3d: number[];
    radius: number;
    depth: number;
    opacity: number;
    shape_type?: "lake" | "pond" | "elongated" | "complex";
    irregularity?: number;
  }[];
  waterColor?: THREE.Color | number[];
  seed?: number;
  globalIrregularity?: number;
}

export class SuperEarthWaterFeaturesEffect {
  private waterGroup: THREE.Group;
  private waterBodyMeshes: THREE.Mesh[] = [];
  private params: SuperEarthWaterFeaturesParams;
  private rng: SeededRandom;
  private materials: THREE.Material[] = [];
  private planetRadius: number;

  private waterMaterial: THREE.ShaderMaterial;

  private normalMap: THREE.DataTexture;
  private displacementMap: THREE.DataTexture;
  private foamMap: THREE.DataTexture;

  private animationTime: number = 0;

  constructor(planetRadius: number, params: SuperEarthWaterFeaturesParams = {}) {
    const seed = params.seed || Math.floor(Math.random() * 1000000);
    this.rng = new SeededRandom(seed);
    this.planetRadius = planetRadius;

    this.params = {
      water_bodies: params.water_bodies || [],
      waterColor: params.waterColor || new THREE.Color(0.2, 0.5, 0.9),
      globalIrregularity: params.globalIrregularity || 0.7,
      seed,
      ...params,
    };

    this.waterGroup = new THREE.Group();

    this.generateWaterTextures();

    this.createUnifiedWaterMaterial();

    this.generateWaterBodies();
  }

  private generateWaterTextures(): void {
    // Reduced texture sizes for better performance
    const normalSize = 128;
    const normalData = new Uint8Array(normalSize * normalSize * 4);

    for (let i = 0; i < normalSize; i++) {
      for (let j = 0; j < normalSize; j++) {
        const idx = (i * normalSize + j) * 4;

        const u = (i / normalSize) * Math.PI * 6;
        const v = (j / normalSize) * Math.PI * 6;

        const wave1 = Math.sin(u * 1.0 + v * 0.5) * 0.5;
        const wave2 = Math.sin(u * 2.3 - v * 1.1) * 0.3;
        const wave3 = Math.sin(u * 0.7 + v * 1.9) * 0.2;

        const nx = (wave1 + wave2) * 0.5 + 0.5;
        const ny = (wave2 + wave3) * 0.5 + 0.5;
        const nz = 1.0;

        normalData[idx] = nx * 255;
        normalData[idx + 1] = ny * 255;
        normalData[idx + 2] = nz * 255;
        normalData[idx + 3] = 255;
      }
    }

    this.normalMap = new THREE.DataTexture(normalData, normalSize, normalSize, THREE.RGBAFormat);
    this.normalMap.wrapS = THREE.RepeatWrapping;
    this.normalMap.wrapT = THREE.RepeatWrapping;
    // Normal maps are linear data; tagging them sRGB would corrupt lighting.
    this.normalMap.needsUpdate = true;

    const dispSize = 64;
    const dispData = new Uint8Array(dispSize * dispSize * 4);

    for (let i = 0; i < dispSize; i++) {
      for (let j = 0; j < dispSize; j++) {
        const idx = (i * dispSize + j) * 4;

        const u = (i / dispSize) * Math.PI * 2;
        const v = (j / dispSize) * Math.PI * 2;

        const disp1 = Math.sin(u * 2 + v) * 0.3;
        const disp2 = Math.cos(u - v * 2) * 0.3;
        const height = (disp1 + disp2) * 0.25 + 0.5;

        const heightValue = Math.max(0, Math.min(255, height * 255));
        dispData[idx] = heightValue;
        dispData[idx + 1] = heightValue;
        dispData[idx + 2] = heightValue;
        dispData[idx + 3] = 255;
      }
    }

    this.displacementMap = new THREE.DataTexture(dispData, dispSize, dispSize, THREE.RGBAFormat);
    this.displacementMap.wrapS = THREE.RepeatWrapping;
    this.displacementMap.wrapT = THREE.RepeatWrapping;
    this.displacementMap.needsUpdate = true;

    const foamSize = 64;
    const foamData = new Uint8Array(foamSize * foamSize * 4);

    for (let i = 0; i < foamSize; i++) {
      for (let j = 0; j < foamSize; j++) {
        const idx = (i * foamSize + j) * 4;

        const u = (i / foamSize) * Math.PI * 6;
        const v = (j / foamSize) * Math.PI * 6;
        const foamValue = (Math.sin(u) * Math.cos(v) + 1) * 0.5;
        const foam = foamValue > 0.6 ? foamValue * 0.8 : 0;

        const foamIntensity = foam * 255;
        foamData[idx] = foamIntensity;
        foamData[idx + 1] = foamIntensity;
        foamData[idx + 2] = foamIntensity;
        foamData[idx + 3] = 255;
      }
    }

    this.foamMap = new THREE.DataTexture(foamData, foamSize, foamSize, THREE.RGBAFormat);
    this.foamMap.wrapS = THREE.RepeatWrapping;
    this.foamMap.wrapT = THREE.RepeatWrapping;
    this.foamMap.needsUpdate = true;
  }

  private createUnifiedWaterMaterial(): void {
    const vertexShader = `
      uniform float time;
      
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vAnimatedUv;
      
      void main() {
        vUv = uv;

        vAnimatedUv = uv + vec2(time * 0.08, time * 0.06);

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;

        vWorldNormal = normalize(vWorldPosition);
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 waterColor;
      uniform float opacity;
      uniform float time;
      uniform sampler2D normalMap;
      uniform vec3 lightPosition;
      uniform vec3 lightDirection;
      uniform float ambientStrength;
      uniform float lightIntensity;
      
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vAnimatedUv;
      
      void main() {

        vec3 normalMapSample = texture2D(normalMap, vAnimatedUv * 2.0).rgb;
        vec3 perturbedNormal = normalize(vWorldNormal + (normalMapSample - 0.5) * 0.4);

        vec3 normal = normalize(perturbedNormal);

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

        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);

        vec3 finalColor = waterColor;

        finalColor *= totalLight;

        finalColor += vec3(0.2, 0.3, 0.4) * fresnel * 0.3;

        float shimmer = sin(time * 2.5 + vWorldPosition.x * 30.0 + vWorldPosition.z * 25.0) * 0.08 + 0.92;
        finalColor *= shimmer;

        vec2 centerDist = vUv - vec2(0.5, 0.5);
        float distFromCenter = length(centerDist) * 2.0;

        float edgeNoise = sin(vUv.x * 20.0 + time * 0.5) * cos(vUv.y * 20.0 - time * 0.3) * 0.1;
        distFromCenter += edgeNoise;

        float edgeSoftness = 1.0 - smoothstep(0.5, 0.95, distFromCenter);

        edgeSoftness = pow(edgeSoftness, 1.5);
        
        float finalOpacity = opacity * edgeSoftness;
        
        gl_FragColor = vec4(finalColor, finalOpacity);
      }
    `;

    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        waterColor: { value: new THREE.Color(0.15, 0.55, 0.85) },
        opacity: { value: 0.8 },
        time: { value: 0 },
        normalMap: { value: this.normalMap },
        lightPosition: { value: new THREE.Vector3(0, 0, 0) },
        lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
        ambientStrength: { value: 0.15 },
        lightIntensity: { value: 0.85 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
  }

  private generateWaterBodies(): void {
    if (this.params.water_bodies && this.params.water_bodies.length > 0) {
      this.params.water_bodies.forEach((bodyData, index) => {
        const waterMesh = this.createTextureBasedWaterBody(bodyData, index);
        if (waterMesh) {
          this.waterBodyMeshes.push(waterMesh);
          this.waterGroup.add(waterMesh);
        }
      });
    } else {
      this.generateProceduralWaterBodies();
    }
  }

  private createTextureBasedWaterBody(bodyData: any, bodyIndex: number): THREE.Mesh | null {
    if (!bodyData.position_3d || bodyData.position_3d.length !== 3) {
      return null;
    }

    const position = new THREE.Vector3().fromArray(bodyData.position_3d);
    const sphericalPos = position.normalize();

    const baseRadius = bodyData.radius || this.rng.uniform(PROCEDURAL_RANGES.WATER_BODY_RADIUS.min, PROCEDURAL_RANGES.WATER_BODY_RADIUS.max);
    const size = baseRadius * this.planetRadius;

    const segments = 24;
    const geometry = new THREE.PlaneGeometry(size * 2, size * 2, segments, segments);

    const uvRotation = this.rng.uniform(0, Math.PI * 2);
    const uvs = geometry.attributes.uv;
    const cosR = Math.cos(uvRotation);
    const sinR = Math.sin(uvRotation);

    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i) - 0.5;
      const v = uvs.getY(i) - 0.5;
      uvs.setXY(i, u * cosR - v * sinR + 0.5, u * sinR + v * cosR + 0.5);
    }
    uvs.needsUpdate = true;

    const positionsAttr = geometry.attributes.position;
    const uvsAttr = geometry.attributes.uv;
    const validVertices = [];
    const validUVs = [];
    const validIndices = [];
    const originalUVs = [];

    const vertexMap = new Map();
    let newVertexIndex = 0;

    for (let i = 0; i < positionsAttr.count; i++) {
      const x = positionsAttr.getX(i);
      const y = positionsAttr.getY(i);
      const z = positionsAttr.getZ(i);

      const origU = uvsAttr.getX(i);
      const origV = uvsAttr.getY(i);

      const distFromCenter = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);

      const shapeType = bodyIndex % 5;
      let withinBoundary = false;

      switch (shapeType) {
        case 0:
          const ellipseA = 1.0 + Math.sin(bodyIndex) * 0.3;
          const ellipseB = 1.0 + Math.cos(bodyIndex * 1.3) * 0.3;
          const ellipseAngle = bodyIndex * 0.7;
          const rotatedX = x * Math.cos(ellipseAngle) - y * Math.sin(ellipseAngle);
          const rotatedY = x * Math.sin(ellipseAngle) + y * Math.cos(ellipseAngle);
          withinBoundary = (rotatedX * rotatedX) / (size * ellipseA * size * ellipseA) + (rotatedY * rotatedY) / (size * ellipseB * size * ellipseB) <= 1.0;
          break;

        case 1:
          const beanRadius = size * (0.8 + Math.sin(angle * 2 + bodyIndex) * 0.2);
          const beanIndent = Math.cos(angle + Math.PI + bodyIndex) * size * 0.3;
          const effectiveRadius = Math.max(beanRadius + beanIndent, size * 0.5);
          withinBoundary = distFromCenter <= effectiveRadius;
          break;

        case 2:
          const blobRadius = size * (0.8 + Math.sin(angle * 1.5 + bodyIndex) * 0.2 + Math.cos(angle * 2.3 + bodyIndex * 1.7) * 0.15);
          withinBoundary = distFromCenter <= blobRadius;
          break;

        case 3:
          const tearAngle = angle - bodyIndex;
          const tearRadius = size * ((1 + Math.cos(tearAngle)) * 0.4 + 0.4);
          const tearDistortion = Math.sin(tearAngle * 3) * size * 0.1;
          withinBoundary = distFromCenter <= tearRadius + tearDistortion;
          break;

        case 4:
          const crescentAngle = angle - bodyIndex * 0.5;
          const crescentRadius = size * Math.max(0.4, 1.0 - Math.cos(crescentAngle * 1.5) * 0.4);
          const crescentDetail = Math.sin(crescentAngle * 6) * size * 0.05;
          withinBoundary = distFromCenter <= crescentRadius + crescentDetail;
          break;
      }

      if (withinBoundary) {
        const coastlineNoise = Math.sin(angle * 12 + bodyIndex * 3) * 0.05;
        const finalRadius = distFromCenter * (1.0 + coastlineNoise);
        withinBoundary = finalRadius <= size * 1.1;
      }

      if (withinBoundary) {
        validVertices.push(x, y, z);
        validUVs.push(uvsAttr.getX(i), uvsAttr.getY(i));
        originalUVs.push(origU, origV);
        vertexMap.set(i, newVertexIndex);
        newVertexIndex++;
      }
    }

    const originalIndices = geometry.getIndex();
    if (originalIndices) {
      for (let i = 0; i < originalIndices.count; i += 3) {
        const a = originalIndices.getX(i);
        const b = originalIndices.getX(i + 1);
        const c = originalIndices.getX(i + 2);

        if (vertexMap.has(a) && vertexMap.has(b) && vertexMap.has(c)) {
          validIndices.push(vertexMap.get(a), vertexMap.get(b), vertexMap.get(c));
        }
      }
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(validVertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(validUVs, 2));
    geometry.setIndex(validIndices);
    geometry.computeVertexNormals();

    const individualMaterial = this.waterMaterial.clone();
    individualMaterial.uniforms.opacity.value = bodyData.opacity || 0.8;

    individualMaterial.uniforms.normalMap.value = this.normalMap;
    const waterMesh = new THREE.Mesh(geometry, individualMaterial);

    this.materials.push(individualMaterial);

    const up = sphericalPos.clone();
    const right = new THREE.Vector3();
    if (Math.abs(up.y) < 0.99) {
      right.crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      right.crossVectors(up, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    const positions = geometry.attributes.position;
    const centerPos = sphericalPos.clone().multiplyScalar(this.planetRadius * 1.001);

    for (let i = 0; i < positions.count; i++) {
      const localVertex = new THREE.Vector3();
      localVertex.fromBufferAttribute(positions, i);

      const worldVertex = centerPos.clone().add(right.clone().multiplyScalar(localVertex.x)).add(forward.clone().multiplyScalar(localVertex.y));

      const projectedVertex = worldVertex.normalize().multiplyScalar(this.planetRadius * 1.001);

      positions.setXYZ(i, projectedVertex.x, projectedVertex.y, projectedVertex.z);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    waterMesh.position.set(0, 0, 0);

    waterMesh.userData = {
      baseSize: size,
      uvOffset: new THREE.Vector2(this.rng.uniform(0, 1), this.rng.uniform(0, 1)),
      animationSpeed: this.rng.uniform(0.8, 1.2),
      index: bodyIndex,
    };

    waterMesh.renderOrder = 1002;
    waterMesh.castShadow = false;
    waterMesh.receiveShadow = true;

    return waterMesh;
  }

  private generateProceduralWaterBodies(): void {
    const bodyCount = this.rng.randint(PROCEDURAL_RANGES.WATER_BODY_COUNT.min, PROCEDURAL_RANGES.WATER_BODY_COUNT.max);

    for (let i = 0; i < bodyCount; i++) {
      const radius = this.rng.uniform(PROCEDURAL_RANGES.WATER_BODY_RADIUS.min, PROCEDURAL_RANGES.WATER_BODY_RADIUS.max);

      const bodyData = {
        position_3d: this.generateRandomSurfacePoint(),
        radius: radius,
        depth: 0.025,
        opacity: this.rng.uniform(PROCEDURAL_RANGES.WATER_BODY_OPACITY.min, PROCEDURAL_RANGES.WATER_BODY_OPACITY.max),
      };

      const waterMesh = this.createTextureBasedWaterBody(bodyData, i);
      if (waterMesh) {
        this.waterBodyMeshes.push(waterMesh);
        this.waterGroup.add(waterMesh);
      }
    }
  }

  private generateRandomSurfacePoint(): number[] {
    const theta = this.rng.uniform(0.3, Math.PI - 0.3);
    const phi = this.rng.uniform(0, Math.PI * 2);

    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.cos(theta);
    const z = Math.sin(theta) * Math.sin(phi);

    return [x, y, z];
  }

  addToScene(scene: THREE.Scene, planetPosition?: THREE.Vector3): void {
    if (planetPosition) {
      this.waterGroup.position.copy(planetPosition);
    }
    scene.add(this.waterGroup);
  }

  /**
   * Update lighting from Three.js DirectionalLight - EXACT same as PlanetLayerSystem
   */
  updateFromThreeLight(light: THREE.DirectionalLight): void {
    this.materials.forEach((material) => {
      if (material instanceof THREE.ShaderMaterial && material.uniforms) {
        if (material.uniforms.lightPosition) {
          material.uniforms.lightPosition.value.copy(light.position);
        }

        if (material.uniforms.lightDirection) {
          const direction = light.target.position.clone().sub(light.position).normalize();
          material.uniforms.lightDirection.value.copy(direction);
        }
      }
    });

    if (this.waterMaterial && this.waterMaterial.uniforms) {
      if (this.waterMaterial.uniforms.lightPosition) {
        this.waterMaterial.uniforms.lightPosition.value.copy(light.position);
      }

      if (this.waterMaterial.uniforms.lightDirection) {
        const direction = light.target.position.clone().sub(light.position).normalize();
        this.waterMaterial.uniforms.lightDirection.value.copy(direction);
      }
    }
  }

  update(deltaTime: number, planetRotation?: number): void {
    this.animationTime += deltaTime;

    if (this.waterMaterial && this.waterMaterial.uniforms) {
      this.waterMaterial.uniforms.time.value = this.animationTime;
    }

    this.materials.forEach((material) => {
      if (material instanceof THREE.ShaderMaterial && material.uniforms) {
        material.uniforms.time.value = this.animationTime;
      }
    });

    if (this.normalMap) {
      this.normalMap.offset.x += deltaTime * 0.02;
      this.normalMap.offset.y += deltaTime * 0.015;
      this.normalMap.needsUpdate = true;
    }

    if (this.foamMap) {
      this.foamMap.offset.x += deltaTime * 0.025;
      this.foamMap.offset.y += deltaTime * 0.018;
      this.foamMap.needsUpdate = true;
    }

    if (planetRotation !== undefined) {
      this.waterGroup.rotation.y = planetRotation;
    }
  }

  updateParams(newParams: Partial<SuperEarthWaterFeaturesParams>): void {
    this.params = { ...this.params, ...newParams };

    if (newParams.waterColor && this.waterMaterial) {
      const waterColor = newParams.waterColor instanceof THREE.Color ? newParams.waterColor : new THREE.Color().fromArray(newParams.waterColor as number[]);

      this.waterMaterial.uniforms.waterColor.value.copy(waterColor);
    }
  }

  getObject3D(): THREE.Group {
    return this.waterGroup;
  }

  dispose(): void {
    if (this.normalMap) this.normalMap.dispose();
    if (this.displacementMap) this.displacementMap.dispose();
    if (this.foamMap) this.foamMap.dispose();

    if (this.waterMaterial) this.waterMaterial.dispose();

    this.waterBodyMeshes.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
    });

    this.waterBodyMeshes = [];
    this.waterGroup.clear();
  }
}

export function createSuperEarthWaterFeaturesFromPythonData(planetRadius: number, surfaceData: any, globalSeed?: number, planetType?: string): SuperEarthWaterFeaturesEffect | null {
  const seed = globalSeed || Math.floor(Math.random() * 1000000);
  const waterSeed = seed + 10000;
  const rng = new SeededRandom(waterSeed);

  const waterFeaturesData = surfaceData.water_features || {};
  let waterBodies = waterFeaturesData.water_bodies || [];

  if (planetType === "desert") {
    const probability = rng.uniform(3, 5);
    const roll = rng.uniform(0, 100);

    if (roll <= probability) {
      const theta = rng.uniform(0, 2 * Math.PI);
      const phi = Math.acos(rng.uniform(-1, 1));

      waterBodies = [
        {
          position_3d: [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)],
          radius: rng.uniform(0.08, 0.15),
          depth: rng.uniform(0.005, 0.015),
          opacity: rng.uniform(0.75, 0.85),
          shape_type: "lake",
        },
      ];
    } else {
      return null;
    }
  }

  if (waterBodies.length === 0 && surfaceData.blue_patches && surfaceData.blue_patches.length > 0) {
    waterBodies = surfaceData.blue_patches.map((patch: any) => ({
      position_3d: patch.position_3d,
      radius: patch.size || 0.1,
      depth: patch.height || 0.02,
      opacity: patch.color?.[3] || 0.8,
      shape_type: "lake",
    }));
  }

  const params: SuperEarthWaterFeaturesParams = {
    water_bodies: waterBodies,
    waterColor: new THREE.Color(0.2, 0.5, 0.9),
    globalIrregularity: 0.7,
    seed: waterSeed,
  };

  const effect = new SuperEarthWaterFeaturesEffect(planetRadius, params);

  return effect;
}
