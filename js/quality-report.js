(function (global) {
  const REPORT_ISSUE_TYPES = {
    DENSITY_ANOMALY: "density_anomaly",
    PENDING_CANDIDATES: "pending_candidates",
    REVIEW_REJECTED: "review_rejected",
    DIFF_MISMATCH: "diff_mismatch",
    LOW_QUALITY_MIGRATION: "low_quality_migration",
  };

  const ISSUE_TYPE_LABELS = {
    density_anomaly: "标记密度异常",
    pending_candidates: "未处理候选",
    review_rejected: "复核退回项",
    diff_mismatch: "双人标注不一致",
    low_quality_migration: "低质量校准迁移",
  };

  const ISSUE_SEVERITY = {
    CRITICAL: "critical",
    WARNING: "warning",
    INFO: "info",
  };

  const DENSITY_THRESHOLD_HIGH = 100;
  const DENSITY_THRESHOLD_LOW = 0;
  const LOW_QUALITY_THRESHOLD = 60;

  const listeners = new Set();
  let _reportCache = null;
  let _cacheTimestamp = 0;
  const CACHE_TTL = 500;
  let _debounceTimer = null;
  let _stateSubscription = null;

  function _notify() {
    listeners.forEach((fn) => {
      try {
        fn(_reportCache);
      } catch (e) {
        console.error("质检报告监听回调异常", e);
      }
    });
  }

  function _triggerRecalculate() {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      QualityReport.recalculateReport();
    }, 300);
  }

  function _getPageStats(page) {
    const markers = page.markers || [];
    const count = markers.length;
    const byTypeId = {};
    markers.forEach((m) => {
      const tid = m.typeId || "unknown";
      byTypeId[tid] = (byTypeId[tid] || 0) + 1;
    });
    return {
      total: count,
      byTypeId,
      pointCount: markers.filter((m) => m.mode !== "region").length,
      regionCount: markers.filter((m) => m.mode === "region").length,
    };
  }

  function _detectDensityAnomalies(pages) {
    const issues = [];
    if (!pages || pages.length === 0) return issues;

    const allCounts = pages.map((p) => ({
      pageId: p.id,
      pageName: p.name || p.fileName || ("第 " + (pages.indexOf(p) + 1) + " 页"),
      stats: _getPageStats(p),
    }));

    const counts = allCounts.map((c) => c.stats.total);
    const avg = counts.reduce((a, b) => a + b, 0) / Math.max(counts.length, 1);
    const variance =
      counts.reduce((s, c) => s + Math.pow(c - avg, 2), 0) /
      Math.max(counts.length, 1);
    const stdDev = Math.sqrt(variance);

    allCounts.forEach((entry) => {
      const c = entry.stats.total;
      const zScore = stdDev > 0 ? (c - avg) / stdDev : 0;
      const isHighAnomaly = c > DENSITY_THRESHOLD_HIGH || zScore > 2.5;
      const isLowAnomaly = pages.length > 1 && c === DENSITY_THRESHOLD_LOW && avg > 5;

      if (isHighAnomaly || isLowAnomaly) {
        issues.push({
          id: "density-" + entry.pageId,
          type: REPORT_ISSUE_TYPES.DENSITY_ANOMALY,
          severity: isHighAnomaly ? ISSUE_SEVERITY.WARNING : ISSUE_SEVERITY.INFO,
          pageId: entry.pageId,
          pageName: entry.pageName,
          data: {
            markerCount: c,
            averageCount: Number(avg.toFixed(1)),
            zScore: Number(zScore.toFixed(2)),
            stdDev: Number(stdDev.toFixed(2)),
            anomalyType: isHighAnomaly ? "high" : "low",
            byTypeId: entry.stats.byTypeId,
          },
          description: isHighAnomaly
            ? "标记数量偏多（" + c + " 个），建议检查是否有重复标注或误标注"
            : "无任何标记，建议确认是否遗漏标注",
        });
      }
    });

    return issues;
  }

  function _detectPendingCandidates(pages) {
    const issues = [];
    if (!pages || pages.length === 0) return issues;

    pages.forEach((p, idx) => {
      const summary = p.candidateSummary || null;
      if (!summary) return;

      const pending = summary.pending || 0;
      const total = summary.total || 0;

      if (pending > 0) {
        issues.push({
          id: "candidate-" + p.id,
          type: REPORT_ISSUE_TYPES.PENDING_CANDIDATES,
          severity: pending > total * 0.3 ? ISSUE_SEVERITY.WARNING : ISSUE_SEVERITY.INFO,
          pageId: p.id,
          pageName: p.name || p.fileName || ("第 " + (idx + 1) + " 页"),
          data: {
            pending: pending,
            total: total,
            accepted: summary.accepted || 0,
            ignored: summary.ignored || 0,
            pendingRatio: total > 0 ? Number(((pending / total) * 100).toFixed(1)) : 0,
          },
          description:
            "有 " +
            pending +
            " 个智能识别候选未处理（共 " +
            total +
            " 个），请继续完成候选确认",
        });
      }
    });

    return issues;
  }

  function _detectReviewRejected(pages) {
    const issues = [];
    if (!pages || pages.length === 0) return issues;

    pages.forEach((p, idx) => {
      const markers = p.markers || [];
      const rejected = markers.filter(
        (m) => m.review && m.review.status === "rejected"
      );
      const doubtful = markers.filter(
        (m) => m.review && m.review.status === "doubtful"
      );

      if (rejected.length > 0 || doubtful.length > 0) {
        const details = [];

        rejected.forEach((m) => {
          details.push({
            id: "rejected-" + m.id,
            markerId: m.id,
            type: "rejected",
            typeId: m.typeId,
            typeName: m.type,
            mode: m.mode,
            note: m.note || "",
            x: m.x,
            y: m.y,
            reviewComment: m.review ? m.review.comment || "" : "",
            reviewedAt: m.review ? m.review.reviewedAt || null : null,
          });
        });

        doubtful.forEach((m) => {
          details.push({
            id: "doubtful-" + m.id,
            markerId: m.id,
            type: "doubtful",
            typeId: m.typeId,
            typeName: m.type,
            mode: m.mode,
            note: m.note || "",
            x: m.x,
            y: m.y,
            reviewComment: m.review ? m.review.comment || "" : "",
            reviewedAt: m.review ? m.review.reviewedAt || null : null,
          });
        });

        issues.push({
          id: "review-" + p.id,
          type: REPORT_ISSUE_TYPES.REVIEW_REJECTED,
          severity: rejected.length > 0 ? ISSUE_SEVERITY.CRITICAL : ISSUE_SEVERITY.WARNING,
          pageId: p.id,
          pageName: p.name || p.fileName || ("第 " + (idx + 1) + " 页"),
          data: {
            rejectedCount: rejected.length,
            doubtfulCount: doubtful.length,
            details: details,
          },
          description:
            (rejected.length > 0
              ? rejected.length + " 项已退回，"
              : "") +
            (doubtful.length > 0 ? doubtful.length + " 项存疑，" : "") +
            "请尽快处理复核反馈",
        });
      }
    });

    return issues;
  }

  function _detectLowQualityMigrations(pages, calibrationPlans) {
    const issues = [];
    if (!pages || pages.length === 0) return issues;

    const planQualityMap = {};
    if (Array.isArray(calibrationPlans)) {
      calibrationPlans.forEach((plan) => {
        if (plan.targetPageId) {
          planQualityMap[plan.targetPageId] = {
            planId: plan.id,
            planName: plan.name,
            quality: plan.quality || null,
            residual: plan.residual || null,
            sourcePageId: plan.sourcePageId,
          };
        }
      });
    }

    pages.forEach((p, idx) => {
      const markers = p.markers || [];
      const migratedMarkers = markers.filter((m) => m.migrated === true);

      if (migratedMarkers.length === 0) return;

      const lowQualityMigrated = [];
      const positionAdjusted = [];

      migratedMarkers.forEach((m) => {
        const isLowQuality =
          m.positionAdjusted === true ||
          (planQualityMap[p.id] &&
            planQualityMap[p.id].quality &&
            typeof planQualityMap[p.id].quality.score === "number" &&
            planQualityMap[p.id].quality.score < LOW_QUALITY_THRESHOLD);

        if (isLowQuality || m.positionAdjusted) {
          lowQualityMigrated.push({
            id: "migration-" + m.id,
            markerId: m.id,
            typeId: m.typeId,
            typeName: m.type,
            mode: m.mode,
            x: m.x,
            y: m.y,
            sourceMarkerId: m.sourceMarkerId || null,
            migratedFrom: m.migratedFrom || null,
            transformType: m.transformType || null,
            positionAdjusted: m.positionAdjusted === true,
          });
        }

        if (m.positionAdjusted) {
          positionAdjusted.push(m.id);
        }
      });

      if (lowQualityMigrated.length > 0) {
        const planInfo = planQualityMap[p.id];
        const planQualityScore =
          planInfo && planInfo.quality && typeof planInfo.quality.score === "number"
            ? planInfo.quality.score
            : null;

        issues.push({
          id: "migration-" + p.id,
          type: REPORT_ISSUE_TYPES.LOW_QUALITY_MIGRATION,
          severity:
            lowQualityMigrated.length > migratedMarkers.length * 0.5
              ? ISSUE_SEVERITY.WARNING
              : ISSUE_SEVERITY.INFO,
          pageId: p.id,
          pageName: p.name || p.fileName || ("第 " + (idx + 1) + " 页"),
          data: {
            totalMigrated: migratedMarkers.length,
            lowQualityCount: lowQualityMigrated.length,
            positionAdjustedCount: positionAdjusted.length,
            details: lowQualityMigrated,
            planQualityScore: planQualityScore,
            planQualityLabel: planInfo && planInfo.quality ? planInfo.quality.label : null,
            residualRmse:
              planInfo && planInfo.residual && typeof planInfo.residual.rmse === "number"
                ? planInfo.residual.rmse
                : null,
            sourcePlanName: planInfo ? planInfo.planName : null,
          },
          description:
            "有 " +
            lowQualityMigrated.length +
            " 个校准迁移标记可能存在位置误差（共 " +
            migratedMarkers.length +
            " 个迁移标记），建议人工核对",
        });
      }
    });

    return issues;
  }

  function _detectDiffMismatches() {
    const issues = [];
    return issues;
  }

  function _buildReport(state) {
    if (!state) return null;

    const pages = state.pages || [];
    const calibrationPlans = state.calibrationPlans || [];

    const allIssues = [].concat(
      _detectDensityAnomalies(pages),
      _detectPendingCandidates(pages),
      _detectReviewRejected(pages),
      _detectDiffMismatches(),
      _detectLowQualityMigrations(pages, calibrationPlans)
    );

    const byPage = {};
    const byType = {};

    allIssues.forEach((issue) => {
      if (!byPage[issue.pageId]) {
        byPage[issue.pageId] = {
          pageId: issue.pageId,
          pageName: issue.pageName,
          issues: [],
          counts: {
            critical: 0,
            warning: 0,
            info: 0,
          },
        };
      }
      byPage[issue.pageId].issues.push(issue);
      if (byPage[issue.pageId].counts[issue.severity] !== undefined) {
        byPage[issue.pageId].counts[issue.severity]++;
      }

      if (!byType[issue.type]) {
        byType[issue.type] = {
          type: issue.type,
          label: ISSUE_TYPE_LABELS[issue.type] || issue.type,
          issues: [],
          counts: {
            critical: 0,
            warning: 0,
            info: 0,
          },
        };
      }
      byType[issue.type].issues.push(issue);
      if (byType[issue.type].counts[issue.severity] !== undefined) {
        byType[issue.type].counts[issue.severity]++;
      }
    });

    const totalMarkers = pages.reduce(
      (acc, p) => acc + ((p.markers && p.markers.length) || 0),
      0
    );
    const totalReviewed = pages.reduce((acc, p) => {
      if (!p.markers) return acc;
      return (
        acc +
        p.markers.filter(
          (m) => m.review && m.review.status && m.review.status !== "pending"
        ).length
      );
    }, 0);
    const totalMigrated = pages.reduce((acc, p) => {
      if (!p.markers) return acc;
      return acc + p.markers.filter((m) => m.migrated === true).length;
    }, 0);

    const pendingCandidatesTotal = Object.values(byType)
      .find((t) => t.type === REPORT_ISSUE_TYPES.PENDING_CANDIDATES);
    const totalPendingCandidates = pendingCandidatesTotal
      ? pendingCandidatesTotal.issues.reduce(
          (acc, i) => acc + (i.data.pending || 0),
          0
        )
      : 0;

    return {
      reportId: "report-" + Date.now(),
      generatedAt: new Date().toISOString(),
      summary: {
        totalPages: pages.length,
        totalMarkers: totalMarkers,
        totalIssues: allIssues.length,
        totalReviewed: totalReviewed,
        reviewProgress:
          totalMarkers > 0
            ? Math.round((totalReviewed / totalMarkers) * 100)
            : 0,
        totalMigrated: totalMigrated,
        totalPendingCandidates: totalPendingCandidates,
        countsBySeverity: {
          critical: allIssues.filter((i) => i.severity === ISSUE_SEVERITY.CRITICAL)
            .length,
          warning: allIssues.filter((i) => i.severity === ISSUE_SEVERITY.WARNING)
            .length,
          info: allIssues.filter((i) => i.severity === ISSUE_SEVERITY.INFO).length,
        },
        countsByType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, v.issues.length])
        ),
        pagesWithIssues: Object.keys(byPage).length,
      },
      byPage: Object.values(byPage).sort((a, b) => {
        const sa =
          a.counts.critical * 100 + a.counts.warning * 10 + a.counts.info;
        const sb =
          b.counts.critical * 100 + b.counts.warning * 10 + b.counts.info;
        return sb - sa;
      }),
      byType: Object.values(byType),
      issues: allIssues,
    };
  }

  const QualityReport = {
    ISSUE_TYPES: REPORT_ISSUE_TYPES,
    ISSUE_TYPE_LABELS: ISSUE_TYPE_LABELS,
    SEVERITY: ISSUE_SEVERITY,

    init() {
      if (!_stateSubscription && global.VolumeState) {
        _stateSubscription = global.VolumeState.subscribe(() => {
          _triggerRecalculate();
        });
      }
    },

    subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    recalculateReport() {
      const state = global.VolumeState ? global.VolumeState.all : null;
      const report = _buildReport(state);
      _reportCache = report;
      _cacheTimestamp = Date.now();
      _notify();
      return report;
    },

    getReport(options) {
      options = options || {};
      const forceRefresh = options.force === true;
      const now = Date.now();
      const cacheValid =
        _reportCache && now - _cacheTimestamp < CACHE_TTL;

      if (!forceRefresh && cacheValid) {
        return _reportCache;
      }

      return this.recalculateReport();
    },

    getIssuesByPage(pageId) {
      const report = this.getReport();
      if (!report || !report.byPage) return null;
      return report.byPage.find((p) => p.pageId === pageId) || null;
    },

    getIssuesByType(type) {
      const report = this.getReport();
      if (!report || !report.byType) return null;
      return report.byType.find((t) => t.type === type) || null;
    },

    exportReportData() {
      const report = this.getReport({ force: true });
      return report ? JSON.parse(JSON.stringify(report)) : null;
    },

    importReportData(data) {
      if (!data || !data.issues) return false;
      _reportCache = JSON.parse(JSON.stringify(data));
      _cacheTimestamp = Date.now();
      _notify();
      return true;
    },

    navigateToIssue(issue) {
      if (!issue) return { success: false, reason: "无效问题项" };

      const pageId = issue.pageId;
      if (!pageId) return { success: false, reason: "缺少页面信息" };

      const target = {
        pageId: pageId,
        markerId: null,
        view: "main",
      };

      if (issue.type === REPORT_ISSUE_TYPES.REVIEW_REJECTED && issue.data && issue.data.details) {
        const firstDetail = issue.data.details[0];
        if (firstDetail && firstDetail.markerId) {
          target.markerId = firstDetail.markerId;
        }
        target.view = "review";
      } else if (issue.type === REPORT_ISSUE_TYPES.PENDING_CANDIDATES) {
        target.view = "candidates";
      } else if (issue.type === REPORT_ISSUE_TYPES.LOW_QUALITY_MIGRATION && issue.data && issue.data.details) {
        const firstDetail = issue.data.details[0];
        if (firstDetail && firstDetail.markerId) {
          target.markerId = firstDetail.markerId;
        }
        target.view = "calibration";
      } else if (issue.type === REPORT_ISSUE_TYPES.DIFF_MISMATCH) {
        target.view = "diff";
      }

      return {
        success: true,
        target: target,
      };
    },

    invalidateCache() {
      _reportCache = null;
      _cacheTimestamp = 0;
    },

    destroy() {
      if (_stateSubscription) {
        _stateSubscription();
        _stateSubscription = null;
      }
      if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
      }
      listeners.clear();
      _reportCache = null;
      _cacheTimestamp = 0;
    },
  };

  global.QualityReport = QualityReport;
})(window);
