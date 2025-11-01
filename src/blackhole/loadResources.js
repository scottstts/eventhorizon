import * as THREE from 'three/webgpu'

const noiseTextureUrl = new URL('../assets/textures/noise_deep.png', import.meta.url)
const starsTextureUrl = new URL('../assets/textures/hdr/nebula.png', import.meta.url)
const planetTextureUrl = new URL('../assets/textures/planet_texture.jpg', import.meta.url)

export async function loadBlackHoleResources() {
  const loader = new THREE.TextureLoader()

  const [noiseTexture, starsTexture, planetTexture] = await Promise.all([
    loader.loadAsync(noiseTextureUrl.href),
    loader.loadAsync(starsTextureUrl.href),
    loader.loadAsync(planetTextureUrl),
  ])

  noiseTexture.wrapS = THREE.RepeatWrapping
  noiseTexture.wrapT = THREE.RepeatWrapping
  noiseTexture.needsUpdate = true

  starsTexture.mapping = THREE.EquirectangularReflectionMapping
  starsTexture.colorSpace = THREE.SRGBColorSpace
  starsTexture.flipY = false
  starsTexture.needsUpdate = true

  planetTexture.colorSpace = THREE.SRGBColorSpace
  planetTexture.wrapS = THREE.RepeatWrapping
  planetTexture.wrapT = THREE.ClampToEdgeWrapping
  planetTexture.flipY = false
  planetTexture.needsUpdate = true

  return {
    noiseTexture,
    starsTexture,
    planetTexture,
  }
}
