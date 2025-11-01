import * as THREE from 'three'

export async function loadBlackHoleResources() {
  const loader = new THREE.TextureLoader()

  const [noiseTexture, starsTexture] = await Promise.all([
    loader.loadAsync('/textures/noise_deep.png'),
    loader.loadAsync('/textures/hdr/nebula.png'),
  ])

  noiseTexture.wrapS = THREE.RepeatWrapping
  noiseTexture.wrapT = THREE.RepeatWrapping
  noiseTexture.colorSpace = THREE.SRGBColorSpace
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
