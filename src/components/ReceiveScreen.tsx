import React, { useState, useRef, useEffect } from "react";
import { skuCountOptions, SkuCountOption } from "../data";
import {
  Camera,
  Upload,
  CheckCircle,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  Plus,
  X,
  BookOpen,
} from "lucide-react";
import { AIResponse, Marker } from "../types";

interface ItemProfile {
  mean_radius: number;
  std_radius: number;
  min_radius: number;
  max_radius: number;
  min_dist: number;
  param2: number;
  item_count: number;
  mean_circularity: number;
  training_images?: number;
}

interface StoredReference {
  sku: string;
  image: string;
  count: number;
  markers: Marker[];
  message: string;
  savedAt: string;
  profile?: ItemProfile;
  trainedOn?: number;
}

interface ReceiveScreenProps {
  onConfirmReceipt: (sku: string, count: number, serial: string) => void;
  preSelectedSku?: string;
  skuOptions?: SkuCountOption[];
}

const MAX_TRAINING_IMAGES = 5;

export default function ReceiveScreen({
  onConfirmReceipt,
  preSelectedSku,
  skuOptions = skuCountOptions,
}: ReceiveScreenProps) {
  const initialOption =
    skuOptions.find((o) => o.sku === preSelectedSku) ||
    skuOptions[0] ||
    skuCountOptions[0];
  const [selectedSku, setSelectedSku] = useState<string>(initialOption.sku);
  const currentOption =
    skuOptions.find((o) => o.sku === selectedSku) ||
    skuOptions[0] ||
    skuCountOptions[0];

  const [serialNo, setSerialNo] = useState("");
  const [manualCount, setManualCount] = useState<number>(0);

  // Steps: 'train' | 'verify'
  const [step, setStep] = useState<"train" | "verify">("train");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Training images (up to MAX_TRAINING_IMAGES)
  const [trainingImages, setTrainingImages] = useState<string[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainedProfile, setTrainedProfile] = useState<ItemProfile | null>(
    null,
  );
  const [trainedCount, setTrainedCount] = useState<number | null>(null);
  const [trainedMarkers, setTrainedMarkers] = useState<Marker[]>([]);

  // Stored reference (from DB)
  const [storedReference, setStoredReference] =
    useState<StoredReference | null>(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);

  // Verify image state
  const [verifyImage, setVerifyImage] = useState<string | null>(null);
  const [verifyCount, setVerifyCount] = useState<number | null>(null);
  const [verifyMarkers, setVerifyMarkers] = useState<Marker[]>([]);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"train" | "verify">("train");
  const [cameraError, setCameraError] = useState(false);

  const trainFileInputRef = useRef<HTMLInputElement>(null);
  const verifyFileInputRef = useRef<HTMLInputElement>(null);

  // Load stored reference when SKU changes
  useEffect(() => {
    loadStoredReference(selectedSku);
    resetAll();
  }, [selectedSku]);

  const loadStoredReference = async (sku: string) => {
    setIsLoadingReference(true);
    try {
      const response = await fetch(`/api/reference-images/${sku}`);
      if (response.ok) {
        const data: StoredReference = await response.json();
        setStoredReference(data);
        setStatusMessage(
          `✓ Loaded trained model for ${sku} (${data.trainedOn || 1} training image${(data.trainedOn || 1) > 1 ? "s" : ""})`,
        );
      } else {
        setStoredReference(null);
      }
    } catch {
      setStoredReference(null);
    } finally {
      setIsLoadingReference(false);
    }
  };

  const deleteReference = async () => {
    if (
      !window.confirm(
        "Delete trained model for this SKU? You will need to retrain.",
      )
    )
      return;
    setIsProcessing(true);
    try {
      const r = await fetch(`/api/reference-images/${selectedSku}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setStoredReference(null);
        setTrainedProfile(null);
        setTrainedCount(null);
        setStatusMessage(
          "✓ Trained model deleted. Add new training images to retrain.",
        );
      }
    } catch {
      setStatusMessage("Error deleting model");
    } finally {
      setIsProcessing(false);
    }
  };

  // Camera setup
  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;

    if (useCamera) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
        .then((s) => {
          if (!active) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
          setCameraError(false);
        })
        .catch(() => {
          if (active) {
            setCameraError(true);
            setUseCamera(false);
          }
        });
    }

    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [useCamera]);

  const captureFromCamera = (): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const handleCameraCapture = () => {
    const image = captureFromCamera();
    if (!image) {
      setStatusMessage("Capture failed");
      return;
    }
    setUseCamera(false);

    if (cameraTarget === "train") {
      addTrainingImage(image);
    } else {
      setVerifyImage(image);
    }
  };

  const addTrainingImage = (image: string) => {
    if (trainingImages.length >= MAX_TRAINING_IMAGES) {
      setStatusMessage(
        `Maximum ${MAX_TRAINING_IMAGES} training images reached`,
      );
      return;
    }
    setTrainingImages((prev) => [...prev, image]);
    setStatusMessage(
      `${trainingImages.length + 1} training image(s) added. Add more or click "Train Model".`,
    );
  };

  const removeTrainingImage = (idx: number) => {
    setTrainingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleTrainFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    (Array.from(files) as File[])
      .slice(0, MAX_TRAINING_IMAGES - trainingImages.length)
      .forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const b64 = ev.target?.result as string;
          if (b64) addTrainingImage(b64);
        };
        reader.readAsDataURL(file);
      });
    e.target.value = "";
  };

  const handleVerifyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] as File | undefined;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setVerifyImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ---- Train model ----
  const trainModel = async () => {
    if (trainingImages.length === 0) {
      setStatusMessage("Add at least one training image first");
      return;
    }

    setIsTraining(true);
    setStatusMessage(`Training model on ${trainingImages.length} image(s)...`);

    try {
      const response = await fetch(`/api/train/${selectedSku}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: trainingImages,
          expected: currentOption.expected || 30,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setStatusMessage("Training failed: " + (data.error || "Unknown error"));
        return;
      }

      setTrainedProfile(data.profile);
      setTrainedCount(data.count);
      setTrainedMarkers(data.markers || []);
      await loadStoredReference(selectedSku);
      setStatusMessage(
        `✓ Model trained! Detected ${data.count} items avg across ${data.trained_on} image(s). Ready for live counting.`,
      );
    } catch (err) {
      setStatusMessage("Training error. Check backend.");
    } finally {
      setIsTraining(false);
    }
  };

  // ---- Live count ----
  const runLiveCount = async (imageData: string) => {
    if (!imageData) {
      setStatusMessage("No image");
      return;
    }
    setIsProcessing(true);
    setStatusMessage("Counting items...");

    const activeProfile = storedReference?.profile || trainedProfile || null;

    try {
      const response = await fetch("/api/count-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageData,
          sku: selectedSku,
          expected: currentOption.expected || 30,
          isSimulator: false,
          simulatedMarkers: null,
          referenceProfile: activeProfile,
        }),
      });

      if (!response.ok) throw new Error("API error");
      const data: AIResponse = await response.json();

      if (data.error) {
        setStatusMessage("Error: " + data.error);
        return;
      }

      setVerifyCount(data.count);
      setVerifyMarkers(data.markers || []);
      setManualCount(data.count);

      const baseCount = storedReference?.count ?? trainedCount;
      const diff = baseCount !== null ? data.count - baseCount : null;
      let msg = `✓ Live count: ${data.count} items detected.`;
      if (diff !== null) {
        if (diff === 0)
          msg = `✓ Perfect match! Expected: ${baseCount}, Found: ${data.count}`;
        else if (diff > 0)
          msg = `⚠ ${data.count} found vs ${baseCount} expected (+${diff} extra)`;
        else
          msg = `⚠ ${data.count} found vs ${baseCount} expected (${diff} missing)`;
      }
      setStatusMessage(msg);
    } catch {
      setStatusMessage("Live count failed. Check backend.");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setStep("train");
    setTrainingImages([]);
    setTrainedProfile(null);
    setTrainedCount(null);
    setTrainedMarkers([]);
    setVerifyImage(null);
    setVerifyCount(null);
    setVerifyMarkers([]);
    setManualCount(0);
    setStatusMessage("");
    setUseCamera(false);
  };

  const baselineCount = storedReference?.count ?? trainedCount;
  const hasModel = storedReference !== null || trainedProfile !== null;
  const activeMarkers = step === "train" ? trainedMarkers : verifyMarkers;

  return (
    <div className="flex flex-col flex-grow text-[#191c1e] pb-10 bg-white rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Item Counting</h2>

      {/* SKU Selector */}
      <div className="mb-6">
        <label className="text-sm font-semibold text-gray-700 block mb-2">
          SELECT SKU
        </label>
        <select
          value={selectedSku}
          onChange={(e) => setSelectedSku(e.target.value)}
          disabled={isLoadingReference}
          className="w-full h-12 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none disabled:opacity-50"
        >
          {skuOptions.map((opt) => (
            <option key={opt.sku} value={opt.sku}>
              {opt.sku} — {opt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stored Model Panel */}
      {storedReference && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-semibold text-green-900 flex items-center gap-1">
                <BookOpen size={15} /> Trained Model Active
              </p>
              <p className="text-xs text-green-800 mt-1">
                Baseline: <strong>{storedReference.count} items</strong>
                {storedReference.trainedOn && storedReference.trainedOn > 1 && (
                  <span className="ml-2 text-green-700">
                    · trained on {storedReference.trainedOn} images
                  </span>
                )}
              </p>
              {storedReference.profile && (
                <p className="text-xs text-green-700 mt-1">
                  Avg radius: {Math.round(storedReference.profile.mean_radius)}
                  px
                  {storedReference.profile.training_images && (
                    <span>
                      {" "}
                      · {storedReference.profile.training_images} training
                      image(s)
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-green-600 mt-1">
                Saved: {new Date(storedReference.savedAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={deleteReference}
              disabled={isProcessing}
              className="text-red-500 hover:text-red-700 disabled:opacity-50"
              title="Delete trained model (retrain)"
            >
              <Trash2 size={20} />
            </button>
          </div>
          <img
            src={storedReference.image}
            alt="Training ref"
            className="w-full rounded h-28 object-cover mt-2"
          />
        </div>
      )}

      {/* Step Tabs */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setStep("train")}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${
            step === "train"
              ? "bg-teal-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          Step 1: Train Model
          {hasModel && <span className="ml-1 text-xs">✓</span>}
        </button>
        <button
          onClick={() => {
            if (!hasModel) {
              setStatusMessage("Train the model first");
              return;
            }
            setStep("verify");
          }}
          disabled={!hasModel}
          className={`flex-1 py-3 px-4 rounded-lg font-semibold text-sm transition ${
            step === "verify"
              ? "bg-teal-600 text-white"
              : hasModel
                ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Step 2: Live Count
          {verifyCount !== null && (
            <span className="ml-1 text-xs">✓ ({verifyCount})</span>
          )}
        </button>
      </div>

      {/* Status */}
      {statusMessage && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-medium ${
            statusMessage.includes("✓")
              ? "bg-green-100 text-green-800"
              : statusMessage.includes("⚠")
                ? "bg-yellow-100 text-yellow-800"
                : "bg-blue-100 text-blue-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* ===== STEP 1: TRAIN ===== */}
      {step === "train" && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Capture <strong>1–{MAX_TRAINING_IMAGES} images</strong> of the item
            you want to count. More images = better accuracy.
          </p>

          {/* Camera view */}
          {useCamera && cameraTarget === "train" && (
            <div className="mb-4">
              <div
                className="relative border-2 border-teal-400 rounded-lg overflow-hidden"
                style={{ maxHeight: 280 }}
              >
                <video
                  ref={videoRef}
                  className="w-full object-cover"
                  style={{ maxHeight: 280 }}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleCameraCapture}
                  className="flex-1 bg-teal-600 text-white py-2 rounded-lg font-semibold hover:bg-teal-700 flex items-center justify-center gap-2"
                >
                  <Camera size={18} /> Capture Training Image
                </button>
                <button
                  onClick={() => setUseCamera(false)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Training image thumbnails */}
          {trainingImages.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-2 font-semibold">
                TRAINING IMAGES ({trainingImages.length}/{MAX_TRAINING_IMAGES})
              </p>
              <div className="grid grid-cols-4 gap-2">
                {trainingImages.map((img, i) => (
                  <div
                    key={i}
                    className="relative group rounded overflow-hidden border border-gray-300"
                    style={{ height: 80 }}
                  >
                    <img
                      src={img}
                      alt={`Training ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeTrainingImage(i)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-80 hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs rounded px-1">
                      {i + 1}
                    </span>
                  </div>
                ))}

                {/* Add slot */}
                {trainingImages.length < MAX_TRAINING_IMAGES && !useCamera && (
                  <div
                    className="rounded border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-teal-500 hover:bg-teal-50 transition"
                    style={{ height: 80 }}
                    onClick={() => {
                      setCameraTarget("train");
                      setUseCamera(true);
                    }}
                  >
                    <Plus size={20} className="text-gray-400" />
                    <span className="text-xs text-gray-400 mt-1">Add</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add buttons */}
          {!useCamera && trainingImages.length < MAX_TRAINING_IMAGES && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => {
                  setCameraTarget("train");
                  setUseCamera(true);
                }}
                disabled={cameraError}
                className="flex-1 bg-teal-600 text-white py-2 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <Camera size={18} /> Use Camera
              </button>
              <button
                onClick={() => trainFileInputRef.current?.click()}
                className="flex-1 bg-gray-600 text-white py-2 rounded-lg font-semibold hover:bg-gray-700 flex items-center justify-center gap-2 text-sm"
              >
                <Upload size={18} /> Upload Images
              </button>
            </div>
          )}

          {/* Train button */}
          {trainingImages.length > 0 && (
            <button
              onClick={trainModel}
              disabled={isTraining}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
            >
              {isTraining ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> Training
                  model...
                </>
              ) : (
                <>
                  <BookOpen size={20} /> Train Model ({trainingImages.length}{" "}
                  image{trainingImages.length > 1 ? "s" : ""})
                </>
              )}
            </button>
          )}

          {/* After training: show result and proceed */}
          {trainedCount !== null && trainedMarkers.length > 0 && (
            <div className="mb-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <p className="text-sm font-semibold text-teal-900">
                ✓ Model trained — avg {trainedCount} items detected
              </p>
              {trainedProfile && (
                <p className="text-xs text-teal-700 mt-1">
                  Circle radius: {trainedProfile.min_radius}–
                  {trainedProfile.max_radius}px · Trained on{" "}
                  {trainingImages.length} image(s)
                </p>
              )}
              <button
                onClick={() => setStep("verify")}
                className="mt-2 w-full bg-teal-600 text-white py-2 rounded-lg font-semibold hover:bg-teal-700 text-sm"
              >
                Proceed to Live Count →
              </button>
            </div>
          )}

          <input
            ref={trainFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleTrainFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* ===== STEP 2: LIVE COUNT ===== */}
      {step === "verify" && (
        <div>
          {/* Camera / Image area */}
          <div className="mb-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 overflow-hidden min-h-64 flex flex-col items-center justify-center">
            {useCamera && cameraTarget === "verify" ? (
              <>
                <video
                  ref={videoRef}
                  className="w-full object-cover"
                  style={{ maxHeight: 320 }}
                />
                <button
                  onClick={handleCameraCapture}
                  disabled={isProcessing}
                  className="mt-3 mb-3 bg-teal-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <Camera size={20} />
                  )}
                  {isProcessing ? "Processing..." : "Capture & Count"}
                </button>
              </>
            ) : verifyImage ? (
              <div className="relative w-full" style={{ maxHeight: 320 }}>
                <img
                  src={verifyImage}
                  alt="Live capture"
                  className="w-full object-contain rounded"
                  style={{ maxHeight: 320, display: "block" }}
                />
                {/* Circle overlays */}
                {verifyMarkers.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {verifyMarkers.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          left: `calc(${m.x}% - 12px)`,
                          top: `calc(${m.y}% - 12px)`,
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          border: "2px solid #3b82f6",
                          backgroundColor: "rgba(59,130,246,0.25)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 7,
                            color: "#1e3a8a",
                            fontWeight: "bold",
                          }}
                        >
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-6">
                <Camera size={48} className="mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 mb-4">
                  Capture live image to count items
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      setCameraTarget("verify");
                      setUseCamera(true);
                    }}
                    disabled={cameraError}
                    className="bg-teal-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                  >
                    <Camera size={18} /> Camera
                  </button>
                  <button
                    onClick={() => verifyFileInputRef.current?.click()}
                    className="bg-gray-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-gray-700 flex items-center gap-2 text-sm"
                  >
                    <Upload size={18} /> Upload
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons below image */}
          {verifyImage && !useCamera && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => {
                  setCameraTarget("verify");
                  setUseCamera(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
              >
                Retake
              </button>
              <button
                onClick={() => runLiveCount(verifyImage)}
                disabled={isProcessing}
                className="flex-1 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Counting...
                  </>
                ) : (
                  "Recount"
                )}
              </button>
            </div>
          )}

          {/* Process uploaded image automatically */}
          {verifyImage &&
            verifyCount === null &&
            !isProcessing &&
            !useCamera && (
              <button
                onClick={() => runLiveCount(verifyImage)}
                className="w-full mb-4 bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex items-center justify-center gap-2"
              >
                <Camera size={20} /> Count Items
              </button>
            )}

          {/* Result summary */}
          {verifyCount !== null && (
            <div className="mb-4 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900">
                  Live Count:{" "}
                  <span className="text-3xl font-bold">{verifyCount}</span>
                </p>
                {baselineCount !== null && (
                  <p className="text-xs text-blue-700 mt-1">
                    Baseline (trained): {baselineCount} items
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">
                  SERIAL NUMBER (Optional)
                </label>
                <input
                  type="text"
                  value={serialNo}
                  onChange={(e) => setSerialNo(e.target.value)}
                  placeholder="Enter serial or reference number"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:border-teal-600 outline-none"
                />
              </div>

              <button
                onClick={() =>
                  onConfirmReceipt(selectedSku, manualCount, serialNo)
                }
                className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <CheckCircle size={24} /> Confirm Receipt ({manualCount} items)
              </button>
            </div>
          )}

          <input
            ref={verifyFileInputRef}
            type="file"
            accept="image/*"
            onChange={handleVerifyFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Reset */}
      <button
        onClick={resetAll}
        className="w-full mt-4 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 flex items-center justify-center gap-2 text-sm"
      >
        <RotateCcw size={16} /> Reset
      </button>
    </div>
  );
}
