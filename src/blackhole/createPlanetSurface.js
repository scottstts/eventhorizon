import * as THREE from 'three/webgpu'
import {
  Fn,
  PI2,
  abs,
  atan,
  clamp,
  float,
  mix,
  normalize,
  positionGeometry,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  ColorRamp3_BSpline,
  fbm,
  smoothRange,
  srgbToLinear,
  whiteNoise2D,
} from './tslUtils.js'

export function createPlanetSurface({ radius = 2, segments = 128 } = {}) {
  const geometry = new THREE.SphereGeometry(radius, segments, segments)

  const material = new THREE.MeshStandardNodeMaterial({
    metalness: 0.04,
    roughness: 0.85,
    side: THREE.FrontSide,
  })

  const sphericalUV = Fn(() => {
    const normal = normalize(positionGeometry)
    const lon = atan(normal.z, normal.x).div(PI2).add(0.5)
    const lat = normal.y.mul(0.5).add(0.5)
    return vec2(lon, lat)
  })()

  const horizonMask = Fn(() => {
    const normal = normalize(positionGeometry)
    return smoothRange(abs(normal.y), float(0), float(0.55), float(0), float(1))
  })()

  const heightNode = Fn(() => {
    const uv = sphericalUV
    const macro = fbm(uv.mul(6), float(5))
    const detail = fbm(uv.mul(20), float(3))
    const height = macro.mul(0.7).add(detail.mul(0.3))
    return clamp(height, float(0), float(1))
  })()

  const albedoNode = Fn(() => {
    const uv = sphericalUV
    const height = heightNode
    const horizon = horizonMask
    const rampCoord = clamp(height.add(horizon.mul(0.2)), float(0), float(1))

    const rampA = vec4(0.035, 0.046, 0.072, 0)
    const rampB = vec4(0.17, 0.19, 0.25, 0.48)
    const rampC = vec4(0.65, 0.55, 0.4, 1)

    const base = ColorRamp3_BSpline(rampCoord, rampA, rampB, rampC)
    const dusk = vec3(0.28, 0.21, 0.16).mul(horizon.mul(0.3))
    const grain = whiteNoise2D(uv.mul(96)).mul(0.08).add(0.92)

    const tinted = base.mul(grain).add(dusk)
    return srgbToLinear(tinted)
  })()

  material.colorNode = albedoNode
  material.emissiveNode = albedoNode.mul(float(0.05))
  material.roughnessNode = mix(float(0.6), float(0.94), heightNode)
  material.metalnessNode = float(0.04)
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
