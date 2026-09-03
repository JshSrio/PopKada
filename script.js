/* =========================================================================
   POPKADA — SHARED SCRIPT
   One file, two jobs: it detects which page it's on (by looking for that
   page's root element) and runs the matching init function. Both pages
   use the same Supabase database below.
   ========================================================================= */

/* -------------------------------------------------------------------------
   SUPABASE DATABASE
   -------------------------------------------------------------------------
   Feedback is stored in Supabase instead of browser localStorage.

   IMPORTANT: replace the two values below with the Project URL and
   Publishable Key from Supabase Dashboard > Settings > API Keys.
   Never put a secret/service_role key in this file.
   ------------------------------------------------------------------------- */
const SUPABASE_URL = "https://dirsatezhsnfkvzwfeuk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xRLdGi1P9mNkMDQLLxQdew_PvrQvWZw";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

let submissionsCache = [];

async function getSubmissions() {
  const { data, error } = await supabaseClient
    .from("feedback")
    .select("id, rating, comment, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error("PopKada: couldn't load feedback", error);
    throw error;
  }

  submissionsCache = (data || []).map((row) => ({
    id: row.id,
    rating: row.rating == null ? 0 : Number(row.rating),
    comment: row.comment || "",
    status: row.status || "new",
    timestamp: row.created_at,
    updatedAt: row.updated_at,
  }));

  return submissionsCache;
}

async function addSubmission({ rating, comment }) {
  const { data, error } = await supabaseClient
    .from("feedback")
    .insert({
      rating: rating || null,
      comment: comment || "",
      status: "new",
    })
    .select("id, rating, comment, status, created_at, updated_at")
    .single();

  if (error) {
    console.error("PopKada: couldn't save feedback", error);
    throw error;
  }

  const item = {
    id: data.id,
    rating: data.rating == null ? 0 : Number(data.rating),
    comment: data.comment || "",
    status: data.status || "new",
    timestamp: data.created_at,
    updatedAt: data.updated_at,
  };

  submissionsCache.unshift(item);
  return item;
}

async function updateSubmissionStatus(id, status) {
  const { data, error } = await supabaseClient
    .from("feedback")
    .update({ status })
    .eq("id", id)
    .select("id, rating, comment, status, created_at, updated_at")
    .single();

  if (error) {
    console.error("PopKada: couldn't update feedback status", error);
    throw error;
  }

  const item = {
    id: data.id,
    rating: data.rating == null ? 0 : Number(data.rating),
    comment: data.comment || "",
    status: data.status || "new",
    timestamp: data.created_at,
    updatedAt: data.updated_at,
  };

  const index = submissionsCache.findIndex(
    (entry) => String(entry.id) === String(id)
  );

  if (index >= 0) submissionsCache[index] = item;

  return item;
}

/* =========================================================================
   LANDING PAGE
   ========================================================================= */
