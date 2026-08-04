document.getElementById('btn-analyze').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analyze');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await window.api.analyze({});
  } finally {
    btn.disabled = false;
    btn.textContent = '분석';
  }
});

document.getElementById('btn-hide').addEventListener('click', () => {
  window.api.closeCapture();
});

// 클릭 통과/조작 영역 판정은 main 프로세스 커서 폴링이 담당합니다.
