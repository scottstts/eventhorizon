import * as THREE from 'three/webgpu'
import {
  Fn,
  Loop,
  abs,
  cameraPosition,
  color,
  equirectUV,
  faceDirection,
  float,
  max,
  mix,
  modelWorldMatrix,
  positionGeometry,
  positionWorld,
  remapClamp,
  step,
  sub,
  texture,
  time,
  uniform,
  vec3,
  vec4,
  normalize,
} from 'three/tsl'
import {
  ColorRamp3_BSpline,
  linearToSrgb,
  rotateAxis,
  srgbToLinear,
  vecToFac,
  whiteNoise2D,
  lengthSqrt,
  smoothRange,
} from './tslUtils.js'

export function createBlackHole({ noiseTexture, starsTexture, scale = 5 }) {
  const group = new THREE.Group()

  const geometry = new THREE.SphereGeometry(1, 16, 16)
  const material = new THREE.MeshStandardNodeMaterial({
    side: THREE.DoubleSide,
  })

  const uniforms = {
    iterations: uniform(float(128)),
    stepSize: uniform(float(0.0071)),
    noiseFactor: uniform(float(0.01)),
    power: uniform(float(0.3)),
    clamp1: uniform(float(0.5)),
    clamp2: uniform(float(1.0)),
    originRadius: uniform(float(0.13)),
    width: uniform(float(0.03)),
    uvMotion: uniform(float(0)),
    rampCol1: uniform(color(0.95, 0.71, 0.44)),
    rampPos1: uniform(float(0.05)),
    rampCol2: uniform(color(0.14, 0.05, 0.03)),
    rampPos2: uniform(float(0.425)),
    rampCol3: uniform(color(0, 0, 0)),
    rampPos3: uniform(float(1)),
    rampEmission: uniform(float(2)),
    emissionColor: uniform(color(0.14, 0.129, 0.09)),
  }

  material.colorNode = Fn(() => {
    const _step = uniforms.stepSize
    const noiseAmp = uniforms.noiseFactor
    const power = uniforms.power
    const originRadius = uniforms.originRadius
    const bandWidth = uniforms.width
    const iterCount = uniforms.iterations

    const objCoords = positionGeometry.mul(vec3(1, 1, -1)).xzy
    const isBackface = step(0, faceDirection.negate())

    const camPointObj = cameraPosition.mul(modelWorldMatrix).mul(vec3(1, 1, -1)).xzy
    const startCoords = mix(objCoords, camPointObj.xyz, isBackface)

    const viewInWorld = normalize(sub(cameraPosition, positionWorld))
      .mul(vec3(1, 1, -1)).xzy
    const rayDir = viewInWorld.negate()

    const noiseWhite = whiteNoise2D(objCoords.xy).mul(noiseAmp)
    const jitter = rayDir.mul(noiseWhite)
    const rayPos = startCoords.sub(jitter)

    const colorAcc = vec3(0)
    const alphaAcc = float(0)

    Loop(iterCount, () => {
      const rNorm = normalize(rayPos)
      const rLen = lengthSqrt(rayPos)
      const steerMag = _step.mul(power).div(rLen.mul(rLen))
      const range = remapClamp(rLen, 1, 0.5, 0, 1)
      const steer = rNorm.mul(steerMag.mul(range))
      const steeredDir = rayDir.sub(steer).normalize()

      const advance = rayDir.mul(_step)
      rayPos.addAssign(advance)

      const xyLen = lengthSqrt(rayPos.mul(vec3(1, 1, 0)))
      const rotPhase = xyLen.mul(4.27).sub(time.mul(0.1))
      const uvAxis = vec3(0, 0, 1)
      const uvRot = rayPos.mul(rotateAxis(uvAxis, rotPhase))
      const uv = uvRot.mul(2)

      const noiseDeep = texture(noiseTexture, uv)

      const bandMin = bandWidth.negate()
      const bandEnds = vec3(bandMin, 0, bandWidth)
      const dz = sub(bandEnds, vec3(rayPos.z))
      const zQuad = dz.mul(dz).div(bandWidth)
      const zBand = max(bandWidth.sub(zQuad).div(bandWidth), 0)

      const noiseAmp3 = noiseDeep.mul(zBand)
      const noiseAmpLen = lengthSqrt(noiseAmp3)

      const uvForNormal = uv.mul(1.002)
      const noiseNormal = texture(noiseTexture, uvForNormal).mul(zBand)
      const noiseNormalLen = lengthSqrt(noiseNormal)

      const rampInput = xyLen
        .add(noiseAmpLen.sub(0.78).mul(1.5))
        .add(noiseAmpLen.sub(noiseNormalLen).mul(19.75))

      const rampA = vec4(uniforms.rampCol1, uniforms.rampPos1)
      const rampB = vec4(uniforms.rampCol2, uniforms.rampPos2)
      const rampC = vec4(uniforms.rampCol3, uniforms.rampPos3)

      const baseCol = ColorRamp3_BSpline(rampInput.x, rampA, rampB, rampC)
      const emissiveCol = baseCol.mul(uniforms.rampEmission)
        .add(uniforms.emissionColor)

      const rLenNow = lengthSqrt(rayPos)
      const insideCore = rLenNow.lessThan(originRadius)
      const shadedCol = mix(emissiveCol, vec3(0), insideCore)

      const zAbs = abs(rayPos.z)
      const aNoise = noiseAmpLen.sub(0.75).mul(-0.6)
      const aPre = zAbs.add(aNoise)
      const aRadial = smoothRange(xyLen, 1, 0, 0, 1)
      const aBand = smoothRange(aPre, bandWidth, 0, 0, aRadial)
      const alphaLocal = mix(aBand, 1, insideCore)

      const oneMinusA = alphaAcc.oneMinus()
      const weight = oneMinusA.mul(vecToFac(alphaLocal))
      const newColor = mix(colorAcc, shadedCol, weight)
      const newAlpha = mix(alphaAcc, 1, vecToFac(alphaLocal))

      rayPos.addAssign(advance)
      rayDir.assign(steeredDir)
      colorAcc.assign(newColor)
      alphaAcc.assign(newAlpha)
    })

    const dirForEnv = rayDir.mul(vec3(1, -1, 1)).xzy
    const env = linearToSrgb(
      texture(starsTexture, equirectUV(dirForEnv)).mul(float(1))
    )

    const trans = float(1).sub(alphaAcc)
    const finalRGB = mix(colorAcc, env, trans.mul(1))

    return srgbToLinear(finalRGB)
  })()

  material.emissiveNode = material.colorNode

  const mesh = new THREE.Mesh(geometry, material)
  mesh.scale.setScalar(scale)
  group.add(mesh)

  return {
    group,
    material,
    uniforms,
  }
}
