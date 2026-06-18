(function (global) {
  const DIFF_TYPES = {
    MATCH: 'match',
    ONLY_A: 'only_a',
    ONLY_B: 'only_b',
    TYPE_MISMATCH: 'type_mismatch',
    NOTE_MISMATCH: 'note_mismatch',
  };

  function getMarkerCenter(marker) {
    if (marker.mode === 'region' && marker.width && marker.height) {
      return {
        x: marker.x + marker.width / 2,
        y: marker.y + marker.height / 2,
      };
    }
    return { x: marker.x, y: marker.y };
  }

  function calculateDistance(m1, m2) {
    const c1 = getMarkerCenter(m1);
    const c2 = getMarkerCenter(m2);
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMarkerType(marker) {
    return marker.type || marker.typeName || '';
  }

  function getMarkerNote(marker) {
    return (marker.note || '').trim();
  }

  function isMigratedMarker(marker) {
    return marker && marker.migrated === true;
  }

  function normalizeMarkers(markers) {
    if (!Array.isArray(markers)) return [];
    return markers.map((m) => ({
      ...m,
      _center: getMarkerCenter(m),
      _type: getMarkerType(m),
      _note: getMarkerNote(m),
      _migrated: isMigratedMarker(m),
    }));
  }

  function findClosestMarker(marker, candidates, threshold, usedIndices) {
    let minDist = Infinity;
    let closestIdx = -1;

    for (let i = 0; i < candidates.length; i++) {
      if (usedIndices.has(i)) continue;
      const dist = calculateDistance(marker, candidates[i]);
      if (dist < threshold && dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    return closestIdx >= 0 ? { index: closestIdx, distance: minDist } : null;
  }

  function compareMarkers(markersA, markersB, options = {}) {
    const threshold = options.threshold !== undefined ? options.threshold : 3.0;
    const compareType = options.compareType !== undefined ? options.compareType : true;
    const compareNote = options.compareNote !== undefined ? options.compareNote : true;

    const normalizedA = normalizeMarkers(markersA);
    const normalizedB = normalizeMarkers(markersB);

    const usedB = new Set();
    const results = [];

    for (let i = 0; i < normalizedA.length; i++) {
      const markerA = normalizedA[i];
      const closest = findClosestMarker(markerA, normalizedB, threshold, usedB);

      if (closest) {
        const markerB = normalizedB[closest.index];
        usedB.add(closest.index);

        let diffType = DIFF_TYPES.MATCH;
        const mismatches = [];

        if (compareType && markerA._type !== markerB._type) {
          diffType = DIFF_TYPES.TYPE_MISMATCH;
          mismatches.push({
            field: 'type',
            valueA: markerA._type,
            valueB: markerB._type,
          });
        }

        if (compareNote && markerA._note !== markerB._note) {
          if (diffType === DIFF_TYPES.MATCH) {
            diffType = DIFF_TYPES.NOTE_MISMATCH;
          }
          mismatches.push({
            field: 'note',
            valueA: markerA._note,
            valueB: markerB._note,
          });
        }

        results.push({
          type: diffType,
          markerA: markerA,
          markerB: markerB,
          distance: closest.distance,
          mismatches: mismatches,
        });
      } else {
        results.push({
          type: DIFF_TYPES.ONLY_A,
          markerA: markerA,
          markerB: null,
          distance: null,
          mismatches: [],
        });
      }
    }

    for (let i = 0; i < normalizedB.length; i++) {
      if (!usedB.has(i)) {
        results.push({
          type: DIFF_TYPES.ONLY_B,
          markerA: null,
          markerB: normalizedB[i],
          distance: null,
          mismatches: [],
        });
      }
    }

    return results;
  }

  function groupByType(results) {
    const groups = {
      [DIFF_TYPES.MATCH]: [],
      [DIFF_TYPES.ONLY_A]: [],
      [DIFF_TYPES.ONLY_B]: [],
      [DIFF_TYPES.TYPE_MISMATCH]: [],
      [DIFF_TYPES.NOTE_MISMATCH]: [],
    };

    results.forEach((r) => {
      if (groups[r.type]) {
        groups[r.type].push(r);
      }
    });

    return groups;
  }

  function getStatistics(results) {
    const groups = groupByType(results);
    let migratedA = 0, migratedB = 0;
    results.forEach((r) => {
      if (r.markerA && r.markerA.migrated) migratedA++;
      if (r.markerB && r.markerB.migrated) migratedB++;
    });
    return {
      total: results.length,
      match: groups[DIFF_TYPES.MATCH].length,
      onlyA: groups[DIFF_TYPES.ONLY_A].length,
      onlyB: groups[DIFF_TYPES.ONLY_B].length,
      typeMismatch: groups[DIFF_TYPES.TYPE_MISMATCH].length,
      noteMismatch: groups[DIFF_TYPES.NOTE_MISMATCH].length,
      aTotal: results.filter((r) => r.markerA).length,
      bTotal: results.filter((r) => r.markerB).length,
      migratedA: migratedA,
      migratedB: migratedB,
      consistency: results.length > 0
        ? Math.round((groups[DIFF_TYPES.MATCH].length / results.length) * 100)
        : 0,
    };
  }

  function mergeMarkers(results, options = {}) {
    const prefer = options.prefer || 'a';
    const mergeStrategy = options.mergeStrategy || 'combine';

    const merged = [];

    results.forEach((r, index) => {
      if (r.type === DIFF_TYPES.MATCH) {
        const base = prefer === 'a' ? r.markerA : r.markerB;
        merged.push({
          ...base,
          _mergeSource: 'match',
          _mergeIndex: index,
        });
      } else if (r.type === DIFF_TYPES.ONLY_A) {
        merged.push({
          ...r.markerA,
          _mergeSource: 'only_a',
          _mergeIndex: index,
        });
      } else if (r.type === DIFF_TYPES.ONLY_B) {
        merged.push({
          ...r.markerB,
          _mergeSource: 'only_b',
          _mergeIndex: index,
        });
      } else if (r.type === DIFF_TYPES.TYPE_MISMATCH || r.type === DIFF_TYPES.NOTE_MISMATCH) {
        if (mergeStrategy === 'combine') {
          const base = prefer === 'a' ? r.markerA : r.markerB;
          const other = prefer === 'a' ? r.markerB : r.markerA;
          merged.push({
            ...base,
            note: base._note
              ? `${base._note} | ${other._note}`.trim()
              : other._note,
            _mergeSource: 'merged',
            _mergeIndex: index,
            _mergedNote: true,
          });
        } else if (mergeStrategy === 'a') {
          merged.push({
            ...r.markerA,
            _mergeSource: 'from_a',
            _mergeIndex: index,
          });
        } else if (mergeStrategy === 'b') {
          merged.push({
            ...r.markerB,
            _mergeSource: 'from_b',
            _mergeIndex: index,
          });
        } else {
          merged.push({
            ...r.markerA,
            _mergeSource: 'conflict',
            _mergeIndex: index,
            _conflict: true,
            _conflictData: r,
          });
        }
      }
    });

    return merged.map(({ _center, _type, _note, ...rest }) => rest);
  }

  function extractPageMarkers(packageData, pageIndex = 0) {
    if (!packageData || !packageData.pages || !packageData.pages[pageIndex]) {
      return [];
    }
    return packageData.pages[pageIndex].markers || [];
  }

  function extractPageImage(packageData, pageIndex = 0) {
    if (!packageData || !packageData.pages || !packageData.pages[pageIndex]) {
      return null;
    }
    return packageData.pages[pageIndex].image || null;
  }

  function extractPageInfo(packageData, pageIndex = 0) {
    if (!packageData || !packageData.pages || !packageData.pages[pageIndex]) {
      return null;
    }
    const page = packageData.pages[pageIndex];
    return {
      id: page.id,
      name: page.name,
      fileName: page.fileName,
      markerCount: (page.markers || []).length,
    };
  }

  function validatePackage(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: '数据格式无效' };
    }
    if (!data.pages || !Array.isArray(data.pages)) {
      return { valid: false, error: '缺少 pages 数组' };
    }
    if (data.pages.length === 0) {
      return { valid: false, error: 'pages 数组为空' };
    }
    return { valid: true };
  }

  function getPageCount(packageData) {
    if (!packageData || !packageData.pages || !Array.isArray(packageData.pages)) {
      return 0;
    }
    return packageData.pages.length;
  }

  function compareAllPages(dataA, dataB, options = {}) {
    const countA = getPageCount(dataA);
    const countB = getPageCount(dataB);
    const maxPages = Math.max(countA, countB);
    const results = [];

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const markersA = extractPageMarkers(dataA, pageIndex);
      const markersB = extractPageMarkers(dataB, pageIndex);
      const pageInfoA = extractPageInfo(dataA, pageIndex);
      const pageInfoB = extractPageInfo(dataB, pageIndex);
      const imageA = extractPageImage(dataA, pageIndex);
      const imageB = extractPageImage(dataB, pageIndex);

      const diffResults = compareMarkers(markersA, markersB, options);
      const statistics = getStatistics(diffResults);

      results.push({
        pageIndex,
        pageInfoA,
        pageInfoB,
        imageA,
        imageB,
        markersA,
        markersB,
        diffResults,
        statistics,
        pageName: pageInfoA
          ? (pageInfoA.name || pageInfoA.fileName || `第${pageIndex + 1}页`)
          : (pageInfoB ? (pageInfoB.name || pageInfoB.fileName || `第${pageIndex + 1}页`) : `第${pageIndex + 1}页`),
        existsA: pageIndex < countA,
        existsB: pageIndex < countB,
      });
    }

    return results;
  }

  function getVolumeStatistics(pageResults) {
    if (!Array.isArray(pageResults) || pageResults.length === 0) {
      return {
        total: 0,
        match: 0,
        onlyA: 0,
        onlyB: 0,
        typeMismatch: 0,
        noteMismatch: 0,
        aTotal: 0,
        bTotal: 0,
        consistency: 0,
        pageCount: 0,
      };
    }

    let total = 0;
    let match = 0;
    let onlyA = 0;
    let onlyB = 0;
    let typeMismatch = 0;
    let noteMismatch = 0;
    let aTotal = 0;
    let bTotal = 0;
    let matchedPages = 0;

    pageResults.forEach((pr) => {
      if (pr.statistics) {
        total += pr.statistics.total || 0;
        match += pr.statistics.match || 0;
        onlyA += pr.statistics.onlyA || 0;
        onlyB += pr.statistics.onlyB || 0;
        typeMismatch += pr.statistics.typeMismatch || 0;
        noteMismatch += pr.statistics.noteMismatch || 0;
        aTotal += pr.statistics.aTotal || 0;
        bTotal += pr.statistics.bTotal || 0;
        if (pr.existsA && pr.existsB) {
          matchedPages++;
        }
      }
    });

    return {
      total,
      match,
      onlyA,
      onlyB,
      typeMismatch,
      noteMismatch,
      aTotal,
      bTotal,
      consistency: total > 0 ? Math.round((match / total) * 100) : 0,
      pageCount: pageResults.length,
      matchedPages,
    };
  }

  function mergeAllPages(pageResults, options = {}) {
    if (!Array.isArray(pageResults) || pageResults.length === 0) {
      return [];
    }

    return pageResults.map((pr) => {
      const merged = mergeMarkers(pr.diffResults, options);
      return {
        pageIndex: pr.pageIndex,
        pageInfoA: pr.pageInfoA,
        pageInfoB: pr.pageInfoB,
        imageA: pr.imageA,
        imageB: pr.imageB,
        existsA: pr.existsA,
        existsB: pr.existsB,
        markers: merged,
        pageName: pr.pageName,
        pageDataA: pr.pageInfoA ? {
          id: pr.pageInfoA.id,
          name: pr.pageInfoA.name,
          fileName: pr.pageInfoA.fileName,
          image: pr.imageA,
        } : null,
        pageDataB: pr.pageInfoB ? {
          id: pr.pageInfoB.id,
          name: pr.pageInfoB.name,
          fileName: pr.pageInfoB.fileName,
          image: pr.imageB,
        } : null,
      };
    });
  }

  const DiffCompare = {
    DIFF_TYPES,
    compareMarkers,
    groupByType,
    getStatistics,
    mergeMarkers,
    extractPageMarkers,
    extractPageImage,
    extractPageInfo,
    validatePackage,
    getMarkerCenter,
    calculateDistance,
    isMigratedMarker,
    getPageCount,
    compareAllPages,
    getVolumeStatistics,
    mergeAllPages,
  };

  global.DiffCompare = DiffCompare;
})(window);
