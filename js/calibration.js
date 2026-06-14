(function (global) {

  function solveHomography(src, dst) {
    var A = [];
    for (var i = 0; i < 4; i++) {
      var sx = src[i].x, sy = src[i].y;
      var dx = dst[i].x, dy = dst[i].y;
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
    }

    var n = 9;
    var m = 8;
    var augmented = [];
    for (var r = 0; r < 8; r++) {
      augmented.push(A[r].slice(0, m).concat([A[r][n - 1]]));
    }

    for (var col = 0; col < m; col++) {
      var maxRow = col;
      for (var row = col + 1; row < 8; row++) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
          maxRow = row;
        }
      }
      var tmp = augmented[col];
      augmented[col] = augmented[maxRow];
      augmented[maxRow] = tmp;

      var pivot = augmented[col][col];
      if (Math.abs(pivot) < 1e-12) return null;

      for (var j = col; j <= m; j++) {
        augmented[col][j] /= pivot;
      }
      for (var row = 0; row < 8; row++) {
        if (row === col) continue;
        var factor = augmented[row][col];
        for (var j = col; j <= m; j++) {
          augmented[row][j] -= factor * augmented[col][j];
        }
      }
    }

    var h = [];
    for (var i = 0; i < m; i++) {
      h.push(augmented[i][m]);
    }
    h.push(1);

    return {
      type: "homography",
      a: h[0], b: h[1], c: h[2],
      d: h[3], e: h[4], f: h[5],
      g: h[6], h_: h[7]
    };
  }

  function solveAffine(src, dst) {
    var A = [];
    var b = [];
    for (var i = 0; i < src.length; i++) {
      var sx = src[i].x, sy = src[i].y;
      var dx = dst[i].x, dy = dst[i].y;
      A.push([sx, sy, 1, 0, 0, 0]);
      b.push(dx);
      A.push([0, 0, 0, sx, sy, 1]);
      b.push(dy);
    }

    var n = A.length;
    var cols = 6;
    var aug = [];
    for (var r = 0; r < n; r++) {
      aug.push(A[r].slice(0, cols).concat([b[r]]));
    }

    for (var col = 0; col < cols; col++) {
      var maxRow = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
          maxRow = row;
        }
      }
      var tmp = aug[col];
      aug[col] = aug[maxRow];
      aug[maxRow] = tmp;

      var pivot = aug[col][col];
      if (Math.abs(pivot) < 1e-12) return null;

      for (var j = col; j <= cols; j++) {
        aug[col][j] /= pivot;
      }
      for (var row = 0; row < n; row++) {
        if (row === col) continue;
        var factor = aug[row][col];
        for (var j = col; j <= cols; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }

    var x = [];
    for (var i = 0; i < cols; i++) {
      x.push(aug[i][cols]);
    }

    return {
      type: "affine",
      a: x[0], b: x[1], c: x[2],
      d: x[3], e: x[4], f: x[5],
      g: 0, h_: 0
    };
  }

  function projectPoint(H, px, py) {
    if (!H) return null;
    var w = H.g * px + H.h_ * py + 1;
    if (Math.abs(w) < 1e-12) return null;
    var x = (H.a * px + H.b * py + H.c) / w;
    var y = (H.d * px + H.e * py + H.f) / w;
    return { x: x, y: y };
  }

  function computeResidualError(H, srcPoints, dstPoints) {
    if (!H || !srcPoints || !dstPoints) return null;
    var totalDistSq = 0;
    var maxDist = 0;
    var count = 0;
    var perPoint = [];
    for (var i = 0; i < srcPoints.length; i++) {
      if (!srcPoints[i] || !dstPoints[i]) continue;
      var projected = projectPoint(H, srcPoints[i].x, srcPoints[i].y);
      if (!projected) continue;
      var dx = projected.x - dstPoints[i].x;
      var dy = projected.y - dstPoints[i].y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      totalDistSq += dist * dist;
      if (dist > maxDist) maxDist = dist;
      perPoint.push({ index: i, error: Number(dist.toFixed(4)) });
      count++;
    }
    if (count === 0) return null;
    var rmse = Math.sqrt(totalDistSq / count);
    return {
      rmse: Number(rmse.toFixed(4)),
      maxError: Number(maxDist.toFixed(4)),
      meanError: Number((Math.sqrt(totalDistSq / count)).toFixed(4)),
      perPoint: perPoint,
      pointCount: count
    };
  }

  function computeQualityScore(residual) {
    if (!residual) return { score: 0, level: "invalid", label: "无效" };
    var rmse = residual.rmse;
    if (rmse < 0.5) return { score: 100, level: "excellent", label: "极佳" };
    if (rmse < 1.0) return { score: 90, level: "good", label: "良好" };
    if (rmse < 2.0) return { score: 75, level: "acceptable", label: "可接受" };
    if (rmse < 5.0) return { score: 50, level: "poor", label: "较差" };
    return { score: 25, level: "bad", label: "差" };
  }

  function validateCalibrationPoints(srcPoints, dstPoints) {
    if (!srcPoints || !dstPoints) return { valid: false, reason: "校准点为空" };
    var issues = [];

    var validSrc = srcPoints.filter(function (p) { return p != null; });
    var validDst = dstPoints.filter(function (p) { return p != null; });
    if (validSrc.length < 4 || validDst.length < 4) {
      return { valid: false, reason: "需要至少 4 对校准点" };
    }

    var srcArea = triangleArea(srcPoints[0], srcPoints[1], srcPoints[2]) +
                  triangleArea(srcPoints[0], srcPoints[2], srcPoints[3]);
    var dstArea = triangleArea(dstPoints[0], dstPoints[1], dstPoints[2]) +
                  triangleArea(dstPoints[0], dstPoints[2], dstPoints[3]);

    if (srcArea < 1.0) issues.push("源页面校准点覆盖区域过小，建议分散选取");
    if (dstArea < 1.0) issues.push("目标页面校准点覆盖区域过小，建议分散选取");

    if (areCollinear(srcPoints[0], srcPoints[1], srcPoints[2])) {
      issues.push("源页面前三个校准点近似共线，可能影响变换精度");
    }
    if (areCollinear(dstPoints[0], dstPoints[1], dstPoints[2])) {
      issues.push("目标页面前三个校准点近似共线，可能影响变换精度");
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      srcArea: Number(srcArea.toFixed(2)),
      dstArea: Number(dstArea.toFixed(2))
    };
  }

  function triangleArea(a, b, c) {
    if (!a || !b || !c) return 0;
    return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }

  function areCollinear(a, b, c) {
    if (!a || !b || !c) return false;
    var area = triangleArea(a, b, c);
    var maxSide = Math.max(
      Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)),
      Math.sqrt((c.x - b.x) * (c.x - b.x) + (c.y - b.y) * (c.y - b.y)),
      Math.sqrt((a.x - c.x) * (a.x - c.x) + (a.y - c.y) * (a.y - c.y))
    );
    if (maxSide < 1e-6) return true;
    return (area / maxSide) < 0.5;
  }

  function projectMarker(H, marker) {
    if (!H) return null;
    var projected = projectPoint(H, marker.x, marker.y);
    if (!projected) return null;

    var result = {
      id: crypto.randomUUID(),
      mode: marker.mode || "point",
      typeId: marker.typeId,
      type: marker.type,
      note: marker.note || "",
      x: Number(projected.x.toFixed(2)),
      y: Number(projected.y.toFixed(2)),
      sourceMarkerId: marker.id,
      migrated: true,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    if (marker.mode === "region" && marker.width !== undefined && marker.height !== undefined) {
      var tl = projectPoint(H, marker.x, marker.y);
      var tr = projectPoint(H, marker.x + marker.width, marker.y);
      var bl = projectPoint(H, marker.x, marker.y + marker.height);
      var br = projectPoint(H, marker.x + marker.width, marker.y + marker.height);
      if (!tl || !tr || !bl || !br) return null;

      var minX = Math.min(tl.x, tr.x, bl.x, br.x);
      var minY = Math.min(tl.y, tr.y, bl.y, br.y);
      var maxX = Math.max(tl.x, tr.x, bl.x, br.x);
      var maxY = Math.max(tl.y, tr.y, bl.y, br.y);

      result.x = Number(minX.toFixed(2));
      result.y = Number(minY.toFixed(2));
      result.width = Number((maxX - minX).toFixed(2));
      result.height = Number((maxY - minY).toFixed(2));
    }

    return result;
  }

  function computeTransform(srcPoints, dstPoints) {
    if (!srcPoints || !dstPoints) return null;
    if (srcPoints.length !== 4 || dstPoints.length !== 4) return null;
    for (var i = 0; i < 4; i++) {
      if (srcPoints[i] == null || dstPoints[i] == null) return null;
      if (typeof srcPoints[i].x !== "number" || typeof srcPoints[i].y !== "number") return null;
      if (typeof dstPoints[i].x !== "number" || typeof dstPoints[i].y !== "number") return null;
    }
    return solveHomography(srcPoints, dstPoints);
  }

  function computeBestTransform(srcPoints, dstPoints) {
    if (!srcPoints || !dstPoints) return null;
    if (srcPoints.length < 4 || dstPoints.length < 4) return null;

    var validation = validateCalibrationPoints(srcPoints, dstPoints);
    var H = solveHomography(srcPoints, dstPoints);

    if (H) {
      var residual = computeResidualError(H, srcPoints, dstPoints);
      if (residual && residual.rmse < 10) {
        var quality = computeQualityScore(residual);
        return {
          transform: H,
          type: "homography",
          residual: residual,
          quality: quality,
          validation: validation
        };
      }
    }

    var affineH = solveAffine(srcPoints, dstPoints);
    if (affineH) {
      var affineResidual = computeResidualError(affineH, srcPoints, dstPoints);
      var affineQuality = computeQualityScore(affineResidual);
      return {
        transform: affineH,
        type: "affine",
        residual: affineResidual,
        quality: affineQuality,
        validation: validation,
        fallback: true
      };
    }

    return null;
  }

  function projectMarkers(H, markers) {
    if (!H || !Array.isArray(markers)) return [];
    var results = [];
    for (var i = 0; i < markers.length; i++) {
      var projected = projectMarker(H, markers[i]);
      if (projected) results.push(projected);
    }
    return results;
  }

  function suggestAdjacentPages(pages, currentPageId) {
    if (!pages || !Array.isArray(pages) || pages.length < 2) return null;
    var idx = -1;
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].id === currentPageId) { idx = i; break; }
    }
    if (idx === -1) return null;
    var sourceIdx = idx > 0 ? idx - 1 : idx + 1;
    var targetIdx = idx;
    return {
      sourcePageId: pages[sourceIdx].id,
      targetPageId: pages[targetIdx].id,
      sourceIndex: sourceIdx,
      targetIndex: targetIdx,
      sourceName: pages[sourceIdx].name || pages[sourceIdx].fileName || ("第 " + (sourceIdx + 1) + " 页"),
      targetName: pages[targetIdx].name || pages[targetIdx].fileName || ("第 " + (targetIdx + 1) + " 页"),
      sourceMarkerCount: pages[sourceIdx].markers ? pages[sourceIdx].markers.length : 0
    };
  }

  function computeTransformSummary(result) {
    if (!result) return null;
    var lines = [];
    lines.push("变换类型：" + (result.type === "homography" ? "单应性变换（透视）" : "仿射变换"));
    if (result.fallback) {
      lines.push("注意：单应性变换精度不足，已降级为仿射变换");
    }
    if (result.quality) {
      lines.push("变换质量：" + result.quality.label + "（评分 " + result.quality.score + "）");
    }
    if (result.residual) {
      lines.push("RMSE：" + result.residual.rmse + "%，最大误差：" + result.residual.maxError + "%");
    }
    if (result.validation && result.validation.issues && result.validation.issues.length > 0) {
      result.validation.issues.forEach(function (issue) {
        lines.push("⚠ " + issue);
      });
    }
    return lines.join("\n");
  }

  function computeQualityVisualization(result) {
    if (!result || !result.residual || !result.residual.perPoint) return null;
    var perPoint = result.residual.perPoint;
    var maxError = 0;
    perPoint.forEach(function (p) { if (p.error > maxError) maxError = p.error; });
    var bars = perPoint.map(function (p) {
      var pct = maxError > 0 ? Math.round((p.error / maxError) * 100) : 0;
      var level = p.error < 0.5 ? "good" : p.error < 2.0 ? "warn" : "bad";
      return { index: p.index, error: p.error, pct: pct, level: level };
    });
    return { bars: bars, maxError: maxError, rmse: result.residual.rmse, quality: result.quality };
  }

  var Calibration = {
    computeTransform: computeTransform,
    computeBestTransform: computeBestTransform,
    solveHomography: solveHomography,
    solveAffine: solveAffine,
    projectPoint: projectPoint,
    projectMarker: projectMarker,
    projectMarkers: projectMarkers,
    computeResidualError: computeResidualError,
    computeQualityScore: computeQualityScore,
    validateCalibrationPoints: validateCalibrationPoints,
    suggestAdjacentPages: suggestAdjacentPages,
    computeTransformSummary: computeTransformSummary,
    computeQualityVisualization: computeQualityVisualization
  };

  global.Calibration = Calibration;
})(window);
