// src/AIReimager.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseAnonKey } from "./supabaseClient";

// Our 5 fixed archetypes
const HOME_VARIANTS = [
  {
    key: "bungalow",
    label: "Bungalow",
    suffix:
      "a single-storey bungalow, compact footprint, pitched roof, simple and welcoming, suited to Irish suburbs",
  },
  {
    key: "two_storey",
    label: "2-storey home",
    suffix:
      "a modern two-storey detached family home, pitched roof, balanced windows, comfortable proportions",
  },
  {
    key: "attached_garage",
    label: "1-storey + attached garage",
    suffix:
      "a single-storey home with an attached single-car garage on one side, neat and practical",
  },
  {
    key: "detached_garage",
    label: "1-storey + detached garage",
    suffix:
      "a single-storey home with a small detached garage elsewhere on the plot, leaving a clear front elevation",
  },
  {
    key: "bold_unique",
    label: "Bold unique design",
    suffix:
      "a bold contemporary Irish home design, tasteful modern materials, striking but realistic, high curb appeal",
  },
];

function getSiteTitle(site) {
  return (
    site?.title ||
    site?.name ||
    site?.address ||
    site?.location ||
    "Derelict Site"
  );
}

function getOriginalImageUrl(site) {
  return (
    site?.image_url ||
    site?.imageUrl ||
    site?.photo_url ||
    site?.photoUrl ||
    site?.original_image_url ||
    ""
  );
}

function buildPrompt({ variant, notes }) {
  const base =
    "Reimagine this derelict Irish property as a finished home. Photorealistic, daytime, natural lighting, realistic landscaping, Irish setting. Keep the original footprint orientation where possible. No text, no watermark, no logos.";
  const extras = notes?.trim()
    ? `Extra notes: ${notes.trim()}`
    : "Extra notes: none.";
  return `${base} Style: ${variant.suffix}. ${extras}`;
}

