import * as THREE from 'three/webgpu'

const noiseTextureUrl = new URL('../assets/textures/noise_deep.png', import.meta.url)
const starsTextureUrl = new URL('../assets/textures/hdr/nebula.png', import.meta.url)

export async function loadBlackHoleResources() {
  const loader = new THREE.TextureLoader()

  const [noiseTexture, starsTexture] = await Promise.all([
    loader.loadAsync(noiseTextureUrl.href),
    loader.loadAsync(starsTextureUrl.href),
  ])

  noiseTexture.wrapS = THREE.RepeatWrapping
  noiseTexture.wrapT = THREE.RepeatWrapping
  noiseTexture.needsUpdate = true

  starsTexture.mapping = THREE.EquirectangularReflectionMapping
  starsTexture.colorSpace = THREE.SRGBColorSpace
  starsTexture.flipY = false
  starsTexture.needsUpdate = true

  return {
    noiseTexture,
    starsTexture,
  }
}
