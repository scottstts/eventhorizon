import * as THREE from 'three/webgpu'
import {
  Fn,
  abs,
  clamp,
  float,
  mix,
  normalize,
  positionGeometry,
  texture,
  uv,
  vec3,
} from 'three/tsl'
import { smoothRange, srgbToLinear } from './tslUtils.js'

export function createPlanetSurface({ radius = 2, segments = 128, colorTexture } = {}) {
  if (!colorTexture) {
    throw new Error('colorTexture is required for the planet surface')
  }
  const geometry = new THREE.SphereGeometry(radius, segments, segments)

  const material = new THREE.MeshStandardNodeMaterial({
    metalness: 0.04,
    roughness: 0.85,
    side: THREE.FrontSide,
  })

  const horizonMask = Fn(() => {
    const normal = normalize(positionGeometry)
    return smoothRange(abs(normal.y), float(0), float(0.55), float(0), float(1))
  })()

  const albedoNode = Fn(() => {
    const surfaceUV = uv()
    const horizon = horizonMask
    const sampled = texture(colorTexture, surfaceUV)
    const base = srgbToLinear(sampled.xyz)
    const dusk = vec3(0.12, 0.09, 0.07)
    const tinted = mix(base, base.mul(vec3(1.2, 1.1, 0.95)), clamp(horizon.mul(0.4), float(0), float(1)))
    return mix(tinted, mix(tinted, dusk, horizon.mul(0.3)), float(0.05))
  })()

  material.colorNode = albedoNode
  material.emissiveNode = albedoNode.mul(float(0.03))
  material.roughnessNode = mix(float(0.45), float(0.85), horizonMask)
  material.metalnessNode = float(0.02)
  material.needsUpdate = true

  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false

  return {
    mesh,
    geometry,
    material,
  }
}
