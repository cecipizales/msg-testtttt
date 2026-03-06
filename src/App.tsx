import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { Settings2, X } from 'lucide-react';
import '@tensorflow/tfjs';
import * as bodyPix from '@tensorflow-models/body-pix';

const gltfUrls = [
  '/assets/1.glb',
  '/assets/2.glb',
  '/assets/3.glb'
];

gltfUrls.forEach(url => useGLTF.preload(url));

function extractAndNormalizeGeometry(gltf: any) {
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.Material | null = null;
  gltf.scene.traverse((child: any) => {
    if (child instanceof THREE.Mesh && !geometry) {
      geometry = child.geometry.clone();
      material = child.material;
    }
  });
  
  if (geometry) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      geometry.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);
    }
  }
  return { geometry, material };
}

function useWebcam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    const video = document.createElement('video');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          setVideoReady(true);
        };
      })
      .catch((err) => {
        console.error("Error accessing webcam: ", err);
        setPermissionDenied(true);
      });

    videoRef.current = video;

    return () => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return { video: videoRef.current, videoReady, permissionDenied };
}

function Loader() {
  return (
    <Html center>
      <div className="text-white font-mono text-sm whitespace-nowrap bg-black/50 px-4 py-2 rounded">
        LOADING ASSETS...
      </div>
    </Html>
  );
}

