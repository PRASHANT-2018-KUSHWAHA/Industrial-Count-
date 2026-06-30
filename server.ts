import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { spawn } from "child_process";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Set up body parsing with increased size limits for base64 images
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Healthy check route
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Using Python-only computer vision counting
console.log("Using Python computer vision counting engine.");

// Helper function to count items using a cross-platform Python command
function countWithPython(
  image: string,
  sku: string,
  expected: number,
  isSimulator?: boolean,
  simulatedMarkers?: any[],
  referenceProfile?: any,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(process.cwd(), "count_items.py");
    const pythonCommand =
      process.env.PYTHON_BIN ||
      (process.platform === "win32" ? "python" : "python3");
    const pythonProcess = spawn(pythonCommand, [pythonScriptPath]);

    let stdoutData = "";
    let stderrData = "";

    pythonProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python process exited with code ${code}. Error: ${stderrData}`,
          ),
        );
        return;
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python stdout: ${stdoutData}`));
      }
    });

    pythonProcess.on("error", (err) => {
      reject(err);
    });

    // Write input payload to stdin and close it
    pythonProcess.stdin.write(
      JSON.stringify({
        image,
        sku,
        expected,
        isSimulator,
        simulatedMarkers,
        referenceProfile,
      }),
    );
    pythonProcess.stdin.end();
  });
}

// POST endpoint for counting items from images (webcam or simulated upload template)
app.post("/api/count-items", async (req, res) => {
  const { image, sku, expected, isSimulator, simulatedMarkers, referenceProfile } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Missing image data" });
  }

  // Extract base64 details
  let mimeType = "image/png";
  let base64Data = image;

  if (image.startsWith("data:")) {
    const match = image.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  }

  // Route to Python analysis
  try {
    const expectedNum = Number(expected) || 140;
    console.log(
      `Processing count via Python for SKU: ${sku}, expected: ${expectedNum}`,
    );
    const result = await countWithPython(
      image,
      sku || "default",
      expectedNum,
      isSimulator,
      simulatedMarkers,
      referenceProfile,
    );
    return res.json(result);
  } catch (err: any) {
    console.error("Python analysis failed:", err);
    return res
      .status(500)
      .json({ error: "Failed to count items.", details: err.message });
  }
});

// Configure Vite or Serve Static build
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "Configuring Express in DEVELOPMENT mode with Vite middleware...",
    );
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Mount Vite dev server middlewares
    app.use(vite.middlewares);
  } else {
    console.log("Configuring Express in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bühler Inventory Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

// ========== REFERENCE IMAGE STORAGE (File-based Database) ==========
import fs from "fs";

const referenceDir = path.join(process.cwd(), ".reference-images");

// Ensure reference images directory exists
if (!fs.existsSync(referenceDir)) {
  fs.mkdirSync(referenceDir, { recursive: true });
}

// GET reference image for a SKU
app.get("/api/reference-images/:sku", (req, res) => {
  const sku = req.params.sku;
  const refFile = path.join(referenceDir, `${sku}.json`);

  if (fs.existsSync(refFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(refFile, "utf-8"));
      return res.json(data);
    } catch (err) {
      console.error("Failed to read reference image:", err);
      return res.status(500).json({ error: "Failed to read reference" });
    }
  }

  return res.status(404).json({ error: "Reference image not found" });
});

// POST save reference image for a SKU
app.post("/api/reference-images/:sku", (req, res) => {
  const sku = req.params.sku;
  const { image, count, markers, message, profile } = req.body;

  if (!image) {
    return res.status(400).json({ error: "Missing image data" });
  }

  const refFile = path.join(referenceDir, `${sku}.json`);

  try {
    const refData = {
      sku,
      image,
      count,
      markers,
      message,
      profile: profile || null,
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(refFile, JSON.stringify(refData, null, 2));
    console.log(`Reference image saved for SKU: ${sku}`);
    return res.json({ success: true, message: "Reference image saved" });
  } catch (err) {
    console.error("Failed to save reference image:", err);
    return res.status(500).json({ error: "Failed to save reference" });
  }
});

// POST /api/train/:sku  — multi-image training endpoint
app.post("/api/train/:sku", async (req, res) => {
  const sku = req.params.sku;
  const { images, expected } = req.body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: "No training images provided" });
  }

  console.log(`Training model for SKU: ${sku} with ${images.length} image(s)`);

  try {
    // Send all images to Python in train mode
    const result = await new Promise<any>((resolve, reject) => {
      const pythonScriptPath = path.join(process.cwd(), "count_items.py");
      const pythonCommand =
        process.env.PYTHON_BIN ||
        (process.platform === "win32" ? "python" : "python3");
      const proc = spawn(pythonCommand, [pythonScriptPath]);

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => {
        if (code !== 0)
          return reject(new Error(`Python exit ${code}: ${stderr}`));
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Parse error: ${stdout}`));
        }
      });
      proc.on("error", reject);

      proc.stdin.write(
        JSON.stringify({
          mode: "train",
          images,
          sku,
          expected: expected || 30,
        }),
      );
      proc.stdin.end();
    });

    if (result.error) {
      return res.status(500).json(result);
    }

    // Persist the trained profile to the reference database
    const refFile = path.join(referenceDir, `${sku}.json`);
    const refData = {
      sku,
      image: images[0], // first image as thumbnail
      count: result.count || 0,
      markers: result.markers || [],
      profile: result.profile || null,
      trainedOn: result.trained_on || images.length,
      message: result.message || `Trained on ${images.length} images`,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(refFile, JSON.stringify(refData, null, 2));
    console.log(`Training complete for SKU: ${sku}, count: ${refData.count}`);

    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Training failed:", err);
    return res
      .status(500)
      .json({ error: "Training failed", details: err.message });
  }
});

// DELETE reference image for a SKU
app.delete("/api/reference-images/:sku", (req, res) => {
  const sku = req.params.sku;
  const refFile = path.join(referenceDir, `${sku}.json`);

  try {
    if (fs.existsSync(refFile)) {
      fs.unlinkSync(refFile);
      console.log(`Reference image deleted for SKU: ${sku}`);
      return res.json({ success: true, message: "Reference image deleted" });
    }
    return res.status(404).json({ error: "Reference image not found" });
  } catch (err) {
    console.error("Failed to delete reference image:", err);
    return res.status(500).json({ error: "Failed to delete reference" });
  }
});
