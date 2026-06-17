import React, { useState, useRef, useEffect } from 'react';
import { initialInventory, skuCountOptions, SkuCountOption } from '../data';
import { Camera, Upload, AlertCircle, CheckCircle, Barcode, HelpCircle, Loader2, ArrowRight, RotateCcw, AlertTriangle, Eye, Video, Sliders, Cpu, Cloud } from 'lucide-react';
import { AIResponse, Marker } from '../types';

// Local visual element blob tracker (Connected Component Labeling BFS)
export function runLocalConnectedComponents(
  canvas: HTMLCanvasElement, 
  config: { threshold: number; minSize: number; maxSize: number; detectDark: boolean; autoTune?: boolean }
): Marker[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  
  const w = canvas.width;
  const h = canvas.height;
  
  // Downsample grid for high performance, noise filtering, and fast connected components
  const procW = 120;
  const procH = 90;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = procW;
  tempCanvas.height = procH;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return [];
  
  // Compress frame to downsizer
  tempCtx.drawImage(canvas, 0, 0, procW, procH);
  
  let imgData;
  try {
    imgData = tempCtx.getImageData(0, 0, procW, procH);
  } catch (e) {
    // Return empty if security/CORS blocks reading canvas pixels (usually only happens in complex cross-origin iframes)
    return [];
  }
  
  const data = imgData.data;
  
  // 1. Grayscale and adaptive segmentation helper
  let sumGray = 0;
  const grays = new Uint8Array(procW * procH);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard relative luminance weights
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    grays[i / 4] = gray;
    sumGray += gray;
  }
  
  const avgGray = sumGray / (procW * procH);
  
  // If autoTune is active, intelligently estimate foreground parameters
  let detectDark = config.detectDark;
  let threshold = config.threshold;
  
  if (config.autoTune) {
    if (avgGray > 120) {
      // Light background, search for darker objects
      detectDark = true;
      threshold = Math.max(30, Math.min(220, Math.round(avgGray - 35)));
    } else {
      // Dark background, search for lighter objects
      detectDark = false;
      threshold = Math.max(30, Math.min(220, Math.round(avgGray + 35)));
    }
  }
  
  const binaryGrid = new Uint8Array(procW * procH);
  for (let i = 0; i < procW * procH; i++) {
    const gray = grays[i];
    const isForeground = detectDark 
      ? gray < threshold 
      : gray > threshold;
    binaryGrid[i] = isForeground ? 1 : 0;
  }
  
  // 2. Connected Component Labeling via Breadth-First Search (BFS)
  const visited = new Uint8Array(procW * procH);
  const markers: Marker[] = [];
  
  for (let y = 0; y < procH; y++) {
    for (let x = 0; x < procW; x++) {
      const parentIdx = y * procW + x;
      if (binaryGrid[parentIdx] === 1 && visited[parentIdx] === 0) {
        // Unvisited foreground component: execute clustering BFS
        const queue: [number, number][] = [[x, y]];
        visited[parentIdx] = 1;
        
        let sumX = 0;
        let sumY = 0;
        let pixelCount = 0;
        
        while (queue.length > 0) {
          const [cx, cy] = queue.shift()!;
          sumX += cx;
          sumY += cy;
          pixelCount++;
          
          // Check 4-connected neighbors
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1]
          ];
          
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < procW && ny >= 0 && ny < procH) {
              const nIdx = ny * procW + nx;
              if (binaryGrid[nIdx] === 1 && visited[nIdx] === 0) {
                visited[nIdx] = 1;
                queue.push([nx, ny]);
              }
            }
          }
          
          // Prevention guard against runaway loops
          if (pixelCount > 5000) break;
        }
        
        // Isolate components matching target particle dimensions
        if (pixelCount >= config.minSize && pixelCount <= config.maxSize) {
          const avgX = sumX / pixelCount;
          const avgY = sumY / pixelCount;
          
          // Map average pixel coordinates back to proportional viewport % coordinates
          markers.push({
            x: Number(((avgX / procW) * 100).toFixed(2)),
            y: Number(((avgY / procH) * 100).toFixed(2))
          });
        }
      }
    }
  }
  
  return markers;
}

interface ReceiveScreenProps {
  onConfirmReceipt: (sku: string, count: number, serial: string) => void;
  preSelectedSku?: string;
  skuOptions?: SkuCountOption[];
}

