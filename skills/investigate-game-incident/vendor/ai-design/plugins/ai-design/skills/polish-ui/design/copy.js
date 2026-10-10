// Design system "Clear" (ai-design): copy button for .ds-cmd blocks. Include once per page.
// Text inside .ds-c (comments) is left out, so a block can explain each line and still paste cleanly.
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".ds-cmd button");
  if (!btn) return;
  const code = btn.parentElement.querySelector("code, pre");
  const copy = code.cloneNode(true);
  copy.querySelectorAll(".ds-c").forEach((n) => n.remove());
  const text = copy.textContent.split("\n").map((l) => l.trimEnd()).filter(Boolean).join("\n");
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = "복사됨"; } catch { btn.textContent = "복사 실패"; }
  setTimeout(() => { btn.textContent = label; }, 1500);
});