function initLandingPage() {
  const stage = document.getElementById("stage");
  const card = document.getElementById("feedbackCard");
  const feedbackFace = document.getElementById("feedbackFace");
  const thanksFace = document.getElementById("thanksFace");
  const starRating = document.getElementById("starRating");
  const stars = Array.from(starRating.querySelectorAll(".star"));
  const form = document.getElementById("feedbackForm");
  const textarea = document.getElementById("feedbackText");
  const formError = document.getElementById("formError");
  const resetBtn = document.getElementById("resetBtn");
  const submitBtn = document.getElementById("submitBtn");
  const confettiHost = document.getElementById("confetti");

  let selectedRating = 0;

  /* --- Phase 1 -> Phase 2: intro logo settles, then hands off to the card ---
     Timing note: .logo-in (CSS) runs ~1.1s. We hold on the logo a little
     past that so it doesn't feel rushed, then flip data-phase, which is
     what every phase-based CSS rule in style.css section 4 keys off of. */
  const INTRO_HOLD_MS = 1700;
  setTimeout(() => {
    stage.dataset.phase = "form";
  }, INTRO_HOLD_MS);

  /* --- Star rating: click to select 1-5, fills stars up to that value --- */
  function setRating(value) {
    selectedRating = value;
    stars.forEach((star) => {
      const starValue = Number(star.dataset.value);
      star.classList.toggle("is-filled", starValue <= value);
      star.setAttribute("aria-checked", String(starValue === value));
    });
  }
  stars.forEach((star) => {
    star.addEventListener("click", () => setRating(Number(star.dataset.value)));
  });

  /* --- Submit handling ---
     1. Validate (need a rating OR a comment).
     2. Save to storage.
     3. Run the send animation (see style.css section 6):
        is-sending  -> form face dissolves, card collapses, plane fades in
        is-flying   -> plane flies off-screen
        is-sent     -> thanks face fades in + confetti bursts
     Delays below are timed to match the CSS animation durations/delays so
     JS only swaps content once the matching visual beat has finished. */
  const SENDING_TO_FLYING_MS = 950; // matches collapse (0.3s delay + 0.45s) + plane-appear settle
  const FLYING_DURATION_MS = 950; // matches .plane-fly animation-duration

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (card.classList.contains("is-sending") || card.classList.contains("is-flying")) return; // ignore double-submits

    const comment = textarea.value.trim();
    if (selectedRating === 0 && comment === "") {
      formError.hidden = false;
      card.classList.remove("is-invalid");
      // restart the shake animation even on repeated invalid submits
      void card.offsetWidth;
      card.classList.add("is-invalid");
      setTimeout(() => card.classList.remove("is-invalid"), 500);
      return;
    }

    formError.hidden = true;
    submitBtn.disabled = true;

    try {
      await addSubmission({ rating: selectedRating, comment });
    } catch (error) {
      console.error("PopKada: feedback submission failed", error);
      submitBtn.disabled = false;
      formError.textContent = "We couldn't send your feedback. Please try again.";
      formError.hidden = false;
      return;
    }

    card.classList.add("is-sending");
    setTimeout(() => {
      card.classList.add("is-flying");
      setTimeout(() => {
        showThanks();
      }, FLYING_DURATION_MS);
    }, SENDING_TO_FLYING_MS);
  });

  function showThanks() {
    feedbackFace.hidden = true;
    thanksFace.hidden = false;
    card.classList.remove("is-sending", "is-flying");
    card.classList.add("is-sent");
    spawnConfetti();

    // Auto-reset back to a blank form after giving the thank-you room to breathe
    setTimeout(resetToForm, 4500);
  }

  function resetToForm() {
    card.classList.remove("is-sent");
    thanksFace.hidden = true;
    feedbackFace.hidden = false;
    feedbackFace.style.opacity = ""; // clear inline state left by face-dissolve fill-mode
    textarea.value = "";
    setRating(0);
    stars.forEach((star) => star.setAttribute("aria-checked", "false"));
    submitBtn.disabled = false;
  }

  resetBtn.addEventListener("click", resetToForm);

  /* --- Confetti burst: a handful of colored rectangles fall + spin.
     Kept in JS (not fixed HTML) so every burst gets fresh random timing. */
  function spawnConfetti() {
    const colors = ["#FFC229", "#8A1B1B", "#FFFFFF", "#E8A400"];
    const pieceCount = 26;
    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement("span");
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
      piece.style.animationDelay = `${Math.random() * 0.3}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiHost.appendChild(piece);
      // Clean up after the fall so the DOM doesn't accumulate old confetti
      setTimeout(() => piece.remove(), 3200);
    }
  }
}

/* =========================================================================
   ADMIN PAGE
   ========================================================================= */
function initAdminPage() {
  // No login gate — this page is reached only by a private URL staff have,
  // not linked from the customer-facing site. See the note in admin.html.
  const filterRating = document.getElementById("filterRating");
  const filterStatus = document.getElementById("filterStatus");
  const sortBy = document.getElementById("sortBy");
  const exportBtn = document.getElementById("exportBtn");
  const listHost = document.getElementById("feedbackList");
  const emptyState = document.getElementById("emptyState");

  const storyModal = document.getElementById("storyModal");
  const storyBackdrop = document.getElementById("storyBackdrop");
  const storyCanvas = document.getElementById("storyCanvas");
  const storyDownloadBtn = document.getElementById("storyDownloadBtn");
  const storyCloseBtn = document.getElementById("storyCloseBtn");
  let currentStoryItem = null;
  let cachedLogoImg = null;

  // Always start the dashboard on the list view.
  // This also prevents a previously-open Story modal/browser restoration
  // from making a specific feedback item appear when admin.html loads.
  closeStoryModalOnLoad();

  renderDashboard();

  [filterRating, filterStatus, sortBy].forEach((el) =>
    el.addEventListener("change", renderDashboard)
  );

  /* --- Build the filtered + sorted list currently in view --- */
  function getVisibleSubmissions() {
    let list = [...submissionsCache];

    if (filterRating.value !== "all") {
      const r = Number(filterRating.value);
      list = list.filter((item) => item.rating === r);
    }
    if (filterStatus.value !== "all") {
      list = list.filter((item) => item.status === filterStatus.value);
    }

    switch (sortBy.value) {
      case "oldest":
        list.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        break;
      case "highest":
        list.sort((a, b) => b.rating - a.rating);
        break;
      case "lowest":
        list.sort((a, b) => a.rating - b.rating);
        break;
      case "newest":
      default:
        list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        break;
    }
    return list;
  }

  /* --- Stats strip: total, average rating, last-7-days count, distribution --- */
  function renderStats(allSubmissions) {
    const total = allSubmissions.length;
    document.getElementById("statTotal").textContent = total;

    const avg = total ? allSubmissions.reduce((sum, s) => sum + s.rating, 0) / total : 0;
    document.getElementById("statAverage").textContent = total ? avg.toFixed(1) : "–";
    document.getElementById("statAverageStars").textContent = total
      ? "★".repeat(Math.round(avg)) + "☆".repeat(5 - Math.round(avg))
      : "";

    const weekCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekCount = allSubmissions.filter((s) => new Date(s.timestamp).getTime() >= weekCutoff).length;
    document.getElementById("statWeek").textContent = weekCount;

    const counts = [1, 2, 3, 4, 5].map((r) => allSubmissions.filter((s) => s.rating === r).length);
    const max = Math.max(1, ...counts);
    const distHost = document.getElementById("distBars");
    distHost.innerHTML = "";
    for (let r = 5; r >= 1; r--) {
      const count = counts[r - 1];
      const row = document.createElement("div");
      row.className = "dist-bar-row";
      row.innerHTML = `
        <span>${r}★</span>
        <span class="dist-track"><span class="dist-fill" style="width:${(count / max) * 100}%"></span></span>
        <span class="dist-count">${count}</span>
      `;
      distHost.appendChild(row);
    }
  }

  /* --- Feedback list rendering --- */
  function renderList(visibleSubmissions) {
    listHost.innerHTML = "";
    emptyState.hidden = visibleSubmissions.length !== 0;

    visibleSubmissions.forEach((item) => {
      const entry = document.createElement("article");
      entry.className = "feedback-entry";
      entry.dataset.status = item.status;

      const when = new Date(item.timestamp).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
      const stars = "★".repeat(item.rating) + "☆".repeat(5 - item.rating);
      const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);

      entry.innerHTML = `
        <div class="feedback-entry__main">
          <div class="feedback-entry__top">
            <span class="feedback-entry__stars">${item.rating ? stars : "No rating"}</span>
            <span class="status-pill status-pill--${item.status}">${statusLabel}</span>
            <span class="feedback-entry__time">${when}</span>
          </div>
          <p class="feedback-entry__comment">${escapeHtml(item.comment)}</p>
        </div>
        <div class="feedback-entry__actions">
          <button type="button" data-action="story">View / Story</button>
          ${item.status !== "read" ? `<button type="button" data-action="read">Mark Read</button>` : ""}
          ${item.status !== "resolved" ? `<button type="button" data-action="resolved">Resolve</button>` : `<button type="button" data-action="new">Reopen</button>`}
        </div>
      `;

      entry.querySelectorAll("button[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.dataset.action === "story") {
            openStoryModal(item);
          } else {
            updateStatus(item.id, btn.dataset.action);
          }
        });
      });

      listHost.appendChild(entry);
    });
  }

  async function updateStatus(id, status) {
    try {
      await updateSubmissionStatus(id, status);
      renderStats(submissionsCache);
      renderList(getVisibleSubmissions());
    } catch (error) {
      console.error("PopKada: status update failed", error);
      alert("Unable to update feedback status. Please try again.");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function closeStoryModalOnLoad() {
    currentStoryItem = null;
    storyModal.hidden = true;
    storyModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function renderDashboard() {
    try {
      await getSubmissions();
      renderStats(submissionsCache);
      renderList(getVisibleSubmissions());
    } catch (error) {
      console.error("PopKada: admin database error", error);
      listHost.innerHTML = "";
      emptyState.hidden = false;
      emptyState.textContent =
        "Unable to connect to Supabase. Check your Supabase URL, publishable key, table, and RLS policies.";
    }
  }

  /* -------------------------------------------------------------------
     STORY CARD — draws one feedback entry as a 1080x1920 (9:16) PNG
     sized for Instagram/Facebook Stories, so staff can screenshot a good
     review straight to canvas and post it. Everything is drawn with the
     Canvas 2D API rather than html2canvas so it works even when the
     dashboard is opened as a local file (no server) — see the comment in
     js/logo-data.js for why the logo specifically has to be a data URI
     for that to work.
     ---------------------------------------------------------------- */

  // Load the logo once and reuse it; it's a data URI so this resolves
  // instantly with no network request.
  function getLogoImage(callback) {
    if (cachedLogoImg) { callback(cachedLogoImg); return; }
    const img = new Image();
    img.onload = () => { cachedLogoImg = img; callback(img); };
    img.src = POPKADA_LOGO_DATA_URI;
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Wraps text to maxWidth, draws each line, and returns the line count
  // (used both to size the comment card and to actually paint the text).
  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = "";
    const lines = [];
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length;
  }

  function drawStoryCard(item) {
    const ctx = storyCanvas.getContext("2d");
    const W = storyCanvas.width, H = storyCanvas.height;

    // Background: vertical maroon gradient, matching the live page's palette
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#A62828");
    bg.addColorStop(0.55, "#6B1414");
    bg.addColorStop(1, "#4A0E0E");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Two soft gold glows, echoing the live page's ambient blob field
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#FFC229";
    ctx.beginPath(); ctx.ellipse(W * 0.12, H * 0.08, 340, 340, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.9, H * 0.85, 300, 300, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    getLogoImage((img) => {
      const logoW = 300, logoH = (img.height / img.width) * logoW;
      const logoX = (W - logoW) / 2, logoY = 130;

      // The logo's own background is white, so give it a paper card behind it
      drawRoundedRect(ctx, logoX - 24, logoY - 24, logoW + 48, logoH + 48, 36);
      ctx.fillStyle = "#FFF9F0";
      ctx.fill();
      ctx.drawImage(img, logoX, logoY, logoW, logoH);

      ctx.textAlign = "center";
      ctx.fillStyle = "#FFE08A";
      ctx.font = "600 34px Poppins, sans-serif";
      ctx.fillText("CUSTOMER FEEDBACK", W / 2, logoY + logoH + 110);

      const rating = item.rating || 0;
      ctx.font = "72px Arial, sans-serif";
      ctx.fillStyle = "#FFC229";
      const starsStr = rating ? "★".repeat(rating) + "☆".repeat(5 - rating) : "No star rating";
      ctx.fillText(starsStr, W / 2, logoY + logoH + 210);

      // Comment card — sized to fit however many lines the comment wraps to
      const cardX = 90, cardY = logoY + logoH + 280, cardW = W - 180;
      const maxTextWidth = cardW - 100;
      const lineHeight = 60;
      const comment = item.comment && item.comment.trim()
        ? item.comment.trim()
        : "No written comment — just a star rating!";

      ctx.font = "500 44px Poppins, sans-serif";
      const words = comment.split(/\s+/);
      let line = "", lineCount = 0;
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxTextWidth && line) { lineCount++; line = word; }
        else line = test;
      });
      if (line) lineCount++;
      const cardH = 100 + lineCount * lineHeight + 90;

      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 40);
      ctx.fillStyle = "#FFF9F0";
      ctx.fill();

      ctx.textAlign = "left";
      ctx.fillStyle = "#3A1010";
      wrapCanvasText(ctx, comment, cardX + 50, cardY + 90, maxTextWidth, lineHeight);

      const when = new Date(item.timestamp).toLocaleDateString(undefined, {
        month: "long", day: "numeric", year: "numeric",
      });
      ctx.font = "500 32px Poppins, sans-serif";
      ctx.fillStyle = "rgba(58,16,16,0.55)";
      ctx.fillText(when, cardX + 50, cardY + cardH - 40);

      ctx.textAlign = "center";
      ctx.font = "700 40px 'Baloo 2', sans-serif";
      ctx.fillStyle = "#FFF9F0";
      ctx.fillText("Your go-to barkada bites.", W / 2, H - 100);
    });
  }

  function openStoryModal(item) {
    currentStoryItem = item;
    storyModal.hidden = false;
    storyModal.setAttribute("aria-hidden", "false");
    // Wait for the web fonts to be ready so canvas text doesn't fall back
    // to the browser default on the first render.
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
      .then(() => drawStoryCard(item));
  }

  function closeStoryModal() {
    storyModal.hidden = true;
    storyModal.setAttribute("aria-hidden", "true");
    currentStoryItem = null;
  }

  storyBackdrop.addEventListener("click", closeStoryModal);
  storyCloseBtn.addEventListener("click", closeStoryModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !storyModal.hidden) closeStoryModal();
  });
  storyDownloadBtn.addEventListener("click", () => {
    if (!currentStoryItem) return;
    const url = storyCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `popkada-feedback-story-${currentStoryItem.id}.png`;
    a.click();
  });

  /* --- CSV export of the current filtered/sorted view --- */
  exportBtn.addEventListener("click", () => {
    const rows = [["Date/Time", "Rating", "Status", "Comment"]];
    getVisibleSubmissions().forEach((item) => {
      rows.push([
        new Date(item.timestamp).toLocaleString(),
        item.rating,
        item.status,
        (item.comment || "").replace(/"/g, '""'),
      ]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `popkada-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* =========================================================================
   BOOT — run whichever page's init matches what's on screen
   ========================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("feedbackForm")) initLandingPage();
  if (document.getElementById("adminDash")) initAdminPage();
});