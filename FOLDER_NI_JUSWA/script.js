/* =========================================================================
   POPKADA — SHARED SCRIPT
   One file, two jobs: it detects which page it's on and runs the matching
   init function. Both pages share the same localStorage-backed "database".
   ========================================================================= */


/* -------------------------------------------------------------------------
   STORAGE — prototype persistence via localStorage.
   Swap this module out for real fetch() calls to a backend later; every
   other function in this file only talks to getSubmissions/saveSubmissions,
   so that's the only place that needs to change.
   ---------------------------------------------------------------------- */

const STORAGE_KEY = "popkada_feedback";

function getSubmissions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("PopKada: couldn't read stored feedback", err);
    return [];
  }
}

function saveSubmissions(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("PopKada: couldn't save feedback", err);
  }
}

function addSubmission({ rating, comment }) {
  const list = getSubmissions();

  list.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rating,
    comment,
    timestamp: new Date().toISOString(),
    status: "new",
  });

  saveSubmissions(list);
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
  const confettiHost = document.getElementById("confetti");

  let selectedRating = 0;

  /* --- Phase 1 -> Phase 2 --------------------------------------------- */

  const INTRO_HOLD_MS = 1700;

  setTimeout(() => {
    stage.dataset.phase = "form";
  }, INTRO_HOLD_MS);


  /* --- Star rating ----------------------------------------------------- */

  function setRating(value) {
    selectedRating = value;

    stars.forEach((star) => {
      const starValue = Number(star.dataset.value);

      star.classList.toggle(
        "is-filled",
        starValue <= value
      );

      star.setAttribute(
        "aria-checked",
        String(starValue === value)
      );
    });
  }

  stars.forEach((star) => {
    star.addEventListener("click", () => {
      setRating(Number(star.dataset.value));
    });
  });


  /* --- Submit handling ------------------------------------------------- */

  const SENDING_TO_FLYING_MS = 950;
  const FLYING_DURATION_MS = 950;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (
      card.classList.contains("is-sending") ||
      card.classList.contains("is-flying")
    ) {
      return;
    }

    const comment = textarea.value.trim();

    if (selectedRating === 0 && comment === "") {
      formError.hidden = false;

      card.classList.remove("is-invalid");

      // Restart shake animation
      void card.offsetWidth;

      card.classList.add("is-invalid");

      setTimeout(() => {
        card.classList.remove("is-invalid");
      }, 500);

      return;
    }

    formError.hidden = true;

    addSubmission({
      rating: selectedRating,
      comment,
    });

    card.classList.add("is-sending");

    setTimeout(() => {
      card.classList.add("is-flying");

      setTimeout(() => {
        showThanks();
      }, FLYING_DURATION_MS);

    }, SENDING_TO_FLYING_MS);
  });


  /* --- Thank you screen ----------------------------------------------- */

  function showThanks() {
    feedbackFace.hidden = true;
    thanksFace.hidden = false;

    card.classList.remove(
      "is-sending",
      "is-flying"
    );

    card.classList.add("is-sent");

    spawnConfetti();

    // Auto-reset after displaying thank you
    setTimeout(resetToForm, 4500);
  }


  /* --- Reset form ------------------------------------------------------ */

  function resetToForm() {
    card.classList.remove("is-sent");

    thanksFace.hidden = true;
    feedbackFace.hidden = false;

    feedbackFace.style.opacity = "";

    textarea.value = "";

    setRating(0);

    stars.forEach((star) => {
      star.setAttribute("aria-checked", "false");
    });
  }

  resetBtn.addEventListener("click", resetToForm);


  /* --- Confetti -------------------------------------------------------- */

  function spawnConfetti() {
    const colors = [
      "#FFC229",
      "#8A1B1B",
      "#FFFFFF",
      "#E8A400",
    ];

    const pieceCount = 26;

    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement("span");

      piece.style.left = `${Math.random() * 100}%`;

      piece.style.background =
        colors[i % colors.length];

      piece.style.animationDuration =
        `${1.6 + Math.random() * 1.2}s`;

      piece.style.animationDelay =
        `${Math.random() * 0.3}s`;

      piece.style.transform =
        `rotate(${Math.random() * 360}deg)`;

      confettiHost.appendChild(piece);

      // Remove old confetti
      setTimeout(() => {
        piece.remove();
      }, 3200);
    }
  }
}


