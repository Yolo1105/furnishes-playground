"use client";

/**
 * The last fall: the root layout itself failed, so nothing of the
 * site's own (its styles, its fonts) is here; a plain page in its
 * colours says so, with a way to try again. The browser's copy of the
 * work is untouched.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fff2e5",
          color: "#6b2c12",
          font: "16px/1.5 system-ui, sans-serif",
        }}
      >
        <title>Something went wrong</title>
        <main style={{ maxWidth: "40ch", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>
            The studio did not load.
          </h1>
          <p style={{ margin: "0 0 20px" }}>
            Your work in this browser is as it was. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: "inherit",
              padding: "10px 18px",
              border: 0,
              borderRadius: 999,
              background: "#6b2c12",
              color: "#fff2e5",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
