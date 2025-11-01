import { useEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { loadBlackHoleResources } from './blackhole/loadResources.js'
import { createBlackHole } from './blackhole/createBlackHole.js'
import { createPlanetSurface } from './blackhole/createPlanetSurface.js'
import './App.css'
import { createAccretionFlare } from './blackhole/createAccretionFlare.js'

const WORLD_UP = new THREE.Vector3(0, 1, 0)

function App() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let renderer

    const cleanupStack = []

    const moveState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    }

    let yaw = 0
    let pitch = 0
    const lookSensitivity = 0.002
    const pitchLimit = Math.PI / 2 - 0.05

    const playerOffset = new THREE.Vector3()
    const playerOffsetLocal = new THREE.Vector3()
    const tempVec = new THREE.Vector3()
    const tempVec2 = new THREE.Vector3()
    const upVec = new THREE.Vector3()
    const forwardVec = new THREE.Vector3()
    const rightVec = new THREE.Vector3()
    const baseQuat = new THREE.Quaternion()
    const lookQuat = new THREE.Quaternion()
    const cameraQuat = new THREE.Quaternion()
    const inverseBase = new THREE.Quaternion()
    const toBlackHole = new THREE.Vector3()
    const planetSpinAxis = new THREE.Vector3(0, 1, 0)
    let planetSpinAngle = 0
    let initialLookAligned = false

    const setup = async () => {
      const canvas = document.createElement('canvas')
      canvas.className = 'experience-canvas'
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      container.appendChild(canvas)

      renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
        alpha: false,
        depth: true,
        forceWebGL: false,
      })
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.2
      renderer.shadowMap.enabled = false
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      await renderer.init()
      if (disposed) return

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(
        70,
        Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
        0.0001,
        5000
      )

      const clock = new THREE.Clock()

      const { noiseTexture, starsTexture, planetTexture } = await loadBlackHoleResources()
      if (disposed) return

      scene.background = starsTexture
      scene.environment = starsTexture

      const { group: blackHoleGroup, material: blackHoleMaterial } = createBlackHole({
        noiseTexture,
        starsTexture,
        scale: 28,
      })
      scene.add(blackHoleGroup)
      cleanupStack.push(() => {
        scene.remove(blackHoleGroup)
      })

      const flare = createAccretionFlare()
      blackHoleGroup.add(flare.haloSprite)
      blackHoleGroup.add(flare.glareSprite)
      cleanupStack.push(() => {
        flare.dispose()
      })

      const ambientLight = new THREE.AmbientLight(0x0f1326, 0.38)
      scene.add(ambientLight)
      const rimLight = new THREE.DirectionalLight(0x3a5dff, 0.55)
      rimLight.position.set(-60, 90, 140)
      scene.add(rimLight)
      cleanupStack.push(() => {
        scene.remove(ambientLight)
        scene.remove(rimLight)
      })

      const planetGroup = new THREE.Group()
      scene.add(planetGroup)

      const accretionLight = new THREE.DirectionalLight(0x9caeff, 4.1)
      accretionLight.position.copy(blackHoleGroup.position.clone().add(new THREE.Vector3(0, 5, 0)))
      accretionLight.castShadow = false
      scene.add(accretionLight)

      const accretionLightTarget = new THREE.Object3D()
      scene.add(accretionLightTarget)
      accretionLight.target = accretionLightTarget

      cleanupStack.push(() => {
        scene.remove(accretionLight)
        scene.remove(accretionLightTarget)
      })

      const planetRadius = 0.2
      const playerHeight = 0.002
      const cameraDistance = planetRadius + playerHeight
      const planetSpinSpeed = 0.001

      const {
        mesh: planetMesh,
        geometry: planetGeometry,
        material: planetMaterial,
      } = createPlanetSurface({
        radius: planetRadius,
        segments: 160,
        colorTexture: planetTexture,
      })
      planetGroup.add(planetMesh)

      const orbitRadius = 30
      const orbitSpeed = 0.0006
      let orbitAngle = Math.PI * 0.4
      planetGroup.position.set(
        Math.cos(orbitAngle) * orbitRadius,
        orbitRadius * 0.05,
        Math.sin(orbitAngle) * orbitRadius
      )
      accretionLightTarget.position.copy(planetGroup.position)

      const planetDir = planetGroup.position.clone().normalize()
      const towardBlackHole = planetDir.clone().negate()
      const horizonAxis = new THREE.Vector3().crossVectors(towardBlackHole, WORLD_UP)
      if (horizonAxis.lengthSq() < 1e-6) {
        horizonAxis.set(0, 0, 1)
      }
      horizonAxis.normalize()

      const tempQuat = new THREE.Quaternion()
      const tempOffset = new THREE.Vector3()
      const tempWorld = new THREE.Vector3()
      const tempDir = new THREE.Vector3()
      const computeDotAt = (angle) => {
        tempQuat.setFromAxisAngle(horizonAxis, angle)
        tempOffset.copy(towardBlackHole).applyQuaternion(tempQuat).normalize()
        tempWorld.copy(tempOffset).multiplyScalar(cameraDistance).add(planetGroup.position)
        tempDir.copy(tempWorld).negate().normalize()
        return tempDir.dot(tempOffset)
      }

      const targetDot = Math.sin(THREE.MathUtils.degToRad(45))
      let low = 0
      let high = Math.PI / 2
      for (let i = 0; i < 8; i += 1) {
        const mid = (low + high) / 2
        const dot = computeDotAt(mid)
        if (dot > targetDot) {
          low = mid
        } else {
          high = mid
        }
      }

      const chosenAngle = (low + high) / 2
      tempQuat.setFromAxisAngle(horizonAxis, chosenAngle)
      const offsetDir = towardBlackHole.clone().applyQuaternion(tempQuat).normalize()
      playerOffset.copy(offsetDir).multiplyScalar(cameraDistance)

      const setInitialOrientation = () => {
        const worldPos = tempVec.copy(playerOffset).add(planetGroup.position)
        toBlackHole.set(0, 0, 0).sub(worldPos).normalize()
        baseQuat.setFromUnitVectors(WORLD_UP, tempVec2.copy(playerOffset).normalize())
        inverseBase.copy(baseQuat).invert()
        const localDir = toBlackHole.clone().applyQuaternion(inverseBase)
        yaw = Math.atan2(localDir.x, -localDir.z)
        const clampedY = Math.max(-1, Math.min(1, localDir.y))
        pitch = Math.asin(clampedY)
        pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch))
      }
      setInitialOrientation()
      playerOffsetLocal.copy(playerOffset)

      const handleKeyDown = (event) => {
        switch (event.code) {
          case 'KeyW':
            moveState.forward = true
            break
          case 'KeyS':
            moveState.backward = true
            break
          case 'KeyA':
            moveState.left = true
            break
          case 'KeyD':
            moveState.right = true
            break
          default:
            break
        }
      }

      const handleKeyUp = (event) => {
        switch (event.code) {
          case 'KeyW':
            moveState.forward = false
            break
          case 'KeyS':
            moveState.backward = false
            break
          case 'KeyA':
            moveState.left = false
            break
          case 'KeyD':
            moveState.right = false
            break
          default:
            break
        }
      }

      const handlePointerMove = (event) => {
        if (document.pointerLockElement !== renderer.domElement) return
        yaw -= event.movementX * lookSensitivity
        pitch -= event.movementY * lookSensitivity
        pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch))
      }

      const handlePointerLockChange = () => {
        if (document.pointerLockElement !== renderer.domElement) {
          moveState.forward = false
          moveState.backward = false
          moveState.left = false
          moveState.right = false
        }
      }

      const handleCanvasClick = () => {
        renderer.domElement.requestPointerLock()
      }

      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('keyup', handleKeyUp)
      document.addEventListener('pointerlockchange', handlePointerLockChange)
      document.addEventListener('mousemove', handlePointerMove)
      renderer.domElement.addEventListener('click', handleCanvasClick)

      cleanupStack.push(() => {
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('keyup', handleKeyUp)
        document.removeEventListener('pointerlockchange', handlePointerLockChange)
        document.removeEventListener('mousemove', handlePointerMove)
        renderer?.domElement?.removeEventListener('click', handleCanvasClick)
      })

      const moveSpeed = playerHeight * 2

      const updateCamera = (delta) => {
        const up = upVec.copy(playerOffset).normalize()
        baseQuat.setFromUnitVectors(WORLD_UP, up)
        lookQuat.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
        cameraQuat.copy(baseQuat).multiply(lookQuat)
        camera.quaternion.copy(cameraQuat)
        camera.up.copy(up)

        forwardVec.set(0, 0, -1).applyQuaternion(cameraQuat).projectOnPlane(up).normalize()
        if (!Number.isFinite(forwardVec.x)) {
          forwardVec.set(0, 0, -1)
        }
        rightVec.copy(forwardVec).cross(up).normalize()

        tempVec.set(0, 0, 0)
        if (moveState.forward) tempVec.add(forwardVec)
        if (moveState.backward) tempVec.sub(forwardVec)
        if (moveState.right) tempVec.add(rightVec)
        if (moveState.left) tempVec.sub(rightVec)

        if (tempVec.lengthSq() > 0) {
          tempVec.normalize().multiplyScalar(moveSpeed * delta)
          playerOffset.add(tempVec)
          playerOffset.normalize().multiplyScalar(cameraDistance)
        }

        const worldPos = tempVec.copy(playerOffset).add(planetGroup.position)
        camera.position.copy(worldPos)
        if (!initialLookAligned) {
          camera.lookAt(blackHoleGroup.position)
          camera.updateMatrixWorld()
          initialLookAligned = true
        }
      }

      const onResize = () => {
        const width = Math.max(container.clientWidth, 1)
        const height = Math.max(container.clientHeight, 1)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(width, height)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }

      window.addEventListener('resize', onResize)
      onResize()

      cleanupStack.push(() => {
        window.removeEventListener('resize', onResize)
        planetGeometry.dispose()
        planetMaterial.dispose()
        blackHoleMaterial.dispose()
        noiseTexture.dispose()
        starsTexture.dispose()
        planetTexture.dispose()
        blackHoleGroup.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose?.()
          }
        })
      })

      renderer.setAnimationLoop(async () => {
        const delta = clock.getDelta()

        orbitAngle += orbitSpeed * delta
        planetGroup.position.set(
          Math.cos(orbitAngle) * orbitRadius,
          orbitRadius * 0.05,
          Math.sin(orbitAngle) * orbitRadius
        )

        planetSpinAngle += planetSpinSpeed * delta
        planetMesh.rotation.y = planetSpinAngle

        playerOffset.copy(playerOffsetLocal).applyAxisAngle(planetSpinAxis, planetSpinAngle)

        updateCamera(delta)

        playerOffsetLocal
          .copy(playerOffset)
          .applyAxisAngle(planetSpinAxis, -planetSpinAngle)
          .normalize()
          .multiplyScalar(cameraDistance)

        accretionLightTarget.position.copy(planetGroup.position)
        accretionLight.position.copy(blackHoleGroup.position)

        flare.update(camera, blackHoleGroup.position)

        await renderer.renderAsync(scene, camera)
      })
    }

    setup().catch((error) => {
      console.error('Failed to initialize scene', error)
    })

    return () => {
      disposed = true
      cleanupStack.forEach((fn) => {
        try {
          fn()
        } catch (error) {
          console.error(error)
        }
      })
      cleanupStack.length = 0

      if (renderer) {
        renderer.setAnimationLoop(null)
        renderer.dispose()
        const canvas = renderer.domElement
        if (canvas && canvas.parentNode === container) {
          container.removeChild(canvas)
        }
      } else {
        const canvas = container.querySelector('.experience-canvas')
        if (canvas) {
          container.removeChild(canvas)
        }
      }
    }
  }, [])

  return <div ref={containerRef} className="app-container" />
}

export default App
