(function (global) {
  const DEFAULT_SENSITIVITY = 50;
  const MIN_SPOT_SIZE = 3;
  const MAX_SPOT_SIZE_RATIO = 0.05;
  const EDGE_MARGIN_RATIO = 0.02;
  const DOWNSCALE_MAX_WIDTH = 800;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function getImageData(img, maxWidth) {
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const width = Math.floor(img.naturalWidth * scale);
    const height = Math.floor(img.naturalHeight * scale);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    return {
      imageData: ctx.getImageData(0, 0, width, height),
      width,
      height,
      scale,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    };
  }

  function rgbToGray(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function computeGrayHistogram(imageData) {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(rgbToGray(data[i], data[i + 1], data[i + 2]));
      histogram[gray]++;
    }
    return histogram;
  }

  function otsuThreshold(histogram, totalPixels) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 128;

    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (wB === 0) continue;
      wF = totalPixels - wB;
      if (wF === 0) break;

      sumB += i * histogram[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = i;
      }
    }
    return threshold;
  }

  function estimateBackgroundDarkness(imageData) {
    const histogram = computeGrayHistogram(imageData);
    const total = imageData.width * imageData.height;
    
    let darkPixels = 0;
    for (let i = 0; i < 64; i++) darkPixels += histogram[i];
    const darkRatio = darkPixels / total;

    let lightPixels = 0;
    for (let i = 192; i < 256; i++) lightPixels += histogram[i];
    const lightRatio = lightPixels / total;

    let avgGray = 0;
    for (let i = 0; i < 256; i++) avgGray += i * histogram[i];
    avgGray /= total;

    return {
      darkRatio,
      lightRatio,
      avgGray,
      isDarkBackground: darkRatio > 0.6,
      isLightBackground: lightRatio > 0.6,
    };
  }

  function getAdaptiveThreshold(backgroundInfo, sensitivity) {
    const baseThreshold = otsuThreshold(
      computeGrayHistogram({ data: backgroundInfo.histogram, width: 1, height: 1 }),
      backgroundInfo.totalPixels
    );

    const sensitivityFactor = 1 - (sensitivity - 50) / 100;
    let threshold;

    if (backgroundInfo.isDarkBackground) {
      threshold = Math.min(255, baseThreshold + 30 * sensitivityFactor);
    } else {
      threshold = Math.max(0, baseThreshold - 30 * sensitivityFactor);
    }

    return threshold;
  }

  function createBinaryMask(imageData, threshold, detectDark) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
      const gray = rgbToGray(data[i], data[i + 1], data[i + 2]);
      const idx = i / 4;
      if (detectDark) {
        mask[idx] = gray < threshold ? 1 : 0;
      } else {
        mask[idx] = gray > threshold ? 1 : 0;
      }
    }

    return { mask, width, height };
  }

  function removeEdgeRegions(maskData, marginRatio) {
    const { mask, width, height } = maskData;
    const marginX = Math.floor(width * marginRatio);
    const marginY = Math.floor(height * marginRatio);
    const result = new Uint8Array(mask.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (
          x >= marginX &&
          x < width - marginX &&
          y >= marginY &&
          y < height - marginY
        ) {
          result[idx] = mask[idx];
        }
      }
    }

    return { mask: result, width, height };
  }

  function findConnectedComponents(maskData, minSize, maxSize) {
    const { mask, width, height } = maskData;
    const visited = new Uint8Array(mask.length);
    const components = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] && !visited[idx]) {
          const component = floodFill(mask, width, height, x, y, visited);
          const area = component.pixels.length;
          if (area >= minSize && area <= maxSize) {
            components.push(component);
          }
        }
      }
    }

    return components;
  }

  function floodFill(mask, width, height, startX, startY, visited) {
    const pixels = [];
    const stack = [[startX, startY]];
    let minX = width, maxX = 0, minY = height, maxY = 0;

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = y * width + x;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[idx] || !mask[idx]) continue;

      visited[idx] = 1;
      pixels.push([x, y]);

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    const area = pixels.length;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const bboxWidth = maxX - minX + 1;
    const bboxHeight = maxY - minY + 1;

    let perimeter = 0;
    for (const [px, py] of pixels) {
      let neighbors = 0;
      if (px > 0 && mask[py * width + (px - 1)]) neighbors++;
      if (px < width - 1 && mask[py * width + (px + 1)]) neighbors++;
      if (py > 0 && mask[(py - 1) * width + px]) neighbors++;
      if (py < height - 1 && mask[(py + 1) * width + px]) neighbors++;
      if (neighbors < 4) perimeter++;
    }

    const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;

    return {
      pixels,
      area,
      minX,
      maxX,
      minY,
      maxY,
      centerX,
      centerY,
      width: bboxWidth,
      height: bboxHeight,
      circularity,
    };
  }

  function detectEdgeDamage(imageData, sensitivity) {
    const { data, width, height } = imageData;
    const margin = Math.max(5, Math.floor(Math.min(width, height) * EDGE_MARGIN_RATIO));
    const edgeCandidates = [];

    const sampleStep = Math.max(1, Math.floor(margin / 3));

    function checkEdgePixel(x, y, edgeSide) {
      if (x < 0 || x >= width || y < 0 || y >= height) return null;
      const idx = (y * width + x) * 4;
      const gray = rgbToGray(data[idx], data[idx + 1], data[idx + 2]);
      
      const threshold = 100 + (100 - sensitivity) * 0.5;
      if (gray < threshold) {
        return { x, y, gray, edgeSide };
      }
      return null;
    }

    for (let x = 0; x < width; x += sampleStep) {
      for (let dy = 0; dy < margin; dy++) {
        const pixel = checkEdgePixel(x, dy, "top");
        if (pixel) {
          edgeCandidates.push({ ...pixel, depth: dy });
          break;
        }
      }
    }

    for (let x = 0; x < width; x += sampleStep) {
      for (let dy = 0; dy < margin; dy++) {
        const pixel = checkEdgePixel(x, height - 1 - dy, "bottom");
        if (pixel) {
          edgeCandidates.push({ ...pixel, depth: dy });
          break;
        }
      }
    }

    for (let y = 0; y < height; y += sampleStep) {
      for (let dx = 0; dx < margin; dx++) {
        const pixel = checkEdgePixel(dx, y, "left");
        if (pixel) {
          edgeCandidates.push({ ...pixel, depth: dx });
          break;
        }
      }
    }

    for (let y = 0; y < height; y += sampleStep) {
      for (let dx = 0; dx < margin; dx++) {
        const pixel = checkEdgePixel(width - 1 - dx, y, "right");
        if (pixel) {
          edgeCandidates.push({ ...pixel, depth: dx });
          break;
        }
      }
    }

    const minDamageSize = Math.max(margin * 0.3, 5);
    const filtered = edgeCandidates.filter(c => c.depth >= minDamageSize * 0.2);

    const clusters = clusterEdgePoints(filtered, width, height, minDamageSize);

    return clusters.map(c => ({
      type: "edge",
      centerX: c.centerX,
      centerY: c.centerY,
      minX: c.minX,
      maxX: c.maxX,
      minY: c.minY,
      maxY: c.maxY,
      width: c.maxX - c.minX + 1,
      height: c.maxY - c.minY + 1,
      area: c.area,
      edgeSide: c.edgeSide,
      depth: c.maxDepth,
    }));
  }

  function clusterEdgePoints(points, width, height, minSize) {
    if (points.length === 0) return [];

    const clusters = [];
    const visited = new Set();

    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;

      const cluster = {
        points: [points[i]],
        minX: points[i].x,
        maxX: points[i].x,
        minY: points[i].y,
        maxY: points[i].y,
        area: 1,
        maxDepth: points[i].depth,
        edgeSide: points[i].edgeSide,
      };

      visited.add(i);

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < points.length; j++) {
          if (visited.has(j)) continue;
          const p = points[j];
          if (
            Math.abs(p.x - (cluster.minX + cluster.maxX) / 2) < minSize * 2 &&
            Math.abs(p.y - (cluster.minY + cluster.maxY) / 2) < minSize * 2
          ) {
            cluster.points.push(p);
            visited.add(j);
            cluster.minX = Math.min(cluster.minX, p.x);
            cluster.maxX = Math.max(cluster.maxX, p.x);
            cluster.minY = Math.min(cluster.minY, p.y);
            cluster.maxY = Math.max(cluster.maxY, p.y);
            cluster.area++;
            cluster.maxDepth = Math.max(cluster.maxDepth, p.depth);
            changed = true;
          }
        }
      }

      if (cluster.area >= 3) {
        cluster.centerX = (cluster.minX + cluster.maxX) / 2;
        cluster.centerY = (cluster.minY + cluster.maxY) / 2;
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  function classifyCandidate(component, backgroundInfo) {
    const { circularity, area, width, height } = component;
    const aspectRatio = width > 0 && height > 0 ? Math.min(width, height) / Math.max(width, height) : 0;

    let type = "spot";
    let confidence = 0.5;

    if (circularity > 0.7 && aspectRatio > 0.7) {
      type = "hole";
      confidence = 0.6 + circularity * 0.3;
    } else if (circularity > 0.4) {
      type = "spot";
      confidence = 0.4 + circularity * 0.3;
    } else {
      type = "irregular";
      confidence = 0.3 + circularity * 0.2;
    }

    const sizeFactor = clamp(area / 100, 0, 1);
    confidence = clamp(confidence - sizeFactor * 0.2, 0.1, 0.95);

    return { type, confidence };
  }

  function componentsToCandidates(components, scale, naturalWidth, naturalHeight, backgroundInfo) {
    return components.map((comp, idx) => {
      const classification = classifyCandidate(comp, backgroundInfo);
      return {
        id: "cand-" + idx + "-" + Date.now(),
        type: classification.type,
        confidence: classification.confidence,
        x: Number(((comp.centerX / comp._imgWidth) * 100).toFixed(2)),
        y: Number(((comp.centerY / comp._imgHeight) * 100).toFixed(2)),
        width: Number(((comp.width / comp._imgWidth) * 100).toFixed(2)),
        height: Number(((comp.height / comp._imgHeight) * 100).toFixed(2)),
        realX: Math.round(comp.centerX * scale),
        realY: Math.round(comp.centerY * scale),
        realWidth: Math.round(comp.width * scale),
        realHeight: Math.round(comp.height * scale),
        area: comp.area,
        circularity: comp.circularity,
        status: "pending",
        edgeSide: comp.edgeSide || null,
        detectedAt: new Date().toISOString(),
      };
    });
  }

  async function detectCandidates(imageSrc, options) {
    const sensitivity = options?.sensitivity ?? DEFAULT_SENSITIVITY;
    const maxCandidates = options?.maxCandidates ?? 200;
    const detectEdge = options?.detectEdge ?? true;

    const img = await loadImage(imageSrc);
    
    const imgInfo = getImageData(img, DOWNSCALE_MAX_WIDTH);
    const { imageData, width, height, scale, naturalWidth, naturalHeight } = imgInfo;

    const histogram = computeGrayHistogram(imageData);
    const totalPixels = width * height;
    const backgroundInfo = {
      ...estimateBackgroundDarkness(imageData),
      histogram,
      totalPixels,
    };

    if (backgroundInfo.isDarkBackground && backgroundInfo.darkRatio > 0.85) {
      return {
        candidates: [],
        warning: "图像整体过暗，难以检测到有效候选目标",
        backgroundInfo,
        imageInfo: { width, height, naturalWidth, naturalHeight },
      };
    }

    const baseThreshold = otsuThreshold(histogram, totalPixels);
    const sensitivityOffset = (sensitivity - 50) * 0.8;
    const threshold = clamp(baseThreshold - sensitivityOffset, 20, 220);

    const detectDark = !backgroundInfo.isDarkBackground;

    const maskData = createBinaryMask(imageData, threshold, detectDark);
    const innerMaskData = removeEdgeRegions(maskData, EDGE_MARGIN_RATIO);

    const minSpotArea = MIN_SPOT_SIZE * MIN_SPOT_SIZE;
    const maxSpotArea = Math.floor(
      totalPixels * MAX_SPOT_SIZE_RATIO * (sensitivity / 50)
    );

    const components = findConnectedComponents(
      innerMaskData,
      minSpotArea,
      maxSpotArea
    );

    components.forEach(c => {
      c._imgWidth = width;
      c._imgHeight = height;
    });

    components.sort((a, b) => b.area - a.area);

    const limitedComponents = components.slice(0, maxCandidates);
    const spotCandidates = componentsToCandidates(
      limitedComponents,
      scale,
      naturalWidth,
      naturalHeight,
      backgroundInfo
    );

    let edgeCandidates = [];
    if (detectEdge) {
      const edgeDamages = detectEdgeDamage(imageData, sensitivity);
      edgeDamages.forEach(c => {
        c._imgWidth = width;
        c._imgHeight = height;
      });
      edgeCandidates = componentsToCandidates(
        edgeDamages,
        scale,
        naturalWidth,
        naturalHeight,
        backgroundInfo
      ).map(c => ({ ...c, category: "edge" }));
    }

    const allCandidates = [...spotCandidates, ...edgeCandidates];

    allCandidates.sort((a, b) => b.confidence - a.confidence);

    return {
      candidates: allCandidates.slice(0, maxCandidates),
      backgroundInfo,
      imageInfo: { width, height, naturalWidth, naturalHeight },
      threshold,
      totalDetected: allCandidates.length,
    };
  }

  const CandidateDetector = {
    detectCandidates,
    DEFAULT_SENSITIVITY,
    loadImage,
  };

  global.CandidateDetector = CandidateDetector;
})(window);
