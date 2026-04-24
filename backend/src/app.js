const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { healthRoutes }      = require("./routes/health.routes");
const { studentRoutes }     = require("./routes/students.routes");
const { promotionRoutes }   = require("./routes/promotions.routes");
const { authRoutes }        = require("./routes/auth.routes");
const { masterRoutes }      = require("./routes/masters.routes");
const { certificateRoutes } = require("./routes/certificates.routes");
const { academicRoutes }    = require("./routes/academics.routes");
const { leavingRoutes }     = require("./routes/leaving.routes");
const { userRoutes }        = require("./routes/users.routes");
const { reportRoutes }      = require("./routes/reports.routes");

const app = express();

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.use(express.static(path.join(__dirname, "..", "..", "frontend", "public")));

// API routes
app.use("/api", healthRoutes);
app.use("/api", authRoutes);
app.use("/api", studentRoutes);
app.use("/api", promotionRoutes);
app.use("/api", masterRoutes);
app.use("/api", certificateRoutes);
app.use("/api", academicRoutes);
app.use("/api", leavingRoutes);
app.use("/api", userRoutes);
app.use("/api", reportRoutes);

// SPA catch-all — return index.html for any non-API path (fixes hard refresh / direct URL)
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Global error handler
app.use((err, _req, res, _next) => {
  const status = err?.name === "ZodError" ? 400 : 500;
  const msg = err.message || "Internal server error";
  res.status(status).json({
    message: msg,
    details: err.issues || undefined,
  });
});

module.exports = { app };