function Mosaic({ resolution, iconScale, colorFilter, materialType }: { resolution: number, iconScale: number, colorFilter: string, materialType: string }) {
  const { video, videoReady, permissionDenied } = useWebcam();
  const { viewport } = useThree();
  
  const gltf1 = useGLTF(gltfUrls[0]);
  const gltf2 = useGLTF(gltfUrls[1]);
  const gltf3 = useGLTF(gltfUrls[2]);

  const { geometry: geo1, material: origMat1 } = useMemo(() => extractAndNormalizeGeometry(gltf1), [gltf1]);
  const { geometry: geo2, material: origMat2 } = useMemo(() => extractAndNormalizeGeometry(gltf2), [gltf2]);
  const { geometry: geo3, material: origMat3 } = useMemo(() => extractAndNormalizeGeometry(gltf3), [gltf3]);

  const mesh1Ref = useRef<THREE.InstancedMesh>(null);
  const mesh2Ref = useRef<THREE.InstancedMesh>(null);
  const mesh3Ref = useRef<THREE.InstancedMesh>(null);

  const canvasRef = useRef(document.createElement('canvas'));
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Calculate grid dimensions to fill the viewport
  const aspect = viewport.width / viewport.height;
  const GRID_COLS = resolution;
  // Calculate rows to cover the height, maintaining square-ish aspect ratio for cells
  // spacing = viewport.width / GRID_COLS
  // viewport.height = GRID_ROWS * spacing
  // GRID_ROWS = viewport.height / (viewport.width / GRID_COLS) = GRID_COLS / aspect
  const GRID_ROWS = Math.ceil(GRID_COLS / aspect);
  
  const MAX_INSTANCES = GRID_COLS * GRID_ROWS;

  const physics = useMemo(() => {
    return {
      displacements: new Float32Array(MAX_INSTANCES * 3),
      velocities: new Float32Array(MAX_INSTANCES * 3),
      prevData: new Uint8ClampedArray(MAX_INSTANCES * 4),
      initialized: false
    };
  }, [MAX_INSTANCES]);

  useEffect(() => {
    canvasRef.current.width = GRID_COLS;
    canvasRef.current.height = GRID_ROWS;
    ctxRef.current = canvasRef.current.getContext('2d', { willReadFrequently: true });
  }, [GRID_COLS, GRID_ROWS]);

  // BodyPix Segmentation
  const [net, setNet] = useState<bodyPix.BodyPix | null>(null);
  const maskRef = useRef<any>(null);

  useEffect(() => {
    bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.5,
      quantBytes: 2
    }).then(setNet);
  }, []);

  useEffect(() => {
    if (!net || !videoReady || !video) return;
    let active = true;
    const segment = async () => {
      if (!active) return;
      try {
        const segmentation = await net.segmentPerson(video, {
          internalResolution: 'medium',
          segmentationThreshold: 0.5,
          maxDetections: 1,
        });
        maskRef.current = segmentation;
      } catch (e) {
        console.error(e);
      }
      if (active) requestAnimationFrame(segment);
    };
    segment();
    return () => { active = false; };
  }, [net, videoReady, video]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    if (!videoReady || !video || !ctxRef.current) return;

    // Draw video to cover the grid area
    ctxRef.current.drawImage(video, 0, 0, GRID_COLS, GRID_ROWS);
    const imageData = ctxRef.current.getImageData(0, 0, GRID_COLS, GRID_ROWS);
    const data = imageData.data;

    let count1 = 0;
    let count2 = 0;
    let count3 = 0;

    const spacing = viewport.width / GRID_COLS;
    const baseScale = spacing * 0.8 * iconScale;
    const time = clock.getElapsedTime();

    const { displacements, velocities, prevData } = physics;
    const isInit = physics.initialized;
    const spring = 0.02;
    const damping = 0.92;

    for (let y = 0; y < GRID_ROWS; y++) {
      for (let x = 0; x < GRID_COLS; x++) {
        const i = (y * GRID_COLS + x) * 4;
        const idx3 = (y * GRID_COLS + x) * 3;
        
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        if (isInit) {
          const pr = prevData[i];
          const pg = prevData[i + 1];
          const pb = prevData[i + 2];
          const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
          
          if (diff > 120) {
            velocities[idx3 + 2] += Math.random() * 2 + 1; // Push Z
            velocities[idx3 + 0] += (Math.random() - 0.5) * 2; // Scatter X
            velocities[idx3 + 1] += (Math.random() - 0.5) * 2; // Scatter Y
            
            // Cap velocity
            const maxVel = 5.0;
            velocities[idx3 + 0] = Math.max(-maxVel, Math.min(maxVel, velocities[idx3 + 0]));
            velocities[idx3 + 1] = Math.max(-maxVel, Math.min(maxVel, velocities[idx3 + 1]));
            velocities[idx3 + 2] = Math.max(-maxVel, Math.min(maxVel, velocities[idx3 + 2]));
          }
        }

        velocities[idx3 + 0] += -spring * displacements[idx3 + 0];
        velocities[idx3 + 1] += -spring * displacements[idx3 + 1];
        velocities[idx3 + 2] += -spring * displacements[idx3 + 2];

        velocities[idx3 + 0] *= damping;
        velocities[idx3 + 1] *= damping;
        velocities[idx3 + 2] *= damping;

        displacements[idx3 + 0] += velocities[idx3 + 0];
        displacements[idx3 + 1] += velocities[idx3 + 1];
        displacements[idx3 + 2] += velocities[idx3 + 2];

        prevData[i] = r;
        prevData[i + 1] = g;
        prevData[i + 2] = b;
        prevData[i + 3] = data[i + 3];
        
        let shapeIndex = 0;
        
        if (colorFilter === 'grid') {
          // Stable pseudo-random assignment based on x and y coordinates
          const randomVal = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          shapeIndex = Math.floor(Math.abs(randomVal)) % 3;
          
          if (shapeIndex === 0) {
            r = 255; g = 67; b = 42; // #FF432A
          } else if (shapeIndex === 1) {
            r = 102; g = 245; b = 90; // #66F55A
          } else {
            r = 245; g = 11; b = 186; // #F50BBA
          }
        } else {
          if (colorFilter === 'grayscale') {
            const avg = r * 0.299 + g * 0.587 + b * 0.114;
            r = g = b = avg;
          } else if (colorFilter === 'sepia') {
            const tr = 0.393 * r + 0.769 * g + 0.189 * b;
            const tg = 0.349 * r + 0.686 * g + 0.168 * b;
            const tb = 0.272 * r + 0.534 * g + 0.131 * b;
            r = Math.min(255, tr);
            g = Math.min(255, tg);
            b = Math.min(255, tb);
          } else if (colorFilter === 'invert') {
            r = 255 - r;
            g = 255 - g;
            b = 255 - b;
          } else if (colorFilter === 'cyberpunk') {
            if (r > g && r > b) { 
              r = Math.min(255, r * 1.5); g *= 0.5; b = Math.min(255, b * 1.2); 
            } else { 
              r *= 0.5; g = Math.min(255, g * 1.5); b = Math.min(255, b * 1.5); 
            }
          } else if (colorFilter !== 'none') {
            // Default: Boost saturation to make colors pop
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            const saturationBoost = 1.8; // Increase this value for more pop
            r = Math.min(255, Math.max(0, luminance + (r - luminance) * saturationBoost));
            g = Math.min(255, Math.max(0, luminance + (g - luminance) * saturationBoost));
            b = Math.min(255, Math.max(0, luminance + (b - luminance) * saturationBoost));
          }
          
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance < 85) shapeIndex = 0;
          else if (luminance < 170) shapeIndex = 1;
          else shapeIndex = 2;
        }
        
        // Position
        // Center the grid based on the viewport dimensions
        const posX = -(x - GRID_COLS / 2) * spacing + spacing / 2 + displacements[idx3 + 0]; 
        const posY = -(y - GRID_ROWS / 2) * spacing + spacing / 2 + displacements[idx3 + 1];
        const posZ = displacements[idx3 + 2];

        dummy.position.set(posX, posY, posZ);
        
        // Also add rotation based on displacement so they spin when pushed
        dummy.rotation.set(
          Math.sin(time + x * 0.1) * 0.2 + displacements[idx3 + 1] * 0.5,
          Math.cos(time + y * 0.1) * 0.2 + displacements[idx3 + 0] * 0.5,
          displacements[idx3 + 2] * 0.2
        );
        
        // Check mask
        let isPerson = false;
        if (maskRef.current) {
          const mask = maskRef.current;
          const maskX = Math.floor((x / GRID_COLS) * mask.width);
          const maskY = Math.floor((y / GRID_ROWS) * mask.height);
          isPerson = mask.data[maskY * mask.width + maskX] === 1;
        }

        if (isPerson) {
          dummy.scale.setScalar(0);
        } else {
          dummy.scale.setScalar(baseScale);
        }

        dummy.updateMatrix();

        color.setRGB(r / 255, g / 255, b / 255);

        if (shapeIndex === 0) {
          if (mesh1Ref.current) {
            mesh1Ref.current.setMatrixAt(count1, dummy.matrix);
            mesh1Ref.current.setColorAt(count1, color);
            count1++;
          }
        } else if (shapeIndex === 1) {
          if (mesh2Ref.current) {
            mesh2Ref.current.setMatrixAt(count2, dummy.matrix);
            mesh2Ref.current.setColorAt(count2, color);
            count2++;
          }
        } else {
          if (mesh3Ref.current) {
            mesh3Ref.current.setMatrixAt(count3, dummy.matrix);
            mesh3Ref.current.setColorAt(count3, color);
            count3++;
          }
        }
      }
    }

    if (mesh1Ref.current) {
      mesh1Ref.current.count = count1;
      mesh1Ref.current.instanceMatrix.needsUpdate = true;
      if (mesh1Ref.current.instanceColor) mesh1Ref.current.instanceColor.needsUpdate = true;
    }
    if (mesh2Ref.current) {
      mesh2Ref.current.count = count2;
      mesh2Ref.current.instanceMatrix.needsUpdate = true;
      if (mesh2Ref.current.instanceColor) mesh2Ref.current.instanceColor.needsUpdate = true;
    }
    if (mesh3Ref.current) {
      mesh3Ref.current.count = count3;
      mesh3Ref.current.instanceMatrix.needsUpdate = true;
      if (mesh3Ref.current.instanceColor) mesh3Ref.current.instanceColor.needsUpdate = true;
    }

    physics.initialized = true;
  });

  const material = useMemo(() => {
    switch (materialType) {
      case 'basic':
        return new THREE.MeshBasicMaterial();
      case 'phong':
        return new THREE.MeshPhongMaterial({ shininess: 100 });
      case 'physical':
        return new THREE.MeshPhysicalMaterial({ 
          roughness: 0.1, 
          metalness: 0.8,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1
        });
      case 'fresnel':
        return new THREE.ShaderMaterial({
          uniforms: {
            fresnelColor: { value: new THREE.Color('#421CDF') },
            fresnelBias: { value: 0.1 },
            fresnelScale: { value: 2.0 },
            fresnelPower: { value: 2.0 },
          },
          vertexShader: `
            varying vec3 vPositionV;
            varying vec3 vNormalV;
            #ifdef USE_INSTANCING
              varying vec3 vInstanceColor;
            #endif
            void main() {
              #include <beginnormal_vertex>
              #include <defaultnormal_vertex>
              #include <begin_vertex>
              
              vec4 mvPosition = vec4( transformed, 1.0 );
              #ifdef USE_INSTANCING
                mvPosition = instanceMatrix * mvPosition;
                vInstanceColor = instanceColor;
              #endif
              mvPosition = modelViewMatrix * mvPosition;
              
              vPositionV = mvPosition.xyz;
              vNormalV = normalize( transformedNormal );
              
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          fragmentShader: `
            uniform vec3 fresnelColor;
            uniform float fresnelBias;
            uniform float fresnelScale;
            uniform float fresnelPower;
            varying vec3 vPositionV;
            varying vec3 vNormalV;
            #ifdef USE_INSTANCING
              varying vec3 vInstanceColor;
            #endif
            void main() {
              vec3 baseColor = vec3(1.0);
              #ifdef USE_INSTANCING
                baseColor = vInstanceColor;
              #endif
              
              vec3 viewDirectionV = normalize(-vPositionV);
              float fresnelTerm = fresnelBias + fresnelScale * pow(1.0 - max(0.0, dot(viewDirectionV, vNormalV)), fresnelPower);
              fresnelTerm = clamp(fresnelTerm, 0.0, 1.0);
              
              vec3 finalColor = mix(baseColor, fresnelColor, fresnelTerm);
              gl_FragColor = vec4(finalColor, 1.0);
            }
          `,
          transparent: true,
          blending: THREE.NormalBlending,
          depthWrite: true,
        });
      case 'wireframe':
        return new THREE.MeshStandardMaterial({ wireframe: true });
      case 'standard':
      default:
        return new THREE.MeshStandardMaterial({ 
          roughness: 0.4, 
          metalness: 0.1 
        });
    }
  }, [materialType]);

  const defaultMat1 = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FF432A', roughness: 0.4, metalness: 0.1 }), []);
  const defaultMat2 = useMemo(() => new THREE.MeshStandardMaterial({ color: '#66F55A', roughness: 0.4, metalness: 0.1 }), []);
  const defaultMat3 = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F50BBA', roughness: 0.4, metalness: 0.1 }), []);

  return (
    <group>
      {!videoReady && !permissionDenied && (
        <Html center>
          <div className="text-white font-mono text-sm whitespace-nowrap bg-black/50 px-4 py-2 rounded">
            WAITING FOR CAMERA...
          </div>
        </Html>
      )}
      {videoReady && !net && (
        <Html center>
          <div className="text-white font-mono text-sm whitespace-nowrap bg-black/50 px-4 py-2 rounded mt-12">
            LOADING AI MODEL...
          </div>
        </Html>
      )}
      {permissionDenied && (
        <Html center>
          <div className="text-red-500 font-mono text-sm whitespace-nowrap bg-black/50 px-4 py-2 rounded">
            CAMERA PERMISSION DENIED
          </div>
        </Html>
      )}
      {geo1 && (
        <instancedMesh ref={mesh1Ref} args={[geo1, materialType === 'none' ? origMat1 : (materialType === 'default' ? defaultMat1 : material), MAX_INSTANCES]}>
        </instancedMesh>
      )}
      {geo2 && (
        <instancedMesh ref={mesh2Ref} args={[geo2, materialType === 'none' ? origMat2 : (materialType === 'default' ? defaultMat2 : material), MAX_INSTANCES]}>
        </instancedMesh>
      )}
      {geo3 && (
        <instancedMesh ref={mesh3Ref} args={[geo3, materialType === 'none' ? origMat3 : (materialType === 'default' ? defaultMat3 : material), MAX_INSTANCES]}>
        </instancedMesh>
      )}
    </group>
  );
}

const bgColors = ['#000000', '#0C1E4C', '#26199D', '#66F55A', '#F50BBA', '#FF432A', '#82D1FF', '#FFFFFF'];

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Html center>
          <div className="text-red-500 font-mono text-sm bg-black/80 px-4 py-2 rounded border border-red-500/50">
            ERROR LOADING ASSETS
          </div>
        </Html>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [resolution, setResolution] = useState(114);
  const [iconScale, setIconScale] = useState(1.0);
  const [colorFilter, setColorFilter] = useState('grid');
  const [materialType, setMaterialType] = useState('default');
  const [bgColor, setBgColor] = useState('#26199D');
  const [showSettings, setShowSettings] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === '5') {
        setShowSettings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!started) {
    return (
      <div className="w-full h-screen relative overflow-hidden flex flex-col justify-center px-8 md:px-24" style={{ backgroundColor: '#0A092B' }}>
        {/* Floating Images */}
        {/* Orange Shape - Top Right (Left of Green) */}
        <img 
          src="/assets/orange.png" 
          alt="Orange Shape" 
          className="absolute top-[-15%] right-[25%] w-[50vw] md:w-[40vw] object-contain animate-float-slow pointer-events-none opacity-90 z-0"
          style={{ animationDuration: '8s' }}
        />
        
        {/* Green Shape - Top Right */}
        <img 
          src="/assets/green.png" 
          alt="Green Shape" 
          className="absolute top-[5%] right-[5%] w-[25vw] md:w-[18vw] object-contain animate-float-medium pointer-events-none opacity-80 z-0"
          style={{ animationDuration: '6s' }}
        />
        
        {/* Pink Shape - Bottom Right */}
        <img 
          src="/assets/pink.png" 
          alt="Pink Shape" 
          className="absolute bottom-[-25%] right-[-15%] w-[80vw] md:w-[60vw] object-contain animate-float-fast pointer-events-none opacity-90 z-0"
          style={{ animationDuration: '10s' }}
        />

        <div className="z-10 max-w-2xl">
          <h1 className="text-white text-6xl md:text-8xl font-semibold leading-[0.9] mb-6" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>
            MSG'S<br />INTERACTIVE<br />WALL
          </h1>
          <div className="w-24 h-1 bg-white/20 mb-6"></div>
          <p className="text-white text-lg md:text-xl font-light mb-12 max-w-lg leading-relaxed">
            An AI-powered screen that responds to movement, transforming MSG’s new rebranding into an immersive experience.
          </p>
          
          <div className="flex flex-col items-start gap-3">
            <button 
              onClick={() => setStarted(true)}
              className="bg-white text-[#0A092B] px-8 py-4 text-lg font-bold tracking-wider hover:bg-white/90 transition-colors uppercase"
              style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}
            >
              Launch Demo
            </button>
            <span className="text-white/40 text-xs uppercase tracking-widest">
              Make sure to enable camera
            </span>
          </div>
        </div>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(2deg); }
          }
          .animate-float-slow { animation: float 8s ease-in-out infinite; }
          .animate-float-medium { animation: float 6s ease-in-out infinite; }
          .animate-float-fast { animation: float 10s ease-in-out infinite; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="w-full h-screen overflow-hidden relative font-sans" style={{ backgroundColor: bgColor }}>
      <Canvas camera={{ position: [0, 0, 70], fov: 50 }}>
        <color attach="background" args={[bgColor]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        <ErrorBoundary>
          <Suspense fallback={<Loader />}>
            <Mosaic resolution={resolution} iconScale={iconScale} colorFilter={colorFilter} materialType={materialType} />
          </Suspense>
        </ErrorBoundary>
        <OrbitControls enableRotate={false} enableZoom={false} enablePan={false} />
      </Canvas>
      
      <div className="absolute top-4 left-4 text-white/50 font-mono text-xs pointer-events-none tracking-widest z-10 mix-blend-difference">
        MSG INTERACTIVE WALL // REAL-TIME 3D MOSAIC
      </div>

      {showSettings && (
        <div className="absolute top-16 right-4 w-72 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-white z-20 shadow-2xl max-h-[80vh] overflow-y-auto">
          <h2 className="text-sm font-semibold mb-6 uppercase tracking-wider text-white/80">Settings</h2>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-white/60">
                <label>Grid Resolution</label>
                <span>{resolution}x{Math.floor(resolution * 0.75)}</span>
              </div>
              <input 
                type="range" 
                min="16" max="150" step="2" 
                value={resolution} 
                onChange={(e) => setResolution(parseInt(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-xs text-white/60">
                <label>Icon Size</label>
                <span>{iconScale.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.2" max="3.0" step="0.1" 
                value={iconScale} 
                onChange={(e) => setIconScale(parseFloat(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            <div className="space-y-3">
              <div className="text-xs text-white/60 mb-2">Color Filter</div>
              <div className="grid grid-cols-2 gap-2">
                {['grid', 'none', 'grayscale', 'sepia', 'invert', 'cyberpunk'].map(f => (
                  <button
                    key={f}
                    onClick={() => setColorFilter(f)}
                    className={`px-3 py-2 rounded-lg text-xs capitalize border transition-colors ${
                      colorFilter === f 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/70 border-white/20 hover:border-white/50'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-white/60 mb-2">Material</div>
              <div className="grid grid-cols-2 gap-2">
                {['fresnel', 'default', 'none', 'standard', 'basic', 'phong', 'physical', 'wireframe'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMaterialType(m)}
                    className={`px-3 py-2 rounded-lg text-xs capitalize border transition-colors ${
                      materialType === m 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/70 border-white/20 hover:border-white/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-white/60 mb-2">Background Color</div>
              <div className="flex flex-wrap gap-2">
                {bgColors.map(c => (
                  <button
                    key={c}
                    onClick={() => setBgColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${
                      bgColor === c ? 'scale-125 border-white' : 'border-transparent hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}