export default function ReceiveScreen({ onConfirmReceipt, preSelectedSku, skuOptions = skuCountOptions }: ReceiveScreenProps) {
  // Find initial choice
  const initialOption = skuOptions.find(o => o.sku === preSelectedSku) || skuOptions[0] || skuCountOptions[0];
  const [selectedSku, setSelectedSku] = useState<string>(initialOption.sku);
  const currentOption = skuOptions.find(o => o.sku === selectedSku) || skuOptions[0] || skuCountOptions[0];

  const [serialNo, setSerialNo] = useState('');
  const [manualCount, setManualCount] = useState<number>(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState('');
  const [hasCameraError, setHasCameraError] = useState(false);
  
  // Computer Vision Processing Configuration
  const [processingEngine, setProcessingEngine] = useState<'local_edge' | 'ai_cloud'>('local_edge');
  const [cvThreshold, setCvThreshold] = useState<number>(115);
  const [cvMinSize, setCvMinSize] = useState<number>(3);
  const [cvMaxSize, setCvMaxSize] = useState<number>(500);
  const [cvDetectDark, setCvDetectDark] = useState<boolean>(true); // True: dark objects on light background (metallic components), False: bright objects on dark background
  const [cvAutoTune, setCvAutoTune] = useState<boolean>(true);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Two-step workflow state:
  // 'initial_image' = First stage: Capture or upload initial baseline reference image
  // 'live_camera'   = Second stage: Complete active count verification in the live viewfinder
  const [workflowStep, setWorkflowStep] = useState<'initial_image' | 'live_camera'>('initial_image');
  
  // Captured records for Step 1
  const [initialCount, setInitialCount] = useState<number | null>(null);
  const [initialMarkers, setInitialMarkers] = useState<Marker[]>([]);
  const [initialMessage, setInitialMessage] = useState<string>('');

  // Captured records for Step 2
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [liveMarkers, setLiveMarkers] = useState<Marker[]>([]);
  const [liveMessage, setLiveMessage] = useState<string>('');

  // Default viewMode inside each step: Step 1 can be simulator/uploaded image, Step 2 defaults to real camera
  const [viewMode, setViewMode] = useState<'simulator' | 'camera'>('simulator');
  const [dragActive, setDragActive] = useState(false);
  const [isAutoScanning, setIsAutoScanning] = useState(false);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Ref to always reference the freshest triggerAICounter closure in the scanning tick interval
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    triggerRef.current = triggerAICounter;
  });

  // Automated live camera periodic inspection loop
  useEffect(() => {
    if (!isAutoScanning || viewMode !== 'camera') {
      return;
    }

    const intervalId = setInterval(() => {
      if (!isScanning) {
        triggerRef.current();
      }
    }, 4000); // scans every 4 seconds

    return () => clearInterval(intervalId);
  }, [isAutoScanning, viewMode, isScanning]);

  // Real-time local edge CV preview loop for camera stream
  useEffect(() => {
    if (viewMode !== 'camera' || processingEngine !== 'local_edge' || isScanning) {
      return;
    }

    const intervalId = setInterval(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const video = videoRef.current;
        const tempCanvas = document.createElement('canvas');
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 480;
        if (w === 0) w = 640;
        if (h === 0) h = 480;
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const detected = runLocalConnectedComponents(tempCanvas, {
            threshold: cvThreshold,
            minSize: cvMinSize,
            maxSize: cvMaxSize,
            detectDark: cvDetectDark,
            autoTune: cvAutoTune
          });

          // Update active step counts in real-time
          if (workflowStep === 'initial_image') {
            setInitialCount(detected.length);
            setInitialMarkers(detected);
            setManualCount(detected.length);
          } else {
            setLiveCount(detected.length);
            setLiveMarkers(detected);
            setManualCount(detected.length);
          }
        }
      }
    }, 450); // real-time 450ms updates

    return () => clearInterval(intervalId);
  }, [viewMode, processingEngine, cvThreshold, cvMinSize, cvMaxSize, cvDetectDark, cvAutoTune, workflowStep, isScanning]);

  // Click handler to manually add or remove item tracking markers
  const handleViewfinderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isScanning) return;

    // Prevent marker additions when clicking control buttons or forms
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    const clickThreshold = 4.5; // percentage distance
    let matchIdx = -1;
    const currentMarkers = workflowStep === 'initial_image' ? initialMarkers : liveMarkers;

    for (let i = 0; i < currentMarkers.length; i++) {
      const dx = currentMarkers[i].x - clickX;
      const dy = currentMarkers[i].y - clickY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < clickThreshold) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      // Remove existing marker
      const updated = currentMarkers.filter((_, idx) => idx !== matchIdx);
      if (workflowStep === 'initial_image') {
        setInitialMarkers(updated);
        setInitialCount(updated.length);
        setManualCount(updated.length);
      } else {
        setLiveMarkers(updated);
        setLiveCount(updated.length);
        setManualCount(updated.length);
      }
    } else {
      // Create manual marker
      const newMarker: Marker = {
        x: Number(clickX.toFixed(2)),
        y: Number(clickY.toFixed(2))
      };
      const updated = [...currentMarkers, newMarker];
      if (workflowStep === 'initial_image') {
        setInitialMarkers(updated);
        setInitialCount(updated.length);
        setManualCount(updated.length);
      } else {
        setLiveMarkers(updated);
        setLiveCount(updated.length);
        setManualCount(updated.length);
      }
    }
  };

  // Reset entire workflow setup when changing the SKU selection
  useEffect(() => {
    resetWorkflow();
    setSerialNo('');
  }, [selectedSku]);

  // Load custom drawn simulated components on Canvas when SKU, viewmode or workflow shifts, or custom image uploads
  useEffect(() => {
    if (viewMode === 'simulator') {
      drawSimulationPlates();
    }
  }, [selectedSku, viewMode, workflowStep, uploadedImage, cvThreshold, cvMinSize, cvMaxSize, cvDetectDark, cvAutoTune]);

  // Handle webcam stream start/stop with resilient device fallbacks
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    if (viewMode === 'camera') {
      const constraints = { video: { facingMode: 'environment' } };
      navigator.mediaDevices.getUserMedia(constraints)
        .catch(err => {
          console.warn('Environment-facing camera not found/denied, trying default video source...', err);
          return navigator.mediaDevices.getUserMedia({ video: true });
        })
        .then(s => {
          if (!isActive) {
            s.getTracks().forEach(track => track.stop());
            return;
          }
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            // Safari/Chrome play reassurance
            videoRef.current.play().catch(e => console.warn('Silent play catch:', e));
          }
          setHasCameraError(false);
        })
        .catch(err => {
          console.error('Camera access completely blocked:', err);
          if (isActive) {
            setHasCameraError(true);
            setViewMode('simulator'); // fallback gracefully
          }
        });
    }

    return () => {
      isActive = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [viewMode]);

  const resetWorkflow = () => {
    setWorkflowStep('initial_image');
    setViewMode('simulator');
    setUploadedImage(null);
    setIsAutoScanning(false);
    setInitialCount(null);
    setInitialMarkers([]);
    setInitialMessage('');
    setLiveCount(null);
    setLiveMarkers([]);
    setLiveMessage('');
    setManualCount(0);
    setScannerStatus('idle');
    setScanMessage('');
  };

  // Draw simulated hardware components onto canvas to produce visual photo representation
  const drawSimulationPlates = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas size
    canvas.width = 480;
    canvas.height = 360;

    // 1. Draw uploaded custom image if set
    if (uploadedImage) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Run local connected components instantly!
        const detected = runLocalConnectedComponents(canvas, {
          threshold: cvThreshold,
          minSize: cvMinSize,
          maxSize: cvMaxSize,
          detectDark: cvDetectDark,
          autoTune: cvAutoTune
        });

        if (workflowStep === 'initial_image') {
          setInitialCount(detected.length);
          setInitialMarkers(detected);
          setManualCount(detected.length);
          setScanMessage(`[Adaptive CV Tracker] Detected ${detected.length} elements from the uploaded photograph.`);
        } else {
          setLiveCount(detected.length);
          setLiveMarkers(detected);
          setManualCount(detected.length);
          setScanMessage(`[Adaptive CV Tracker] Detected ${detected.length} elements from your live photo.`);
        }
      };
      img.src = uploadedImage;
      return;
    }

    // 2. Check if dynamic user SKU reference catalog photo exists
    if ((currentOption as any).referenceImage) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Run local CV segmenter instantly on catalog reference
        const detected = runLocalConnectedComponents(canvas, {
          threshold: cvThreshold,
          minSize: cvMinSize,
          maxSize: cvMaxSize,
          detectDark: cvDetectDark,
          autoTune: cvAutoTune
        });

        if (workflowStep === 'initial_image') {
          setInitialCount(detected.length);
          setInitialMarkers(detected);
          setManualCount(detected.length);
        } else {
          setLiveCount(detected.length);
          setLiveMarkers(detected);
          setManualCount(detected.length);
        }
      };
      img.src = (currentOption as any).referenceImage;
      return;
    }

    // 1. Draw metal tray plate surface as background
    ctx.fillStyle = '#cfd8dc'; // cold steel
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle brushed metal texture lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.height; i += 6) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i + (Math.sin(i) * 2));
      ctx.stroke();
    }

    // Plate rim border
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    // 2. Lay out grid items based on SKU profile configuration
    const cols = currentOption.gridCols || 6;
    const rows = currentOption.gridRows || 6;

    const xStep = 380 / (cols + 1);
    const yStep = 280 / (rows + 1);

    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';

    // We can vary the seed depending on step to make step 1 and step 2 counts realistically different!
    let stepOffset = workflowStep === 'live_camera' ? 5 : 0;
    let seed = (currentOption.seed || 12) + stepOffset;
    
    const random = () => {
      // simple deterministic multiplier
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    let actualCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Decide if item exists (density percentage representation)
        if (random() > (1 - (currentOption.density || 0.85))) {
          const cx = 50 + (c + 1) * xStep + (random() * 4 - 2);
          const cy = 40 + (r + 1) * yStep + (random() * 4 - 2);

          drawSingleHardware(ctx, cx, cy, currentOption.itemType);
          actualCount++;
        }
      }
    }

    // reset shadow
    ctx.shadowBlur = 0;
  };

  // Canvas visual painters for industrial components
  const drawSingleHardware = (ctx: CanvasRenderingContext2D, x: number, y: number, type: string) => {
    switch (type) {
      case 'bracket': // Steel Bracket - rounded metal ring with center pin
        // outer steel rim
        ctx.fillStyle = '#b0bec5';
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#37474f';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // metallic inner bevel
        ctx.fillStyle = '#eceff1';
        ctx.beginPath();
        ctx.arc(x - 3, y - 3, 5, 0, Math.PI * 2);
        ctx.fill();

        // hollow center hole
        ctx.fillStyle = '#455a64';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // screw slot lines inside
        ctx.strokeStyle = '#cfd8dc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 3);
        ctx.lineTo(x + 3, y + 3);
        ctx.stroke();
        break;

      case 'profile': // Aluminum profile - concentric hex structures
        ctx.fillStyle = '#e0e0e0';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = x + 13 * Math.cos(angle);
          const py = y + 13 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#424242';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // inner tubular hex hole
        ctx.fillStyle = '#212121';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = x + 6 * Math.cos(angle);
          const py = y + 6 * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;

      case 'sensor': // Silicon tray sensor - small rectangular package with golden nodes
        ctx.fillStyle = '#263238'; // matte plastic black
        ctx.fillRect(x - 12, y - 10, 24, 20);
        ctx.strokeStyle = '#eceff1';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 12, y - 10, 24, 20);

        // silicon sensor chip center circle
        ctx.fillStyle = '#00838f';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Gold pins left & right
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(x - 15, y - 7, 3, 3);
        ctx.fillRect(x - 15, y, 3, 3);
        ctx.fillRect(x - 15, y + 4, 3, 3);
        
        ctx.fillRect(x + 12, y - 7, 3, 3);
        ctx.fillRect(x + 12, y, 3, 3);
        ctx.fillRect(x + 12, y + 4, 3, 3);
        break;

      case 'wire': // Copper Wire spools - amber/brown copper rings
        // outer insulation
        ctx.fillStyle = '#bf360c'; // red-orange copper
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d84315';
        ctx.lineWidth = 2;
        ctx.stroke();

        // concentric copper winding circles
        ctx.strokeStyle = '#ffb74d';
        ctx.lineWidth = 1;
        for (let r = 5; r <= 13; r += 3) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // black hollow center core spigot
        ctx.fillStyle = '#262626';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  };

  // Convert current Canvas layout or webcam snapshot to Base64 to query Gemini backend
  const triggerAICounter = () => {
    setIsScanning(true);
    setScannerStatus('scanning');

    // Clear step specific values before scanning
    if (workflowStep === 'initial_image') {
      setInitialCount(null);
      setInitialMarkers([]);
    } else {
      setLiveCount(null);
      setLiveMarkers([]);
    }

    // --- CASE 1: LOCAL EDGE CV ENGINE ---
    if (processingEngine === 'local_edge') {
      setTimeout(() => {
        let localCanvas = canvasRef.current;
        if (viewMode === 'camera' && videoRef.current) {
          const video = videoRef.current;
          localCanvas = document.createElement('canvas');
          let w = video.videoWidth || 640;
          let h = video.videoHeight || 480;
          if (w === 0) w = 640;
          if (h === 0) h = 480;
          localCanvas.width = w;
          localCanvas.height = h;
          const ctx = localCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
          }
        }

        if (localCanvas) {
          const detected = runLocalConnectedComponents(localCanvas, {
            threshold: cvThreshold,
            minSize: cvMinSize,
            maxSize: cvMaxSize,
            detectDark: cvDetectDark,
            autoTune: cvAutoTune
          });

          setIsScanning(false);
          setScannerStatus('success');

          if (workflowStep === 'initial_image') {
            setInitialCount(detected.length);
            setInitialMarkers(detected);
            setInitialMessage(`[Local Edge CV] Segmented ${detected.length} points.`);
            setManualCount(detected.length);
            setScanMessage(`Step 1 Complete: Captured ${detected.length} baseline elements. Proceed to Live Cam!`);
          } else {
            setLiveCount(detected.length);
            setLiveMarkers(detected);
            setLiveMessage(`[Local Edge CV] Verified ${detected.length} points.`);
            setManualCount(detected.length);

            if (initialCount !== null) {
              const diff = detected.length - initialCount;
              if (diff === 0) {
                setScanMessage(`Live Verified! Perfect Match (Count: ${detected.length}) with baseline.`);
              } else if (diff > 0) {
                setScanMessage(`Live scan detects deviation! Found +${diff} extra elements compared to reference.`);
              } else {
                setScanMessage(`Live scan detects deviation! Found ${diff} fewer elements than reference.`);
              }
            } else {
              setScanMessage(`Live verification complete: Counted ${detected.length} components.`);
            }
          }
        } else {
          setIsScanning(false);
          setScannerStatus('error');
          setScanMessage('Failed to access active video stream or drawing canvas.');
        }
      }, 500);
      return;
    }

    // --- CASE 2: AI CLOUD/PROXY BACKEND ENGINE ---
    let base64Image = '';

    if (viewMode === 'camera' && videoRef.current) {
      // Capture frame from webcam channel using its high-quality native aspect ratio
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      let w = video.videoWidth || 640;
      let h = video.videoHeight || 480;
      if (w === 0) w = 640;
      if (h === 0) h = 480;
      canvas.width = w;
      canvas.height = h;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        base64Image = canvas.toDataURL('image/jpeg', 0.85); // elevated compression quality for crisp element outline
      }
    } else {
      // Use standard drawn plate preview
      const canvas = canvasRef.current;
      if (canvas) {
        base64Image = canvas.toDataURL('image/jpeg', 0.85);
      }
    }

    if (!base64Image) {
      setScannerStatus('error');
      setIsScanning(false);
      setScanMessage('Failed to construct inspection image frame. Please verify camera stream.');
      return;
    }

    // Determine simulated markers if viewMode is simulator
    const simulatedMarkers: Marker[] = [];
    const isSim = viewMode === 'simulator' && !uploadedImage && !(currentOption as any).referenceImage;
    if (isSim) {
      const cols = currentOption.gridCols || 6;
      const rows = currentOption.gridRows || 6;
      const xStep = 380 / (cols + 1);
      const yStep = 280 / (rows + 1);
      let stepOffset = workflowStep === 'live_camera' ? 5 : 0;
      let seed = (currentOption.seed || 12) + stepOffset;
      const random = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (random() > (1 - (currentOption.density || 0.85))) {
            const cx = 50 + (c + 1) * xStep + (random() * 4 - 2);
            const cy = 40 + (r + 1) * yStep + (random() * 4 - 2);
            simulatedMarkers.push({
              x: Number(((cx / 480) * 100).toFixed(2)),
              y: Number(((cy / 360) * 100).toFixed(2))
            });
          }
        }
      }
    }

    // Determine the expected number of components based on current layout options
    const targetExpected = workflowStep === 'live_camera' && initialCount !== null
      ? initialCount // expecting to match step 1 reference count
      : (currentOption.expected || 10);

    // Send payload POST to Express proxy
    fetch('/api/count-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        sku: `${currentOption.sku}-${workflowStep}`,
        expected: targetExpected,
        isSimulator: isSim,
        simulatedMarkers: simulatedMarkers
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('API server returned error status');
        return res.json();
      })
      .then((data: AIResponse) => {
        setIsScanning(false);
        if (data.error) {
          setScannerStatus('error');
          setScanMessage(data.error);
        } else {
          setScannerStatus('success');
          
          if (workflowStep === 'initial_image') {
            setInitialCount(data.count);
            setInitialMarkers(data.markers || []);
            setInitialMessage(data.message || `Baseline counted: acknowledged ${data.count} components.`);
            setManualCount(data.count);
            setScanMessage(`Step 1 Complete: Counted ${data.count} baseline components. Proceed to Live Camera next!`);
          } else {
            setLiveCount(data.count);
            setLiveMarkers(data.markers || []);
            setLiveMessage(data.message || `Live count complete: calculated ${data.count} units.`);
            setManualCount(data.count); // Live verified count represents final count
            
            // Generate deviation comparison message
            if (initialCount !== null) {
              const diff = data.count - initialCount;
              if (diff === 0) {
                setScanMessage(`Live Verified! Perfect Match (Count: ${data.count}) with baseline.`);
              } else if (diff > 0) {
                setScanMessage(`Live scan detects target count deviation! Found +${diff} more items than initial baseline.`);
              } else {
                setScanMessage(`Live scan detects target count deviation! Found ${diff} fewer items than initial baseline.`);
              }
            } else {
              setScanMessage(`Live verification complete: Counted ${data.count} components.`);
            }
          }
        }
      })
      .catch(err => {
        console.error('Inspection count API failure:', err);
        setIsScanning(false);
        setScannerStatus('error');
        setScanMessage('API endpoint transmission failure. Please verify backend status.');
      });
  };

  // Handlers for Custom Drag and Drop file parsing
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Only image files are accepted for hardware inspections.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Str = event.target?.result as string;
      setUploadedImage(base64Str);
      setViewMode('simulator'); // enforce canvas display for uploaded image
      
      setScannerStatus('idle');
      if (workflowStep === 'initial_image') {
        setInitialCount(null);
        setInitialMarkers([]);
      } else {
        setLiveCount(null);
        setLiveMarkers([]);
      }
      setScanMessage('External inspection photograph loaded. Press capture button.');
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmSubmit = () => {
    if (manualCount <= 0) {
      alert('Inspection is incomplete. Please process counts under live camera first.');
      return;
    }
    onConfirmReceipt(selectedSku, manualCount, serialNo);
  };

  const proceedToLiveFeed = () => {
    setWorkflowStep('live_camera');
    // For live camera verification, turn on real webcam feed as default!
    setViewMode('camera');
    setScannerStatus('idle');
    setScanMessage('Transitioned to Live verification. Position camera and capture to complete audit.');
  };

  // Markers currently drawn inside viewport depends on the active step
  const activeMarkers = workflowStep === 'initial_image' ? initialMarkers : liveMarkers;

  return (
    <div className="flex flex-col flex-grow text-[#191c1e] pb-10">
      
      {/* Target Sku Selection */}
      <div className="mb-4">
        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
          SKU SELECTION
        </label>
        <select
          value={selectedSku}
          onChange={(e) => setSelectedSku(e.target.value)}
          className="w-full h-[44px] bg-white border border-[#bdc9c7] rounded-lg px-3 text-sm font-semibold tracking-tight focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none"
        >
          {skuOptions.map(opt => (
            <option key={opt.sku} value={opt.sku}>
              {opt.sku} - {opt.name}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[11px] font-bold text-[#54647a]">Section: {currentOption.section}</span>
          <span className="text-[11px] font-bold text-[#005e5c] uppercase">Expected: {currentOption.expected} Units</span>
        </div>
      </div>

      {/* TWO-STEP WORKFLOW STATUS INDICATOR STEPPER */}
      <div className="mb-4 bg-slate-100 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-1 text-xs select-none shadow-inner">
        {/* Step 1 Pill */}
        <button
          onClick={() => {
            if (workflowStep === 'live_camera') {
              setWorkflowStep('initial_image');
              setViewMode('simulator');
              setScannerStatus('idle');
              setScanMessage('Returned to initial image capture view.');
            }
          }}
          className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            workflowStep === 'initial_image'
              ? 'bg-brand-teal text-white shadow'
              : 'text-gray-500 hover:text-brand-teal hover:bg-slate-200/50'
          }`}
        >
          <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black ${
            workflowStep === 'initial_image' ? 'bg-white text-brand-teal' : 'bg-gray-300 text-gray-600'
          }`}>1</span>
          <span className="truncate">Initial Image</span>
          {initialCount !== null && (
            <span className="bg-teal-900/40 text-teal-100 font-black text-[9px] px-1 rounded">
              {initialCount}
            </span>
          )}
        </button>

        <span className="text-gray-400 font-black text-xs px-1 shrink-0">➔</span>

        {/* Step 2 Pill */}
        <button
          disabled={initialCount === null}
          onClick={() => proceedToLiveFeed()}
          className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            workflowStep === 'live_camera'
              ? 'bg-brand-teal text-white shadow'
              : 'text-gray-500 hover:text-brand-teal hover:bg-slate-200/50'
          }`}
        >
          <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black ${
            workflowStep === 'live_camera' ? 'bg-white text-brand-teal' : 'bg-gray-300 text-gray-600'
          }`}>2</span>
          <span className="truncate">Live Camera</span>
          {liveCount !== null && (
            <span className="bg-teal-900/40 text-teal-100 font-black text-[9px] px-1 rounded">
              {liveCount}
            </span>
          )}
        </button>
      </div>

      {/* Vision Processing Engine Selector and Adjustments */}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-inner">
        <div className="flex justify-between items-center">
          <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
            <Cpu size={12} className="text-brand-teal" /> Detection Engine
          </label>
          <div className="flex bg-slate-200/80 rounded-lg p-0.5 border border-slate-300">
            <button
              onClick={() => setProcessingEngine('local_edge')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                processingEngine === 'local_edge'
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Cpu size={10} /> Local Pixel Tracker
            </button>
            <button
              onClick={() => setProcessingEngine('ai_cloud')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase transition-all flex items-center gap-1 ${
                processingEngine === 'ai_cloud'
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Cloud size={10} /> AI Cloud Inspect
            </button>
          </div>
        </div>

        {processingEngine === 'local_edge' ? (
          <div className="text-xs text-slate-600 space-y-2 mt-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Sensitivity Parameters</span>
              </div>
              <span className="text-teal-600 italic text-[10px] font-bold">No latency • Real-time overlay</span>
            </div>

            {/* Auto-Tune settings toggle checkbox */}
            <div className="bg-slate-100 border border-slate-200 rounded-lg p-2 flex items-center justify-between shadow-sm">
              <label className="text-[10px] font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cvAutoTune}
                  onChange={(e) => setCvAutoTune(e.target.checked)}
                  className="rounded border-[#bdc9c7] text-brand-teal focus:ring-brand-teal w-4.5 h-4.5 accent-brand-teal"
                />
                <div>
                  <span className="text-brand-teal font-black uppercase block">Auto-Tune Sensitivity (Highly Recommended)</span>
                  <span className="text-slate-400 text-[9px] font-semibold">Intelligently scans background contrast & inverts lighting modes on load</span>
                </div>
              </label>
            </div>
            
            <div className={`grid grid-cols-2 gap-3 transition-opacity duration-200 ${cvAutoTune ? 'opacity-40 pointer-events-none' : ''}`}>
              {/* Threshold sensitivity */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-700">
                  <span>Contrast Threshold: <b className="text-brand-teal">{cvAutoTune ? 'Auto (~' + cvThreshold + ')' : cvThreshold}</b></span>
                </div>
                <input
                  type="range"
                  min="25"
                  max="225"
                  value={cvThreshold}
                  disabled={cvAutoTune}
                  onChange={(e) => setCvThreshold(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
              </div>

              {/* Min Size */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-700">
                  <span>Min Object Size: <b className="text-brand-teal">{cvMinSize} px</b></span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="35"
                  value={cvMinSize}
                  onChange={(e) => setCvMinSize(Number(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-teal"
                />
              </div>
            </div>

            <div className={`flex items-center justify-between pt-1 transition-opacity duration-200 ${cvAutoTune ? 'opacity-40 pointer-events-none' : ''}`}>
              <label className="text-[10px] font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cvDetectDark}
                  disabled={cvAutoTune}
                  onChange={(e) => setCvDetectDark(e.target.checked)}
                  className="rounded border-[#bdc9c7] text-brand-teal focus:ring-brand-teal w-3.5 h-3.5"
                />
                Dark Items on White/Light Tray (Metallic parts)
              </label>
              <span className="text-[9px] text-slate-400 font-bold block">100% OFFLINE</span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-slate-500 py-1 flex items-start gap-1.5 mt-2 pt-2 border-t border-slate-200 font-semibold leading-relaxed">
            <AlertCircle size={12} className="text-brand-teal shrink-0 mt-0.5" />
            <span>Sends inspection target snapshot to server-side Gemini 3.5 API. Fits complex visual structures, colors, and shadows. Falls back to local counting automatically.</span>
          </div>
        )}
      </div>

      {/* View Mode Controller */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="text-[11px] font-black text-brand-teal uppercase tracking-widest bg-brand-teal-container/60 text-brand-teal-on-container px-2.5 py-0.5 rounded-full border border-teal-200">
            {workflowStep === 'initial_image' ? 'Stage 1: Base Reference' : 'Stage 2: Live Audit'}
          </span>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <button
            onClick={() => setViewMode('simulator')}
            className={`px-2 py-1 rounded transition-all ${
              viewMode === 'simulator' 
                ? 'bg-brand-teal text-white' 
                : 'bg-white hover:bg-slate-100 border border-[#bdc9c7]/50 text-gray-700'
            }`}
          >
            {workflowStep === 'initial_image' ? 'Reference Simulation' : 'Verified simulation'}
          </button>
          <button
            onClick={() => setViewMode('camera')}
            className={`px-2 py-1 rounded transition-all flex items-center gap-1 ${
              viewMode === 'camera' 
                ? 'bg-brand-teal text-white' 
                : 'bg-white hover:bg-slate-100 border border-[#bdc9c7]/50 text-gray-700'
            }`}
          >
            <Camera size={12} /> Live camera
          </button>
        </div>
      </div>

      {/* Viewfinder Platform */}
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={handleViewfinderClick}
        className={`relative w-full rounded-2xl overflow-hidden bg-slate-950 border-2 transition-all shadow-inner aspect-[4/3] flex items-center justify-center cursor-crosshair ${
          dragActive ? 'border-brand-teal scale-[1.01]' : 'border-brand-teal-light'
        }`}
        title="Interact: tap anywhere on screen to manually add or clear visual target points"
      >
        {/* Live Video Auto-Scan Toggle overlay */}
        {viewMode === 'camera' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsAutoScanning(!isAutoScanning);
            }}
            className={`absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-extrabold uppercase tracking-widest transition-all shadow-md active:scale-95 ${
              isAutoScanning
                ? 'bg-red-600 text-white border-red-500 animate-pulse'
                : 'bg-slate-900/85 text-teal-300 border-teal-500/30 hover:bg-slate-800'
            }`}
            title="Toggle automated continuous scanning loop (scans every 4 seconds)"
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isAutoScanning ? 'bg-white animate-ping' : 'bg-red-500'}`}></div>
            <span>{isAutoScanning ? 'Auto Scan Enabled' : 'Auto Scan disabled'}</span>
          </button>
        )}

        {/* Status Badge */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full border border-teal-500/20">
          <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></div>
          <span className="text-[9px] text-white font-bold uppercase tracking-wider">
            {isScanning ? 'Inspecting' : 'Ready'}
          </span>
        </div>

        {/* Shutter Laser beam scanner animation */}
        {isScanning && (
          <div className="absolute inset-x-0 h-1 bg-teal-400 shadow-[0_0_8px_#2dd4bf] z-20 animate-bounce top-0 pointer-events-none"></div>
        )}

        {/* Viewfinder Frame boundaries overlay */}
        <div className="absolute inset-6 border-2 border-dashed border-teal-400/30 rounded-lg pointer-events-none z-10"></div>
        {/* Focus viewfinder targeting brackets */}
        <div className="absolute top-10 left-10 w-6 h-6 border-t-4 border-l-4 border-brand-teal pointer-events-none z-10"></div>
        <div className="absolute top-10 right-10 w-6 h-6 border-t-4 border-r-4 border-brand-teal pointer-events-none z-10"></div>
        <div className="absolute bottom-10 left-10 w-6 h-6 border-b-4 border-l-4 border-brand-teal pointer-events-none z-10"></div>
        <div className="absolute bottom-10 right-10 w-6 h-6 border-b-4 border-r-4 border-brand-teal pointer-events-none z-10"></div>

        {/* CAMERA FEED AND CANVAS DISPLAY - Permanently mounted for robust, non-null React Ref assignment */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover rounded-xl ${viewMode === 'camera' ? 'block' : 'hidden'}`}
        />
        <canvas
          ref={canvasRef}
          className={`w-full h-full object-contain rounded-xl bg-slate-800 ${viewMode !== 'camera' ? 'block' : 'hidden'}`}
        />

        {/* Camera block placeholder error banner */}
        {hasCameraError && viewMode === 'camera' && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center z-20 text-white">
            <Camera size={36} className="text-red-400 mb-2" />
            <p className="text-sm font-semibold">Camera Access Blocked</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Check authorization permissions or stay under Reference Simulation.
            </p>
          </div>
        )}

        {/* pulsing dots visually representing Detected Inventory Elements */}
        {activeMarkers.map((pt, idx) => (
          <div
            key={idx}
            className={`absolute w-4 h-4 -ml-2 -mt-2 ${
              workflowStep === 'initial_image' 
                ? 'bg-amber-400/85 hover:bg-amber-300' 
                : 'bg-emerald-400/85 hover:bg-emerald-300'
            } border-2 border-white rounded-full flex items-center justify-center cursor-help shadow-lg animate-pulse z-20 hover:scale-125 transition-all text-[8px] font-black text-[#00201f]`}
            style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            title={`Component #${idx + 1}`}
          >
            {idx + 1}
          </div>
        ))}

        {/* Camera Control Trigger Action Buttons inside overlay */}
        <div className="absolute bottom-4 inset-x-0 z-30 flex justify-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 bg-black/60 backdrop-blur-md text-white border border-white/20 rounded-full flex items-center justify-center hover:bg-black/80 transition-all hover:scale-105 shadow active:scale-95"
            title="Upload snapshot"
          >
            <Upload size={16} />
          </button>

          {/* Shutter Button (Runs Step 1 or Step 2 dependent query) */}
          <button
            onClick={triggerAICounter}
            disabled={isScanning}
            className="w-14 h-14 bg-brand-teal hover:bg-brand-teal-light text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-90 transition-all ring-4 ring-white/15 disabled:opacity-50"
            title={workflowStep === 'initial_image' ? 'Capture Initial Base State' : 'Scan Live Audit'}
          >
            {isScanning ? (
              <Loader2 className="w-7 h-7 text-white animate-spin" />
            ) : (
              <Camera className="w-7 h-7 text-white" />
            )}
          </button>

          {/* Reset / Clean Option */}
          <button
            onClick={() => {
              drawSimulationPlates();
              if (workflowStep === 'initial_image') {
                setInitialCount(null);
                setInitialMarkers([]);
                setInitialMessage('');
              } else {
                setLiveCount(null);
                setLiveMarkers([]);
                setLiveMessage('');
              }
              setScannerStatus('idle');
              setScanMessage('');
            }}
            className="w-10 h-10 bg-black/60 backdrop-blur-md text-white border border-white/20 rounded-full flex items-center justify-center hover:bg-black/80 transition-all hover:scale-105 shadow active:scale-95"
            title="Reload plate variables"
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* Instructions placeholder while empty */}
        {scannerStatus === 'idle' && (
          <div className="absolute bottom-20 inset-x-4 bg-black/70 backdrop-blur-md py-1.5 px-3 rounded-lg text-center pointer-events-none z-10 text-[10px] text-teal-200 tracking-wide font-bold uppercase">
            {workflowStep === 'initial_image'
              ? `[Step 1] Capture baseline of ${currentOption.name}`
              : `[Step 2] Position Live Camera to verify counts`
            }
          </div>
        )}
      </div>

      {/* Action panel to transition from Initial to Live Camera verification */}
      {workflowStep === 'initial_image' && initialCount !== null && !isScanning && (
        <div className="mt-3.5 bg-brand-teal-container/60 border border-brand-teal/30 rounded-xl p-3 flex justify-between items-center shadow-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-black text-brand-teal uppercase tracking-widest">Baseline Settled</span>
            <span className="text-xs font-bold text-[#00201f]">Base reference counted {initialCount} items.</span>
          </div>
          <button
            onClick={() => proceedToLiveFeed()}
            className="bg-brand-teal hover:bg-brand-teal-dark font-bold text-white text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1 hover:translate-x-0.5 transition-all shadow active:scale-95"
          >
            <span>Proceed to Live Cam</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Scanner Diagnostic Response Feed Log */}
      {scanMessage && (
        <div className="mt-3">
          <div className={`p-3 rounded-lg border text-xs flex gap-2 items-center ${
            scannerStatus === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {scannerStatus === 'success' ? <CheckCircle size={14} className="text-emerald-600 shrink-0" /> : <AlertCircle size={14} className="text-amber-600 shrink-0" />}
            <div className="flex-grow">
              <p className="font-bold tracking-tight">{scanMessage}</p>
              {workflowStep === 'live_camera' && initialCount !== null && liveCount !== null && (
                <div className="mt-1.5 flex gap-3 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  <span>Initial: <b className="text-slate-800 font-extrabold">{initialCount}</b></span>
                  <span>•</span>
                  <span>Live Scan: <b className="text-slate-800 font-extrabold">{liveCount}</b></span>
                  <span>•</span>
                  <span>Deviation: <b className={`font-black ${liveCount === initialCount ? 'text-emerald-600' : 'text-brand-error'}`}>
                    {liveCount - initialCount === 0 ? 'None (Perfect Match)' : `${liveCount - initialCount > 0 ? '+' : ''}${liveCount - initialCount}`}
                  </b></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual adjustments block */}
      <div className="bg-white border border-[#bdc9c7]/65 rounded-xl p-4 shadow-sm mt-4 flex flex-col gap-4">
        <div className="border-b border-[#bdc9c7]/20 pb-2 flex justify-between items-center">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest block">
            VERIFICATION DETAILS
          </span>
          <button 
            onClick={resetWorkflow}
            className="text-[10px] font-extrabold text-brand-teal hover:underline flex items-center gap-0.5"
            title="Reset whole capture sequence"
          >
            <RotateCcw size={10} /> Restart Verification
          </button>
        </div>

        {/* Mock Serial Number Input with scanner decoration */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-gray-700">Serial No. (Optional)</span>
          <div className="relative">
            <input
              type="text"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              className="w-full h-[40px] border border-[#bdc9c7] rounded px-3 text-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none font-mono"
              placeholder="Scan tray, barcodes, or packaging..."
            />
            <button 
              onClick={() => {
                setSerialNo('SN-' + Math.floor(100000 + Math.random() * 900000) + '-MET');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-teal hover:text-brand-teal-light transition-colors"
              title="Simulate barcode beep"
            >
              <Barcode size={18} />
            </button>
          </div>
        </div>

        {/* Workflow comparative analytics card */}
        <div className="grid grid-cols-2 gap-3.5 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[11px] font-medium text-slate-600">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-left block">
              1. Reference State
            </span>
            <span className="font-bold text-slate-800 mt-0.5 block">
              {initialCount !== null ? `${initialCount} counted` : 'Not captured yet'}
            </span>
          </div>

          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-left block">
              2. Live Audit
            </span>
            <span className="font-bold text-slate-800 mt-0.5 block">
              {liveCount !== null ? `${liveCount} verified` : 'Awaiting live scan'}
            </span>
          </div>
        </div>

        {/* System Count vs Manual Dynamic Verified Count */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-gray-500">System Count</span>
            <div className="h-[40px] bg-gray-100 rounded flex items-center justify-center text-sm font-bold text-gray-600 border border-gray-200">
              {currentOption.expected}
            </div>
          </div>

          <div className="flex flex-col gap-1 font-sans">
            <span className="text-xs font-bold text-gray-700">Verified Receipt Count</span>
            <input
              type="number"
              value={manualCount}
              onChange={(e) => setManualCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-[40px] text-center border border-[#bdc9c7] rounded hover:border-brand-teal text-xl font-bold text-brand-teal bg-brand-teal-container focus:ring-brand-teal focus:border-brand-teal"
              title="Adjust verified amount"
            />
          </div>
        </div>
      </div>

      {/* Bottom actions confirmation button */}
      <div className="mt-6 flex flex-col gap-2">
        <button
          onClick={handleConfirmSubmit}
          disabled={manualCount <= 0 || isScanning}
          className="w-full h-[44px] bg-brand-teal hover:bg-brand-teal-dark text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          <CheckCircle size={18} />
          <span>Confirm Receipt ({manualCount} Units)</span>
        </button>
        {workflowStep === 'initial_image' && initialCount !== null && (
          <p className="text-[10px] text-center text-slate-400 font-medium">
            💡 For complete verification, it is recommended to proceed to Step 2 (Live camera scan) before submitting.
          </p>
        )}
      </div>

    </div>
  );
}