export default function AIReimager({
  isOpen = true,
  onClose,
  site,
  functionName = "generate-image",
  onResults,
}) {
  const siteTitle = useMemo(() => getSiteTitle(site), [site]);
  const originalImageUrl = useMemo(() => getOriginalImageUrl(site), [site]);
  const siteId = site?.id ?? null;

  const [notes, setNotes] = useState("");
  const [selectedKey, setSelectedKey] = useState(HOME_VARIANTS[0].key);
  const [isGenerating, setIsGenerating] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const makeInitResults = () => {
    const init = {};
    HOME_VARIANTS.forEach((v) => {
      init[v.key] = { status: "idle", imageUrl: "", error: "", prompt: "" };
    });
    return init;
  };

  const [results, setResults] = useState(() => makeInitResults());
  const resultsRef = useRef(results);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const selectedVariant = useMemo(
    () => HOME_VARIANTS.find((v) => v.key === selectedKey) || HOME_VARIANTS[0],
    [selectedKey]
  );

  // Reset when opening or switching site
  useEffect(() => {
    if (!isOpen) return;

    setNotes("");
    setSelectedKey(HOME_VARIANTS[0].key);
    setIsGenerating(false);
    setGlobalError("");
    setResults(makeInitResults());
  }, [isOpen, siteId]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll while modal open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  async function callEdgeFunction(payload) {
    const supabaseUrl =
      process.env.REACT_APP_SUPABASE_URL ||
      supabase?.supabaseUrl ||
      supabase?.url;

    const anonKey =
      process.env.REACT_APP_SUPABASE_ANON_KEY || supabaseAnonKey;

    if (!supabaseUrl || !anonKey) {
      throw new Error(
        "Missing Supabase URL or anon key. Check REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY."
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || "";

    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `Edge Function failed (${res.status}). ${text || "No response body."}`
      );
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const imageUrl =
      data?.imageUrl ||
      data?.url ||
      data?.publicUrl ||
      (Array.isArray(data?.images) && data.images[0]) ||
      (Array.isArray(data) && data[0]) ||
      "";

    if (!imageUrl) {
      throw new Error(
        `Edge Function returned no image URL. Response: ${text}`
      );
    }

    return { imageUrl, data };
  }

  async function generateOne(variantKey) {
    const variant = HOME_VARIANTS.find((v) => v.key === variantKey);
    if (!variant) return;

    setGlobalError("");
    if (!originalImageUrl) {
      setGlobalError(
        "This site has no original image URL saved, so AI reimagination can't run."
      );
      return;
    }

    const prompt = buildPrompt({ variant, notes });

    setResults((prev) => ({
      ...prev,
      [variantKey]: {
        ...prev[variantKey],
        status: "loading",
        error: "",
        prompt,
      },
    }));

    try {
      const payload = {
        siteId,
        originalImageUrl,
        variantKey: variant.key,
        variantLabel: variant.label,
        prompt,
        notes: notes?.trim() || "",
      };

      const { imageUrl } = await callEdgeFunction(payload);

      setResults((prev) => ({
        ...prev,
        [variantKey]: {
          status: "done",
          imageUrl,
          error: "",
          prompt,
        },
      }));
    } catch (e) {
      const msg = typeof e?.message === "string" ? e.message : "Unknown error";
      console.error("generateOne error:", e);

      setResults((prev) => ({
        ...prev,
        [variantKey]: {
          ...prev[variantKey],
          status: "error",
          error: msg,
        },
      }));
    }
  }

  async function generateAll() {
    setGlobalError("");
    if (!originalImageUrl) {
      setGlobalError(
        "This site has no original image URL saved, so AI reimagination can't run."
      );
      return;
    }

    setIsGenerating(true);

    try {
      // mark all loading
      setResults((prev) => {
        const next = { ...prev };
        HOME_VARIANTS.forEach((v) => {
          const prompt = buildPrompt({ variant: v, notes });
          next[v.key] = {
            ...next[v.key],
            status: "loading",
            error: "",
            prompt,
          };
        });
        return next;
      });

      const batchSize = 2;
      const variants = [...HOME_VARIANTS];

      for (let i = 0; i < variants.length; i += batchSize) {
        const chunk = variants.slice(i, i + batchSize);
        await Promise.all(chunk.map((v) => generateOne(v.key)));
      }

      if (typeof onResults === "function") {
        onResults({ siteId, results: resultsRef.current });
      }
    } finally {
      setIsGenerating(false);
    }
  }

  if (!isOpen) return null;

  const selected = results?.[selectedKey] || {
    status: "idle",
    imageUrl: "",
    error: "",
    prompt: "",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      onTouchStart={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(1280px, 96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "#fff",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 18px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>
              ✨ NEW REIMAGINE {siteTitle}
            </h2>
          </div>

          <button
            onClick={onClose}
            type="button"
            style={{
              border: "none",
              background: "#6b7280",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginTop: 14,
          }}
        >
          {/* Original */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Original Derelict Site
            </div>
            <div
              style={{
                borderRadius: 12,
                overflow: "hidden",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
              }}
            >
              {originalImageUrl ? (
                <img
                  src={originalImageUrl}
                  alt="Original derelict"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              ) : (
                <div style={{ padding: 18, color: "#6b7280" }}>
                  No original image found for this site.
                </div>
              )}
            </div>
          </div>

          {/* AI Reimagined */}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>AI Reimagined</div>
            <div
              style={{
                minHeight: 340,
                borderRadius: 12,
                overflow: "hidden",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {selected?.imageUrl ? (
                <img
                  src={selected.imageUrl}
                  alt="AI reimagined"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              ) : (
                <div
                  style={{
                    padding: 18,
                    color: "#6b7280",
                    textAlign: "center",
                    maxWidth: 420,
                  }}
                >
                  Click “Generate Reimagination” to see 5 concept options for this
                  site.
                </div>
              )}

              {selected?.status === "loading" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  Generating…
                </div>
              )}
            </div>

            {selected?.status === "error" && selected?.error ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: "#fee2e2",
                  border: "1px solid #fecaca",
                  borderRadius: 10,
                  color: "#991b1b",
                  fontSize: 14,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Error for {selectedVariant.label}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{selected.error}</div>

                <button
                  type="button"
                  onClick={() => generateOne(selectedKey)}
                  style={{
                    marginTop: 10,
                    border: "none",
                    background: "#991b1b",
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Retry this option
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Optional extra notes for the architect
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., keep some existing trees, use brick and slate, add good parking..."
            style={{
              width: "100%",
              minHeight: 90,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              padding: 10,
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </div>

        {globalError ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              color: "#991b1b",
              fontSize: 14,
            }}
          >
            {globalError}
          </div>
        ) : null}

        {/* Actions */}
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={generateAll}
            disabled={isGenerating}
            style={{
              flex: 1,
              border: "none",
              background: isGenerating ? "#9ca3af" : "#16a34a",
              color: "#fff",
              padding: "14px 14px",
              borderRadius: 12,
              cursor: isGenerating ? "not-allowed" : "pointer",
              fontWeight: 900,
              fontSize: 15,
            }}
          >
            🎨 {isGenerating ? "Generating…" : "Generate Reimagination"}
          </button>
        </div>

        {/* Concept options */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Concept options</div>
          <div style={{ color: "#6b7280", marginBottom: 10, fontSize: 14 }}>
            You'll get one concept for each type: bungalow, 2-storey,
            attached garage, detached garage, and a bold unique design.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {HOME_VARIANTS.map((variant) => {
              const r = results?.[variant.key] || {
                status: "idle",
                imageUrl: "",
                error: "",
              };
              const active = variant.key === selectedKey;

              return (
                <div
                  key={variant.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(variant.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedKey(variant.key);
                  }}
                  style={{
                    textAlign: "left",
                    borderRadius: 12,
                    border: active ? "2px solid #16a34a" : "1px solid #e5e7eb",
                    background: "#fff",
                    padding: 10,
                    cursor: "pointer",
                    overflow: "hidden",
                    userSelect: "none",
                  }}
                  title={variant.label}
                >
                  <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6 }}>
                    {variant.label}
                  </div>

                  <div
                    style={{
                      height: 120,
                      borderRadius: 10,
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt={variant.label}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div style={{ color: "#9ca3af", fontSize: 12, padding: 10 }}>
                        {r.status === "loading"
                          ? "Generating…"
                          : r.status === "error"
                          ? "Error"
                          : "Not generated"}
                      </div>
                    )}

                    {r.status === "loading" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(255,255,255,0.65)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        …
                      </div>
                    )}
                  </div>

                  {r.status === "error" && r.error ? (
                    <div style={{ marginTop: 8, color: "#991b1b", fontSize: 12 }}>
                      {r.error.length > 70 ? r.error.slice(0, 70) + "…" : r.error}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        generateOne(variant.key);
                      }}
                      disabled={isGenerating}
                      style={{
                        border: "none",
                        background: "#111827",
                        color: "#fff",
                        padding: "6px 8px",
                        borderRadius: 10,
                        cursor: isGenerating ? "not-allowed" : "pointer",
                        fontWeight: 800,
                        fontSize: 12,
                        width: "100%",
                      }}
                    >
                      Generate this
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
            If you ever see a 500 again, check Supabase → Edge Functions →{" "}
            <strong>{functionName}</strong> → Logs.
          </div>
        </div>
      </div>
    </div>
  );
}