/* =========================================================================
   ADMIN PAGE
   ========================================================================= */

function initAdminPage() {

  // Admin dashboard elements
  const filterRating = document.getElementById("filterRating");
  const filterStatus = document.getElementById("filterStatus");
  const sortBy = document.getElementById("sortBy");

  const exportBtn = document.getElementById("exportBtn");
  const listHost = document.getElementById("feedbackList");
  const emptyState = document.getElementById("emptyState");

  // Story modal elements
  const storyModal = document.getElementById("storyModal");
  const storyBackdrop = document.getElementById("storyBackdrop");
  const storyCanvas = document.getElementById("storyCanvas");
  const storyDownloadBtn = document.getElementById("storyDownloadBtn");
  const storyCloseBtn = document.getElementById("storyCloseBtn");

  let currentStoryItem = null;
  let cachedLogoImg = null;


  /* --- Initial dashboard render --------------------------------------- */

  renderDashboard();


  /* --- Filters --------------------------------------------------------- */

  [filterRating, filterStatus, sortBy].forEach((el) => {
    el.addEventListener("change", renderDashboard);
  });


  /* ---------------------------------------------------------------------
     Build the filtered + sorted list currently in view
     ------------------------------------------------------------------ */

  function getVisibleSubmissions() {
    let list = getSubmissions();


    // Filter by rating
    if (filterRating.value !== "all") {
      const r = Number(filterRating.value);

      list = list.filter(
        (item) => item.rating === r
      );
    }


    // Filter by status
    if (filterStatus.value !== "all") {
      list = list.filter(
        (item) => item.status === filterStatus.value
      );
    }


    // Sort
    switch (sortBy.value) {

      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.timestamp) -
            new Date(b.timestamp)
        );
        break;

      case "highest":
        list.sort(
          (a, b) =>
            b.rating - a.rating
        );
        break;

      case "lowest":
        list.sort(
          (a, b) =>
            a.rating - b.rating
        );
        break;

      case "newest":
      default:
        list.sort(
          (a, b) =>
            new Date(b.timestamp) -
            new Date(a.timestamp)
        );
        break;
    }

    return list;
  }


  /* ---------------------------------------------------------------------
     Stats strip
     ------------------------------------------------------------------ */

  function renderStats(allSubmissions) {

    const total = allSubmissions.length;

    document.getElementById(
      "statTotal"
    ).textContent = total;


    // Average rating
    const avg = total
      ? allSubmissions.reduce(
          (sum, s) => sum + s.rating,
          0
        ) / total
      : 0;

    document.getElementById(
      "statAverage"
    ).textContent = total
      ? avg.toFixed(1)
      : "–";


    document.getElementById(
      "statAverageStars"
    ).textContent = total
      ? "★".repeat(Math.round(avg)) +
        "☆".repeat(5 - Math.round(avg))
      : "";


    // Last 7 days
    const weekCutoff =
      Date.now() -
      7 * 24 * 60 * 60 * 1000;

    const weekCount =
      allSubmissions.filter(
        (s) =>
          new Date(s.timestamp).getTime() >=
          weekCutoff
      ).length;

    document.getElementById(
      "statWeek"
    ).textContent = weekCount;


    // Rating distribution
    const counts = [1, 2, 3, 4, 5].map(
      (r) =>
        allSubmissions.filter(
          (s) => s.rating === r
        ).length
    );

    const max = Math.max(
      1,
      ...counts
    );

    const distHost =
      document.getElementById("distBars");

    distHost.innerHTML = "";


    for (let r = 5; r >= 1; r--) {

      const count = counts[r - 1];

      const row =
        document.createElement("div");

      row.className =
        "dist-bar-row";

      row.innerHTML = `
        <span>${r}★</span>

        <span class="dist-track">
          <span
            class="dist-fill"
            style="width:${(count / max) * 100}%"
          ></span>
        </span>

        <span class="dist-count">
          ${count}
        </span>
      `;

      distHost.appendChild(row);
    }
  }


  /* ---------------------------------------------------------------------
     Feedback list rendering
     ------------------------------------------------------------------ */

  function renderList(visibleSubmissions) {

    listHost.innerHTML = "";

    emptyState.hidden =
      visibleSubmissions.length !== 0;


    visibleSubmissions.forEach((item) => {

      const entry =
        document.createElement("article");

      entry.className =
        "feedback-entry";

      entry.dataset.status =
        item.status;


      const when =
        new Date(
          item.timestamp
        ).toLocaleString(
          undefined,
          {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }
        );


      const stars =
        "★".repeat(item.rating) +
        "☆".repeat(5 - item.rating);


      const statusLabel =
        item.status.charAt(0).toUpperCase() +
        item.status.slice(1);


      entry.innerHTML = `
        <div class="feedback-entry__main">

          <div class="feedback-entry__top">

            <span class="feedback-entry__stars">
              ${item.rating ? stars : "No rating"}
            </span>

            <span class="status-pill status-pill--${item.status}">
              ${statusLabel}
            </span>

            <span class="feedback-entry__time">
              ${when}
            </span>

          </div>

          <p class="feedback-entry__comment">
            ${escapeHtml(item.comment)}
          </p>

        </div>

        <div class="feedback-entry__actions">

          <button
            type="button"
            data-action="story"
          >
            View
          </button>

          ${
            item.status !== "read"
              ? `
                <button
                  type="button"
                  data-action="read"
                >
                  Mark Read
                </button>
              `
              : ""
          }

          

        </div>
      `;


      // Button actions
      entry
        .querySelectorAll(
          "button[data-action]"
        )
        .forEach((btn) => {

          btn.addEventListener(
            "click",
            () => {

              if (
                btn.dataset.action ===
                "story"
              ) {

                openStoryModal(item);

              } else {

                updateStatus(
                  item.id,
                  btn.dataset.action
                );
              }
            }
          );
        });


      listHost.appendChild(entry);
    });
  }


  /* ---------------------------------------------------------------------
     Update feedback status
     ------------------------------------------------------------------ */

  function updateStatus(id, status) {

    const list =
      getSubmissions();

    const target =
      list.find(
        (s) => s.id === id
      );


    if (target) {

      target.status = status;

      saveSubmissions(list);

      renderDashboard();
    }
  }


  /* ---------------------------------------------------------------------
     Escape HTML
     ------------------------------------------------------------------ */

  function escapeHtml(str) {

    const div =
      document.createElement("div");

    div.textContent =
      str || "";

    return div.innerHTML;
  }


  /* ---------------------------------------------------------------------
     Render dashboard
     ------------------------------------------------------------------ */

  function renderDashboard() {

    const all =
      getSubmissions();

    renderStats(all);

    renderList(
      getVisibleSubmissions()
    );
  }


  /* =========================================================================
     STORY CARD
     ========================================================================= */

  function getLogoImage(callback) {

    if (cachedLogoImg) {
      callback(cachedLogoImg);
      return;
    }

    const img =
      new Image();

    img.onload = () => {
      cachedLogoImg = img;
      callback(img);
    };

    img.src =
      POPKADA_LOGO_DATA_URI;
  }


  /* -------------------------------------------------------------------------
     Rounded rectangle helper
     ---------------------------------------------------------------------- */

  function drawRoundedRect(
    ctx,
    x,
    y,
    w,
    h,
    r
  ) {

    ctx.beginPath();

    ctx.moveTo(
      x + r,
      y
    );

    ctx.arcTo(
      x + w,
      y,
      x + w,
      y + h,
      r
    );

    ctx.arcTo(
      x + w,
      y + h,
      x,
      y + h,
      r
    );

    ctx.arcTo(
      x,
      y + h,
      x,
      y,
      r
    );

    ctx.arcTo(
      x,
      y,
      x + w,
      y,
      r
    );

    ctx.closePath();
  }


  /* -------------------------------------------------------------------------
     Canvas text wrapping
     ---------------------------------------------------------------------- */

  function wrapCanvasText(
    ctx,
    text,
    x,
    y,
    maxWidth,
    lineHeight
  ) {

    const words =
      text.split(/\s+/);

    let line = "";

    const lines = [];


    words.forEach((word) => {

      const test =
        line
          ? `${line} ${word}`
          : word;


      if (
        ctx.measureText(test).width >
          maxWidth &&
        line
      ) {

        lines.push(line);

        line = word;

      } else {

        line = test;
      }
    });


    if (line) {
      lines.push(line);
    }


    lines.forEach((l, i) => {

      ctx.fillText(
        l,
        x,
        y + i * lineHeight
      );
    });


    return lines.length;
  }


  /* -------------------------------------------------------------------------
     Draw story card
     ---------------------------------------------------------------------- */

  function drawStoryCard(item) {

    const ctx =
      storyCanvas.getContext("2d");

    const W =
      storyCanvas.width;

    const H =
      storyCanvas.height;


    // Background gradient
    const bg =
      ctx.createLinearGradient(
        0,
        0,
        0,
        H
      );

    bg.addColorStop(
      0,
      "#A62828"
    );

    bg.addColorStop(
      0.55,
      "#6B1414"
    );

    bg.addColorStop(
      1,
      "#4A0E0E"
    );


    ctx.fillStyle = bg;

    ctx.fillRect(
      0,
      0,
      W,
      H
    );


    // Gold glows
    ctx.save();

    ctx.globalAlpha = 0.18;

    ctx.fillStyle =
      "#FFC229";


    ctx.beginPath();

    ctx.ellipse(
      W * 0.12,
      H * 0.08,
      340,
      340,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();


    ctx.beginPath();

    ctx.ellipse(
      W * 0.9,
      H * 0.85,
      300,
      300,
      0,
      0,
      Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    // Logo
    getLogoImage((img) => {

      const logoW = 300;

      const logoH =
        (img.height / img.width) *
        logoW;

      const logoX =
        (W - logoW) / 2;

      const logoY = 130;


      // Logo paper card
      drawRoundedRect(
        ctx,
        logoX - 24,
        logoY - 24,
        logoW + 48,
        logoH + 48,
        36
      );

      ctx.fillStyle =
        "#FFF9F0";

      ctx.fill();


      ctx.drawImage(
        img,
        logoX,
        logoY,
        logoW,
        logoH
      );


      // Customer feedback title
      ctx.textAlign =
        "center";

      ctx.fillStyle =
        "#FFE08A";

      ctx.font =
        "600 34px Poppins, sans-serif";

      ctx.fillText(
        "CUSTOMER FEEDBACK",
        W / 2,
        logoY + logoH + 110
      );


      // Rating
      const rating =
        item.rating || 0;

      ctx.font =
        "72px Arial, sans-serif";

      ctx.fillStyle =
        "#FFC229";


      const starsStr =
        rating
          ? "★".repeat(rating) +
            "☆".repeat(5 - rating)
          : "No star rating";


      ctx.fillText(
        starsStr,
        W / 2,
        logoY + logoH + 210
      );


      // Comment card
      const cardX = 90;

      const cardY =
        logoY +
        logoH +
        280;

      const cardW =
        W - 180;

      const maxTextWidth =
        cardW - 100;

      const lineHeight = 60;


      const comment =
        item.comment &&
        item.comment.trim()
          ? item.comment.trim()
          : "No written comment — just a star rating!";


      ctx.font =
        "500 44px Poppins, sans-serif";


      const words =
        comment.split(/\s+/);

      let line = "";

      let lineCount = 0;


      words.forEach((word) => {

        const test =
          line
            ? `${line} ${word}`
            : word;


        if (
          ctx.measureText(test).width >
            maxTextWidth &&
          line
        ) {

          lineCount++;

          line = word;

        } else {

          line = test;
        }
      });


      if (line) {
        lineCount++;
      }


      const cardH =
        100 +
        lineCount * lineHeight +
        90;


      drawRoundedRect(
        ctx,
        cardX,
        cardY,
        cardW,
        cardH,
        40
      );


      ctx.fillStyle =
        "#FFF9F0";

      ctx.fill();


      // Comment
      ctx.textAlign =
        "left";

      ctx.fillStyle =
        "#3A1010";


      wrapCanvasText(
        ctx,
        comment,
        cardX + 50,
        cardY + 90,
        maxTextWidth,
        lineHeight
      );


      // Date
      const when =
        new Date(
          item.timestamp
        ).toLocaleDateString(
          undefined,
          {
            month: "long",
            day: "numeric",
            year: "numeric",
          }
        );


      ctx.font =
        "500 32px Poppins, sans-serif";

      ctx.fillStyle =
        "rgba(58,16,16,0.55)";


      ctx.fillText(
        when,
        cardX + 50,
        cardY + cardH - 40
      );


      // Footer
      ctx.textAlign =
        "center";

      ctx.font =
        "700 40px 'Baloo 2', sans-serif";

      ctx.fillStyle =
        "#FFF9F0";


      ctx.fillText(
        "Your go-to barkada bites.",
        W / 2,
        H - 100
      );
    });
  }


  /* -------------------------------------------------------------------------
     Open story modal
     ---------------------------------------------------------------------- */

  function openStoryModal(item) {

    currentStoryItem =
      item;

    storyModal.hidden =
      false;


    // Wait for fonts
    (
      document.fonts &&
      document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve()
    )
      .then(() => {
        drawStoryCard(item);
      });
  }


  /* -------------------------------------------------------------------------
     Close story modal
     ---------------------------------------------------------------------- */

  function closeStoryModal() {

    storyModal.hidden =
      true;

    currentStoryItem =
      null;
  }


  storyBackdrop.addEventListener(
    "click",
    closeStoryModal
  );


  storyCloseBtn.addEventListener(
    "click",
    closeStoryModal
  );


  document.addEventListener(
    "keydown",
    (e) => {

      if (
        e.key === "Escape" &&
        !storyModal.hidden
      ) {
        closeStoryModal();
      }
    }
  );


  /* -------------------------------------------------------------------------
     Download story
     ---------------------------------------------------------------------- */

  storyDownloadBtn.addEventListener(
    "click",
    () => {

      if (!currentStoryItem) {
        return;
      }


      const url =
        storyCanvas.toDataURL(
          "image/png"
        );


      const a =
        document.createElement("a");

      a.href = url;

      a.download =
        `popkada-feedback-story-${currentStoryItem.id}.png`;

      a.click();
    }
  );


  /* =========================================================================
     CSV EXPORT
     ========================================================================= */

  exportBtn.addEventListener(
    "click",
    () => {

      const rows = [
        [
          "Date/Time",
          "Rating",
          "Status",
          "Comment"
        ]
      ];


      getVisibleSubmissions()
        .forEach((item) => {

          rows.push([
            new Date(
              item.timestamp
            ).toLocaleString(),

            item.rating,

            item.status,

            (item.comment || "")
              .replace(/"/g, '""')
          ]);
        });


      const csv =
        rows
          .map((row) =>
            row
              .map(
                (cell) =>
                  `"${cell}"`
              )
              .join(",")
          )
          .join("\n");


      const blob =
        new Blob(
          [csv],
          {
            type:
              "text/csv;charset=utf-8;",
          }
        );


      const url =
        URL.createObjectURL(blob);


      const a =
        document.createElement("a");

      a.href = url;

      a.download =
        `popkada-feedback-${new Date()
          .toISOString()
          .slice(0, 10)}.csv`;


      a.click();


      URL.revokeObjectURL(url);
    }
  );
}


/* =========================================================================
   BOOT — INITIALIZE THE CORRECT PAGE
   =========================================================================
   
   IMPORTANT:
   We determine which page we're on using the body's page class.

   admin.html:
       <body class="page-admin">

   index.html:
       <body class="page-landing">

   This prevents the admin page from accidentally initializing the
   customer feedback page.
   ========================================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const page =
      document.body;


    /* ---------------------------------------------------------------------
       ADMIN DASHBOARD
       ------------------------------------------------------------------ */

    if (
      page.classList.contains(
        "page-admin"
      )
    ) {

      initAdminPage();

      return;
    }


    /* ---------------------------------------------------------------------
       CUSTOMER FEEDBACK PAGE
       ------------------------------------------------------------------ */

    if (
      page.classList.contains(
        "page-landing"
      )
    ) {

      initLandingPage();

      return;
    }


    /* ---------------------------------------------------------------------
       Fallback
       ------------------------------------------------------------------ */

    console.warn(
      "PopKada: No recognized page class found. " +
      'Use class="page-admin" for admin.html or ' +
      'class="page-landing" for index.html.'
    );
  }
);