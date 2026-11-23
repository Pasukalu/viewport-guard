(() => {
  const api = window.viewportGuard;
  const $ = (id) => document.getElementById(id);

  const state = {
    scanning: false,
    demo: { running: false },
    lastRun: null,
    selectedIndex: 0,
  };

  function formatPx(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}px` : `${rounded.toFixed(1)}px`;
  }

  function showError(message) {
    $('error-text').textContent = message;
    $('error-card').hidden = false;
  }

  function clearError() {
    $('error-card').hidden = true;
    $('error-text').textContent = '';
  }

  function setProgress(visible, label = '', percent = 0) {
    $('progress-card').hidden = !visible;
    $('progress-label').textContent = label;
    $('progress-step').textContent = `${Math.round(percent)}%`;
    $('progress-bar').value = Math.max(0, Math.min(100, percent));
  }

  function updateDemoUi(demo) {
    state.demo = demo;
    if (demo.running) {
      $('demo-toggle-btn').textContent = '停止演示服务';
      $('demo-status').textContent = `运行中：${demo.url}（可点击上方故障版 / 修复版快速扫描）`;
    } else {
      $('demo-toggle-btn').textContent = '启动本地演示服务';
      $('demo-status').textContent = '内置演示服务未启动。点击上方按钮可直接启动并一键填充地址。';
    }
  }

  function renderSelectedViewport() {
    const run = state.lastRun;
    if (!run) return;
    const result = run.report.results[state.selectedIndex];
    if (!result) return;

    document.querySelectorAll('.vp-card').forEach((card, idx) => {
      card.classList.toggle('active', idx === state.selectedIndex);
    });

    $('shot-title').textContent = `${result.viewport.width} × ${result.viewport.height} CSS px 截图`;
    $('shot-meta').textContent = result.overflow
      ? `文档 ${formatPx(result.overflow.documentWidth)} / 视口 ${formatPx(result.overflow.viewportWidth)}`
      : '测量不可用';

    const stage = $('shot-stage');
    stage.textContent = '';
    const dataUrl = run.screenshotDataUrls[state.selectedIndex];
    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = `Screenshot at ${result.viewport.width}x${result.viewport.height}`;
      stage.appendChild(img);
    } else {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = '该视口暂无截图。';
      stage.appendChild(p);
    }

    const candidates = result.overflow?.elements ?? [];
    $('candidate-count').textContent = `${candidates.length} 项`;
    const body = $('candidate-body');
    body.textContent = '';
    if (!result.overflow) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = '未能完成溢出测量，请检查报错。';
      body.appendChild(p);
      return;
    }
    if (!result.overflow.hasOverflow) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = '该视口横向溢出为 0px，无需修复。';
      body.appendChild(p);
      return;
    }
    if (candidates.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = '未自动定位到可见候选元素，请结合截图检查根容器样式。';
      body.appendChild(p);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'candidate-list';
    for (const element of candidates) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.className = 'selector-code';
      code.textContent = element.selector;
      const bounds = document.createElement('div');
      bounds.className = 'bounds-row';
      const delta = element.overflowPx !== undefined
        ? element.overflowPx
        : Math.max(0, -element.left, element.right - result.overflow.viewportWidth);
      const metrics = [
        `Left: ${formatPx(element.left)}`,
        `Right: ${formatPx(element.right)}`,
        `Width: ${formatPx(element.width)}`,
        `Overflow: +${formatPx(delta)}`,
      ];
      for (const metric of metrics) {
        const span = document.createElement('span');
        span.textContent = metric;
        bounds.appendChild(span);
      }
      li.append(code, bounds);
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  function renderResults(run) {
    state.lastRun = run;
    state.selectedIndex = 0;
    $('welcome-card').hidden = true;
    $('results-root').hidden = false;

    const firstTitle = run.report.results.find((r) => r.pageTitle)?.pageTitle;
    $('result-title').textContent = firstTitle || 'Viewport Guard 扫描结果';
    $('result-url').textContent = `目标地址：${run.report.targetUrl} · 耗时 ${run.report.durationMs}ms`;
    $('result-path').textContent = `离线报告：${run.htmlPath}`;

    const badge = $('outcome-badge');
    if (run.operationalErrors.length > 0) {
      badge.className = 'outcome-badge error';
      badge.textContent = `执行异常 (${run.operationalErrors.length})`;
    } else if (run.hasOverflow) {
      badge.className = 'outcome-badge overflow';
      badge.textContent = '检测到横向溢出';
    } else {
      badge.className = 'outcome-badge clean';
      badge.textContent = '全部视口 0px 溢出';
    }

    const overview = $('overview-grid');
    overview.textContent = '';
    run.report.results.forEach((result, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `vp-card${index === 0 ? ' active' : ''}`;
      card.addEventListener('click', () => {
        state.selectedIndex = index;
        renderSelectedViewport();
      });

      const top = document.createElement('div');
      top.className = 'vp-card-top';
      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = `${result.viewport.width} × ${result.viewport.height}`;
      const statusSpan = document.createElement('span');
      statusSpan.textContent = result.overflow?.hasOverflow ? 'Overflow' : (result.errors.length ? 'Error' : 'Pass');
      top.append(sizeSpan, statusSpan);

      const delta = document.createElement('p');
      const overflowPx = result.overflow?.overflowPx ?? 0;
      delta.className = `vp-delta ${result.overflow?.hasOverflow ? 'overflow' : 'clean'}`;
      delta.textContent = result.overflow
        ? (result.overflow.hasOverflow ? `+${formatPx(overflowPx)}` : '0px')
        : 'Unavailable';

      const meta = document.createElement('p');
      meta.className = 'vp-meta';
      meta.textContent = result.overflow
        ? `文档 ${formatPx(result.overflow.documentWidth)} · 视口 ${formatPx(result.overflow.viewportWidth)} · 候选 ${result.overflow.elements.length}`
        : (result.errors[0] ?? '测量失败');

      card.append(top, delta, meta);
      overview.appendChild(card);
    });

    $('prompt-textarea').value = run.fixPrompt;
    $('copy-status').textContent = '';
    renderSelectedViewport();
  }

  async function triggerScan() {
    if (state.scanning) return;
    clearError();
    const url = $('url-input').value.trim();
    if (!url) {
      showError('请输入要检查的 HTTP 或 HTTPS 地址。');
      return;
    }

    state.scanning = true;
    $('scan-btn').disabled = true;
    setProgress(true, '正在启动无头 Chromium…', 10);

    try {
      const response = await api.runScan({
        url,
        outputPath: $('output-input').value.trim(),
        widthsText: $('widths-input').value.trim(),
        timeoutMs: Number($('timeout-input').value),
        waitMs: Number($('wait-input').value),
        waitForSelector: $('waitfor-input').value.trim(),
      });
      if (!response.ok) {
        showError(response.error || '扫描失败');
      } else {
        renderResults(response);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    } finally {
      state.scanning = false;
      $('scan-btn').disabled = false;
      setProgress(false);
    }
  }

  async function init() {
    const info = await api.getAppInfo();
    $('app-version').textContent = `v${info.version} · ${info.isPackaged ? 'Standalone Desktop' : 'Dev Mode'}`;
    $('engine-chip').textContent = info.browserMode;
    $('output-input').value = info.defaultOutputPath;
    if (info.mascotDataUrl) {
      $('mascot-img').src = info.mascotDataUrl;
    } else {
      $('mascot-img').hidden = true;
    }
    updateDemoUi(info.demo);

    api.onScanProgress((progress) => {
      const total = progress.totalViewports || 3;
      if (progress.phase === 'starting') {
        setProgress(true, '正在启动无头 Chromium…', 12);
      } else if (progress.phase === 'viewport-start') {
        const vp = progress.viewport;
        const pct = 15 + ((progress.viewportIndex ?? 0) / total) * 65;
        setProgress(true, `正在检查 ${vp.width}×${vp.height} CSS px…`, pct);
      } else if (progress.phase === 'viewport-done') {
        const vp = progress.viewport;
        const pct = 15 + (((progress.viewportIndex ?? 0) + 1) / total) * 65;
        setProgress(true, `已完成 ${vp.width}×${vp.height} 视口测量与截图`, pct);
      } else if (progress.phase === 'writing-report') {
        setProgress(true, '正在生成独立离线 report.html…', 90);
      } else if (progress.phase === 'done') {
        setProgress(true, '扫描完成！', 100);
      }
    });

    $('scan-btn').addEventListener('click', triggerScan);
    $('url-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') triggerScan();
    });

    $('browse-btn').addEventListener('click', async () => {
      const chosen = await api.chooseOutputPath($('output-input').value);
      if (chosen) $('output-input').value = chosen;
    });

    $('demo-toggle-btn').addEventListener('click', async () => {
      clearError();
      try {
        const next = state.demo.running ? await api.stopDemo() : await api.startDemo();
        updateDemoUi(next);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    });

    $('demo-broken-btn').addEventListener('click', async () => {
      clearError();
      const demo = await api.startDemo();
      updateDemoUi(demo);
      $('url-input').value = demo.brokenUrl;
      await triggerScan();
    });

    $('demo-fixed-btn').addEventListener('click', async () => {
      clearError();
      const demo = await api.startDemo();
      updateDemoUi(demo);
      $('url-input').value = demo.fixedUrl;
      await triggerScan();
    });

    $('open-report-btn').addEventListener('click', async () => {
      if (!state.lastRun) return;
      const res = await api.openReport(state.lastRun.htmlPath);
      if (!res.ok) showError(res.error || '无法打开报告文件');
    });

    $('reveal-report-btn').addEventListener('click', async () => {
      if (!state.lastRun) return;
      await api.revealReport(state.lastRun.htmlPath);
    });

    $('save-copy-btn').addEventListener('click', async () => {
      if (!state.lastRun) return;
      const res = await api.saveReportCopy(state.lastRun.htmlPath);
      if (res.ok) {
        $('copy-status').textContent = `已另存独立离线报告到：${res.destinationPath}`;
      } else if (!res.canceled) {
        showError(res.error || '另存失败');
      }
    });

    $('select-prompt-btn').addEventListener('click', () => {
      const box = $('prompt-textarea');
      box.focus();
      box.select();
      box.setSelectionRange(0, box.value.length);
      $('copy-status').textContent = '已全选修复提示词，请按 Ctrl+C 复制。';
    });

    $('copy-prompt-btn').addEventListener('click', async () => {
      const box = $('prompt-textarea');
      try {
        const res = await api.copyText(box.value);
        if (res.ok) {
          $('copy-status').textContent = '已复制到剪贴板！可直接粘贴给 AI 编程助手。';
          return;
        }
      } catch {
        // Fall back to selecting text below.
      }
      box.focus();
      box.select();
      box.setSelectionRange(0, box.value.length);
      $('copy-status').textContent = '自动复制失败，已全选文本，请按 Ctrl+C 手动复制。';
    });
  }

  init();
})();
