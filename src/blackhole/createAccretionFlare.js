import * as THREE from 'three/webgpu'

function createHaloTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.35, 'rgba(190, 215, 255, 0.65)')
  gradient.addColorStop(0.7, 'rgba(120, 150, 255, 0.25)')
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  return texture
}

function createGlareTexture() {
  const width = 512
  const height = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, height / 2, width, height / 2)
  gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(0.35, 'rgba(200, 220, 255, 0.65)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)')
  gradient.addColorStop(0.65, 'rgba(200, 220, 255, 0.65)')
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.globalAlpha = 1
  ctx.fillRect(0, 0, width, height)
  const verticalFade = ctx.createLinearGradient(0, 0, 0, height)
  verticalFade.addColorStop(0.0, 'rgba(0, 0, 0, 0)')
  verticalFade.addColorStop(0.5, 'rgba(0, 0, 0, 1)')
  verticalFade.addColorStop(1.0, 'rgba(0, 0, 0, 0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = verticalFade
  ctx.fillRect(0, 0, width, height)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  return texture
}

export function createAccretionFlare() {
  const haloTexture = createHaloTexture()
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTexture,
    color: new THREE.Color(0xcad8ff),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  const haloSprite = new THREE.Sprite(haloMaterial)
  haloSprite.scale.setScalar(30)

  const glareTexture = createGlareTexture()
  const glareMaterial = new THREE.SpriteMaterial({
    map: glareTexture,
    color: new THREE.Color(0xf2f6ff),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  glareMaterial.rotation = THREE.MathUtils.degToRad(27)
  const glareSprite = new THREE.Sprite(glareMaterial)
  glareSprite.scale.set(65, 16, 1)

  const cameraDir = new THREE.Vector3()
  const toBlackHoleDir = new THREE.Vector3()

  const update = (camera, blackHolePosition) => {
    cameraDir.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize()
    toBlackHoleDir.copy(blackHolePosition).sub(camera.position).normalize()
    const visibility = Math.max(0, cameraDir.dot(toBlackHoleDir))
    const haloIntensity = THREE.MathUtils.smoothstep(visibility, 0.18, 0.85)
    const distance = camera.position.distanceTo(blackHolePosition)
    const sizeBase = THREE.MathUtils.clamp(40 - distance * 0.25, 18, 45)

    haloMaterial.opacity = haloIntensity * 0.8
    glareMaterial.opacity = haloIntensity * 0.55

    const haloScale = THREE.MathUtils.lerp(sizeBase * 0.7, sizeBase * 1.05, haloIntensity)
    haloSprite.scale.setScalar(haloScale)

    const glareWidth = THREE.MathUtils.lerp(40, 80, haloIntensity)
    const glareHeight = THREE.MathUtils.lerp(10, 26, haloIntensity)
    glareSprite.scale.set(glareWidth, glareHeight, 1)
  }

  const dispose = () => {
    haloTexture.dispose()
    haloMaterial.dispose()
    glareTexture.dispose()
    glareMaterial.dispose()
  }

  return {
    haloSprite,
    glareSprite,
    update,
    dispose,
  }
}
